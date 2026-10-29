class Review {
  constructor({ id, booking, rating, comment = null, createdAt = new Date() }) {
    this.id = id;
    this.booking = booking;
    this.rating = rating;
    this.comment = comment;
    this.createdAt = createdAt;
    if (!this.isValidRating()) throw new Error('rating debe estar entre 1 y 5');
  }

  isValidRating() {
    return Number.isInteger(this.rating) && this.rating >= 1 && this.rating <= 5;
  }

  edit(rating, comment) {
    this.rating = rating;
    this.comment = comment;
    if (!this.isValidRating()) throw new Error('rating debe estar entre 1 y 5');
  }
}

module.exports = Review;
