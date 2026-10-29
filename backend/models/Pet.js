const Size = require('./Size');

class Pet {
  constructor({
    id, owner, name, size, breed = null, birthDate = null,
    notes = null, createdAt = new Date(),
  }) {
    if (!Object.values(Size).includes(size)) {
      throw new Error(`Tamaño inválido: ${size}`);
    }
    this.id = id;
    this.owner = owner;     // User
    this.name = name;
    this.size = size;
    this.breed = breed;
    this.birthDate = birthDate;
    this.notes = notes;
    this.createdAt = createdAt;
    this.bookings = [];     // 1 -> * Booking
  }

  getAge() {
    if (!this.birthDate) return null;
    const diff = Date.now() - new Date(this.birthDate).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  }

  update(data) {
    Object.assign(this, data);
  }

  getBookingHistory() {
    return this.bookings;
  }
}

module.exports = Pet;
