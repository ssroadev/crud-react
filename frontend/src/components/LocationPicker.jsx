import { useId, useRef, useState } from 'react';
import { findLocations } from '../api';

export default function LocationPicker({ value, onChange, title = 'Ubicación' }) {
  const id = useId();
  const requestId = useRef(0);
  const [query, setQuery] = useState(value?.label || '');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [latitude, setLatitude] = useState(value?.latitude ?? '');
  const [longitude, setLongitude] = useState(value?.longitude ?? '');

  const select = (location) => {
    requestId.current += 1;
    onChange(location);
    setResults([]);
    setError('');
    setBusy(false);
    if (location) {
      setQuery(location.label);
      setLatitude(location.latitude);
      setLongitude(location.longitude);
    } else {
      setQuery(''); setLatitude(''); setLongitude('');
    }
  };

  const search = async () => {
    const current = ++requestId.current;
    setBusy(true); setError(''); setResults([]);
    try {
      const locations = await findLocations(query);
      if (current !== requestId.current) return;
      setResults(locations);
      if (!locations.length) setError('No encontramos esa ubicación. Incluye la ciudad o ingresa las coordenadas.');
    } catch (err) { if (current === requestId.current) setError(err.message); }
    finally { if (current === requestId.current) setBusy(false); }
  };

  const locate = () => {
    if (!navigator.geolocation) { setError('Tu navegador no ofrece ubicación. Puedes ingresarla manualmente.'); return; }
    const current = ++requestId.current;
    setBusy(true); setError('');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (current === requestId.current) select({ latitude: coords.latitude, longitude: coords.longitude, label: 'Mi ubicación actual' });
    }, (err) => {
      if (current !== requestId.current) return;
      setBusy(false);
      setError(err.code === 1 ? 'No autorizaste la ubicación. Puedes buscar una dirección o ingresar coordenadas.' : 'No se pudo obtener tu ubicación. Intenta de nuevo o ingrésala manualmente.');
    }, { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false });
  };

  const useCoordinates = () => {
    const lat = Number(latitude), lng = Number(longitude);
    if (String(latitude).trim() === '' || String(longitude).trim() === '' || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError('Indica latitud entre -90 y 90 y longitud entre -180 y 180.'); return;
    }
    select({ latitude: lat, longitude: lng, label: `Coordenadas ${lat.toFixed(5)}, ${lng.toFixed(5)}` });
  };

  return <fieldset className="location-picker">
    <legend>{title}</legend>
    <div className="location-search-row">
      <label htmlFor={`${id}-query`}>Ciudad, barrio o dirección
        <input id={`${id}-query`} value={query} maxLength={160} placeholder="Ej. Chapinero, Bogotá, Colombia" onChange={(event) => {
          requestId.current += 1; setBusy(false); setQuery(event.target.value); setResults([]); setError(''); if (value) onChange(null);
        }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); search(); } }} />
      </label>
      <button type="button" className="secondary" disabled={busy || query.trim().length < 3} onClick={search}>Localizar</button>
      <button type="button" className="secondary" disabled={busy} onClick={locate}>Usar mi ubicación</button>
    </div>
    {busy && <p className="muted small" role="status">Buscando ubicación…</p>}
    {results.length > 0 && <ul className="location-results" aria-label="Ubicaciones encontradas">{results.map((location, index) => <li key={index}><button type="button" className="secondary" onClick={() => select(location)}>{location.label}</button></li>)}</ul>}
    {error && <p className="field-error" role="alert">{error}</p>}
    {value && <div className="selected-location"><span>✓ {value.label || 'Ubicación seleccionada'} <span className="muted small">({Number(value.latitude).toFixed(4)}, {Number(value.longitude).toFixed(4)})</span></span><button type="button" className="secondary" onClick={() => select(null)}>Quitar ubicación</button></div>}
    <details><summary>Ingresar coordenadas manualmente</summary>
      <div className="coordinate-inputs">
        <label>Latitud<input type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => { setLatitude(event.target.value); if (value) onChange(null); }} /></label>
        <label>Longitud<input type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => { setLongitude(event.target.value); if (value) onChange(null); }} /></label>
        <button type="button" className="secondary" onClick={useCoordinates}>Usar coordenadas</button>
      </div>
    </details>
    <p className="muted small attribution">Búsqueda de lugares: <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">Photon</a> · Datos © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></p>
  </fieldset>;
}
