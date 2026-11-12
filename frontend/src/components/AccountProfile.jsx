import { useId, useRef, useState } from 'react';
import { updateAccount } from '../api';
import rules from '../../../shared/account-validation.json';
import '../account.css';

const fieldsFromAccount = (account) => ({ first_name: account.profile.first_name, last_name: account.profile.last_name, phone: account.profile.phone || '', bio: account.profile.bio || '' });
const shortcuts = [
  { href: '#pets', title: 'Mis mascotas', description: 'Su información y sus necesidades', icon: 'pet' },
  { href: '#requests', title: 'Mis solicitudes', description: 'Servicios, respuestas y conversaciones', icon: 'calendar' },
  { href: '#caregivers', title: 'Encontrar un cuidador', description: 'Personas que conectan con tu mascota', icon: 'search' },
];
function AccountIcon({ kind }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2" /></> : kind === 'search' ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></> : kind === 'pet' ? <><ellipse cx="7" cy="7.5" rx="2" ry="2.5" /><ellipse cx="17" cy="7.5" rx="2" ry="2.5" /><path d="M7.5 14c2-1 2-4 4.5-4s2.5 3 4.5 4c3 2 1.5 6-1.5 5-2-.8-4-.8-6 0-3 1-4.5-3-1.5-5Z" /></> : <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>}</svg>;
}

export default function AccountProfile({ account, onUpdated }) {
  const [form, setForm] = useState(() => fieldsFromAccount(account));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const id = useId();
  const summary = useRef(null);
  const saved = fieldsFromAccount(account);
  const dirty = Object.keys(saved).some((key) => form[key] !== saved[key]);
  const fullName = [account.profile.first_name, account.profile.last_name].filter(Boolean).join(' ');
  const initials = [account.profile.first_name, account.profile.last_name].map((name) => name?.[0] || '').join('');
  const change = (event) => { setForm({ ...form, [event.target.name]: event.target.value }); setErrors({ ...errors, [event.target.name]: undefined, form: undefined }); setMessage(''); };
  const save = async (event) => {
    event.preventDefault();
    if (busy) return;
    const invalid = {};
    for (const [key, label] of [['first_name', 'nombre'], ['last_name', 'apellido']]) {
      if (!form[key].trim() || form[key].length > rules.nameMaxLength || /[<>]/.test(form[key]) || [...form[key]].some((char) => char.charCodeAt(0) < 32)) invalid[key] = `Ingresa tu ${label}, de hasta ${rules.nameMaxLength} caracteres.`;
    }
    if (form.phone.trim() && (!/^[+\d\s().-]{7,25}$/.test(form.phone.trim()) || form.phone.replace(/\D/g, '').length < 7)) invalid.phone = 'Ingresa un teléfono válido de al menos 7 dígitos.';
    if (Object.keys(invalid).length) { setErrors({ ...invalid, form: 'Revisa los campos señalados para guardar tu perfil.' }); setMessage(''); summary.current?.focus(); return; }
    setBusy(true); setMessage(''); setErrors({});
    try { const result = await updateAccount(form); setForm(fieldsFromAccount(result.account)); onUpdated(result.account); setMessage(result.message); }
    catch (error) { setErrors({ ...error.fields, form: error.message }); summary.current?.focus(); }
    finally { setBusy(false); }
  };
  const discard = () => { setForm(fieldsFromAccount(account)); setErrors({}); setMessage(''); };
  const field = (key, label, extra) => <div className="account-field" key={key}>
    <label htmlFor={`${id}-${key}`}>{label}</label>
    <input id={`${id}-${key}`} name={key} value={form[key]} onChange={change} maxLength={key === 'phone' ? 25 : rules.nameMaxLength} type={key === 'phone' ? 'tel' : 'text'} required={key !== 'phone'} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${id}-${key}-error` : undefined} autoComplete={({ first_name: 'given-name', last_name: 'family-name', phone: 'tel' })[key]} {...extra} />
    {errors[key] && <span className="field-error" id={`${id}-${key}-error`}>{errors[key]}</span>}
  </div>;
  return <section className="account-page">
    <header className="account-page-heading"><div><p className="eyebrow">Tu cuenta, tu espacio</p><h1>Mi perfil</h1><p>Los pequeños detalles nos ayudan a conectar mejor.</p></div><span className="account-heading-icon"><AccountIcon /></span></header>
    <div className="account-layout">
      <aside className="account-sidebar">
        <section className="account-identity" aria-label="Resumen de tu cuenta">
          <div className="account-identity-top"><div className="account-avatar" aria-hidden="true">{initials}</div><div><h2>{fullName}</h2><div className="account-roles">{account.roles.includes('owner') && <span>Dueño de mascota</span>}{account.roles.includes('caregiver') && <span>Cuidador de mascotas</span>}</div></div></div>
          <dl><div><dt>Correo electrónico</dt><dd>{account.email}</dd></div>{account.profile.phone && <div><dt>Teléfono de contacto</dt><dd>{account.profile.phone}</dd></div>}</dl>
          <p className="account-identity-note">Un mismo lugar para encontrar cuidado, conversar y acompañar a tu mascota.</p>
        </section>
        <nav className="account-shortcuts" aria-label="Accesos de tu cuenta"><p className="eyebrow">Todo a mano</p>{shortcuts.map((shortcut) => <a key={shortcut.href} href={shortcut.href}><span className="account-shortcut-icon"><AccountIcon kind={shortcut.icon} /></span><span><strong>{shortcut.title}</strong><small>{shortcut.description}</small></span><span aria-hidden="true">↗</span></a>)}</nav>
      </aside>
      <section className="account-editor">
        <header><span className="account-editor-icon"><AccountIcon /></span><div><h2>Tus datos personales</h2><p>Así te presentamos y nos ponemos en contacto contigo.</p></div></header>
        <div ref={summary} tabIndex={-1} className="account-form-summary">{errors.form && <p className="error" role="alert">{errors.form}</p>}{message && <p className="success" role="status">{message}</p>}</div>
        <form className="account-form" noValidate onSubmit={save}>
          <fieldset disabled={busy} className="account-fields">
            <div className="account-form-row">{field('first_name', 'Nombre', { placeholder: 'Tu nombre' })}{field('last_name', 'Apellido', { placeholder: 'Tu apellido' })}</div>
            <div className="account-contact">{field('phone', 'Teléfono (opcional)', { placeholder: '+57 300 123 4567' })}<p className="account-field-hint">Añade un número donde puedan contactarte para coordinar el cuidado.</p></div>
            <div className="account-field"><label htmlFor={`${id}-bio`}>Sobre ti (opcional)</label><textarea id={`${id}-bio`} name="bio" value={form.bio} onChange={change} rows={5} maxLength={1000} placeholder="Cuéntanos sobre ti, tus mascotas y lo que hace especial su compañía." aria-invalid={Boolean(errors.bio)} aria-describedby={errors.bio ? `${id}-bio-error` : `${id}-bio-hint`} />{errors.bio && <span className="field-error" id={`${id}-bio-error`}>{errors.bio}</span>}<div className="account-bio-hint" id={`${id}-bio-hint`}><span>Tu presentación, con tus propias palabras.</span><span>{form.bio.length}/1000</span></div></div>
            <footer className="account-form-footer"><p><span aria-hidden="true">{dirty ? '○' : '✓'}</span>{dirty ? 'Tienes cambios sin guardar' : 'Sin cambios pendientes'}</p><div className="form-actions">{dirty && <button type="button" className="secondary" onClick={discard}>Descartar cambios</button>}<button type="submit" disabled={busy || !dirty}>{busy ? 'Guardando…' : 'Guardar mi perfil'}</button></div></footer>
          </fieldset>
        </form>
      </section>
    </div>
  </section>;
}
