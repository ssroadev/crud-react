class User {
  constructor({ id, email, createdAt = new Date() }) {
    this.id = id;
    this.email = email;
    this.createdAt = createdAt;
    this.profile = null;     // 1 -> 1 Profile
    this.roles = [];         // * -> * Role
    this.pets = [];          // 1 -> * Pet
    this.caregiver = null;   // 1 -> 0..1 Caregiver
  }

  register(profile) {
    this.profile = profile;
  }

  assignRole(role) {
    if (!this.hasRole(role.name)) this.roles.push(role);
  }

  removeRole(role) {
    this.roles = this.roles.filter((r) => r.id !== role.id);
  }

  hasRole(name) {
    return this.roles.some((r) => r.name === name);
  }

  getPets() {
    return this.pets;
  }
}

module.exports = User;
