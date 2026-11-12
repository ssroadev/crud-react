const { createClient } = require('@supabase/supabase-js');
const { createHash } = require('node:crypto');

const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 });
const recoveryCookieOptions = () => ({ ...cookieOptions(), sameSite: 'lax', maxAge: 15 * 60 * 1000 });
function readCookies(req) {
  const cookies = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    try { cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim()); } catch { /* Ignora cookies malformadas. */ }
  }
  return cookies;
}
function setSessionCookies(res, session) {
  res.cookie('pawhub_access', session.access_token, cookieOptions());
  res.cookie('pawhub_refresh', session.refresh_token, cookieOptions());
}
function clearSessionCookies(res) {
  const { maxAge: _maxAge, ...options } = cookieOptions();
  res.clearCookie('pawhub_access', options);
  res.clearCookie('pawhub_refresh', options);
  res.clearCookie('pawhub_recovery', { ...options, sameSite: 'lax' });
}

function setRecoverySessionCookies(res, session) {
  setSessionCookies(res, session);
  res.cookie('pawhub_recovery', '1', recoveryCookieOptions());
}

function clearRecoveryCookie(res) {
  const { maxAge: _maxAge, ...options } = recoveryCookieOptions();
  res.clearCookie('pawhub_recovery', options);
}

function createAuthService(database, clientFactory = () => createClient(process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })) {
  const refreshing = new Map();

  async function accountFor(authId) {
    const { data: user, error } = await database.from('users').select('id,email').eq('auth_user_id', authId).maybeSingle();
    if (error || !user) throw Object.assign(new Error('No se pudo cargar tu cuenta. Verifica que se haya aplicado la migración de registro.'), { status: 503 });
    const [{ data: profile, error: profileError }, { data: memberships, error: roleError }] = await Promise.all([
      database.from('profiles').select('id,id_user,first_name,last_name,phone,bio,avatar_url').eq('id_user', user.id).single(),
      database.from('user_roles').select('role:roles(name)').eq('id_user', user.id),
    ]);
    if (profileError || roleError) throw Object.assign(new Error('No se pudo cargar tu perfil. Intenta de nuevo.'), { status: 503 });
    return { id: user.id, email: user.email, profile, roles: memberships.map((item) => item.role?.name).filter(Boolean) };
  }

  async function requestPasswordRecovery(email, redirectTo) {
    // A new client per operation avoids sharing mutable auth state across requests.
    return clientFactory().auth.resetPasswordForEmail(email, { redirectTo });
  }

  async function verifyPasswordRecovery(tokenHash) {
    const client = clientFactory();
    return client.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
  }

  async function updatePasswordFromSession(req, res, password) {
    const cookies = readCookies(req);
    const currentSession = req.authSession || (cookies.pawhub_access && cookies.pawhub_refresh
      ? { access_token: cookies.pawhub_access, refresh_token: cookies.pawhub_refresh } : null);
    if (!currentSession) {
      throw Object.assign(new Error('El enlace de recuperación venció o ya fue utilizado. Solicita uno nuevo.'), { status: 401 });
    }
    const client = clientFactory();
    const { data: sessionData, error: sessionError } = await client.auth.setSession(currentSession);
    if (sessionError || !sessionData.session) {
      throw Object.assign(new Error('El enlace de recuperación venció o ya fue utilizado. Solicita uno nuevo.'), { status: 401 });
    }
    setSessionCookies(res, sessionData.session);
    const { data: verified, error: verifyError } = await client.auth.getUser(sessionData.session.access_token);
    if (verifyError || !verified.user) {
      throw Object.assign(new Error('El enlace de recuperación venció o ya fue utilizado. Solicita uno nuevo.'), { status: 401 });
    }
    return client.auth.updateUser({ password });
  }

  async function identify(req, res) {
    const cookies = readCookies(req);
    if (cookies.pawhub_access) {
      const { data, error } = await clientFactory().auth.getUser(cookies.pawhub_access);
      if (!error && data.user) return {
        account: await accountFor(data.user.id), token: cookies.pawhub_access,
        session: cookies.pawhub_refresh ? { access_token: cookies.pawhub_access, refresh_token: cookies.pawhub_refresh } : null,
      };
      if (error?.status >= 500 || error?.name === 'AuthRetryableFetchError') throw Object.assign(new Error('El servicio de acceso no está disponible. Intenta de nuevo.'), { status: 503 });
    }
    if (cookies.pawhub_refresh) {
      const key = createHash('sha256').update(cookies.pawhub_refresh).digest('hex');
      let pending = refreshing.get(key);
      if (!pending) {
        pending = clientFactory().auth.refreshSession({ refresh_token: cookies.pawhub_refresh });
        refreshing.set(key, pending);
        const cleanup = setTimeout(() => refreshing.delete(key), 10000);
        cleanup.unref();
      }
      const { data, error } = await pending;
      if (error?.status >= 500 || error?.name === 'AuthRetryableFetchError') throw Object.assign(new Error('No pudimos renovar tu sesión. Intenta de nuevo.'), { status: 503 });
      if (!error && data.session && data.user) {
        const account = await accountFor(data.user.id);
        setSessionCookies(res, data.session);
        return { account, token: data.session.access_token, session: data.session };
      }
    }
    clearSessionCookies(res);
    return null;
  }

  async function requireAccount(req, res, next) {
    try {
      const identity = await identify(req, res);
      if (!identity) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
      req.account = identity.account;
      req.accessToken = identity.token;
      req.authSession = identity.session;
      next();
    } catch (error) { next(error); }
  }

  async function requireRecovery(req, res, next) {
    try {
      const cookies = readCookies(req);
      if (cookies.pawhub_recovery !== '1') return res.status(401).json({ error: 'Abre el enlace de recuperación más reciente para continuar.' });
      const identity = await identify(req, res);
      if (!identity) return res.status(401).json({ error: 'El enlace de recuperación venció o ya fue utilizado. Solicita uno nuevo.' });
      req.account = identity.account;
      req.accessToken = identity.token;
      req.authSession = identity.session;
      next();
    } catch (error) { next(error); }
  }

  return { accountFor, identify, requireAccount, requireRecovery, requestPasswordRecovery, verifyPasswordRecovery, updatePasswordFromSession, clientFactory };
}

module.exports = { createAuthService, readCookies, setSessionCookies, clearSessionCookies, setRecoverySessionCookies, clearRecoveryCookie };
