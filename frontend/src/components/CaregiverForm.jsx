import { useState } from 'react';
import options from '../../../shared/caregiver-options.json';
import { saveCaregiverProfile } from '../api';
import CaregiverCard from './CaregiverCard';
import LocationPicker from './LocationPicker';

const emptyProfile = {
  bio: '', experience: '', years_experience: 0, zone: '', species: [],
  specialties: [], services: [], availability: [], photos: [], status: 'draft',
  latitude: null, longitude: null, location_name: '',
};

function FieldError({ errors, name }) {
  return errors[name] ? <p id={`error-${name}`} className="field-error">{errors[name]}</p> : null;
}

export default function CaregiverForm({ profile, account, onSaved }) {
  const [form, setForm] = useState(() => ({ ...emptyProfile, ...profile }));
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [dirty, setDirty] = useState(false);

  const change = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setMessage('');
    setDirty(true);
  };
  const toggle = (key, value) => change(key, form[key].includes(value)
    ? form[key].filter((item) => item !== value) : [...form[key], value]);
  const updateItem = (key, index, changes) => change(key, form[key].map((item, i) => i === index ? { ...item, ...changes } : item));
  const fieldProps = (name) => ({
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `error-${name}` : undefined,
  });

  const save = async (status) => {
    setSaving(true);
    setMessage('');
    setErrors({});
    try {
      const saved = await saveCaregiverProfile(account.id, {
        ...form, status,
        years_experience: form.years_experience === '' ? null : Number(form.years_experience),
        services: form.services.map((service) => ({ ...service, rate: service.rate === '' ? null : Number(service.rate) })),
        photos: form.photos.map((url) => url.trim()).filter(Boolean),
      });
      setForm(saved);
      setDirty(false);
      setMessage(status === 'published' ? 'Tu perfil está publicado. Los dueños ya pueden consultar tus servicios.' : 'Borrador guardado. Tu perfil no aparece en la búsqueda de cuidadores.');
      onSaved(saved);
    } catch (error) {
      setErrors({ ...error.fields, form: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="editor-layout">
      <div>
        <div className="section-heading">
          <div><p className="eyebrow">Tu espacio profesional</p><h2>Perfil de cuidador</h2></div>
          <span className={`status-badge ${form.status}`}>{form.status === 'published' ? 'Publicado' : 'Borrador'}</span>
        </div>
        <p className="muted">Presenta tu experiencia y ayuda a los dueños a conocerte. Los campos con * son obligatorios para publicar.</p>
        <form noValidate onSubmit={(event) => { event.preventDefault(); save('published'); }}>
          <fieldset disabled={saving} className="editor-fields">
            <section className="form-section">
              <h3>Sobre ti</h3>
              <label>Descripción personal *
                <textarea value={form.bio} onChange={(e) => change('bio', e.target.value)} rows={4} maxLength={3000} {...fieldProps('bio')} placeholder="¿Qué hace especial tu forma de cuidar?" />
              </label>
              <FieldError errors={errors} name="bio" />
              <label>Años de experiencia *
                <input type="number" min="0" max="100" step="1" value={form.years_experience} onChange={(e) => change('years_experience', e.target.value)} {...fieldProps('years_experience')} />
              </label>
              <FieldError errors={errors} name="years_experience" />
              <label>Experiencia previa *
                <textarea value={form.experience} onChange={(e) => change('experience', e.target.value)} rows={3} maxLength={3000} {...fieldProps('experience')} placeholder="Cuenta qué mascotas has cuidado y qué has aprendido." />
              </label>
              <FieldError errors={errors} name="experience" />
              <label>Zona de cobertura *
                <input value={form.zone} onChange={(e) => change('zone', e.target.value)} maxLength={200} placeholder="Ej. Bogotá: Chapinero y Teusaquillo" {...fieldProps('zone')} />
              </label>
              <FieldError errors={errors} name="zone" />
              <LocationPicker title="Punto de referencia de tus servicios" value={form.latitude !== null && form.longitude !== null ? {
                latitude: form.latitude, longitude: form.longitude, label: form.location_name,
              } : null} onChange={(location) => {
                setForm((current) => ({ ...current, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null, location_name: location?.label ?? '' }));
                setErrors((current) => ({ ...current, location: undefined }));
                setDirty(true); setMessage('');
              }} />
              <p className="muted small">Registra un punto de referencia para aparecer en las búsquedas por cercanía. La zona de cobertura describe dónde prestas tus servicios.</p>
              <FieldError errors={errors} name="location" />
            </section>
            <section className="form-section">
              <h3>Mascotas y especialidades</h3>
              <fieldset className="choice-group" {...fieldProps('species')}>
                <legend>Especies que atiendes *</legend>
                <div className="choices">{options.species.map((species) => (
                  <label key={species}><input type="checkbox" checked={form.species.includes(species)} onChange={() => toggle('species', species)} />{species}</label>
                ))}</div>
              </fieldset>
              <FieldError errors={errors} name="species" />
              <fieldset className="choice-group">
                <legend>Especialidades (opcional)</legend>
                <div className="choices">{options.specialties.map((specialty) => (
                  <label key={specialty}><input type="checkbox" checked={form.specialties.includes(specialty)} onChange={() => toggle('specialties', specialty)} />{specialty}</label>
                ))}</div>
              </fieldset>
              <FieldError errors={errors} name="specialties" />
            </section>
            <section className="form-section">
              <h3>Servicios y tarifas *</h3>
              <p className="muted small">Selecciona tus servicios e indica su precio en pesos colombianos (COP).</p>
              {options.services.map((name) => {
                const index = form.services.findIndex((service) => service.name === name);
                const service = form.services[index];
                return <div className="service-row" key={name}>
                  <label className="checkbox-label"><input type="checkbox" checked={Boolean(service)} onChange={() => change('services', service
                    ? form.services.filter((item) => item.name !== name) : [...form.services, { name, rate: '', unit: 'hora' }])} />{name}</label>
                  {service && <div className="rate-inputs">
                    <label>Tarifa (COP)<input aria-label={`Tarifa de ${name}`} type="number" min="0.01" max="100000000" step="0.01" value={service.rate} onChange={(e) => updateItem('services', index, { rate: e.target.value })} {...fieldProps('services')} /></label>
                    <label>Por<select aria-label={`Unidad de ${name}`} value={service.unit} onChange={(e) => updateItem('services', index, { unit: e.target.value })}>{options.rateUnits.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
                  </div>}
                </div>;
              })}
              <FieldError errors={errors} name="services" />
            </section>
            <section className="form-section">
              <h3>Disponibilidad semanal *</h3>
              <p className="muted small">Hora de Colombia. Puedes agregar varias franjas por día, sin superposiciones. Cada franja comienza y termina el mismo día.</p>
              {form.availability.map((slot, index) => <div className="availability-row" key={index}>
                <label>Día<select aria-label={`Día del horario ${index + 1}`} value={slot.day} onChange={(e) => updateItem('availability', index, { day: Number(e.target.value) })}>{options.days.map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}</select></label>
                <label>Desde<input aria-label={`Inicio del horario ${index + 1}`} type="time" value={slot.start} onChange={(e) => updateItem('availability', index, { start: e.target.value })} {...fieldProps('availability')} /></label>
                <label>Hasta<input aria-label={`Fin del horario ${index + 1}`} type="time" value={slot.end} onChange={(e) => updateItem('availability', index, { end: e.target.value })} {...fieldProps('availability')} /></label>
                <button className="danger" type="button" aria-label={`Eliminar horario ${index + 1}`} onClick={() => change('availability', form.availability.filter((_, i) => i !== index))}>Quitar</button>
              </div>)}
              <button className="secondary" type="button" disabled={form.availability.length >= 50} onClick={() => change('availability', [...form.availability, { day: 1, start: '08:00', end: '17:00' }])}>+ Agregar horario</button>
              <FieldError errors={errors} name="availability" />
            </section>
            <section className="form-section">
              <h3>Fotografías (opcional)</h3>
              <p className="muted small">Agrega hasta 6 enlaces públicos a fotografías de tu experiencia o espacio de cuidado.</p>
              {form.photos.map((url, index) => <div className="photo-input" key={index}>
                <label>URL de la fotografía {index + 1}<input type="url" value={url} maxLength={2048} placeholder="https://…" onChange={(e) => change('photos', form.photos.map((photo, i) => i === index ? e.target.value : photo))} {...fieldProps('photos')} /></label>
                <button type="button" className="danger" aria-label={`Eliminar fotografía ${index + 1}`} onClick={() => change('photos', form.photos.filter((_, i) => i !== index))}>Quitar</button>
              </div>)}
              <button className="secondary" type="button" disabled={form.photos.length >= 6} onClick={() => change('photos', [...form.photos, ''])}>+ Agregar fotografía</button>
              <FieldError errors={errors} name="photos" />
            </section>
            {errors.form && <div className="error" role="alert"><strong>{errors.form}</strong>{Object.entries(errors).filter(([key, value]) => key !== 'form' && value).length > 0 && <ul>{Object.entries(errors).filter(([key, value]) => key !== 'form' && value).map(([key, value]) => <li key={key}>{value}</li>)}</ul>}</div>}
            <div className="save-panel">
              {dirty && <p className="muted small">Tienes cambios sin guardar.</p>}
              {form.status === 'published' && <p className="muted small">Guardar como borrador retira tu perfil de la búsqueda.</p>}
              <div className="form-actions">
                <button type="submit">{saving ? 'Guardando…' : form.status === 'published' ? 'Actualizar publicación' : 'Publicar perfil'}</button>
                <button type="button" className="secondary" onClick={() => save('draft')}>Guardar borrador</button>
                <button type="button" className="secondary preview-toggle" aria-expanded={showPreview} onClick={() => setShowPreview(!showPreview)}>Vista previa</button>
              </div>
            </div>
          </fieldset>
        </form>
        {message && <p className="success" role="status">{message}</p>}
      </div>
      <aside className={`profile-preview ${showPreview ? 'is-visible' : ''}`} aria-label="Vista previa del perfil">
        <CaregiverCard caregiver={{ ...form, profile: account }} preview />
      </aside>
    </div>
  );
}
