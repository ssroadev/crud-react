import { useId, useRef, useState } from 'react';
import { publishBookingRating } from '../api';
import RatingStars from './RatingStars';
import '../reviews.css';

const labels = ['Muy mala', 'Mala', 'Regular', 'Buena', 'Excelente'];

export default function BookingRating({ booking, onPublished }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [published, setPublished] = useState(null);
  const summary = useRef(null);
  const firstStar = useRef(null);
  const id = useId();
  const review = published || booking.review;

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!rating) { setErrors({ rating: 'Elige una puntuación de 1 a 5 estrellas.' }); firstStar.current?.focus(); return; }
    setBusy(true); setErrors({});
    try {
      const result = await publishBookingRating(booking.id, { rating, comment: comment.trim() || null });
      setPublished(result.review); onPublished(result.review, result.message);
    } catch (err) { setErrors({ ...err.fields, form: err.message }); summary.current?.focus(); }
    finally { setBusy(false); }
  };

  if (review) return <section className="booking-rating published-rating" aria-label="Tu valoración del servicio"><p className="rating-complete" role="status">✓ Tu opinión ya está publicada</p><RatingStars rating={review.rating} />{review.comment && <p className="review-comment">{review.comment}</p>}{booking.caregiver_profile_id && <a href={`#cuidador/${booking.caregiver_profile_id}`}>Ver opiniones del cuidador →</a>}</section>;
  if (!booking.can_rate) return null;
  return <section className="booking-rating" aria-label="Valorar este servicio">
    <div className="booking-rating-heading"><div><p className="eyebrow">Tu experiencia ayuda a otros</p><h4>¿Cómo fue su cuidado?</h4></div>{!open && <button type="button" className="secondary" onClick={() => setOpen(true)}>Valorar servicio</button>}</div>
    {open && <form onSubmit={submit} noValidate>
      <fieldset disabled={busy} className="rating-fields"><fieldset className="rating-choice" aria-describedby={errors.rating ? `${id}-rating-error` : undefined}><legend>Tu puntuación <span aria-hidden="true">*</span></legend><div>{[1, 2, 3, 4, 5].map((value) => <label key={value} className={value <= rating ? 'is-filled' : ''}><input ref={value === 1 ? firstStar : undefined} type="radio" name={`${id}-rating`} value={value} checked={rating === value} onChange={() => { setRating(value); setErrors({}); }} aria-label={`${value} ${value === 1 ? 'estrella' : 'estrellas'}`} /><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2-4.5-4.4 6.3-.9Z" /></svg></label>)}<span aria-live="polite">{rating ? labels[rating - 1] : 'Selecciona tus estrellas'}</span></div></fieldset>
        {errors.rating && <p className="field-error" id={`${id}-rating-error`} role="alert">{errors.rating}</p>}
        <label>Cuéntanos tu experiencia (opcional)<textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} maxLength={2000} placeholder="¿Cómo cuidó de tu mascota? ¿Qué destacarías de este servicio?" aria-invalid={Boolean(errors.comment)} aria-describedby={errors.comment ? `${id}-comment-error` : undefined} /></label>
        {errors.comment && <p className="field-error" id={`${id}-comment-error`}>{errors.comment}</p>}
        <p className="rating-privacy">Tu puntuación, comentario y nombre se mostrarán en el perfil del cuidador. Una valoración por servicio. <span>{comment.length}/2000</span></p>
        <div ref={summary} tabIndex={-1}>{errors.form && <p className="error" role="alert">{errors.form}</p>}</div>
        <div className="form-actions"><button type="submit">{busy ? 'Publicando…' : 'Publicar opinión'}</button><button type="button" className="secondary" onClick={() => setOpen(false)}>Ahora no</button></div>
      </fieldset>
    </form>}
  </section>;
}
