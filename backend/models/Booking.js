const BookingStatus = require('./BookingStatus');

class Booking {
  constructor({
    id, pet, caregiver, service, startAt, endAt,
    status = BookingStatus.REQUESTED, totalAmount = 0, createdAt = new Date(),
  }) {
    this.id = id;
    this.pet = pet;
    this.caregiver = caregiver;
    this.service = service;
    this.startAt = startAt;
    this.endAt = endAt;
    this.status = status;
    this.totalAmount = totalAmount;
    this.createdAt = createdAt;
    this.review = null; // 1 -> 0..1 Review
  }

  confirm() {
    if (this.status !== BookingStatus.REQUESTED) {
      throw new Error('Solo se puede confirmar una reserva solicitada');
    }
    this.status = BookingStatus.CONFIRMED;
  }

  complete() {
    if (this.status !== BookingStatus.CONFIRMED) {
      throw new Error('Solo se puede completar una reserva confirmada');
    }
    this.status = BookingStatus.COMPLETED;
  }

  cancel() {
    if (this.status === BookingStatus.COMPLETED) {
      throw new Error('No se puede cancelar una reserva completada');
    }
    this.status = BookingStatus.CANCELLED;
  }

  getDurationHours() {
    return (this.endAt - this.startAt) / (1000 * 60 * 60);
  }

  calculateTotal() {
    const offer = this.caregiver.services.find(
      (s) => s.service.id === this.service.id && s.active
    );
    if (!offer) throw new Error('El cuidador no ofrece este servicio');
    this.totalAmount = offer.calculateCost(this.getDurationHours());
    return this.totalAmount;
  }
}

module.exports = Booking;
