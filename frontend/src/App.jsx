import { useEffect, useState } from 'react';
import { getPets, createPet, updatePet, deletePet } from './api';
import PetForm from './components/petForm';
import PetList from './components/Petlist';

export default function App() {
  const [pets, setPets] = useState([]);
  const [editingPet, setEditingPet] = useState(null);
  const [error, setError] = useState('');

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

  useEffect(() => {
    loadPets();
  }, []);

  // Devuelve true si se guardó, para que el formulario sepa si limpiarse
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