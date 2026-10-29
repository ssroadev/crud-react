class CaregiverAvailability {
  constructor({
    id, dayOfWeek, startTime, endTime,
    createdAt = new Date(), updatedAt = new Date(),
  }) {
    if (dayOfWeek < 0 || dayOfWeek > 6) throw new Error('dayOfWeek debe estar entre 0 y 6');
    this.id = id;
    this.dayOfWeek = dayOfWeek;
    this.startTime = startTime; // "HH:mm"
    this.endTime = endTime;     // "HH:mm"
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  covers(start, end) {
    const toMin = (d) => d.getHours() * 60 + d.getMinutes();
    const [sh, sm] = this.startTime.split(':').map(Number);
    const [eh, em] = this.endTime.split(':').map(Number);
    return (
      start.getDay() === this.dayOfWeek &&
      toMin(start) >= sh * 60 + sm &&
      toMin(end) <= eh * 60 + em
    );
  }

  overlapsWith(other) {
    return (
      this.dayOfWeek === other.dayOfWeek &&
      this.startTime < other.endTime &&
      other.startTime < this.endTime
    );
  }
}

module.exports = CaregiverAvailability;
