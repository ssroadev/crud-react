import Select from './Select';
import { useEffect, useRef, useState } from 'react';
import { createBooking, getPets } from '../api';
import { bookingMoney, durationLabel, todayInBogota } from '../booking-utils';

export default function BookingForm({ caregiver, account, prefill = {} }) {
  const [pets, setPets] = useState([]);
  const [petState, setPetState] = useState({ loading: true, error: '' });
  const [retry, setRetry] = useState(0);
  const [form, setForm] = useState({ pet_id: prefill.pet_id || '', service: caregiver.services.some((offer) => offer.name === prefill.service) ? prefill.service : caregiver.services[0]?.name || '', date: prefill.date || '', start_time: prefill.start_time || '', end_time: prefill.end_time || '', location: '', notes: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(null);
  const summary = useRef(null);
  useEffect(() => {
    if (!account) return;
    let active = true;
    getPets().then((rows) => { if (active) { setPets(rows); setPetState({ loading: false, error: '' }); } })
      .catch((error) => { if (active) setPetState({ loading: false, error: error.message }); });
    return () => { active = false; };
  }, [account, retry]);
  const minutes = form.start_time && form.end_time ? (Number(form.end_time.slice(0, 2)) * 60 + Number(form.end_time.slice(3))) - (Number(form.start_time.slice(0, 2)) * 60 + Number(form.start_time.slice(3))) : 0;
  const offer = caregiver.services.find((service) => service.name === form.service);
  const estimated = offer && minutes > 0 ? Math.round(Number(offer.rate) * (offer.unit === 'hora' ? minutes / 60 : 1) * 100) / 100 : null;
  const change = (event) => { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); setErrors((current) => ({ ...current, [event.target.name]: undefined, availability: undefined, form: undefined })); };
  const send = async (event) => {
    event.preventDefault();
    const invalid = {};
    if (!form.pet_id) invalid.pet_id = 'Selecciona tu mascota.';
    if (!form.service) invalid.service = 'Selecciona el tipo de servicio.';
    if (!form.date || !form.start_time || !form.end_time || minutes <= 0) invalid.availability = 'Completa la fecha y un horario con hora final posterior a la inicial.';
    if (!form.location.trim()) invalid.location = 'Indica la ubicación del servicio.';
    if (Object.keys(invalid).length) { setErrors({ ...invalid, form: 'Revisa los datos de la solicitud.' }); summary.current?.focus(); return; }
    setBusy(true); setErrors({});
    try { setSuccess(await createBooking({ ...form, caregiver_profile_id: caregiver.id })); }
    catch (error) { setErrors({ ...error.fields, form: error.message }); summary.current?.focus(); }
    finally { setBusy(false); }
  };
  const fieldError = (key) => errors[key] && <p className="field-error" id={`booking-${key}-error`}>{errors[key]}</p>;
  const props = (name) => ({ name, value: form[name], onChange: change, 'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? `booking-${name}-error` : undefined });

  if (!account) return <section className="auth-required"><h2>Coordina su próximo cuidado</h2><p>Inicia sesión para elegir tu mascota y enviar una solicitud a este cuidador.</p><a href="#login" className="button-link">Iniciar sesión para solicitar</a></section>;
  if (String(account.profile.id) === String(caregiver.profile_id)) return <p className="muted">Este es tu perfil profesional. Las solicitudes de otros dueños aparecerán en tu sección de solicitudes.</p>;
  if (petState.loading) return <p role="status">Cargando tus mascotas…</p>;
  if (petState.error) return <p className="error" role="alert">{petState.error} <button className="secondary" onClick={() => { setPetState({ loading: true, error: '' }); setRetry((value) => value + 1); }}>Reintentar</button></p>;
  if (!pets.length) return <section className="auth-required"><h2>Primero, presenta a tu mascota</h2><p>Necesitas una mascota registrada en tu cuenta para solicitar el servicio.</p><a className="button-link" href="#pets">Agregar mi mascota</a></section>;
  if (success) return <section className="booking-success" role="status"><span className="status-badge requested">Pendiente de respuesta</span><h2>Tu solicitud fue enviada</h2><p>{success.message}</p><p>Importe estimado: <strong>{bookingMoney.format(success.booking.total_amount)}</strong></p><a href="#requests" className="button-link">Consultar el estado de mi solicitud →</a></section>;
  return <section className="booking-composer" id="solicitar-servicio">
    <p className="eyebrow">El siguiente paso de su cuidado</p><h2>Solicitar un servicio</h2>
    <p className="muted">La solicitud quedará pendiente hasta que el cuidador la acepte. Todos los horarios corresponden a Colombia.</p>
    <form noValidate onSubmit={send}>
      <fieldset className="booking-fields" disabled={busy}>
        <label>Mascota *<Select {...props('pet_id')} required><option value="">Selecciona tu mascota</option>{pets.map((pet) => <option key={pet.id} value={pet.id}>{pet.name}</option>)}</Select></label>{fieldError('pet_id')}
        <label>Tipo de servicio *<Select {...props('service')} required>{caregiver.services.map((service) => <option key={service.name} value={service.name}>{service.name} · {bookingMoney.format(service.rate)} / {service.unit}</option>)}</Select></label>{fieldError('service')}
        <div className="booking-time-grid">
          <label>Fecha *<input type="date" min={todayInBogota()} {...props('date')} required /></label>
          <label>Hora de inicio *<input type="time" {...props('start_time')} required /></label>
          <label>Hora de fin *<input type="time" {...props('end_time')} required /></label>
        </div>{fieldError('availability')}
        <p className="booking-estimate">Duración estimada: <strong>{durationLabel(minutes)}</strong>{estimated !== null && <> · Importe estimado: <strong>{bookingMoney.format(estimated)}</strong></>}</p>
        {offer && <p className="muted small">{offer.unit === 'hora' ? 'La tarifa por hora se calcula en proporción a la duración.' : `La solicitud incluye una unidad de ${offer.unit}, según la tarifa publicada.`}</p>}
        <label>Ubicación del servicio *<input {...props('location')} maxLength={250} placeholder="Dirección, barrio y ciudad donde se realizará el cuidado" required /></label>{fieldError('location')}
        <label>Necesidades y observaciones<textarea {...props('notes')} maxLength={2000} rows={4} placeholder="Alimentación, medicamentos, comportamiento o instrucciones para el cuidado." /></label>{fieldError('notes')}
        <div ref={summary} tabIndex={-1}>{errors.form && <p className="error" role="alert">{errors.form}</p>}</div>
        <button type="submit" disabled={busy}>{busy ? 'Enviando solicitud…' : 'Enviar solicitud al cuidador'}</button>
      </fieldset>
    </form>
  </section>;
}
