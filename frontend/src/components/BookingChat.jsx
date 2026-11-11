import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getBookingChat, sendChatMessage } from '../api';
import { mergeMessages, reconcileOutbox } from '../chat-utils';
import { formatBookingTime } from '../booking-utils';
import statuses from '../../../shared/booking-statuses.json';
import '../chat.css';

const name = (person) => [person?.first_name, person?.last_name].filter(Boolean).join(' ');
const dayFormat = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: 'America/Bogota' });
const hourFormat = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });

export default function BookingChat({ bookingId, account }) {
  const [booking, setBooking] = useState(null);
  const [messages, setMessages] = useState([]);
  const [outbox, setOutbox] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [olderBusy, setOlderBusy] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const [revision, setRevision] = useState(0);
  const [newMessages, setNewMessages] = useState(false);
  const scrollRef = useRef(null);
  const controllerRef = useRef(null);
  const scrollAction = useRef(null);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const action = scrollAction.current;
    if (!element || !action) return;
    element.scrollTop = action.kind === 'prepend' ? element.scrollHeight - action.height + action.top : element.scrollHeight;
    scrollAction.current = null;
  }, [messages, outbox, loading]);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    let cursor = '0';
    let ready = false;
    let busy = false;
    const accept = (result, initial) => {
      const element = scrollRef.current;
      const nearBottom = !element || element.scrollHeight - element.scrollTop - element.clientHeight < 100;
      if (initial || nearBottom) scrollAction.current = { kind: 'bottom' };
      else if (result.messages.length) setNewMessages(true);
      setBooking(result.booking);
      setMessages((current) => mergeMessages(current, result.messages));
      setOutbox((current) => reconcileOutbox(current, result.messages, account.id));
      if (initial) setHasOlder(result.has_older);
      // Solo las lecturas avanzan el cursor: un envío puede adelantar mensajes aún no consultados.
      if (result.messages.length) cursor = result.messages.at(-1).id;
      setError('');
    };
    const failure = (err) => {
      if (controller.signal.aborted) return;
      setError(err.message);
      if ([401, 403, 404].includes(err.status)) {
        setDenied(true); setBooking(null); setMessages([]); setOutbox([]); controller.abort();
      }
    };
    const load = async () => {
      if (busy || controller.signal.aborted || ready && document.visibilityState === 'hidden') return;
      busy = true;
      try {
        let result = await getBookingChat(bookingId, ready ? { after_id: cursor, limit: '100' } : {}, { signal: controller.signal });
        if (controller.signal.aborted) return;
        accept(result, !ready); ready = true;
        while (result.has_more && !controller.signal.aborted) {
          result = await getBookingChat(bookingId, { after_id: cursor, limit: '100' }, { signal: controller.signal });
          if (!controller.signal.aborted) accept(result, false);
        }
      } catch (err) { failure(err); }
      finally { busy = false; if (!controller.signal.aborted) setLoading(false); }
    };
    load();
    const timer = setInterval(load, 3000);
    window.addEventListener('focus', load);
    window.addEventListener('online', load);
    document.addEventListener('visibilitychange', load);
    return () => {
      controller.abort(); clearInterval(timer);
      window.removeEventListener('focus', load); window.removeEventListener('online', load);
      document.removeEventListener('visibilitychange', load);
    };
  }, [bookingId, account.id, revision]);

  const accessFailure = (err) => {
    if ([401, 403, 404].includes(err.status)) {
      setDenied(true); setBooking(null); setMessages([]); setOutbox([]); setError(err.message); controllerRef.current?.abort();
      return true;
    }
    return false;
  };
  const loadOlder = async () => {
    setOlderBusy(true);
    const signal = controllerRef.current.signal;
    try {
      const result = await getBookingChat(bookingId, { before_id: messages[0].id }, { signal });
      if (signal.aborted) return;
      const element = scrollRef.current;
      scrollAction.current = { kind: 'prepend', height: element.scrollHeight, top: element.scrollTop };
      setMessages((current) => mergeMessages(current, result.messages)); setHasOlder(result.has_older); setError('');
    } catch (err) { if (!signal.aborted && !accessFailure(err)) setError(err.message); }
    finally { if (!signal.aborted) setOlderBusy(false); }
  };
  const deliver = async (message) => {
    const signal = controllerRef.current.signal;
    setOutbox((current) => current.map((item) => item.client_message_id === message.client_message_id ? { ...item, state: 'sending', error: '' } : item));
    try {
      const result = await sendChatMessage(bookingId, { content: message.content, client_message_id: message.client_message_id }, { signal });
      if (signal.aborted) return;
      const element = scrollRef.current;
      if (element && element.scrollHeight - element.scrollTop - element.clientHeight < 140) scrollAction.current = { kind: 'bottom' };
      setMessages((current) => mergeMessages(current, [result.message]));
      setOutbox((current) => reconcileOutbox(current, [result.message], account.id));
    } catch (err) {
      if (!signal.aborted && !accessFailure(err)) setOutbox((current) => current.map((item) => item.client_message_id === message.client_message_id ? { ...item, state: 'failed', error: err.message } : item));
    }
  };
  const submit = (event) => {
    event.preventDefault();
    if (!text.trim() || text.trim().length > 4000 || denied) return;
    const message = { client_message_id: crypto.randomUUID(), content: text.trim(), state: 'sending' };
    scrollAction.current = { kind: 'bottom' }; setNewMessages(false);
    setOutbox((current) => [...current, message]); setText(''); deliver(message);
  };
  const bottom = () => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; setNewMessages(false); };
  const isOwner = booking && String(booking.owner.id) === String(account.id);
  const other = booking && (isOwner ? booking.caregiver : booking.owner);
  return <section className="chat-page">
    <a className="chat-back" href="#requests">← Volver a mis solicitudes</a>
    <div className="chat-title"><div><p className="eyebrow">Un espacio para coordinar el cuidado</p><h1>Chat del servicio</h1></div><span className="chat-private">Conversación privada</span></div>
    {error && <div className="error chat-error" role="alert"><p>{error}</p>{!booking && !denied && <button className="secondary" onClick={() => { setLoading(true); setError(''); setRevision((value) => value + 1); }}>Reintentar conexión</button>}{booking && <small>El historial visible se conserva. Volveremos a intentar la conexión automáticamente.</small>}</div>}
    {denied ? <div className="empty-state"><h2>Esta conversación no está disponible</h2><p>Solo el dueño y el cuidador de la solicitud pueden acceder a sus mensajes.</p><a className="button-link" href="#requests">Ver mis solicitudes</a></div> : loading ? <p role="status">Abriendo la conversación…</p> : booking && <div className="chat-layout">
      <aside className="chat-service"><p className="eyebrow">Solicitud #{booking.id}</p><h2>{booking.service_name || 'Servicio de cuidado'}</h2><span className={`status-badge ${booking.status}`}>{statuses[booking.status] || booking.status}</span><div className="chat-pet"><span aria-hidden="true">♡</span><div><small>El cuidado de</small><strong>{booking.pet.name}</strong></div></div><dl><div><dt>Inicio</dt><dd>{formatBookingTime(booking.start_at)}</dd></div><div><dt>Fin</dt><dd>{formatBookingTime(booking.end_at)}</dd></div></dl>{booking.status === 'requested' && <p className="chat-reminder">La solicitud sigue pendiente. El cuidador debe aceptarla para confirmar el servicio.</p>}<p className="muted small">Los horarios se muestran en hora de Colombia.</p></aside>
      <div className="chat-window">
        <header className="chat-person"><span className="chat-avatar" aria-hidden="true">{name(other).slice(0, 1) || 'P'}</span><div><h2>{name(other) || (isOwner ? 'Cuidador del servicio' : 'Dueño de la mascota')}</h2><p>{isOwner ? 'Tu cuidador' : 'Dueño de la mascota'} · Solicitud #{booking.id}</p></div></header>
        <div className="chat-history" ref={scrollRef} onScroll={(event) => { const el = event.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) setNewMessages(false); }}>
          {hasOlder && <div className="chat-older"><button className="secondary" disabled={olderBusy} onClick={loadOlder}>{olderBusy ? 'Cargando…' : 'Cargar mensajes anteriores'}</button></div>}
          {!messages.length && !outbox.length && <div className="chat-empty"><span aria-hidden="true">♡</span><h3>El buen cuidado empieza conversando</h3><p>Pregunta por las necesidades de la mascota o coordina los detalles de este servicio.</p></div>}
          <ol className="chat-messages" role="log" aria-label="Mensajes de la conversación" aria-live="polite" aria-relevant="additions">
            {messages.map((message, index) => {
              const own = String(message.sender_id) === String(account.id);
              const day = dayFormat.format(new Date(message.created_at));
              const newDay = !index || dayFormat.format(new Date(messages[index - 1].created_at)) !== day;
              return <li key={message.id} className="chat-entry">{newDay && <div className="chat-day">{day}</div>}<div className={`chat-bubble ${own ? 'own' : ''}`}><span className="visually-hidden">{own ? 'Tú' : name(other)}: </span><p>{message.content}</p><time dateTime={message.created_at} title={formatBookingTime(message.created_at)}>{hourFormat.format(new Date(message.created_at))}</time></div></li>;
            })}
            {outbox.map((message) => <li className="chat-entry" key={message.client_message_id}><div className={`chat-bubble own ${message.state}`}><p>{message.content}</p>{message.state === 'sending' ? <small role="status">Enviando…</small> : <div className="chat-send-error" role="alert"><small>No se pudo enviar. {message.error}</small><button className="secondary" onClick={() => deliver(message)}>Reintentar envío</button></div>}</div></li>)}
          </ol>
        </div>
        {newMessages && <button className="chat-new secondary" onClick={bottom}>Ver mensajes nuevos ↓</button>}
        <form className="chat-composer" onSubmit={submit}><label htmlFor="chat-message">Tu mensaje<textarea id="chat-message" value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} rows={2} placeholder="Escribe para coordinar el cuidado…" required /></label><div className="chat-composer-footer"><small>{text.length}/4000 · Los mensajes se actualizan cada 3 s</small><button type="submit" disabled={!text.trim()}>Enviar mensaje <span aria-hidden="true">↗</span></button></div></form>
      </div>
    </div>}
  </section>;
}
