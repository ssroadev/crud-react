export default function HomeLink({ className = '', children }) {
  const navigate = (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.location.hash = 'home';
    window.dispatchEvent(new Event('pawhub:home'));
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };
  return <a href="#home" className={className} onClick={navigate} title="Volver a la página inicial" aria-label={children ? 'Volver a la página inicial' : 'PawHub, volver al inicio'}>
    {children || <><img src="/images/pawhub-logo.png" alt="PawHub" width="160" height="43" /><span className="home-link-hint"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3 10 9-7 9 7v10H7V10m3 10v-6h4v6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>Inicio</span></>}
  </a>;
}
