const BookingStatus = require('./BookingStatus');

class Caregiver {
  constructor({
    id, user, yearsExperience = 0, latitude, longitude, zone,
    bio = null, active = true, createdAt = new Date(),
  }) {
    if (latitude < -90 || latitude > 90) throw new Error('Latitud inválida');
    if (longitude < -180 || longitude > 180) throw new Error('Longitud inválida');
    this.id = id;
    this.user = user;
    this.yearsExperience = yearsExperience;
    this.latitude = latitude;
    this.longitude = longitude;
    this.zone = zone;
    this.bio = bio;
    this.active = active;
    this.createdAt = createdAt;
    this.services = [];       // 1 -> * CaregiverService
    this.availability = [];   // 1 -> * CaregiverAvailability
    this.bookings = [];       // 1 -> * Booking
  }

  activate() {
    this.active = true;
  }

  deactivate() {
    this.active = false;
  }

  isAvailable(start, end) {
    const inSchedule = this.availability.some((a) => a.covers(start, end));
    const hasConflict = this.bookings.some(
      (b) =>
        [BookingStatus.REQUESTED, BookingStatus.CONFIRMED].includes(b.status) &&
        start < b.endAt && b.startAt < end
    );
    return this.active && inSchedule && !hasConflict;
  }

  getAverageRating() {
    const ratings = this.bookings.filter((b) => b.review).map((b) => b.review.rating);
    if (!ratings.length) return null;
    return ratings.reduce((a, b) => a + b, 0) / ratings.length;
  }

  // Distancia en km (fórmula de Haversine)
  distanceTo(lat, lng) {
    const rad = (x) => (x * Math.PI) / 180;
    const R = 6371;
    const dLat = rad(lat - this.latitude);
    const dLng = rad(lng - this.longitude);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(this.latitude)) * Math.cos(rad(lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
}

module.exports = Caregiver;
