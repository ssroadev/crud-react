import { useEffect, useState } from 'react';
import { completeBooking, getBookings, markBookingRead, reviewBooking } from '../api';
import statuses from '../../../shared/booking-statuses.json';
import { bookingMoney, durationLabel, formatBookingTime, todayInBogota } from '../booking-utils';
import { filterRequests, requestCounts } from '../request-filters';
import '../bookings.css';
import '../chat.css';

const fullName = (profile) => [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
const caregiverLabels = { ...statuses, requested: 'Pendiente', confirmed: 'Aceptada', completed: 'Completada' };
const ownerUpdates = {
  confirmed: 'El cuidador aceptó tu solicitud. Tu reserva está confirmada.',
  rejected: 'El cuidador rechazó tu solicitud. Puedes buscar otra opción de cuidado.',
  completed: 'El cuidador marcó tu servicio como completado. Puedes consultar los detalles en tu historial.',
};
const metrics = [
  { status: 'requested', label: 'Pendientes', caption: 'Por responder', symbol: '◷' },
  { status: 'confirmed', label: 'Aceptadas', caption: 'En tu agenda', symbol: '✓' },
  { status: 'rejected', label: 'Rechazadas', caption: 'Respuestas enviadas', symbol: '−' },
  { status: 'completed', label: 'Completadas', caption: 'Cuidados finalizados', symbol: '♡' },
];

function RequestCard({ booking, received, onUpdated }) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const decide = async (decision) => {
    setBusy(true); setError('');
    try {
      const result = await reviewBooking(booking.id, decision, note);
      setRejecting(false); onUpdated(result.booking, result.message);
    } catch (err) { setError(err.message); if (err.status === 409) onUpdated(); }
    finally { setBusy(false); }
  };
  const finish = async () => {
    setBusy(true); setError('');
    try { const result = await completeBooking(booking.id); setCompleting(false); onUpdated(result.booking, result.message); }
    catch (err) { setError(err.message); if (err.status === 409) onUpdated(); }
    finally { setBusy(false); }
  };
  const read = async () => {
    setBusy(true); setError('');
    try { await markBookingRead(booking.id); onUpdated({ id: booking.id, owner_unread: false }, 'Respuesta marcada como leída.'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const ownerProfile = Array.isArray(booking.owner?.profile) ? booking.owner.profile[0] : booking.owner?.profile;
  const incompatible = booking.availability_check?.can_accept === false;
  const labels = received ? caregiverLabels : statuses;
  const size = { pequeno: 'Pequeña', mediano: 'Mediana', grande: 'Grande' }[booking.pet?.size];
  return <article className={`request-card ${booking.owner_unread ? 'has-update' : ''}`}>
    <div className="request-card-heading">
      <div><p className="eyebrow">Solicitud #{booking.id}</p><h3>{booking.service_name}</h3><p className="request-person">{received ? fullName(ownerProfile) : fullName(booking.caregiver_profile?.profile) || 'Cuidador del servicio'}</p></div>
      <span className={`status-badge ${booking.status}`}>{labels[booking.status] || booking.status}</span>
    </div>
    {!received && booking.owner_unread && <div className={`request-update ${booking.status}`} role="status"><strong>{ownerUpdates[booking.status] || 'Esta solicitud tiene una actualización.'}</strong><button className="secondary" disabled={busy} onClick={read}>Marcar respuesta como leída</button></div>}
    <div className="pet-brief"><div className="pet-avatar" aria-hidden="true">{booking.pet?.name?.[0] || 'P'}</div><div><strong>{booking.pet?.name || 'Mascota registrada'}</strong><span>{[booking.pet?.breed, size && `Tamaño ${size.toLowerCase()}`].filter(Boolean).join(' · ') || 'Mascota del servicio'}</span></div></div>
    <dl className="request-details">
      <div><dt>Inicio</dt><dd>{formatBookingTime(booking.start_at)}</dd></div>
      <div><dt>Fin</dt><dd>{formatBookingTime(booking.end_at)}</dd></div>
      <div><dt>Duración</dt><dd>{durationLabel(booking.duration_minutes)}</dd></div>
      <div><dt>Importe estimado</dt><dd>{bookingMoney.format(booking.total_amount)}</dd></div>
      <div className="request-wide"><dt>Ubicación</dt><dd>{booking.location || 'No indicada en la reserva anterior'}</dd></div>
      {received && ownerProfile?.phone && <div><dt>Teléfono del dueño</dt><dd>{ownerProfile.phone}</dd></div>}
      {received && booking.pet?.birth_date && <div><dt>Fecha de nacimiento de la mascota</dt><dd>{booking.pet.birth_date}</dd></div>}
    </dl>
    {received && booking.pet?.notes && <div className="request-notes"><strong>Información registrada de la mascota</strong><p>{booking.pet.notes}</p></div>}
    <div className="request-notes"><strong>Necesidades y observaciones del servicio</strong><p>{booking.notes || 'El dueño no agregó observaciones adicionales.'}</p></div>
    {booking.response_note && <div className="request-notes"><strong>Respuesta del cuidador</strong><p>{booking.response_note}</p></div>}
    <a className="request-chat-link" href={`#chat/${booking.id}`}><span aria-hidden="true">↗</span>Abrir chat del servicio</a>
    {booking.status === 'requested' && <p className="muted small">Pendiente de respuesta. El servicio todavía no está confirmado.</p>}
    {received && booking.status === 'requested' && booking.caregiver_profile_id && <div className="review-controls">
      {booking.availability_check && <p className={`availability-check ${incompatible ? 'incompatible' : 'compatible'}`}><span aria-hidden="true">{incompatible ? '!' : '✓'}</span>{booking.availability_check.reason}</p>}
      <label>Respuesta al dueño (opcional)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={2} disabled={busy} placeholder="Agrega un mensaje o explica el motivo del rechazo." /></label>
      <div className="form-actions"><button disabled={busy || incompatible} title={incompatible ? booking.availability_check.reason : undefined} onClick={() => decide('confirmed')}>Aceptar solicitud</button><button className="danger" disabled={busy} onClick={() => setRejecting(!rejecting)}>Rechazar</button></div>
      {rejecting && <div className="reject-confirmation"><p>Se informará al dueño que no podrás atender esta solicitud.</p><button className="danger" disabled={busy} onClick={() => decide('rejected')}>Confirmar rechazo</button></div>}
    </div>}
    {received && booking.status === 'confirmed' && <div className="completion-controls">
      {booking.can_complete ? <><p className="muted small">El horario del servicio ya terminó. Confirma su finalización para guardarlo como completado.</p><button className="secondary" disabled={busy} onClick={() => setCompleting(!completing)}>Marcar como completada</button>{completing && <div className="completion-confirmation"><p>¿Terminaste este servicio? Se actualizará el historial y se informará al dueño.</p><button disabled={busy} onClick={finish}>Confirmar finalización</button></div>}</> : <p className="muted small">Podrás marcar el servicio como completado después de su hora de finalización.</p>}
    </div>}
    {error && <p className="error" role="alert">{error}</p>}
    {(booking.created_at || booking.reviewed_at || booking.completed_at) && <details className="request-timeline"><summary>Ver registro de la solicitud</summary><ol>{booking.created_at && <li>Solicitada: {formatBookingTime(booking.created_at)}</li>}{booking.reviewed_at && <li>Respuesta del cuidador: {formatBookingTime(booking.reviewed_at)}</li>}{booking.completed_at && <li>Completada: {formatBookingTime(booking.completed_at)}</li>}</ol></details>}
  </article>;
}

export default function BookingRequests({ account }) {
  const isCaregiver = account.roles.includes('caregiver');
  const [view, setView] = useState(isCaregiver ? 'received' : 'sent');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [mode, setMode] = useState('requests');
  const [status, setStatus] = useState(isCaregiver ? 'requested' : 'all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let version = 0;
    const load = () => {
      const current = ++version;
      return getBookings(view, { signal: controller.signal }).then((rows) => { if (!controller.signal.aborted && current === version) { setBookings(rows); setError(''); } })
        .catch((err) => { if (!controller.signal.aborted && current === version) setError(err.message); })
        .finally(() => { if (!controller.signal.aborted && current === version) setLoading(false); });
    };
    load();
    const timer = setInterval(load, 30000);
    const refreshOnFocus = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', refreshOnFocus); };
  }, [view, revision]);
  const received = view === 'received';
  const selectView = (value) => { setView(value); setLoading(true); setBookings([]); setError(''); setMode('requests'); setStatus(value === 'received' ? 'requested' : 'all'); setFrom(''); setTo(''); setQuery(''); setSort('newest'); setPage(1); setFeedback(''); };
  const selectMode = (value) => { setMode(value); setStatus('all'); setSort(value === 'agenda' ? 'soonest' : 'newest'); setPage(1); };
  const selectStatus = (value) => { setMode(['completed', 'rejected', 'cancelled'].includes(value) ? 'history' : 'requests'); setStatus(value); setPage(1); };
  const clear = () => { setStatus('all'); setFrom(''); setTo(''); setQuery(''); setPage(1); };
  const onUpdated = (updated, message) => {
    if (updated) setBookings((current) => current.map((booking) => String(booking.id) === String(updated.id) ? { ...booking, ...updated } : booking));
    if (message) setFeedback(message);
    setRevision((value) => value + 1);
  };
  const invalidRange = from && to && from > to;
  const results = invalidRange ? [] : filterRequests(bookings, { status, from, to, query, mode, sort, prioritizeUpdates: !received });
  const unreadResponses = received ? 0 : bookings.filter((booking) => booking.owner_unread).length;
  const counts = requestCounts(bookings);
  const pages = Math.max(1, Math.ceil(results.length / 12));
  const currentPage = Math.min(page, pages);
  const visible = results.slice((currentPage - 1) * 12, currentPage * 12);
  const groups = Object.groupBy(visible, (booking) => booking.start_at.slice(0, 10));
  const dateShortcut = (days) => {
    const today = todayInBogota(); const end = new Date(`${today}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + days);
    setFrom(today); setTo(end.toISOString().slice(0, 10)); setPage(1);
  };
  const card = (booking) => <RequestCard key={`${view}-${booking.id}`} booking={booking} received={received} onUpdated={onUpdated} />;
  return <>
    <div className="management-heading"><div><p className="eyebrow">{received ? 'Tu espacio de cuidado' : 'Cada cuidado, en un mismo lugar'}</p><h1>{received ? 'Solicitudes recibidas' : 'Mis solicitudes'}</h1><p className="muted">{received ? 'Organiza tu agenda, conoce a cada mascota y elige los cuidados que puedes atender.' : 'Consulta los detalles y las respuestas de tus servicios. Cada solicitud necesita la aceptación del cuidador.'}</p></div><button className="secondary" onClick={() => { setLoading(true); setRevision((value) => value + 1); }}>Actualizar estados</button></div>
    {isCaregiver && <div className="section-tabs request-perspectives"><button aria-pressed={received} className={received ? 'active' : 'secondary'} onClick={() => { if (!received) selectView('received'); }}>Recibidas</button><button aria-pressed={!received} className={!received ? 'active' : 'secondary'} onClick={() => { if (received) selectView('sent'); }}>Enviadas por mí</button></div>}
    {received && <div className="request-metrics" aria-label="Resumen de solicitudes recibidas">{metrics.map((metric) => <button className={`metric-card ${metric.status} ${status === metric.status && mode !== 'agenda' ? 'selected' : ''}`} key={metric.status} aria-pressed={status === metric.status && mode !== 'agenda'} onClick={() => selectStatus(metric.status)}><span className="metric-top"><span>{metric.label}</span><span aria-hidden="true">{metric.symbol}</span></span><strong>{loading || error && !bookings.length ? '—' : counts[metric.status]}</strong><small>{metric.caption}</small></button>)}</div>}
    {received && <div className="management-tabs" aria-label="Vista de solicitudes">{[['requests', 'Solicitudes'], ['agenda', 'Agenda'], ['history', 'Historial']].map(([value, label]) => <button className={mode === value ? 'selected' : ''} aria-pressed={mode === value} key={value} onClick={() => selectMode(value)}>{label}</button>)}</div>}
    <div className="request-filter-panel">
      <div className="request-filters">
        <label>Buscar solicitud<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Mascota, dueño, servicio o número" type="search" /></label>
        <label>Estado<select value={mode === 'agenda' ? 'confirmed' : status} disabled={mode === 'agenda'} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">Todos los estados</option>{Object.entries(received ? caregiverLabels : statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>Desde<input type="date" value={from} aria-invalid={Boolean(invalidRange)} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
        <label>Hasta<input type="date" value={to} aria-invalid={Boolean(invalidRange)} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
        <label>Ordenar<select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="newest">{received ? 'Últimas solicitudes' : 'Últimas actualizaciones'}</option><option value="soonest">Fecha de servicio: primero la más cercana</option><option value="latest">Fecha de servicio: primero la más lejana</option></select></label>
      </div>
      <div className="date-shortcuts"><button className="secondary" onClick={() => dateShortcut(0)}>Hoy</button><button className="secondary" onClick={() => dateShortcut(6)}>Próximos 7 días</button><button className="secondary" onClick={clear}>Limpiar filtros</button><span className="muted small">Hora de Colombia · Actualización cada 30 s</span></div>
      {invalidRange && <p className="field-error" role="alert">La fecha inicial no puede ser posterior a la final.</p>}
    </div>
    {mode === 'agenda' && <p className="agenda-description">Tus servicios aceptados, organizados por día. Al terminar el horario, podrás marcarlos como completados.</p>}
    {mode === 'history' && <p className="agenda-description">Consulta todas tus solicitudes y el estado en que se encuentran, incluidas las completadas, rechazadas y canceladas.</p>}
    {feedback && <p className="success" role="status">{feedback}</p>}
    {unreadResponses > 0 && <div className="unread-responses" role="status"><strong>{unreadResponses} {unreadResponses === 1 ? 'respuesta nueva' : 'respuestas nuevas'} de tus servicios</strong><button className="secondary" onClick={() => { clear(); setSort('newest'); }}>Ver respuestas</button></div>}
    {error && <p className="error" role="alert">{error}</p>}
    {loading ? <p role="status">Cargando solicitudes…</p> : !invalidRange && <>
      <p className="request-result-count" role="status">{results.length} {results.length === 1 ? 'solicitud encontrada' : 'solicitudes encontradas'}</p>
      {!results.length && !error ? <div className="empty-state"><h2>{bookings.length ? 'No hay solicitudes con estos filtros' : received ? 'Tu próximo cuidado empieza aquí' : 'Todavía no has solicitado un servicio'}</h2><p>{bookings.length ? 'Cambia el estado o las fechas para consultar otras solicitudes.' : received ? 'Las solicitudes de los dueños aparecerán aquí para que puedas conocerlas y responder.' : 'Encuentra un cuidador y envíale los detalles del cuidado que necesitas.'}</p>{bookings.length ? <button className="secondary" onClick={clear}>Ver todos los estados</button> : !received && <a className="button-link" href="#home">Encontrar un cuidador</a>}</div> : mode === 'agenda' ? <div className="agenda-groups">{Object.entries(groups).map(([day, entries]) => <section className="agenda-group" key={day}><h2><span aria-hidden="true">◷</span>{new Intl.DateTimeFormat('es-CO', { dateStyle: 'full', timeZone: 'America/Bogota' }).format(new Date(`${day}T12:00:00-05:00`))}<span className="agenda-day-count">{entries.length} {entries.length === 1 ? 'servicio' : 'servicios'}</span></h2><div className="request-list">{entries.map(card)}</div></section>)}</div> : <div className="request-list">{visible.map(card)}</div>}
      {pages > 1 && <div className="request-pagination"><button className="secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button><span>Página {currentPage} de {pages}</span><button className="secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Siguiente</button></div>}
    </>}
  </>;
}
