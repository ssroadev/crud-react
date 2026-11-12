import Select from './Select';
import { useEffect, useRef, useState } from 'react';
import options from '../../../shared/caregiver-options.json';
import preferences from '../../../shared/recommendation-options.json';
import { getCaregiverRecommendations, getCaregiver, getPets } from '../api';
import LocationPicker from './LocationPicker';
import CaregiverCard from './CaregiverCard';
import BookingForm from './BookingForm';
import { todayInBogota } from '../booking-utils';
import '../bookings.css';
import '../directory.css';

const initialFilters = { pet_id: '', service: '', species: '', needs: [], min_price: '', max_price: '', rate_unit: '', date: '', start_time: '', end_time: '', radius_km: '10', priority: 'balanced', min_rating: '', min_reviews: '', only_available: false };
const hasSchedule = (filters) => Boolean(filters.date && filters.start_time && filters.end_time && filters.start_time < filters.end_time);
const emptyResults = { recommendations: [], alternatives: [], context: {}, insufficient_matches: false };
const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const selectedFromHash = () => {
  const match = window.location.hash.match(/^#cuidador\/([^/]+)$/);
  try { return match ? decodeURIComponent(match[1]) : ''; } catch { return ''; }
};

function PawIcon() {
  return <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><ellipse cx="7" cy="11" rx="3" ry="4" transform="rotate(-25 7 11)" /><ellipse cx="14" cy="7" rx="3" ry="4" /><ellipse cx="22" cy="8" rx="3" ry="4" transform="rotate(20 22 8)" /><ellipse cx="27" cy="15" rx="3" ry="4" transform="rotate(30 27 15)" /><path d="M9 20c3-2 3-7 8-6s4 5 7 8c4 5-2 8-6 6-3-1-5 1-8 0-4-1-4-5-1-8Z" /></svg>;
}

function ResultCard({ caregiver, personalized, onRequest }) {
  const name = [caregiver.profile?.first_name, caregiver.profile?.last_name].filter(Boolean).join(' ');
  const initials = [caregiver.profile?.first_name?.[0], caregiver.profile?.last_name?.[0]].filter(Boolean).join('');
  const { reasons, warnings } = caregiver.recommendation;
  const link = `#cuidador/${encodeURIComponent(caregiver.id)}`;
  return <article className={`caregiver-card result-card ${warnings.length ? 'alternative-card' : ''}`}>
    <div className="result-card-top"><span className={`match-label ${warnings.length ? 'partial' : ''}`}>{warnings.length ? 'Opción para explorar' : personalized ? 'Coincide con tu búsqueda' : `${caregiver.years_experience} ${caregiver.years_experience === 1 ? 'año' : 'años'} de experiencia`}</span><span className="result-rating">{caregiver.rating !== null ? <>★ {caregiver.rating.toLocaleString('es-CO')} <small>({caregiver.review_count})</small></> : <small>Sin reseñas aún</small>}</span></div>
    <div className="card-heading"><div className="avatar" aria-hidden="true">{initials || 'P'}</div><div><h3>{name}</h3><p className="muted">{caregiver.zone}</p></div></div>
    <p className="result-bio">{caregiver.bio}</p>
    <div className="tags">{caregiver.species.map((species) => <span key={species}>{species}</span>)}{caregiver.distance_km !== null && <span>{caregiver.distance_km.toLocaleString('es-CO')} km aprox.</span>}</div>
    <p className={`availability-label ${caregiver.recommendation.availability || 'not_checked'}`}>{caregiver.recommendation.availability === 'available' ? 'Disponible en el horario elegido' : caregiver.recommendation.availability === 'unavailable' ? 'Horario solicitado no disponible' : 'Elige un horario para comprobar disponibilidad'}</p>
    {!!reasons.length && <div className="match-reasons"><p>¿Por qué encaja?</p><ul>{reasons.map((reason) => <li key={reason}><span aria-hidden="true">✓</span>{reason}</li>)}</ul></div>}
    {!!warnings.length && <ul className="match-warnings">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
    {!personalized && !!caregiver.specialties.length && <p className="result-specialties">{caregiver.specialties.join(' · ')}</p>}
    <ul className="rate-list">{caregiver.matching_services.map((service) => <li key={service.name}><span>{service.name}</span><strong>{money.format(service.rate)} <small>/ {service.unit}</small></strong></li>)}</ul>
    <div className="result-actions"><a className="button-link" href={link}>Ver perfil</a><a className="button-link primary-link" href={link} onClick={onRequest}>Solicitar servicio <span aria-hidden="true">↗</span></a></div>
  </article>;
}

export default function CaregiverDirectory({ revision = 0, account }) {
  const [filters, setFilters] = useState(initialFilters);
  const [location, setLocation] = useState(null);
  const [locationKey, setLocationKey] = useState(0);
  const [applied, setApplied] = useState({});
  const [appliedLabel, setAppliedLabel] = useState('');
  const [results, setResults] = useState(emptyResults);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [view, setView] = useState('recommendations');
  const [sort, setSort] = useState('recommended');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pets, setPets] = useState([]);
  const [petError, setPetError] = useState('');
  const [petsRevision, setPetsRevision] = useState(0);
  const [selectedId, setSelectedId] = useState(selectedFromHash);
  const [detail, setDetail] = useState({ loading: true, profile: null, error: '' });
  const requestIntent = useRef(false);
  const booking = useRef(null);
  const resultHeading = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    getCaregiverRecommendations(applied, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) { setResults(data); setError(''); setFieldErrors({}); }
    }).catch((err) => {
      if (!controller.signal.aborted) { setError(err.message); setFieldErrors(err.fields || {}); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applied, revision]);

  useEffect(() => {
    if (!account) return;
    const controller = new AbortController();
    const load = () => getPets({ signal: controller.signal }).then((rows) => {
      if (!controller.signal.aborted) { setPets(rows); setPetError(''); }
    }).catch((err) => { if (!controller.signal.aborted) setPetError(err.message); });
    load();
    window.addEventListener('focus', load);
    window.addEventListener('hashchange', load);
    return () => { controller.abort(); window.removeEventListener('focus', load); window.removeEventListener('hashchange', load); };
  }, [account, petsRevision]);

  useEffect(() => {
    const handleHash = () => { setSelectedId(selectedFromHash()); setDetail({ loading: true, profile: null, error: '' }); };
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

  useEffect(() => {
    if (selectedId && !detail.loading && requestIntent.current) {
      booking.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      requestIntent.current = false;
    }
  }, [selectedId, detail.loading]);

  const changeFilter = (event) => {
    const { name, value } = event.target;
    setFilters((current) => {
      const next = { ...current, [name]: value };
      if (!next.rate_unit && next.priority === 'price') next.priority = 'balanced';
      if (!hasSchedule(next)) next.only_available = false;
      return next;
    });
  };
  const changeLocation = (next) => {
    setLocation(next);
    if (!next) setFilters((current) => ({ ...current, priority: current.priority === 'distance' ? 'balanced' : current.priority }));
  };
  const submitFilters = (next, nextLocation = location) => {
    const { radius_km, needs, ...rest } = next;
    setLoading(true); setError(''); setFieldErrors({}); setView('recommendations'); setSort('recommended');
    setFiltersOpen(false);
    setApplied({ ...rest, needs: needs.join(','), ...(nextLocation ? { latitude: nextLocation.latitude, longitude: nextLocation.longitude, radius_km } : {}) });
    setAppliedLabel(nextLocation?.label || '');
    if (window.matchMedia('(max-width: 760px)').matches) resultHeading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const apply = (event) => { event.preventDefault(); submitFilters(filters); };
  const clear = () => {
    setFilters(initialFilters); setLocation(null); setLocationKey((value) => value + 1);
    submitFilters(initialFilters, null); setSort('recommended');
  };
  const broaden = (type) => {
    // Amplía los criterios aplicados, conservando las necesidades de la mascota.
    const { latitude, longitude, ...criteria } = applied;
    const next = { ...initialFilters, ...criteria, needs: applied.needs ? applied.needs.split(',') : [] };
    const appliedLocation = latitude !== undefined ? { latitude, longitude, label: appliedLabel } : null;
    if (type === 'radius') next.radius_km = String(Math.min(200, Number(applied.radius_km) * 2));
    if (type === 'time') { next.date = ''; next.start_time = ''; next.end_time = ''; next.only_available = false; }
    setFilters(next); setLocation(appliedLocation); setLocationKey((value) => value + 1); submitFilters(next, appliedLocation);
  };
  const propsFor = (name) => ({ name, value: filters[name], onChange: changeFilter, 'aria-invalid': Boolean(fieldErrors[name]), 'aria-describedby': fieldErrors[name] ? 'search-errors' : undefined });
  const chosenPriority = preferences.priorities.find(({ value }) => value === filters.priority);
  const appliedPriority = preferences.priorities.find(({ value }) => value === results.context.priority);
  const list = [...results[view]];
  if (sort === 'distance') list.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
  if (sort === 'rating') list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  if (sort === 'price') {
    const price = (caregiver) => Math.min(...caregiver.matching_services.filter((service) => service.unit === applied.rate_unit).map((service) => Number(service.rate)));
    list.sort((a, b) => price(a) - price(b));
  }

  return <>
    <div hidden={Boolean(selectedId)} className="directory-layout">
      <aside className="directory-sidebar" aria-label="Personalizar recomendaciones">
        <button className="mobile-filter-toggle" type="button" aria-expanded={filtersOpen} aria-controls="caregiver-filters" onClick={() => setFiltersOpen((value) => !value)}><PawIcon /><span>Personalizar mi búsqueda<small>Mascota, ubicación y horario</small></span><span aria-hidden="true">{filtersOpen ? '−' : '＋'}</span></button>
        <form id="caregiver-filters" className={`search-panel ${filtersOpen ? 'filters-open' : ''}`} onSubmit={apply} noValidate>
          <div className="filter-heading"><span className="filter-icon"><PawIcon /></span><div><h2>Su cuidador ideal</h2><p>Cuéntanos qué necesitas</p></div><button className="text-button" type="button" onClick={clear}>Limpiar</button></div>
          <section className="filter-section"><h3><span>01</span> Tu mascota</h3>
            {account && <label>Mascota<Select {...propsFor('pet_id')}><option value="">Elegir sin mascota guardada</option>{pets.map((pet) => <option key={pet.id} value={pet.id}>{pet.name}{pet.size ? ` · ${pet.size === 'pequeno' ? 'pequeño' : pet.size}` : ''}</option>)}</Select></label>}
            {petError && <p className="field-error" role="alert">{petError} <button className="text-button" type="button" onClick={() => setPetsRevision((value) => value + 1)}>Reintentar</button></p>}
            {account && !pets.length && !petError && <p className="filter-hint">Puedes buscar ahora o <a href="#pets">registrar tu mascota</a>.</p>}
            <label>¿A quién vamos a cuidar?<Select {...propsFor('species')}><option value="">Todas las especies</option>{options.species.map((value) => <option key={value}>{value}</option>)}</Select></label>
            {filters.pet_id && <p className="filter-hint">Confirma su especie. También usaremos su edad, si está registrada.</p>}
            <label>¿Qué servicio necesitas?<Select {...propsFor('service')}><option value="">Explorar todos los servicios</option>{options.services.map((value) => <option key={value}>{value}</option>)}</Select></label>
            <fieldset className="need-choices"><legend>Necesita atención especial en…</legend><div>{options.specialties.map((need) => <label key={need}><input type="checkbox" checked={filters.needs.includes(need)} onChange={() => setFilters((current) => ({ ...current, needs: current.needs.includes(need) ? current.needs.filter((item) => item !== need) : [...current.needs, need] }))} /><span>{need}</span></label>)}</div></fieldset>
          </section>
          <section className="filter-section"><h3><span>02</span> Cerca de ti</h3>
            <LocationPicker key={locationKey} value={location} onChange={changeLocation} title="Ubicación del servicio" />
            <label>Distancia máxima<Select {...propsFor('radius_km')} disabled={!location}>{[...new Set([1, 3, 5, 10, 20, 50, 100, 200, Number(filters.radius_km)])].sort((a, b) => a - b).map((km) => <option key={km} value={km}>{km} km</option>)}</Select></label>
            {!location && <p className="filter-hint">Añade tu ubicación para priorizar cuidadores cercanos.</p>}
          </section>
          <section className="filter-section"><h3><span>03</span> A tu ritmo</h3>
            <label>Fecha <span className="optional-text">Opcional</span><input type="date" min={todayInBogota()} {...propsFor('date')} /></label>
            <div className="filter-pair"><label>Desde<input type="time" {...propsFor('start_time')} /></label><label>Hasta<input type="time" {...propsFor('end_time')} /></label></div>
            <p className="filter-hint">Hora de Colombia. Comprobamos horarios y reservas.</p>
            <label className="availability-choice"><input type="checkbox" checked={filters.only_available} disabled={!hasSchedule(filters)} onChange={(event) => setFilters((current) => ({ ...current, only_available: event.target.checked }))} /><span>Solo mostrar disponibles en este horario</span></label>
            {!hasSchedule(filters) && <p className="filter-hint">Completa la fecha y las dos horas para activar esta opción.</p>}
          </section>
          <details className="budget-filters"><summary>Presupuesto opcional <span aria-hidden="true">＋</span></summary><div className="filter-section"><label>Comparar tarifas por<Select {...propsFor('rate_unit')}><option value="">Todas las unidades</option>{options.rateUnits.map((value) => <option key={value}>{value}</option>)}</Select></label><div className="filter-pair"><label>Mínimo (COP)<input type="number" min="0" placeholder="Sin mínimo" {...propsFor('min_price')} /></label><label>Máximo (COP)<input type="number" min="0" placeholder="Sin máximo" {...propsFor('max_price')} /></label></div></div></details>
          <section className="filter-section preference-filters"><h3><span>04</span> Lo que más valoras</h3>
            <label>Quiero priorizar<Select {...propsFor('priority')}>{preferences.priorities.map(({ value, label }) => <option key={value} value={value} disabled={(value === 'distance' && !location) || (value === 'price' && !filters.rate_unit)}>{label}</option>)}</Select></label>
            <p className="filter-hint">{chosenPriority?.description}</p>
            {(!location || !filters.rate_unit) && <p className="filter-hint">{!location && 'Añade una ubicación para priorizar cercanía. '}{!filters.rate_unit && 'Elige una unidad en Presupuesto para priorizar tarifas.'}</p>}
            <label>Calificación mínima<Select {...propsFor('min_rating')}><option value="">Sin mínimo</option>{preferences.minimumRatings.map((rating) => <option key={rating} value={rating}>{rating.toLocaleString('es-CO')} ★ o más</option>)}</Select></label>
            <label>Opiniones mínimas<Select {...propsFor('min_reviews')}><option value="">Sin mínimo</option>{preferences.minimumReviewCounts.map((count) => <option key={count} value={count}>{count} opiniones o más</option>)}</Select></label>
            <p className="filter-hint">Las opiniones ayudan a comparar experiencias. Los perfiles que no alcancen tus mínimos aparecerán en Otros perfiles.</p>
          </section>
          <button className="search-submit" type="submit" disabled={loading}>{loading ? 'Buscando…' : 'Encontrar mi cuidador'} <span aria-hidden="true">→</span></button>
        </form>
      </aside>
      <section className="directory-results" aria-label="Cuidadores encontrados" aria-busy={loading}>
        <div className="results-title" ref={resultHeading}><div><p className="eyebrow">Un cuidado que encaja contigo</p><h2>{results.context.personalized ? 'Tus recomendaciones' : 'Cuidadores para conocer'}</h2></div><span className="directory-count">{loading ? '…' : results.recommendations.length + results.alternatives.length} perfiles</span></div>
        <p className="results-description">{results.context.personalized ? 'Primero, quienes cumplen tus criterios, ordenados según lo que más valoras.' : 'Elige su especie, sus necesidades y tu ubicación para encontrar opciones más afines.'}</p>
        {!loading && !error && <div className="applied-preferences" aria-label="Preferencias aplicadas"><span>Prioridad: {appliedPriority?.label || 'Un buen equilibrio'}</span>{results.context.min_rating && <span>Desde {results.context.min_rating.toLocaleString('es-CO')} ★</span>}{results.context.min_reviews && <span>{results.context.min_reviews}+ opiniones</span>}{results.context.only_available && <span>Solo disponibles</span>}{results.context.availability_checked && <span>{applied.date} · {applied.start_time}–{applied.end_time}</span>}{results.context.price_comparable && <span>Tarifas por {applied.rate_unit}</span>}</div>}
        {results.context.pet && <p className="pet-context">Buscando para <strong>{results.context.pet.name}</strong>{results.context.inferred_needs.length ? ` · Por su edad: ${results.context.inferred_needs.join(', ').toLowerCase()}` : ''}</p>}
        {appliedLabel && <p className="location-context">{appliedLabel} · hasta {applied.radius_km} km <span>· distancia en línea recta</span></p>}
        <div className="results-toolbar"><div className="results-tabs" aria-label="Tipo de resultados"><button type="button" aria-pressed={view === 'recommendations'} onClick={() => setView('recommendations')}>{results.context.personalized ? 'Para tu solicitud' : 'Todos'} <span>{results.recommendations.length}</span></button><button type="button" aria-pressed={view === 'alternatives'} onClick={() => setView('alternatives')}>Otros perfiles <span>{results.alternatives.length}</span></button></div><label className="sort-control">Ordenar<Select aria-label="Ordenar cuidadores" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recommended">Compatibilidad</option><option value="distance" disabled={!results.context.location_used}>Cercanía</option><option value="rating">Calificación</option><option value="price" disabled={!results.context.price_comparable}>Menor tarifa</option></Select></label></div>
        {error && <div className="error" id="search-errors" role="alert"><strong>{error}</strong>{Object.keys(fieldErrors).length > 0 && <ul>{Object.entries(fieldErrors).map(([key, value]) => <li key={key}>{value}</li>)}</ul>}<button className="secondary" onClick={() => { setLoading(true); setApplied((current) => ({ ...current })); }}>Reintentar</button></div>}
        {loading ? <div className="result-skeletons" role="status"><span className="sr-only">Buscando cuidadores que se ajusten a tu solicitud…</span>{[0, 1, 2, 3].map((item) => <div key={item} className="result-skeleton" aria-hidden="true"><div /><span /><span /><p /><p /></div>)}</div> : !error && <>
          {results.insufficient_matches && <div className="broaden-panel" role="status"><strong>{results.recommendations.length ? 'Hay pocas coincidencias por ahora' : 'Todavía no hay una coincidencia completa'}</strong><p>Prueba ampliar tu búsqueda. Conservaremos la especie, el servicio y las necesidades de tu mascota.</p><div>{applied.latitude !== undefined && Number(applied.radius_km) < 200 && <button className="secondary" onClick={() => broaden('radius')}>Ampliar a {Math.min(200, Number(applied.radius_km) * 2)} km</button>}{applied.date && <button className="secondary" onClick={() => broaden('time')}>Buscar sin horario</button>}<button className="text-button" onClick={clear}>Explorar sin filtros</button></div></div>}
          {view === 'alternatives' && list.length > 0 && <p className="alternatives-note">Estas opciones requieren ajustar algún criterio. Revisa los avisos antes de solicitar un servicio.</p>}
          <p className="sr-only" role="status">{list.length} cuidadores en {view === 'alternatives' ? 'otros perfiles' : 'tus resultados'}.</p>
          {list.length ? <div className="caregiver-grid">{list.map((caregiver) => <ResultCard key={caregiver.id} caregiver={caregiver} personalized={results.context.personalized} onRequest={() => { requestIntent.current = true; }} />)}</div> : <div className="empty-state"><span className="empty-paw"><PawIcon /></span><h3>{view === 'alternatives' ? 'Ya estás viendo las mejores coincidencias' : 'Busquemos un poco más'}</h3><p>{view === 'alternatives' ? 'No hay otros perfiles para estos criterios. Puedes explorar sin filtros.' : 'Ajusta la distancia, el horario o el presupuesto para descubrir más opciones.'}</p>{view === 'recommendations' && results.alternatives.length > 0 ? <button onClick={() => setView('alternatives')}>Ver otros perfiles ({results.alternatives.length})</button> : <button className="secondary" onClick={clear}>Explorar sin filtros</button>}</div>}
          <p className="directory-footnote">La disponibilidad puede cambiar. El servicio se confirma cuando el cuidador acepta tu solicitud.</p>
        </>}
      </section>
    </div>
    {selectedId && <section className="caregiver-detail" aria-label="Perfil completo del cuidador"><a href="#caregivers" className="back-link">← Volver a mis resultados</a>{detail.loading ? <p role="status">Cargando perfil…</p> : detail.error ? <p role="alert" className="error">{detail.error}</p> : <div className="detail-columns"><CaregiverCard caregiver={detail.profile} /><div ref={booking}><BookingForm key={detail.profile.id} caregiver={detail.profile} account={account} prefill={applied} /></div></div>}</section>}
  </>;
}
