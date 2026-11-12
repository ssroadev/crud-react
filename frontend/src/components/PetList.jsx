const SIZE_LABEL = { pequeno: 'Pequeño', mediano: 'Mediano', grande: 'Grande' };

export default function PetList({ pets, onEdit, onDelete }) {
  if (pets.length === 0) {
    return <div className="pet-empty"><img src="/images/pawhub-cat-cutout.png" alt="" width="120" height="120" /><h3>Su lugar está esperando</h3><p>Agrega a tu primer compañero para encontrar el cuidado que necesita.</p><span>Todo empieza con su nombre.</span></div>;
  }

  return (
    <ul className="pet-list">
      {pets.map((pet) => (
        <li key={pet.id}>
          <div className="pet-list-avatar" aria-hidden="true">{pet.name[0]?.toUpperCase()}</div><div className="pet-list-info">
            <strong>{pet.name}</strong>
            <span>
              {pet.breed || 'Raza sin especificar'}
            </span>
            <span className="pet-size-badge">Tamaño {SIZE_LABEL[pet.size]?.toLowerCase()}</span>
            {pet.notes && <p>{pet.notes}</p>}
          </div>
          <div className="actions">
            <button className="secondary" aria-label={`Editar a ${pet.name}`} onClick={() => onEdit(pet)}>
              Editar
            </button>
            <button className="danger" aria-label={`Eliminar a ${pet.name}`} onClick={() => onDelete(pet.id)}>
              Eliminar
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
