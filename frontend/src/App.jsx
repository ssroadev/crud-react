import { useEffect, useState } from 'react';
import { getPets, createPet, updatePet, deletePet, getOwners } from './api';
import PetForm from './components/PetForm';
import PetList from './components/PetList';

export default function App() {
  const [pets, setPets] = useState([]);
  const [editingPet, setEditingPet] = useState(null);
  const [error, setError] = useState('');
  const [owners, setOwners] = useState([]);

  const loadPets = async () => {
    try {
      setPets(await getPets());
      setError('');
    } catch {
      setError(
        'No se pudo conectar con el servidor. Verifica que el backend esté corriendo en el puerto 3000.'
      );
    }
  };

  const loadOwners = async() =>{
    try{
      setOwners(await getOwners());
      setError('');
    }catch(err){
      setError('No se pudo conectar con el servidor.')
      console.log("ERROROR", err);
    }
  }

  useEffect(() => {
    loadPets();
    loadOwners();
  }, []);
  const handleSave = async (pet) => {
    try {
      if (editingPet) await updatePet(editingPet.id, pet);
      else await createPet(pet);
      setEditingPet(null);
      await loadPets();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta mascota?')) return;
    try {
      await deletePet(id);
      if (editingPet?.id === id) setEditingPet(null);
      await loadPets();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main>
      <h1>Mascotas</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section>
        <h2>{editingPet ? `Editar a ${editingPet.name}` : 'Agregar mascota'}</h2>
        <PetForm
          editingPet={editingPet}
          owners={owners}
          onSubmit={handleSave}
          onCancel={() => setEditingPet(null)}
        />
      </section>

      <section>
        <h2>Mascotas registradas</h2>
        <PetList pets={pets} onEdit={setEditingPet} onDelete={handleDelete} />
      </section>
    </main>
  );
}