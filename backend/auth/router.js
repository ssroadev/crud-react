const express = require('express');
const { validateAccount, validateRecoveryEmail, validateRecoveryPassword } = require('./validation');
const { setSessionCookies, clearSessionCookies, setRecoverySessionCookies, clearRecoveryCookie } = require('./service');

function authMessage(error, mode) {
  if (error.code === 'email_not_confirmed') return 'Confirma tu correo antes de iniciar sesión. Revisa también la carpeta de spam.';
  if (['user_already_exists', 'email_exists'].includes(error.code)) return 'Este correo ya está registrado. Inicia sesión con tu cuenta.';
  if (error.code === 'weak_password') return 'La contraseña no cumple los requisitos de seguridad. Usa una más larga y combina letras y números.';
  if (error.status === 429 || error.code === 'over_email_send_rate_limit') return 'Has realizado varios intentos. Espera unos minutos y vuelve a intentarlo.';
  if (error.status >= 500) return 'No se pudo completar la operación. Revisa la conexión y la configuración del registro.';
  if (mode === 'recovery') return 'No se pudo enviar el enlace de recuperación. Intenta de nuevo más tarde.';
  if (mode === 'password') return error.code === 'weak_password'
    ? 'La contraseña no cumple los requisitos de seguridad configurados en Supabase.'
    : 'No se pudo actualizar la contraseña. Solicita un nuevo enlace e inténtalo otra vez.';
  return mode === 'login' ? 'El correo o la contraseña no son correctos.' : 'No se pudo crear la cuenta. Verifica tus datos e intenta de nuevo.';
}

function createAuthRouter(database, auth, {
  frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173',
  recoveryCallbackUrl = `http://localhost:${process.env.PORT || 3002}/auth/recovery/callback`,
} = {}) {
  const router = express.Router();
  const recoveryPageUrl = new URL('/?auth=recovery', frontendUrl).toString();
  const recoveryErrorUrl = new URL('/?auth=recovery-error', frontendUrl).toString();
  const attempts = new Map();
  const limitAttempts = (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    if (attempts.size >= 10000) for (const [ip, entry] of attempts) if (entry.expires < now) attempts.delete(ip);
    const entry = attempts.get(key);
    if (!entry || entry.expires < now) attempts.set(key, { count: 1, expires: now + 600000 });
    else if (++entry.count > 25) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.' });
    next();
  };
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  router.post('/register', limitAttempts, async (req, res) => {
    const { data: fields, errors } = validateAccount(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Revisa los campos señalados.', errors });
    const { data, error } = await auth.clientFactory().auth.signUp({
      email: fields.email, password: fields.password,
      options: { emailRedirectTo: `${frontendUrl}/?auth=confirmed`, data: {
        first_name: fields.first_name, last_name: fields.last_name, phone: fields.phone || null, role: fields.role,
      } },
    });
    if (error) return res.status(error.status === 429 ? 429 : error.status >= 500 ? 503 : 400).json({ error: authMessage(error, 'register') });
    if (!data.user || (data.user.identities && !data.user.identities.length)) return res.status(409).json({ error: 'Este correo ya está registrado. Inicia sesión o revisa el correo de confirmación.' });
    let account = null;
    if (data.session) {
      account = await auth.accountFor(data.user.id);
      setSessionCookies(res, data.session);
      clearRecoveryCookie(res);
    }
    res.status(201).json({ account, confirmation_required: !data.session,
      message: data.session ? 'Tu cuenta y tu perfil se crearon correctamente.' : 'Tu cuenta se creó correctamente. Revisa tu correo para confirmarla antes de iniciar sesión.' });
  });

  router.post('/login', limitAttempts, async (req, res) => {
    const { data: fields, errors } = validateAccount(req.body, 'login');
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Revisa los campos señalados.', errors });
    const { data, error } = await auth.clientFactory().auth.signInWithPassword(fields);
    if (error || !data.session) return res.status(error?.status === 429 ? 429 : error?.status >= 500 ? 503 : 401).json({ error: authMessage(error || {}, 'login') });
    const account = await auth.accountFor(data.user.id);
    setSessionCookies(res, data.session);
    clearRecoveryCookie(res);
    res.json({ account, message: 'Iniciaste sesión correctamente. ¡Qué bueno verte de nuevo!' });
  });

  router.post('/recovery/request', limitAttempts, async (req, res) => {
    const { email, errors } = validateRecoveryEmail(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Ingresa un correo electrónico válido.', errors });
    const { error } = await auth.requestPasswordRecovery(email, recoveryCallbackUrl);
    if (error) return res.status(error.status === 429 ? 429 : error.status >= 500 ? 503 : 400).json({ error: authMessage(error, 'recovery') });
    res.json({ message: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.' });
  });

  router.get('/recovery/callback', limitAttempts, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    const tokenHash = typeof req.query.token_hash === 'string' ? req.query.token_hash : '';
    const type = typeof req.query.type === 'string' ? req.query.type : '';
    if (!tokenHash || type !== 'recovery') return res.redirect(303, recoveryErrorUrl);
    const { data, error } = await auth.verifyPasswordRecovery(tokenHash);
    if (error || !data.session || !data.user) return res.redirect(303, recoveryErrorUrl);
    setRecoverySessionCookies(res, data.session);
    res.redirect(303, recoveryPageUrl);
  });

  router.post('/recovery/password', auth.requireRecovery, async (req, res) => {
    const { password, errors } = validateRecoveryPassword(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Revisa los campos de contraseña.', errors });
    const { error } = await auth.updatePasswordFromSession(req, res, password);
    if (error) return res.status(error.status === 429 ? 429 : error.status >= 500 ? 503 : 400).json({ error: authMessage(error, 'password') });
    clearRecoveryCookie(res);
    res.json({ message: 'Tu contraseña se actualizó correctamente.' });
  });

  router.get('/session', async (req, res) => {
    const identity = await auth.identify(req, res);
    res.json({ account: identity?.account ?? null });
  });

  router.post('/logout', async (req, res) => {
    const identity = await auth.identify(req, res);
    const token = identity?.token;
    if (token) {
      const { error } = await database.auth.admin.signOut(token, 'local');
      if (error && error.status >= 500) return res.status(503).json({ error: 'No pudimos cerrar tu sesión. Intenta de nuevo.' });
    }
    clearSessionCookies(res);
    res.status(204).end();
  });

  router.put('/profile', auth.requireAccount, async (req, res) => {
    const { data, errors } = validateAccount(req.body, 'profile');
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Revisa los campos señalados.', errors });
    const { error } = await database.from('profiles').update({ ...data, phone: data.phone || null, updated_at: new Date().toISOString() })
      .eq('id', req.account.profile.id).eq('id_user', req.account.id);
    if (error) return res.status(503).json({ error: 'No se pudo actualizar tu perfil. Intenta de nuevo.' });
    res.json({ account: { ...req.account, profile: { ...req.account.profile, ...data } }, message: 'Tu perfil se actualizó correctamente.' });
  });

  return router;
}

module.exports = { createAuthRouter };
