class Profile {
  constructor({
    id, firstName, middleName = null, lastName, secondLastName = null,
    phone = null, bio = null, avatarUrl = null,
    createdAt = new Date(), updatedAt = new Date(),
  }) {
    this.id = id;
    this.firstName = firstName;
    this.middleName = middleName;
    this.lastName = lastName;
    this.secondLastName = secondLastName;
    this.phone = phone;
    this.bio = bio;
    this.avatarUrl = avatarUrl;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  getFullName() {
    return [this.firstName, this.middleName, this.lastName, this.secondLastName]
      .filter(Boolean)
      .join(' ');
  }

  update(data) {
    Object.assign(this, data, { updatedAt: new Date() });
  }

  changeAvatar(url) {
    this.update({ avatarUrl: url });
  }
}

module.exports = Profile;
