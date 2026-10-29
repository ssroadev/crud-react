class CaregiverService {
  constructor({ caregiver, service, hourlyRate, active = true }) {
    if (hourlyRate < 0) throw new Error('hourlyRate debe ser >= 0');
    this.caregiver = caregiver;
    this.service = service;
    this.hourlyRate = hourlyRate;
    this.active = active;
  }

  setRate(rate) {
    if (rate < 0) throw new Error('hourlyRate debe ser >= 0');
    this.hourlyRate = rate;
  }

  toggleActive() {
    this.active = !this.active;
  }

  calculateCost(hours) {
    return this.hourlyRate * hours;
  }
}

module.exports = CaregiverService;
