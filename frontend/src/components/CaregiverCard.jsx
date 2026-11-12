import options from '../../../shared/caregiver-options.json';
import { useState } from 'react';
import CaregiverReviews from './CaregiverReviews';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });

export default function CaregiverCard({ caregiver, preview = false }) {
  const [summary, setSummary] = useState(null);
  const rating = summary ? summary.rating : caregiver.rating;
  const reviewCount = summary ? summary.review_count : caregiver.review_count;
  const ratingLabel = rating == null ? 'Sin calificaciones todavía' : `★ ${rating.toLocaleString('es-CO')} de 5 · ${reviewCount} ${reviewCount === 1 ? 'reseña' : 'reseñas'}`;
  const name = [caregiver.profile?.first_name, caregiver.profile?.last_name].filter(Boolean).join(' ');
  return (
    <article className="caregiver-card">
      <div className="card-heading">
        <div className="avatar" aria-hidden="true">{name ? name[0] : 'P'}</div>
        <div>
          <p className="eyebrow">{preview ? 'Vista previa para dueños' : 'Cuidador de mascotas'}</p>
          <h3>{name || 'Tu nombre'}</h3>
          <p className="muted">{caregiver.zone || 'Zona de cobertura por completar'}</p>
        </div>
      </div>
      {rating !== undefined && (!preview && caregiver.id ? <button type="button" className="profile-review-link" aria-label="Leer opiniones del cuidador" onClick={() => document.getElementById(`caregiver-reviews-${caregiver.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><span>{ratingLabel}</span><span>Leer opiniones ↓</span></button> : <p className="profile-rating">{ratingLabel}</p>)}
      <p className="preserve-lines">{caregiver.bio || 'Tu descripción personal aparecerá aquí.'}</p>
      <h4>Experiencia</h4>
      <p>{caregiver.years_experience || 0} años de experiencia</p>
      <p className="preserve-lines">{caregiver.experience || 'Cuéntales a los dueños cómo has cuidado mascotas.'}</p>
      <h4>Mascotas que atiendo</h4>
      <div className="tags">{(caregiver.species || []).map((species) => <span key={species}>{species}</span>)}</div>
      {!!caregiver.specialties?.length && <>
        <h4>Especialidades</h4>
        <div className="tags">{caregiver.specialties.map((specialty) => <span key={specialty}>{specialty}</span>)}</div>
      </>}
      <h4>Servicios y tarifas · COP</h4>
      {caregiver.services?.length ? (
        <ul className="rate-list">{caregiver.services.map((service) => (
          <li key={service.name}><span>{service.name}</span><strong>{money.format(Number(service.rate) || 0)} / {service.unit}</strong></li>
        ))}</ul>
      ) : <p className="muted">Los servicios aparecerán aquí.</p>}
      <h4>Disponibilidad semanal</h4>
      <p className="muted small">Hora de Colombia · America/Bogota</p>
      {caregiver.availability?.length ? (
        <ul className="schedule-list">{[...caregiver.availability].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)).map((slot, index) => (
          <li key={index}><span>{options.days[slot.day]}</span><span>{slot.start} – {slot.end}</span></li>
        ))}</ul>
      ) : <p className="muted">Los horarios aparecerán aquí.</p>}
      {!!caregiver.photos?.length && <>
        <h4>Fotografías</h4>
        <div className="photo-grid">{caregiver.photos.filter((url) => /^https?:\/\//i.test(url)).map((url, index) => (
          <a key={index} href={url} target="_blank" rel="noreferrer">
            <img src={url} alt={`Fotografía ${index + 1} de ${name || 'tu perfil'}`} loading="lazy" />
          </a>
        ))}</div>
      </>}
      {!preview && caregiver.id && <CaregiverReviews caregiverId={caregiver.id} onSummary={setSummary} />}
    </article>
  );
}
