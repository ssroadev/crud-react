import { useState } from 'react';
import { updateAccount } from '../api';

export default function AccountProfile({ account, onUpdated }) {
  const [form, setForm] = useState(() => ({ first_name: account.profile.first_name, last_name: account.profile.last_name, phone: account.profile.phone || '', bio: account.profile.bio || '' }));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const change = (event) => { setForm({ ...form, [event.target.name]: event.target.value }); setErrors({ ...errors, [event.target.name]: undefined }); setMessage(''); };
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setMessage(''); setErrors({});
    try { const result = await updateAccount(form); onUpdated(result.account); setMessage(result.message); }
    catch (error) { setErrors({ ...error.fields, form: error.message }); }
    finally { setBusy(false); }
  };
  return <section className="account-card">
    <div className="account-avatar" aria-hidden="true">{account.profile.first_name[0]}</div>
    <p className="eyebrow">Tu cuenta, tu espacio</p><h1>Mi perfil</h1><p className="muted">Mantén tus datos al día para que podamos conocerte mejor.</p>
    <p className="account-readonly">{account.email} · {account.roles.includes('caregiver') ? 'Cuidador de mascotas' : 'Dueño de mascota'}</p>
    <form noValidate onSubmit={save}>
      {['first_name', 'last_name', 'phone'].map((key) => <label key={key}>{({ first_name: 'Nombre', last_name: 'Apellido', phone: 'Teléfono (opcional)' })[key]}
        <input name={key} value={form[key]} onChange={change} maxLength={key === 'phone' ? 25 : 80} type={key === 'phone' ? 'tel' : 'text'} required={key !== 'phone'} aria-invalid={Boolean(errors[key])} autoComplete={({ first_name: 'given-name', last_name: 'family-name', phone: 'tel' })[key]} />
        {errors[key] && <span className="field-error">{errors[key]}</span>}
      </label>)}
      <label>Sobre ti (opcional)<textarea name="bio" value={form.bio} onChange={change} rows={3} maxLength={1000} placeholder="Cuéntanos un poco sobre ti y tus mascotas." aria-invalid={Boolean(errors.bio)} />{errors.bio && <span className="field-error">{errors.bio}</span>}</label>
      {errors.form && <p className="error" role="alert">{errors.form}</p>}
      <button disabled={busy}>{busy ? 'Guardando…' : 'Guardar mi perfil'}</button>
    </form>
    {message && <p className="success" role="status">{message}</p>}
  </section>;
}
