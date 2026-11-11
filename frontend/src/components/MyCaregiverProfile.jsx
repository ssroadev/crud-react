import { useEffect, useState } from 'react';
import { getCaregiverProfile } from '../api';
import CaregiverForm from './CaregiverForm';

export default function MyCaregiverProfile({ account, onSaved }) {
  const [state, setState] = useState({ loading: true, profile: null, error: '' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    getCaregiverProfile(account.profile.id).then((profile) => { if (active) setState({ loading: false, profile, error: '' }); })
      .catch((error) => { if (active) setState({ loading: false, profile: null, error: error.message }); });
    return () => { active = false; };
  }, [account.profile.id, retry]);
  if (state.loading) return <p role="status">Cargando tu perfil profesional…</p>;
  if (state.error) return <p className="error" role="alert">{state.error} <button className="secondary" onClick={() => { setState({ loading: true, profile: null, error: '' }); setRetry((value) => value + 1); }}>Reintentar</button></p>;
  return <CaregiverForm key={retry} account={account.profile} profile={state.profile} onSaved={onSaved} />;
}
