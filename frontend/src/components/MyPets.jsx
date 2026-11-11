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
  useEffect(() => {
    let active = true;
    getPets().then((data) => { if (active) { setPets(data); setError(''); } })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  const save = async (pet) => {
    try {
      if (editing) await updatePet(editing.id, pet); else await createPet(pet);
      setEditing(null); setRevision((value) => value + 1); return true;
    } catch (err) { setError(err.message); return false; }
  };
  const remove = async (id) => {
    if (!window.confirm('¿Eliminar esta mascota?')) return;
    try { await deletePet(id); if (editing?.id === id) setEditing(null); setRevision((value) => value + 1); }
    catch (err) { setError(err.message); }
  };
  return <>
    <p className="eyebrow">Su pequeño espacio</p><h1>Mis mascotas</h1><p className="muted">Solo tú puedes administrar las mascotas de tu cuenta.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <section><h2>{editing ? `Editar a ${editing.name}` : 'Agregar mascota'}</h2><PetForm key={editing?.id ?? 'new'} editingPet={editing} onSubmit={save} onCancel={() => setEditing(null)} /></section>
    <section><h2>Mis mascotas registradas</h2>{loading ? <p role="status">Cargando tus mascotas…</p> : <PetList pets={pets} onEdit={setEditing} onDelete={remove} />}</section>
  </>;
}
