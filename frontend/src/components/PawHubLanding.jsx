import { useEffect, useState } from 'react';
import '../landing/css/styles.css';
import pawhubLogo from '../landing/assets/img/pawhub-logo.png';
import heroBackground from '../landing/assets/img/fondo.png';

export default function PawHubLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const year = new Date().getFullYear();

  useEffect(() => {
    const rootStyle = document.documentElement.style;
    const previousScrollBehavior = rootStyle.scrollBehavior;
    rootStyle.scrollBehavior = 'smooth';
    const closeMenuOnEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    const closeMenuOnResize = () => {
      if (window.innerWidth > 980) setMenuOpen(false);
    };
    window.addEventListener('keydown', closeMenuOnEscape);
    window.addEventListener('resize', closeMenuOnResize);
    return () => {
      window.removeEventListener('keydown', closeMenuOnEscape);
      window.removeEventListener('resize', closeMenuOnResize);
      rootStyle.scrollBehavior = previousScrollBehavior;
    };
  }, []);

  const handleNavigationClick = (event) => {
    if (event.target.closest('a')) setMenuOpen(false);
  };

  return (
    <div className="landing-page">

  {/* Encabezado y navegación principal de PawHub. */}
  <header className="encabezado">
    <div className="contenedor encabezado-contenido">
      <a className="marca" href="#home" aria-label="PawHub, página de inicio">
        <img src={pawhubLogo} alt="PawHub" />
      </a>

      <button className="boton-menu" type="button" aria-controls="navegacion-principal" aria-expanded={menuOpen} aria-label={menuOpen ? "Cerrar men\u00fa de navegaci\u00f3n" : "Abrir men\u00fa de navegaci\u00f3n"} onClick={() => setMenuOpen((open) => !open)}>
        <span></span>
        <span></span>
        <span></span>
      </button>

      <nav className="navegacion" id="navegacion-principal" aria-label="Navegación principal" onClick={handleNavigationClick}>
        <a className="enlace-navegacion" href="#como-funciona">Cómo funciona</a>
        <a className="enlace-navegacion" href="#comunidad">Nuestra comunidad</a>
        <a className="enlace-navegacion" href="#beneficios">Beneficios</a>
        <div className="acciones-navegacion">
          <a className="boton boton-inicio-sesion" href="#login">Iniciar sesión</a>
        </div>
      </nav>
    </div>
  </header>

  <main>
    {/* Presentación principal con la imagen editada de PawHub. */}
    <section className="portada" aria-labelledby="titulo-portada">
      <img className="portada-fondo" src={heroBackground} alt="Mujer abrazando a su gato frente a un fondo turquesa con huellas naranjas" />
      <div className="contenedor portada-contenido">
        <div className="portada-texto">
          <h1 id="titulo-portada">El cuidado que merece. <span>La tranquilidad que buscas.</span></h1>
          <p className="portada-descripcion">
            Encuentra personas amantes de los animales para cuidar a tu mascota con la atención y el cariño que merece.
          </p>
          <div className="acciones-portada">
            <a className="boton boton-principal boton-grande" href="#login">
              Encuentra un cuidador
              <span aria-hidden="true">→</span>
            </a>
            <a className="boton boton-secundario boton-grande" href="#register">
              Quiero ofrecer cuidados
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </div>
    </section>

    {/* Explicación sencilla del recorrido de una familia en PawHub. */}
    <section className="seccion seccion-funcionamiento" id="como-funciona" aria-labelledby="titulo-funcionamiento">
      <div className="contenedor">
        <div className="encabezado-seccion">
          <h2 id="titulo-funcionamiento">Cuidar bien empieza <span>conectando.</span></h2>
          <p>Tres pasos para acercarte a una comunidad que entiende lo importante que es tu mascota.</p>
        </div>

        <div className="pasos">
          <article className="paso">
            <div className="imagen-paso imagen-paso-buscar" role="img" aria-label="Imagen del primer paso: encontrar opciones de cuidado con el número integrado"></div>
            <h3>Encuentra opciones</h3>
            <p>Explora cuidadores según tu zona, el servicio que necesitas y el tipo de mascota.</p>
          </article>

          <article className="paso">
            <div className="imagen-paso imagen-paso-conocer" role="img" aria-label="Imagen del segundo paso: conocer a quien cuida con el número integrado"></div>
            <h3>Conoce a quien cuida</h3>
            <p>Revisa la experiencia, las especialidades y la disponibilidad de cada perfil.</p>
          </article>

          <article className="paso">
            <div className="imagen-paso imagen-paso-elegir" role="img" aria-label="Imagen del tercer paso: elegir el cuidado con el número integrado"></div>
            <h3>Elige con confianza</h3>
            <p>Encuentra una persona que encaje contigo y con las necesidades de tu mascota.</p>
          </article>
        </div>
      </div>
    </section>

    {/* Dos formas de formar parte de la comunidad PawHub. */}
    <section className="seccion seccion-comunidad" id="comunidad" aria-labelledby="titulo-comunidad">
      <div className="contenedor comunidad-contenido">
        <div className="encabezado-seccion encabezado-comunidad">
          <p className="etiqueta-seccion">Un lugar para todos los que aman a los animales</p>
          <h2 id="titulo-comunidad">¿Qué lugar tiene PawHub <span>para ti?</span></h2>
          <p>Ya sea que busques apoyo o quieras ofrecerlo, aquí puedes dar el siguiente paso.</p>
        </div>

        <div className="tarjetas-comunidad">
          <article className="tarjeta-comunidad tarjeta-propietario">
            <div className="espacio-imagen-comunidad imagen-comunidad-propietarios" role="img" aria-label="Espacio para una imagen de propietarios y sus mascotas"></div>
            <div className="contenido-comunidad">
              <span className="rotulo-tarjeta">Para propietarios</span>
              <h3>Tu compañero merece lo mejor.</h3>
              <p>Encuentra opciones de cuidado que consideren sus hábitos, su personalidad y lo que necesita.</p>
              <a className="enlace-tarjeta" href="#login">Buscar cuidadores <span aria-hidden="true">→</span></a>
            </div>
          </article>

          <article className="tarjeta-comunidad tarjeta-cuidador">
            <div className="espacio-imagen-comunidad imagen-comunidad-cuidadores" role="img" aria-label="Espacio para una imagen de cuidadores atendiendo mascotas"></div>
            <div className="contenido-comunidad">
              <span className="rotulo-tarjeta">Para cuidadores</span>
              <h3>Tu vocación puede hacer la diferencia.</h3>
              <p>Comparte tu experiencia y conecta con familias que buscan cuidado atento y responsable.</p>
              <a className="enlace-tarjeta" href="#register">Únete como cuidador <span aria-hidden="true">→</span></a>
            </div>
          </article>
        </div>
      </div>
    </section>

    {/* Beneficios expresados como objetivos del servicio, no como garantías existentes. */}
    <section className="seccion seccion-beneficios" id="beneficios" aria-labelledby="titulo-beneficios">
      <div className="contenedor beneficios-contenido">
        <div className="encabezado-seccion encabezado-beneficios">
          <p className="etiqueta-seccion">El bienestar, siempre al centro</p>
          <h2 id="titulo-beneficios">Hecho para cuidar <span>lo que más quieres.</span></h2>
          <p>Conoce aspectos concretos que te ayudan a definir qué necesita tu mascota y comparar alternativas de cuidado.</p>
        </div>

        <div className="cuadricula-beneficios">
          <article className="beneficio">
            <div className="espacio-imagen-beneficio imagen-beneficio-personalizado" role="img" aria-label="Espacio para una imagen sobre cuidado adaptado a cada mascota"></div>
            <div className="contenido-beneficio">
              <h3>Cuidado a su medida</h3>
              <p>Ten en cuenta la edad, los hábitos, la energía y las necesidades de tu mascota al definir el tipo de apoyo que buscas.</p>
            </div>
          </article>
          <article className="beneficio">
            <div className="espacio-imagen-beneficio imagen-beneficio-perfiles" role="img" aria-label="Espacio para una imagen sobre perfiles y servicios de cuidadores"></div>
            <div className="contenido-beneficio">
              <h3>Perfiles para conocer antes</h3>
              <p>Revisa los servicios, la experiencia y la disponibilidad que comparte cada cuidador para valorar si se ajustan a lo que necesitas.</p>
            </div>
          </article>
          <article className="beneficio">
            <div className="espacio-imagen-beneficio imagen-beneficio-zona" role="img" aria-label="Espacio para una imagen sobre opciones de cuidado cercanas"></div>
            <div className="contenido-beneficio">
              <h3>Alternativas en tu zona</h3>
              <p>Acota la búsqueda por localidad o barrio para identificar opciones cercanas y planear con más facilidad los traslados.</p>
            </div>
          </article>
          <article className="beneficio">
            <div className="espacio-imagen-beneficio imagen-beneficio-decision" role="img" aria-label="Espacio para una imagen sobre elegir una alternativa de cuidado"></div>
            <div className="contenido-beneficio">
              <h3>Decide con más contexto</h3>
              <p>Compara necesidades, servicios y detalles del cuidado antes de conversar y acordar cómo será la atención.</p>
            </div>
          </article>
        </div>
      </div>
    </section>

    {/* Invitación final a conocer las opciones de PawHub. */}
    <section className="cierre" aria-labelledby="titulo-cierre">
      <div className="contenedor cierre-contenido">
        <span className="cierre-destello cierre-destello-uno" aria-hidden="true">✳</span>
        <span className="cierre-destello cierre-destello-dos" aria-hidden="true">✦</span>
        <p className="etiqueta etiqueta-clara">Un buen comienzo está a un clic</p>
        <h2 id="titulo-cierre">Más tranquilidad para ti.<br /><span>Más cariño para ellos.</span></h2>
        <p>Explora PawHub y encuentra tu lugar en esta comunidad.</p>
        <a className="boton boton-claro boton-grande" href="#register">Conoce PawHub <span aria-hidden="true">→</span></a>
      </div>
    </section>
  </main>

  {/* Enlaces y datos de contacto informativos. */}
  <footer className="pie-pagina">
    <div className="contenedor pie-contenido">
      <div className="pie-marca">
        <a className="marca" href="#home" aria-label="PawHub, volver al inicio">
          <img src={pawhubLogo} alt="PawHub" />
        </a>
        <p>Un espacio para conectar a quienes cuidan con quienes más los quieren.</p>
      </div>
      <div className="pie-enlaces">
        <div>
          <h2>Explora</h2>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#beneficios">Beneficios</a>
          <a href="#login">Buscar cuidadores</a>
        </div>
        <div>
          <h2>Tu cuenta</h2>
          <a href="#login">Iniciar sesión</a>
          <a href="#register">Registrarse</a>
          <a href="#register">Soy cuidador</a>
        </div>
      </div>
    </div>
    <div className="contenedor pie-final">
      <p>&copy; <span id="anio-actual">{year}</span> PawHub. Cuidado que nos conecta.</p>
      <p>Proyecto universitario en desarrollo.</p>
    </div>
  </footer>
    </div>
  );
}
