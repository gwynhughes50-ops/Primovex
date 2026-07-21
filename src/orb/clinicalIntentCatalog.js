import { hasCapability } from '@/core/identity/capabilities';

export const ORB_INTENT_THRESHOLD = 0.78;
export const ORB_CLARIFY_THRESHOLD = 0.52;

export const CLINICAL_INTENTS = Object.freeze([
  { id: 'emergency.readiness', label: 'Check emergency drugs', description: 'Read emergency drugs, equipment and resus kit readiness.', requiredCapability: 'inventory.read', phrases: ['emergency drugs', 'emergency medicines', 'emergency kit', 'emergency box', 'crash trolley', 'crash cart', 'resus trolley', 'resuscitation trolley', 'resus box', 'recess trolley', 'reconcile resus trolley', 'check emergency drugs', 'tell me about emergency drugs'] },
  { id: 'anaphylaxis.readiness', label: 'Check anaphylaxis boxes', description: 'Read anaphylaxis box readiness and latest checks.', requiredCapability: 'inventory.read', phrases: ['anaphylaxis box', 'anaphylaxis boxes', 'anaphylaxis kit', 'anaphylaxis kits', 'check anaphylaxis box', 'how is the anaphylaxis box'] },
  { id: 'inventory.lowStock', label: 'Check low stock', description: 'Read items at or below minimum stock.', requiredCapability: 'inventory.read', phrases: ['low stock', 'running low', 'out of stock', 'needs ordering'] },
  { id: 'inventory.expiring', label: 'Check expiry dates', description: 'Read stock approaching expiry.', requiredCapability: 'inventory.read', phrases: ['expiry dates', 'expiring stock', 'out of date', 'short dated'] },
  { id: 'coldChain.latestStatus', label: 'Check all fridges', description: 'Read current cold-chain status.', requiredCapability: 'temperature.read', phrases: ['all fridges', 'cold chain', 'fridges ok', 'fridge status'] },
  { id: 'facilities.cleaningStatus', label: 'Check cleaning', description: 'Read rooms with outstanding cleaning.', requiredCapability: 'operations.read', phrases: ['cleaning status', 'rooms need cleaning', 'cleaning outstanding'] },
  { id: 'facilities.maintenanceOpen', label: 'Check maintenance', description: 'Read open maintenance work.', requiredCapability: 'operations.read', phrases: ['maintenance', 'repairs', 'broken equipment', 'open jobs'] },
  { id: 'operations.summary', label: 'Check practice readiness', description: 'Read the current operational summary.', requiredCapability: 'operations.read', phrases: ['practice ready', 'what needs attention', 'anything urgent', 'is everything ok'] },
  { id: 'spaces.summary', label: 'Check practice Spaces', description: 'Read the Unified Space Registry and statuses.', requiredCapability: 'operations.read', phrases: ['practice spaces', 'space registry', 'how many rooms', 'how many spaces', 'room status', 'tell me about spaces'] },
  { id: 'compliance.summary', label: 'Check compliance', description: 'Read connected compliance evidence and exceptions.', requiredCapability: 'compliance.read', phrases: ['compliance status', 'is compliance ok', 'are we compliant', 'compliance outstanding', 'compliance checks', 'what compliance is due'] },
  { id: 'tasks.summary', label: 'Check operational tasks', description: 'Read open operational tasks and escalations.', requiredCapability: 'operations.read', phrases: ['my tasks', 'open tasks', 'tasks outstanding', 'what tasks are due', 'what jobs are open', 'operational tasks'] },
  { id: 'alerts.summary', label: 'Check active alerts', description: 'Read active operational exceptions and alerts.', requiredCapability: 'operations.read', phrases: ['active alerts', 'what alerts are there', 'show alerts', 'any alerts', 'operational alerts', 'anything needs attention'] },
]);

export function getClinicalIntent(id) { return CLINICAL_INTENTS.find((intent) => intent.id === id) || null; }

export function approvedIntentChoices(capabilities = [], ids = []) {
  const preferred = ids.map(getClinicalIntent).filter(Boolean);
  const source = [...preferred, ...CLINICAL_INTENTS.filter((item) => !ids.includes(item.id))];
  return source.filter((item) => hasCapability(capabilities, item.requiredCapability)).slice(0, 6).map(({ id, label, description }) => ({ id, label, description }));
}
