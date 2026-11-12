import { useEffect, useState } from 'react';
import { getPets, createPet, updatePet, deletePet } from '../api';
import PetForm from './PetForm';
import PetList from './PetList';

export default function MyPets() {
  const [pets, setPets] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [success, setSuccess] = useState('');
  useEffect(() => {
    let active = true;
    getPets().then((data) => { if (active) { setPets(data); setError(''); } })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  const save = async (pet) => {
    setError(''); setSuccess('');
    if (editing) await updatePet(editing.id, pet); else await createPet(pet);
    setSuccess(editing ? `Guardaste los cambios de ${pet.name}.` : `${pet.name} ya tiene su espacio en PawHub.`);
    setEditing(null); setRevision((value) => value + 1); return true;
  };
  const remove = async (id) => {
    if (!window.confirm('¿Eliminar esta mascota?')) return;
    try { await deletePet(id); if (editing?.id === id) setEditing(null); setRevision((value) => value + 1); }
    catch (err) { setError(err.message); }
  };
  return <>
    <div className="pets-page-heading"><div><p className="eyebrow">Pequeños compañeros, grandes historias</p><h1>Su espacio, contigo.</h1><p>Presenta a tu mascota y cuéntanos lo que la hace única.</p></div><span className="pets-count">{pets.length} {pets.length === 1 ? 'compañero' : 'compañeros'}</span></div>
    {error && <p className="error" role="alert">{error}</p>}
    {success && <p className="success" role="status">{success}</p>}
    <div className="pets-workspace"><section className="pet-editor-card"><div className="pet-panel-heading"><span className="pet-heading-icon" aria-hidden="true">{editing ? '✎' : '＋'}</span><div><h2>{editing ? `Editar a ${editing.name}` : 'Una nueva amistad'}</h2><p>{editing ? 'Sus datos, siempre al día.' : 'Los detalles que nos ayudan a conocerle.'}</p></div></div><PetForm key={editing?.id ?? 'new'} editingPet={editing} onSubmit={save} onCancel={() => setEditing(null)} /></section>
    <section className="pet-collection"><div className="pet-collection-heading"><div><p className="eyebrow">Tu pequeña familia</p><h2>Mis mascotas</h2></div><span>{pets.length}</span></div>{loading ? <p role="status">Cargando tus mascotas…</p> : <PetList pets={pets} onEdit={(pet) => { setEditing(pet); setSuccess(''); document.querySelector('.pet-editor-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} onDelete={remove} />}{!loading && error && <button className="secondary" onClick={() => { setLoading(true); setRevision((value) => value + 1); }}>Volver a cargar</button>}</section></div>
  </>;
}
