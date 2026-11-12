import { useState } from 'react';
import CaregiverDirectory from './CaregiverDirectory';
import MyCaregiverProfile from './MyCaregiverProfile';

export default function Caregivers({ account }) {
  const [tab, setTab] = useState('browse');
  const [revision, setRevision] = useState(0);
  const isCaregiver = account?.roles.includes('caregiver');
  return <>
    <div className="directory-hero">
      <div><p className="eyebrow">Su bienestar, tu tranquilidad</p><h1>El cuidado que necesita.<br /><span>Cerca de ti.</span></h1><p>Encuentra personas que conecten con tu mascota y con lo que necesitas.</p><div className="hero-benefits"><span>Perfiles con experiencia</span><span>Horarios para tu rutina</span><span>Reseñas de otros dueños</span></div></div>
      <div className="hero-companion" aria-hidden="true"><img src="/images/pawhub-cat-cutout.png" alt="" /><span>Un buen cuidado empieza<br />con una buena conexión.</span></div>
    </div>
    {isCaregiver && <div className="section-tabs" aria-label="Cuidadores">
      <button className={tab === 'browse' ? 'active' : 'secondary'} aria-pressed={tab === 'browse'} onClick={() => setTab('browse')}>Encontrar cuidador</button>
      <button className={tab === 'edit' ? 'active' : 'secondary'} aria-pressed={tab === 'edit'} onClick={() => setTab('edit')}>Administrar mi perfil profesional</button>
    </div>}
    <div hidden={isCaregiver && tab !== 'browse'}><CaregiverDirectory revision={revision} account={account} /></div>
    {isCaregiver && <div hidden={tab !== 'edit'}><MyCaregiverProfile account={account} onSaved={() => setRevision((value) => value + 1)} /></div>}
  </>;
}
