import { useState } from 'react';
import CaregiverDirectory from './CaregiverDirectory';
import MyCaregiverProfile from './MyCaregiverProfile';

export default function Caregivers({ account }) {
  const [tab, setTab] = useState('browse');
  const [revision, setRevision] = useState(0);
  const isCaregiver = account?.roles.includes('caregiver');
  return <>
    <div className="page-intro"><p className="eyebrow">Cuidado con confianza</p><h1>Personas que cuidan como tú.</h1><p className="muted">Conoce su experiencia, compara servicios y encuentra compañía para tu mascota.</p></div>
    {isCaregiver && <div className="section-tabs" aria-label="Cuidadores">
      <button className={tab === 'browse' ? 'active' : 'secondary'} aria-pressed={tab === 'browse'} onClick={() => setTab('browse')}>Encontrar cuidador</button>
      <button className={tab === 'edit' ? 'active' : 'secondary'} aria-pressed={tab === 'edit'} onClick={() => setTab('edit')}>Administrar mi perfil profesional</button>
    </div>}
    <div hidden={isCaregiver && tab !== 'browse'}><CaregiverDirectory revision={revision} account={account} /></div>
    {isCaregiver && <div hidden={tab !== 'edit'}><MyCaregiverProfile account={account} onSaved={() => setRevision((value) => value + 1)} /></div>}
  </>;
}
