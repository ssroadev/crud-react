import { useId, useRef, useState } from 'react';
import { loginAccount, registerAccount } from '../api';
import rules from '../../../shared/account-validation.json';
import '../auth.css';
import HomeLink from './HomeLink';

function PasswordInput({ label, name, value, onChange, onBlur, error, registering = false }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className="auth-field">
    <label htmlFor={id}>{label}</label>
    <div className="password-control">
      <input id={id} name={name} type={visible ? 'text' : 'password'} value={value} onChange={onChange} onBlur={onBlur}
        placeholder={label}
        autoComplete={registering ? 'new-password' : 'current-password'} required maxLength={128}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
      <button type="button" className="password-toggle" aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />{visible && <path d="m4 3 16 18" stroke="currentColor" strokeWidth="1.6" />}</svg>
      </button>
    </div>
    {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
  </div>;
}

function validate(form, registering) {
  const errors = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Ingresa un correo electrónico válido.';
  if (!form.password) errors.password = 'Ingresa tu contraseña.';
  if (registering) {
    for (const key of ['first_name', 'last_name']) if (!form[key].trim()) errors[key] = key === 'first_name' ? 'Ingresa tu nombre.' : 'Ingresa tu apellido.';
    if (form.password.length < rules.passwordMinLength) errors.password = `Usa al menos ${rules.passwordMinLength} caracteres.`;
    if (form.password !== form.confirm_password) errors.confirm_password = 'Las contraseñas no coinciden.';
    if (form.phone && (!/^[+\d\s().-]{7,25}$/.test(form.phone) || form.phone.replace(/\D/g, '').length < 7)) errors.phone = 'Ingresa un teléfono válido de al menos 7 dígitos.';
  }
  return errors;
}

export default function AuthPage({ mode = 'login', onAuthenticated, notice = '' }) {
  const registering = mode === 'register';
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', email: '', password: '', confirm_password: '', role: 'owner' });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(null);
  const summary = useRef(null);
  const invalid = validate(form, registering);
  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined, form: undefined }));
  };
  const errorFor = (name) => errors[name] || (touched[name] ? invalid[name] : '');
  const blur = (event) => setTouched((current) => ({ ...current, [event.target.name]: true }));
  const submit = async (event) => {
    event.preventDefault();
    setErrors(invalid);
    if (Object.keys(invalid).length) { summary.current?.focus(); return; }
    setBusy(true);
    try {
      const result = registering ? await registerAccount(form) : await loginAccount({ email: form.email, password: form.password });
      setForm((current) => ({ ...current, password: '', confirm_password: '' }));
      setTouched({});
      if (registering) setSuccess(result);
      else onAuthenticated(result.account, result.message);
    } catch (error) {
      setErrors({ ...error.fields, form: error.message });
      summary.current?.focus();
    } finally { setBusy(false); }
  };
  const field = (name, label, extra = {}) => <div className="auth-field" key={name}>
    <label htmlFor={`auth-${name}`}>{label}</label>
    <input id={`auth-${name}`} name={name} value={form[name]} onChange={change} onBlur={blur} aria-invalid={Boolean(errorFor(name))} aria-describedby={errorFor(name) ? `auth-${name}-error` : undefined} {...extra} />
    {errorFor(name) && <p className="field-error" id={`auth-${name}-error`}>{errorFor(name)}</p>}
  </div>;

  return <div className={`auth-page ${registering ? 'register-page' : 'login-page'}`}>
    <header className="auth-topbar"><HomeLink className="auth-brand home-brand" /><HomeLink className="auth-back">Explorar PawHub <span aria-hidden="true">↗</span></HomeLink></header>
    <main className="auth-shell">
    <section className="auth-left">
      <div className={`auth-content ${registering ? 'registration-content' : ''}`}>
        {success ? <div className="registration-success" role="status">
          <div className="success-symbol" aria-hidden="true">✓</div>
          <p className="eyebrow">Ya eres parte de PawHub</p><h1>¡Tu cuenta está creada!</h1>
          <p>{success.message}</p>
          <div className="registration-summary"><strong>{form.first_name} {form.last_name}</strong><span>{form.email}</span><span>{form.role === 'owner' ? 'Dueño de mascota' : 'Cuidador de mascotas'}</span></div>
          {success.confirmation_required && <p className="muted small">Busca el mensaje de confirmación en tu bandeja de entrada o en spam. Después, inicia sesión para comenzar.</p>}
          {success.account ? <button className="auth-submit" onClick={() => onAuthenticated(success.account, '¡Bienvenido a PawHub! Tu perfil ya está listo.')}>Entrar a PawHub <span aria-hidden="true">→</span></button> : <a className="auth-submit" href="#login">Ir a iniciar sesión <span aria-hidden="true">→</span></a>}
        </div> : <>
          <span className="auth-kicker">{registering ? 'EMPIEZA A SER PARTE' : 'Bienvenido de nuevo'}</span>
          <h1>{registering ? <>Crea tu cuenta.<br /><em>El cariño ya está aquí.</em></> : 'Inicia sesión en PawHub'}</h1>
          {registering && <p className="auth-intro">Encuentra compañía para tu mascota o comparte tu forma de cuidar.</p>}
          {notice && <p className="auth-notice" role="status">{notice}</p>}
          <form noValidate onSubmit={submit} className="auth-form">
            <fieldset disabled={busy}>
              {registering && <div className="auth-name-row">
                {field('first_name', 'Nombre', { autoComplete: 'given-name', required: true, maxLength: 80, placeholder: 'Tu nombre' })}
                {field('last_name', 'Apellido', { autoComplete: 'family-name', required: true, maxLength: 80, placeholder: 'Tu apellido' })}
              </div>}
              {field('email', 'Correo electrónico', { type: 'email', autoComplete: 'email', required: true, maxLength: 254, placeholder: registering ? 'tu@correo.com' : 'Correo electrónico' })}
              {registering && field('phone', <>Teléfono <span className="optional-label">(opcional)</span></>, { type: 'tel', autoComplete: 'tel', maxLength: 25, placeholder: '+57 300 123 4567' })}
              <PasswordInput label="Contraseña" name="password" value={form.password} onChange={change} onBlur={blur} error={errorFor('password')} registering={registering} />
              {registering && <>
                <p className="password-hint">Al menos 8 caracteres. Combina letras y números para mayor seguridad.</p>
                <PasswordInput label="Confirmar contraseña" name="confirm_password" value={form.confirm_password} onChange={change} onBlur={blur} error={errorFor('confirm_password')} registering />
                <fieldset className="auth-role-choices"><legend>¿Qué te trae a PawHub?</legend>
                  <label className={form.role === 'owner' ? 'selected' : ''}><input type="radio" name="role" value="owner" checked={form.role === 'owner'} onChange={change} /><span><strong>Busco un cuidador</strong><small>Quiero lo mejor para mi mascota.</small></span></label>
                  <label className={form.role === 'caregiver' ? 'selected' : ''}><input type="radio" name="role" value="caregiver" checked={form.role === 'caregiver'} onChange={change} /><span><strong>Quiero cuidar mascotas</strong><small>Quiero ofrecer mis servicios.</small></span></label>
                </fieldset>
              </>}
              {!registering && <p className="login-hint">Usa el correo y la contraseña de tu cuenta PawHub.</p>}
              <div ref={summary} tabIndex={-1} className={Object.values(errors).some(Boolean) ? 'error auth-errors' : 'auth-validation'} role={Object.values(errors).some(Boolean) ? 'alert' : 'status'}>
                {Object.values(errors).some(Boolean) ? <>{errors.form || 'Revisa los campos señalados para continuar.'}</> : form.email && form.password && !Object.keys(invalid).length ? '✓ Tus datos están listos para continuar.' : null}
              </div>
              <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Un momento…' : registering ? 'Crear mi cuenta' : 'Iniciar sesión'}<span aria-hidden="true">→</span></button>
            </fieldset>
          </form>
          <p className="auth-switch">{registering ? '¿Ya eres parte de PawHub?' : '¿Aún no tienes una cuenta?'} <a href={registering ? '#login' : '#register'}>{registering ? 'Inicia sesión' : 'Crear cuenta'}</a></p>
          {!registering && <HomeLink className="login-home">Volver al inicio</HomeLink>}
        </>}
      </div>
    </section>
    {registering ? <aside className="auth-visual" aria-label="El cariño nos conecta">
      <div className="auth-story"><span className="auth-story-tag">EL CARIÑO NOS CONECTA</span><h2>Su compañía lo cambia todo.<br />Su cuidado también.</h2><p>Personas que entienden que una mascota es parte de la familia.</p></div>
      <div className="auth-photo"><img src="/images/pawhub-companion.webp" alt="Una dueña abraza con cariño a su gato" /><span className="auth-photo-caption"><span aria-hidden="true">♡</span> Pequeños momentos. Grandes vínculos.</span></div>
      <div className="auth-benefits"><span><span aria-hidden="true">✓</span> Cuidadores cerca de ti</span><span><span aria-hidden="true">✓</span> Todo en un mismo lugar</span></div>
    </aside> : <aside className="auth-visual login-visual" aria-label="PawHub y sus mascotas">
      <div className="login-art">
        <div className="login-cat"><img src="/images/pawhub-cat-cream.png" alt="Gato atigrado de ojos verdes sobre fondo crema" width="1254" height="1254" /></div>
        <div className="login-art-card"><img className="login-brand-mark" src="/images/pawhub-logo.png" alt="PawHub" width="198" height="50" /><p>Conecta con cuidadores de confianza y dale a tu mascota el cariño que merece.</p></div>
      </div>
    </aside>}
    </main>
    {registering && <footer className="auth-footer"><span>Hecho para quienes aman a sus mascotas.</span><span>PawHub © {new Date().getFullYear()}</span></footer>}
  </div>;
}
