import { useEffect, useId, useRef, useState } from 'react';
import { getPetBreeds } from '../api';
import { todayInBogota } from '../booking-utils';
import Select from './Select';

const EMPTY = { name: '', size: 'mediano', breed: '', birth_date: '', notes: '' };
const normalize = (value) => value.trim().toLocaleLowerCase('es');

export default function PetForm({ editingPet, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => editingPet ? {
    name: editingPet.name, size: editingPet.size, breed: editingPet.breed ?? '',
    birth_date: editingPet.birth_date ?? '', notes: editingPet.notes ?? '',
  } : EMPTY);
  const [breeds, setBreeds] = useState([]);
  const [catalog, setCatalog] = useState({ loading: true, error: '' });
  const [retry, setRetry] = useState(0);
  const [choice, setChoice] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const summary = useRef(null);
  const id = useId();
  const matchingBreed = breeds.find((breed) => normalize(breed.name) === normalize(form.breed));
  const selectedBreed = choice ?? (form.breed ? matchingBreed?.id || '__other__' : '');
  const species = [...new Set(breeds.map((breed) => breed.species))];

  useEffect(() => {
    const controller = new AbortController();
    getPetBreeds({ signal: controller.signal }).then((rows) => {
      if (!controller.signal.aborted) { setBreeds(rows); setCatalog({ loading: false, error: '' }); }
    }).catch((error) => {
      if (!controller.signal.aborted) setCatalog({ loading: false, error: error.message });
    });
    return () => controller.abort();
  }, [retry]);

  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined, form: undefined }));
  };
  const props = (name) => ({ name, value: form[name], onChange: change, 'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `${id}-${name}-error` : undefined });
  const fieldError = (name) => errors[name] && <p className="field-error" id={`${id}-${name}-error`}>{errors[name]}</p>;

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const invalid = {};
    if (!form.name.trim()) invalid.name = 'Cuéntanos cómo se llama tu mascota.';
    if (selectedBreed === '__other__' && !form.breed.trim()) invalid.breed = 'Escribe cuál es la raza.';
    if (form.birth_date && form.birth_date > todayInBogota()) invalid.birth_date = 'La fecha de nacimiento no puede ser futura.';
    if (Object.keys(invalid).length) { setErrors(invalid); summary.current?.focus(); return; }
    setBusy(true); setErrors({});
    try {
      const ok = await onSubmit({ name: form.name.trim(), size: form.size,
        breed_id: selectedBreed && selectedBreed !== '__other__' ? selectedBreed : null,
        breed_other: selectedBreed === '__other__' ? form.breed.trim() : null,
        birth_date: form.birth_date || null, notes: form.notes.trim() || null });
      if (ok && !editingPet) { setForm(EMPTY); setChoice(null); }
    } catch (error) {
      setErrors({ ...error.fields, form: error.message }); summary.current?.focus();
    } finally { setBusy(false); }
  };

  return <form className="pet-form" onSubmit={submit} noValidate>
    <div ref={summary} tabIndex={-1} className="pet-form-summary">{Object.values(errors).some(Boolean) && <div className="error" role="alert"><strong>{errors.form || 'Revisa los campos marcados para continuar.'}</strong></div>}</div>
    <fieldset disabled={busy} className="pet-form-fields">
      <div className="pet-form-row"><div><label>Su nombre <span className="required-dot" aria-label="obligatorio">*</span><input {...props('name')} maxLength={100} placeholder="Ej. Luna" autoComplete="off" required /></label>{fieldError('name')}</div>
        <div><label>Fecha de nacimiento <span className="field-optional">Opcional</span><input type="date" max={todayInBogota()} {...props('birth_date')} /></label>{fieldError('birth_date')}</div>
      </div>
      <div className="pet-breed-field"><label>Raza <span className="field-optional">Opcional</span><Select name="breed_id" value={selectedBreed} disabled={catalog.loading} searchable searchLabel="Buscar una raza…" fallbackValue="__other__" aria-invalid={Boolean(errors.breed)} aria-describedby={errors.breed ? `${id}-breed-error` : `${id}-breed-hint`} onChange={(event) => { setChoice(event.target.value); setErrors((current) => ({ ...current, breed: undefined, form: undefined })); }}>
        <option value="">{catalog.loading ? 'Cargando razas…' : 'Selecciona su raza'}</option>
        {species.map((group) => <optgroup key={group} label={group}>{breeds.filter((breed) => breed.species === group).map((breed) => <option key={breed.id} value={breed.id}>{breed.name}</option>)}</optgroup>)}
        <optgroup label="¿No aparece en la lista?"><option value="__other__">Otra · indicar cuál</option></optgroup>
      </Select></label><p className="input-hint" id={`${id}-breed-hint`}>Puedes buscar por nombre o elegir Otra si no aparece.</p>
        {catalog.error && <div className="catalog-notice" role="status"><p>El catálogo no está disponible. Puedes elegir <strong>Otra</strong> y escribir la raza.</p><button type="button" className="text-button" onClick={() => { setCatalog({ loading: true, error: '' }); setRetry((value) => value + 1); }}>Reintentar catálogo</button></div>}
        {selectedBreed === '__other__' && <div className="other-breed"><label>¿Cuál es su raza?<input {...props('breed')} placeholder="Escribe la raza de tu mascota" maxLength={100} required /></label></div>}{fieldError('breed')}
      </div>
      <fieldset className="pet-size-choice" aria-invalid={Boolean(errors.size)}><legend>Su tamaño <span className="required-dot" aria-label="obligatorio">*</span></legend><div>{[['pequeno', 'Pequeño'], ['mediano', 'Mediano'], ['grande', 'Grande']].map(([size, label], index) => <label key={size} className={form.size === size ? 'is-selected' : ''}>
        <input type="radio" name="size" value={size} checked={form.size === size} onChange={change} /><span className={`size-mark size-${index}`} aria-hidden="true"><svg viewBox="0 0 32 32" fill="currentColor"><ellipse cx="7" cy="11" rx="3" ry="4" transform="rotate(-25 7 11)" /><ellipse cx="14" cy="7" rx="3" ry="4" /><ellipse cx="22" cy="8" rx="3" ry="4" transform="rotate(20 22 8)" /><ellipse cx="27" cy="15" rx="3" ry="4" transform="rotate(30 27 15)" /><path d="M9 20c3-2 3-7 8-6s4 5 7 8c4 5-2 8-6 6-3-1-5 1-8 0-4-1-4-5-1-8Z" /></svg></span><span>{label}</span><span className="size-radio" aria-hidden="true" />
      </label>)}</div></fieldset>{fieldError('size')}
      <div><label>Algo que debamos saber <span className="field-optional">Opcional</span><textarea {...props('notes')} rows={3} maxLength={2000} placeholder="Su personalidad, alimentación o detalles importantes para quien le cuide." /></label><div className="pet-notes-hint"><span>Estos detalles ayudarán a su cuidador.</span><span>{form.notes.length}/2000</span></div>{fieldError('notes')}</div>
      <div className="pet-form-footer"><span><span aria-hidden="true">♡</span> Un perfil completo ayuda a cuidar mejor.</span><div className="form-actions">{editingPet && <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>}<button type="submit">{busy ? 'Guardando…' : editingPet ? 'Guardar cambios' : 'Agregar mascota'}{!busy && <span aria-hidden="true">＋</span>}</button></div></div>
    </fieldset>
  </form>;
}
