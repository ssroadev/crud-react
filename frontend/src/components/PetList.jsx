const SIZE_LABEL = { pequeno: 'Pequeño', mediano: 'Mediano', grande: 'Grande' };

export default function PetList({ pets, onEdit, onDelete }) {
  if (pets.length === 0) {
    return <p className="empty">Aún no hay mascotas. 
    Agrega la primera con el formulario.</p>;
  }

  return (
    <ul className="pet-list">
      {pets.map((pet) => (
        <li key={pet.id}>
          <div>
            <strong>{pet.name}</strong>
            <span>
              {SIZE_LABEL[pet.size]}
              {pet.breed ? `, ${pet.breed}` : ''}
            </span>
            <span>Id del dueño: {pet.id_owner}</span>
            {pet.notes && <p>{pet.notes}</p>}
          </div>
          <div className="actions">
            <button className="secondary" onClick={() => onEdit(pet)}>
              Editar
            </button>
            <button className="danger" onClick={() => onDelete(pet.id)}>
              Eliminar
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}