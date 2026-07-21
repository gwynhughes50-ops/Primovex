export class SenseProvider {
  constructor(id, label) {
    this.id = id;
    this.label = label;
  }

  async scan() {
    throw new Error('SenseProvider.scan must be implemented');
  }
}
