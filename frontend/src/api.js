const API_URL = 'http://localhost:3000';

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;

  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Error en la petición');
  return body;
}

export const getPets = () => request('/pets');
export const createPet = (pet) =>
  request('/pets', { method: 'POST', body: JSON.stringify(pet) });
export const updatePet = (id, pet) =>
  request(`/pets/${id}`, { method: 'PUT', body: JSON.stringify(pet) });
export const deletePet = (id) => request(`/pets/${id}`, { method: 'DELETE' });