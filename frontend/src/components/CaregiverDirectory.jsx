import { useEffect, useState } from 'react';
import options from '../../../shared/caregiver-options.json';
import { getCaregivers, getCaregiver } from '../api';
import LocationPicker from './LocationPicker';
import CaregiverCard from './CaregiverCard';
import BookingForm from './BookingForm';
import '../bookings.css';

const initialFilters = { service: '', species: '', specialty: '', min_price: '', max_price: '', rate_unit: '', date: '', start_time: '', end_time: '', sort: 'distance', radius_km: '10' };
const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
const selectedFromHash = () => {
  const match = window.location.hash.match(/^#cuidador\/([^/]+)$/);
  try { return match ? decodeURIComponent(match[1]) : ''; } catch { return ''; }
};

function ResultCard({ caregiver }) {
  const name = [caregiver.profile?.first_name, caregiver.profile?.last_name].filter(Boolean).join(' ');
  return <article className="caregiver-card result-card">
    <div className="card-heading">
      <div className="avatar" aria-hidden="true">{name[0] || 'P'}</div>
      <div><h3>{name}</h3><p className="muted">{caregiver.zone}</p></div>
    </div>
    <div className="result-meta">
      <span>{caregiver.distance_km !== null ? `A ${caregiver.distance_km.toLocaleString('es-CO')} km aprox.` : 'Distancia sin calcular'}</span>
      <span>{caregiver.rating !== null ? `★ ${caregiver.rating.toLocaleString('es-CO')} · ${caregiver.review_count} ${caregiver.review_count === 1 ? 'reseña' : 'reseñas'}` : 'Sin calificaciones'}</span>
    </div>
    <p className="result-bio">{caregiver.bio}</p>
    <div className="tags">{caregiver.species.map((species) => <span key={species}>{species}</span>)}</div>
    {!!caregiver.specialties.length && <p className="muted small">{caregiver.specialties.join(' · ')}</p>}
    <ul className="rate-list">{caregiver.matching_services.map((service) => <li key={service.name}><span>{service.name}</span><strong>{money.format(service.rate)} / {service.unit}</strong></li>)}</ul>
    <a className="button-link" href={`#cuidador/${encodeURIComponent(caregiver.id)}`}>Ver perfil completo <span aria-hidden="true">→</span></a>
  </article>;
}

export default function CaregiverDirectory({ revision = 0, account }) {
  const [filters, setFilters] = useState(initialFilters);
  const [location, setLocation] = useState(null);
  const [locationKey, setLocationKey] = useState(0);
  const [applied, setApplied] = useState({});
  const [appliedLabel, setAppliedLabel] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [selectedId, setSelectedId] = useState(selectedFromHash);
  const [detail, setDetail] = useState({ loading: true, profile: null, error: '' });

  useEffect(() => {
    const controller = new AbortController();
    getCaregivers(applied, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) { setResults(data); setError(''); setFieldErrors({}); }
    }).catch((err) => {
      if (!controller.signal.aborted) { setError(err.message); setFieldErrors(err.fields || {}); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applied, revision]);

  useEffect(() => {
    const handleHash = () => {
      setSelectedId(selectedFromHash());
      setDetail({ loading: true, profile: null, error: '' });
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    getCaregiver(selectedId, { signal: controller.signal }).then((profile) => {
      if (!controller.signal.aborted) setDetail({ loading: false, profile, error: '' });
    }).catch((err) => {
      if (!controller.signal.aborted) setDetail({ loading: false, profile: null, error: err.message });
    });
    return () => controller.abort();
  }, [selectedId, revision]);

  const changeFilter = (event) => setFilters((current) => ({ ...current, [event.target.name]: event.target.value }));
  const apply = (event) => {
    event.preventDefault();
    const { radius_km, ...rest } = filters;
    setLoading(true); setError(''); setFieldErrors({});
    setApplied({ ...rest, ...(location ? { latitude: location.latitude, longitude: location.longitude, radius_km } : {}) });
    setAppliedLabel(location?.label || '');
  };
  const clear = () => {
    setFilters(initialFilters); setLocation(null); setLocationKey((value) => value + 1);
    setApplied({}); setAppliedLabel(''); setLoading(true); setError(''); setFieldErrors({});
  };
  const propsFor = (name) => ({ name, value: filters[name], onChange: changeFilter, 'aria-invalid': Boolean(fieldErrors[name]) });

  return <>
    <div hidden={Boolean(selectedId)}>
      <form className="search-panel" onSubmit={apply} noValidate>
        <LocationPicker key={locationKey} value={location} onChange={setLocation} title="¿Dónde necesitas un cuidador?" />
        <div className="search-filters">
          <label>Distancia máxima<select {...propsFor('radius_km')} disabled={!location}>{[1, 3, 5, 10, 20, 50, 100, 200].map((km) => <option key={km} value={km}>{km} km</option>)}</select></label>
          <label>Servicio<select {...propsFor('service')}><option value="">Todos los servicios</option>{options.services.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Especie<select {...propsFor('species')}><option value="">Todas las especies</option>{options.species.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Especialidad<select {...propsFor('specialty')}><option value="">Todas las especialidades</option>{options.specialties.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Precio mínimo (COP)<input type="number" min="0" step="0.01" placeholder="Sin mínimo" {...propsFor('min_price')} /></label>
          <label>Precio máximo (COP)<input type="number" min="0" step="0.01" placeholder="Sin máximo" {...propsFor('max_price')} /></label>
          <label>Unidad de tarifa<select {...propsFor('rate_unit')}><option value="">Todas las unidades</option>{options.rateUnits.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Ordenar por<select {...propsFor('sort')}><option value="distance">Más cercanos</option><option value="price">Menor tarifa</option><option value="rating">Mejor calificación</option></select></label>
        </div>
        <fieldset className="availability-filter">
          <legend>Disponibilidad para una fecha (opcional)</legend>
          <div className="search-filters availability-inputs">
            <label>Fecha<input type="date" {...propsFor('date')} /></label>
            <label>Desde<input type="time" {...propsFor('start_time')} /></label>
            <label>Hasta<input type="time" {...propsFor('end_time')} /></label>
          </div>
          <p className="muted small">Hora de Colombia. La franja debe quedar cubierta por el horario del cuidador y libre de reservas solicitadas o confirmadas.</p>
        </fieldset>
        <div className="form-actions"><button type="submit" disabled={loading}>{loading ? 'Buscando…' : 'Buscar cuidadores'}</button><button className="secondary" type="button" onClick={clear}>Limpiar filtros</button></div>
        {!location && <p className="muted small">Sin ubicación se muestran todas las zonas. Selecciona un lugar para filtrar por distancia.</p>}
      </form>
      {error && <div className="error" role="alert"><strong>{error}</strong>{Object.keys(fieldErrors).length > 0 && <ul>{Object.entries(fieldErrors).map(([key, value]) => <li key={key}>{value}</li>)}</ul>}<button className="secondary" onClick={() => { setLoading(true); setApplied((current) => ({ ...current })); }}>Reintentar</button></div>}
      {loading ? <p role="status">Buscando cuidadores que se ajusten a tus criterios…</p> : !error && <>
        <div className="results-heading" role="status"><strong>{results.length} {results.length === 1 ? 'cuidador encontrado' : 'cuidadores encontrados'}</strong>{appliedLabel && <span className="muted small">{appliedLabel} · hasta {applied.radius_km} km · distancia en línea recta</span>}</div>
        {results.length ? <div className="caregiver-grid">{results.map((caregiver) => <ResultCard key={caregiver.id} caregiver={caregiver} />)}</div> : <div className="empty-state"><h2>No encontramos cuidadores con esos criterios</h2><p>Prueba ampliar la distancia, cambiar la fecha o ajustar los filtros de servicio y precio.</p><button className="secondary" onClick={clear}>Limpiar filtros</button></div>}
      </>}
    </div>
    {selectedId && <section className="caregiver-detail" aria-label="Perfil completo del cuidador">
      <a href="#" className="back-link">← Volver a los resultados</a>
      {detail.loading ? <p role="status">Cargando perfil…</p> : detail.error ? <p role="alert" className="error">{detail.error}</p> : <><CaregiverCard caregiver={detail.profile} /><BookingForm key={detail.profile.id} caregiver={detail.profile} account={account} prefill={applied} /></>}
    </section>}
  </>;
}
