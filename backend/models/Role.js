class Role {
  constructor({ id, name, description = null, createdAt = new Date() }) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.createdAt = createdAt;
  }

  rename(name) {
    this.name = name;
  }
}

module.exports = Role;
