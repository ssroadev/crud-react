import { useRef, useState } from 'react';
import { loginAccount, registerAccount, requestPasswordRecovery, updatePasswordFromRecovery } from '../api';
import rules from '../../../shared/account-validation.json';
import '../auth.css';

const passwordRequirements = (password) => [
  { label: 'Al menos 8 caracteres', met: [...password].length >= rules.passwordMinLength },
  { label: 'Una letra minúscula', met: /\p{Ll}/u.test(password) },
  { label: 'Una letra mayúscula', met: /\p{Lu}/u.test(password) },
  { label: 'Un número', met: /\p{N}/u.test(password) },
  { label: 'Un carácter especial', met: /[^\p{L}\p{N}]/u.test(password) },
];
const registrationRequirements = (password) => [{
  label: `Entre ${rules.passwordMinLength} y ${rules.passwordMaxLength} caracteres`,
  met: password.length >= rules.passwordMinLength && password.length <= rules.passwordMaxLength,
}];

function PasswordInput({ label, name, value, onChange, onBlur, error, visible, onToggle, autoComplete = 'new-password', idPrefix = 'auth' }) {
  const id = `${idPrefix}-${name}`;
  return <div className="auth-field auth-field-password">
    <label htmlFor={id}>{label}</label>
    <div className="auth-password-field">
      <input id={id} name={name} type={visible ? 'text' : 'password'} value={value} onChange={onChange} onBlur={onBlur}
        placeholder={label} autoComplete={autoComplete} required maxLength={rules.passwordMaxLength}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
      <button className="auth-password-toggle" type="button" aria-label={`${visible ? 'Ocultar' : 'Mostrar'} contraseña`}
        aria-pressed={visible} onClick={onToggle}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>{visible && <path d="m4 3 16 18" stroke="currentColor" strokeWidth="2"/>}</svg>
      </button>
    </div>
    {error && <p className="auth-message field-error" id={`${id}-error`} role="alert">{error}</p>}
  </div>;
}

function validate(form, mode) {
  const errors = {};
  if (mode !== 'reset-password' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Ingresa un correo electrónico válido.';
  if (mode === 'register') {
    for (const key of ['first_name', 'last_name']) if (!form[key].trim()) errors[key] = key === 'first_name' ? 'Ingresa tu nombre.' : 'Ingresa tu apellido.';
    if (form.password.length < rules.passwordMinLength || form.password.length > rules.passwordMaxLength) errors.password = `Usa entre ${rules.passwordMinLength} y ${rules.passwordMaxLength} caracteres.`;
    if (form.password !== form.confirm_password) errors.confirm_password = 'Las contraseñas no coinciden.';
    if (form.phone && (!/^[+\d\s().-]{7,25}$/.test(form.phone) || form.phone.replace(/\D/g, '').length < 7)) errors.phone = 'Ingresa un teléfono válido de al menos 7 dígitos.';
  } else if (mode === 'login' && !form.password) errors.password = 'Ingresa tu contraseña.';
  else if (mode === 'reset-password') {
    if (passwordRequirements(form.password).some(({ met }) => !met)) errors.password = 'La contraseña debe cumplir todos los requisitos.';
    if (form.password !== form.confirm_password) errors.confirm_password = 'Las contraseñas no coinciden.';
  }
  return errors;
}

export default function AuthPage({ mode = 'login', onAuthenticated, onRecoveryComplete, notice = '' }) {
  const [view, setView] = useState(mode);
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', email: '', password: '', confirm_password: '', role: 'owner' });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const summary = useRef(null);
  const registering = view === 'register';
  const recovering = view === 'recovery';
  const resetting = view === 'reset-password';
  const invalid = validate(form, view);
  const requirements = passwordRequirements(form.password);
  const registrationPasswordRules = registrationRequirements(form.password);
  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined, form: undefined }));
  };
  const errorFor = (name) => errors[name] || (touched[name] ? invalid[name] : '');
  const blur = (event) => setTouched((current) => ({ ...current, [event.target.name]: true }));
  const switchView = (nextView) => { setView(nextView); setErrors({}); setTouched({}); setSuccess(null); };
  const submit = async (event) => {
    event.preventDefault();
    setErrors(invalid);
    if (Object.keys(invalid).length) { summary.current?.focus(); return; }
    setBusy(true);
    try {
      if (recovering) {
        const result = await requestPasswordRecovery(form.email);
        setSuccess({ message: result.message, kind: 'recovery' });
      } else if (resetting) {
        const result = await updatePasswordFromRecovery({ password: form.password, confirm_password: form.confirm_password });
        setForm((current) => ({ ...current, password: '', confirm_password: '' }));
        setSuccess({ message: result.message, kind: 'password' });
      } else {
        const result = registering ? await registerAccount(form) : await loginAccount({ email: form.email, password: form.password });
        setForm((current) => ({ ...current, password: '', confirm_password: '' }));
        setTouched({});
        if (registering) setSuccess({ ...result, kind: 'registration' });
        else onAuthenticated(result.account, result.message);
      }
    } catch (error) {
      setErrors({ ...error.fields, form: error.status === 401 && resetting ? 'El enlace venció o ya fue utilizado. Solicita uno nuevo.' : error.message });
      summary.current?.focus();
    } finally { setBusy(false); }
  };
  const field = (name, label, extra = {}) => <div className="auth-field" key={name}>
    <label htmlFor={`auth-${name}`}>{label}</label>
    <input id={`auth-${name}`} name={name} value={form[name]} onChange={change} onBlur={blur}
      aria-invalid={Boolean(errorFor(name))} aria-describedby={errorFor(name) ? `auth-${name}-error` : undefined} {...extra} />
    {errorFor(name) && <p className="auth-message field-error" id={`auth-${name}-error`} role="alert">{errorFor(name)}</p>}
  </div>;
  const passwordField = (name, label, autocomplete = 'new-password') => <PasswordInput key={name} label={label} name={name} value={form[name]}
    onChange={change} onBlur={blur} error={errorFor(name)} visible={passwordVisible} onToggle={() => setPasswordVisible((visible) => !visible)}
    autoComplete={autocomplete} idPrefix="auth" />;

  return <main className={`auth-page${registering || resetting ? ' auth-page-register' : ''}`}>
    <section className="auth-panel" aria-label="Acceso a PawHub">
      <a className="auth-brand" href="#" aria-label="PawHub, inicio"><img src="/images/pawhub-login-logo.png" alt="PawHub" /></a>
      <div className={`auth-card${registering || resetting ? ' auth-card-register' : ''}`}>
        {success && ['recovery', 'password'].includes(success.kind) ? <section className="auth-success" role="status">
          <p className="auth-eyebrow">{success.kind === 'recovery' ? 'Revisa tu correo' : 'Contraseña actualizada'}</p>
          <h1 className="auth-title">{success.kind === 'recovery' ? 'Recupera el acceso a tu cuenta' : 'Tu contraseña está lista'}</h1>
          <p className="auth-message auth-message-success">{success.message}</p>
          {success.kind === 'password'
            ? <button className="auth-submit" type="button" onClick={onRecoveryComplete}>Continuar a PawHub</button>
            : <button className="auth-footer-button" type="button" onClick={() => switchView('login')}>Volver a iniciar sesión</button>}
        </section> : success?.kind === 'registration' ? <section className="auth-success" role="status">
          <p className="auth-eyebrow">Bienvenido a PawHub</p><h1 className="auth-title">¡Tu cuenta está creada!</h1>
          <p className="auth-message auth-message-success">{success.message}</p>
          {success.confirmation_required && <p className="auth-message">Busca el mensaje de confirmación en tu correo antes de iniciar sesión.</p>}
          {success.account ? <button className="auth-submit" type="button" onClick={() => onAuthenticated(success.account, success.message)}>Entrar a PawHub</button>
            : <button className="auth-submit" type="button" onClick={() => switchView('login')}>Ir a iniciar sesión</button>}
        </section> : <>
          <p className="auth-eyebrow">{recovering ? 'Recupera el acceso a tu cuenta' : resetting ? 'Enlace de recuperación verificado' : registering ? 'Bienvenido a PawHub' : 'Bienvenido de nuevo'}</p>
          <h1 className="auth-title">{recovering ? 'Restablece tu contraseña' : resetting ? 'Crea una nueva contraseña' : registering ? 'Crea tu cuenta en PawHub' : 'Inicia sesión en PawHub'}</h1>
          {notice && <p className="auth-message auth-message-notice" role="status">{notice}</p>}
          <form noValidate onSubmit={submit}>
            <fieldset className="auth-controls" disabled={busy}>
            {registering && <div className="auth-register-fields">
              {field('first_name', 'Nombre', { autoComplete: 'given-name', required: true, maxLength: 80, placeholder: 'Nombre' })}
              {field('last_name', 'Apellido', { autoComplete: 'family-name', required: true, maxLength: 80, placeholder: 'Apellido' })}
              {field('email', 'Correo electrónico', { type: 'email', autoComplete: 'email', required: true, maxLength: 254, placeholder: 'Correo electrónico' })}
              {field('phone', 'Teléfono (opcional)', { type: 'tel', autoComplete: 'tel', maxLength: 25, placeholder: 'Teléfono (opcional)' })}
              {passwordField('password', 'Contraseña')}
              <ul className="auth-password-requirements" aria-label="Requisitos de la contraseña" aria-live="polite">{registrationPasswordRules.map(({ label, met }) => <li className={met ? 'is-met' : ''} key={label}>{label}</li>)}</ul>
              {passwordField('confirm_password', 'Confirmar contraseña')}
            </div>}
            {recovering && <div className="auth-field">
              <label htmlFor="auth-email">Correo electrónico</label><input id="auth-email" name="email" type="email" value={form.email} onChange={change} onBlur={blur} placeholder="Correo electrónico" autoComplete="email" required maxLength={254} aria-invalid={Boolean(errorFor('email'))} />
              {errorFor('email') && <p className="auth-message field-error" role="alert">{errorFor('email')}</p>}
              <p className="auth-help">Te enviaremos un enlace seguro para crear una nueva contraseña.</p>
            </div>}
            {view === 'login' && <>
              <div className="auth-field"><label className="auth-visually-hidden" htmlFor="auth-email">Correo electrónico</label><input id="auth-email" name="email" type="email" value={form.email} onChange={change} onBlur={blur} placeholder="Correo electrónico" autoComplete="email" required maxLength="254" aria-invalid={Boolean(errorFor('email'))} />{errorFor('email') && <p className="auth-message field-error" role="alert">{errorFor('email')}</p>}</div>
              {passwordField('password', 'Contraseña', 'current-password')}
              <button className="auth-recovery-link" type="button" onClick={() => switchView('recovery')}>¿Olvidaste tu contraseña?</button>
            </>}
            {resetting && <div className="auth-register-fields auth-reset-fields">
              {passwordField('password', 'Nueva contraseña')}
              <ul className="auth-password-requirements" aria-label="Requisitos de la contraseña" aria-live="polite">{requirements.map(({ label, met }) => <li className={met ? 'is-met' : ''} key={label}>{label}</li>)}</ul>
              {passwordField('confirm_password', 'Confirmar nueva contraseña')}
            </div>}
            {registering && <fieldset className="auth-role-choices"><legend>¿Qué te trae a PawHub?</legend>
              <label><input type="radio" name="role" value="owner" checked={form.role === 'owner'} onChange={change} /><span>Busco un cuidador</span></label>
              <label><input type="radio" name="role" value="caregiver" checked={form.role === 'caregiver'} onChange={change} /><span>Quiero cuidar mascotas</span></label>
            </fieldset>}
            <div ref={summary} tabIndex={-1} className={`auth-message ${Object.values(errors).some(Boolean) ? 'auth-errors' : 'auth-validation'}`} role={Object.values(errors).some(Boolean) ? 'alert' : 'status'}>
              {Object.values(errors).some(Boolean) ? errors.form || 'Revisa los campos señalados para continuar.' : null}
            </div>
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Procesando…' : recovering ? 'Enviar instrucciones' : resetting ? 'Guardar nueva contraseña' : registering ? 'Crear mi cuenta' : 'Iniciar sesión'}</button>
            </fieldset>
          </form>
          <p className="auth-footer">{recovering || resetting ? <button type="button" onClick={() => resetting ? onRecoveryComplete() : switchView('login')}>{resetting ? 'Salir de la recuperación' : 'Volver a iniciar sesión'}</button> : <>{registering ? '¿Ya tienes una cuenta?' : '¿No tienes una cuenta?'} <button type="button" onClick={() => switchView(registering ? 'login' : 'register')}>{registering ? 'Iniciar sesión' : 'Crear cuenta'}</button></>}</p>
        </>}
      </div>
    </section>
    <aside className="auth-visual" aria-label="PawHub y sus mascotas"><img src="/images/pawhub-auth.png" alt="Una persona comparte un momento de cariño con su mascota" /></aside>
  </main>;
}
