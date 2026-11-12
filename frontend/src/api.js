const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('No pudimos conectar con PawHub. Revisa tu conexión e intenta de nuevo.', { cause: error });
  }
  if (res.status === 204) return null;

  const body = await res.json();
  if (!res.ok) {
    const error = new Error(body.error || 'Error en la petición');
    error.fields = body.errors || {};
    error.status = res.status;
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('pawhub:session-expired'));
    throw error;
  }
  return body;
}

export const getPets = () => request('/pets');
export const createPet = (pet) =>request('/pets', { method: 'POST', body: JSON.stringify(pet) });
export const updatePet = (id, pet) => request(`/pets/${id}`, { method: 'PUT', body: JSON.stringify(pet) });
export const deletePet = (id) => request(`/pets/${id}`, { method: 'DELETE' });
export const getOwners = () => request('/owners');
export const getSession = () => request('/auth/session');
export const registerAccount = (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) });
export const loginAccount = (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) });
export const requestPasswordRecovery = (email) => request('/auth/recovery/request', { method: 'POST', body: JSON.stringify({ email }) });
export const updatePasswordFromRecovery = (data) => request('/auth/recovery/password', { method: 'POST', body: JSON.stringify(data) });
export const logoutAccount = () => request('/auth/logout', { method: 'POST', body: '{}' });
export const updateAccount = (data) => request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) });
export const createBooking = (data) => request('/bookings', { method: 'POST', body: JSON.stringify(data) });
export const getBookings = (view = 'sent', options = {}) => request(`/bookings?view=${encodeURIComponent(view)}`, options);
export const reviewBooking = (id, decision, responseNote = '') => request(`/bookings/${encodeURIComponent(id)}/review`, {
  method: 'POST', body: JSON.stringify({ decision, response_note: responseNote }),
});
export const markBookingRead = (id) => request(`/bookings/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' });
export const completeBooking = (id) => request(`/bookings/${encodeURIComponent(id)}/complete`, { method: 'POST', body: '{}' });
export const getBookingChat = (id, filters = {}, options = {}) => request(`/bookings/${encodeURIComponent(id)}/chat?${new URLSearchParams(filters)}`, options);
export const sendChatMessage = (id, message, options = {}) => request(`/bookings/${encodeURIComponent(id)}/chat`, {
  ...options, method: 'POST', body: JSON.stringify(message),
});
export const getCaregivers = (filters = {}, options = {}) => {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined));
  return request(`/caregivers?${query}`, options);
};
export const getCaregiver = (id, options = {}) => request(`/caregivers/${encodeURIComponent(id)}`, options);
export const findLocations = (query) => request(`/locations?q=${encodeURIComponent(query)}`);
export const getCaregiverProfile = (profileId) => request(`/caregivers/profile/${encodeURIComponent(profileId)}`);
export const saveCaregiverProfile = (profileId, profile) => request(`/caregivers/profile/${encodeURIComponent(profileId)}`, {
  method: 'PUT', body: JSON.stringify(profile),
});
