class Service {
  constructor({ id, name, description = null, createdAt = new Date() }) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.createdAt = createdAt;
    this.offers = []; // 1 -> * CaregiverService
  }

  getCaregivers() {
    return this.offers.filter((o) => o.active).map((o) => o.caregiver);
  }
}

module.exports = Service;
