import { useEffect, useState } from 'react';

const EMPTY = {
  id_owner: '',
  name: '',
  size: 'mediano',
  breed: '',
  birth_date: '',
  notes: '',
};

const toForm = (pet) => ({
  id_owner: pet.id_owner,
  name: pet.name,
  size: pet.size,
  breed: pet.breed ?? '',
  birth_date: pet.birth_date ?? '',
  notes: pet.notes ?? '',
});

export default function PetForm({ editingPet, onSubmit, onCancel }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    setForm(editingPet ? toForm(editingPet) : EMPTY);
  }, [editingPet]);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ok = await onSubmit({
      id_owner: Number(form.id_owner),
      name: form.name,
      size: form.size,
      breed: form.breed || null,
      birth_date: form.birth_date || null,
      notes: form.notes || null,
    });
    if (ok && !editingPet) setForm(EMPTY);
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Id del dueño
        <input
          type="number"
          name="id_owner"
          value={form.id_owner}
          onChange={handleChange}
          disabled={Boolean(editingPet)}
          required
        />
      </label>
      <label>
        Nombre
        <input name="name" value={form.name} onChange={handleChange} required />
      </label>
      <label>
        Tamaño
        <select name="size" value={form.size} onChange={handleChange}>
          <option value="pequeno">Pequeño</option>
          <option value="mediano">Mediano</option>
          <option value="grande">Grande</option>
        </select>
      </label>
      <label>
        Raza
        <input name="breed" value={form.breed} onChange={handleChange} />
      </label>
      <label>
        Fecha de nacimiento
        <input
          type="date"
          name="birth_date"
          value={form.birth_date}
          onChange={handleChange}
        />
      </label>
      <label>
        Notas
        <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} />
      </label>
      <div className="form-actions">
        <button type="submit">
          {editingPet ? 'Guardar cambios' : 'Agregar mascota'}
        </button>
        {editingPet && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}