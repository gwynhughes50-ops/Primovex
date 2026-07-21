export class KnowledgeRegistry {
  constructor() {
    this.domains = new Map();
  }

  register(domain) {
    if (!domain?.id) throw new Error('Orb knowledge domain requires an id.');
    this.domains.set(domain.id, Object.freeze({ status: 'connected', disclosureLevel: 'operational', ...domain }));
    return domain;
  }

  get(id) { return this.domains.get(id) || null; }
  list() { return Array.from(this.domains.values()); }

  modulesForIntent(intent = '') {
    return this.list().filter((domain) => domain.intents?.some((prefix) => intent.startsWith(prefix))).map((domain) => domain.id);
  }
}

export function createDefaultKnowledgeRegistry() {
  const registry = new KnowledgeRegistry();
  registry.register({ id: 'operations', label: 'Operations', intents: ['operations.'] });
  registry.register({ id: 'inventory', label: 'Inventory', intents: ['inventory.'] });
  registry.register({ id: 'temperature', label: 'Temperature and cold chain', intents: ['coldChain.', 'temperature.'] });
  registry.register({ id: 'facilities', label: 'Facilities', intents: ['facilities.'] });
  registry.register({ id: 'spaces', label: 'Spaces', intents: ['spaces.'] });
  registry.register({ id: 'compliance', label: 'Compliance', intents: ['compliance.'] });
  registry.register({ id: 'maintenance', label: 'Maintenance', intents: ['maintenance.'] });
  registry.register({ id: 'cleaning', label: 'Cleaning', intents: ['cleaning.'] });
  registry.register({ id: 'tasks', label: 'Tasks and escalations', intents: ['tasks.'] });
  registry.register({ id: 'alerts', label: 'Alerts', intents: ['alerts.'] });
  return registry;
}
