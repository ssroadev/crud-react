import { useEffect, useRef, useState } from 'react';
import { getSession, logoutAccount } from './api';
import Caregivers from './components/Caregivers';
import AuthPage from './components/AuthPage';
import AccountProfile from './components/AccountProfile';
import MyPets from './components/MyPets';
import BookingRequests from './components/BookingRequests';
import HomeLink from './components/HomeLink';
import BookingChat from './components/BookingChat';

const chatFromHash = () => window.location.hash.slice('#chat/'.length);

const routeFromHash = () => {
  const route = window.location.hash.slice(1);
  if (route.startsWith('chat/')) return 'chat';
  return ['login', 'register', 'account', 'pets', 'requests'].includes(route) ? route : 'caregivers';
};

function initialRoute() {
  const query = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  let notice = '';
  if (query.has('auth') || fragment.has('access_token') || fragment.has('error_code')) {
    notice = fragment.has('error_code') ? 'El enlace de confirmación venció o no es válido. Intenta iniciar sesión o revisa el correo más reciente.' : 'Si ya confirmaste tu correo, puedes iniciar sesión con tu cuenta.';
    query.delete('auth');
    const search = query.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}#login`);
  }
  return { page: routeFromHash(), notice };
}

export default function App() {
  const [initial] = useState(initialRoute);
  const [page, setPage] = useState(initial.page);
  const [chatId, setChatId] = useState(chatFromHash);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(initial.notice);
  const [error, setError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [homeRevision, setHomeRevision] = useState(0);
  const identityRevision = useRef(0);

  useEffect(() => {
    const current = identityRevision.current;
    let active = true;
    getSession().then((result) => { if (active && current === identityRevision.current) setAccount(result.account); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    const onHash = () => {
      const nextPage = routeFromHash();
      setPage(nextPage);
      if (nextPage === 'chat') setChatId(chatFromHash());
      if (['caregivers', 'pets', 'requests', 'chat'].includes(nextPage)) setNotice('');
    };
    const goHome = () => { setPage('caregivers'); setHomeRevision((value) => value + 1); setNotice(''); };
    const expired = () => {
      identityRevision.current++;
      setAccount(null); setNotice('Tu sesión terminó. Inicia sesión para continuar.'); window.location.hash = 'login';
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('pawhub:session-expired', expired);
    window.addEventListener('pawhub:home', goHome);
    return () => { active = false; window.removeEventListener('hashchange', onHash); window.removeEventListener('pawhub:session-expired', expired); window.removeEventListener('pawhub:home', goHome); };
  }, []);

  const authenticated = (nextAccount, message) => {
    identityRevision.current++; setAccount(nextAccount); setNotice(message); setError(''); window.location.hash = 'account';
  };
  const logout = async () => {
    setLoggingOut(true);
    try { await logoutAccount(); identityRevision.current++; setAccount(null); setNotice('Cerraste sesión correctamente. Hasta pronto.'); window.location.hash = 'login'; }
    catch (err) { setError(err.message); }
    finally { setLoggingOut(false); }
  };

  if (page === 'login' || page === 'register') return <AuthPage key={page} mode={page} onAuthenticated={authenticated} notice={notice} />;
  const privatePage = ['pets', 'account', 'requests', 'chat'].includes(page);
  return <>
    <header className="site-header">
      <HomeLink className="brand home-brand" />
      <nav aria-label="Navegación principal"><a className="button-link" href="#">Cuidadores</a><a className="button-link" href="#pets">Mis mascotas</a><a className="button-link" href="#requests">Mis solicitudes</a></nav>
      <div className="account-nav">{account ? <><a href="#account" className="account-name">Hola, {account.profile.first_name}</a><button className="secondary" disabled={loggingOut} onClick={logout}>{loggingOut ? 'Cerrando…' : 'Cerrar sesión'}</button></> : <><a href="#login">Iniciar sesión</a><a className="nav-register" href="#register">Crear cuenta</a></>}</div>
    </header>
    <main className={['caregivers', 'requests', 'chat'].includes(page) ? 'wide-main' : ''}>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && account && <p className="success" role="status">{notice}</p>}
      {privatePage && loading ? <p role="status">Comprobando tu sesión…</p> : privatePage && !account ? <section className="auth-required"><h2>Este espacio es para ti y tus mascotas</h2><p className="muted">Inicia sesión para acceder a tu perfil y administrar tus mascotas.</p><a className="button-link" href="#login">Iniciar sesión</a><p>¿Aún no tienes cuenta? <a href="#register">Regístrate en PawHub</a></p></section> : <>
        <div hidden={page !== 'caregivers'}><Caregivers key={`${account?.id ?? 'guest'}-${homeRevision}`} account={account} /></div>
        {page === 'pets' && account && <MyPets key={account.id} />}
        {page === 'account' && account && <AccountProfile key={account.id} account={account} onUpdated={setAccount} />}
        {page === 'requests' && account && <BookingRequests key={account.id} account={account} />}
        {page === 'chat' && account && <BookingChat key={`${account.id}-${chatId}`} bookingId={chatId} account={account} />}
      </>}
    </main>
  </>;
}
