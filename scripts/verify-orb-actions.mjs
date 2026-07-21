const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
};
globalThis.CustomEvent = class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } };
globalThis.dispatchEvent = () => true;

const {
  createReconciliationProposal,
  parseGovernedProposal,
  confirmGovernedProposal,
  completeGovernedProposal,
  cancelGovernedProposal,
  listGovernedActionAudit,
} = await import('../src/orb/GovernedActionStore.js');

const emergency = createReconciliationProposal({
  collectionName: 'emergency_assets',
  entity: { id: 'resus-1', name: 'Resus trolley 1' },
  kind: 'emergency-drugs',
});
if (!emergency.route.includes('tab=emergency') || emergency.requiredCapability !== 'inventory.verify') throw new Error('Emergency proposal routing or capability failed.');

const search = emergency.route.slice(emergency.route.indexOf('?'));
const parsed = parseGovernedProposal(search, 'emergency_assets');
if (parsed.error || parsed.proposal?.status !== 'proposed') throw new Error(`Registered proposal was not accepted: ${parsed.error}`);

const confirmed = confirmGovernedProposal(parsed.proposal, { userId: 'verifier-1', role: 'Nurse' });
if (confirmed.status !== 'confirmed' || confirmed.confirmedBy.userId !== 'verifier-1') throw new Error('Proposal confirmation audit failed.');

let missingEvidenceRejected = false;
try { completeGovernedProposal(confirmed.id, null, { userId: 'verifier-1' }); } catch { missingEvidenceRejected = true; }
if (!missingEvidenceRejected) throw new Error('Proposal completed without saved checklist evidence.');

const completed = completeGovernedProposal(confirmed.id, 'check-123', { userId: 'verifier-1', role: 'Nurse' });
if (completed.status !== 'completed' || completed.checkId !== 'check-123') throw new Error('Completion audit failed.');
if (!parseGovernedProposal(search, 'emergency_assets').error?.includes('already been completed')) throw new Error('Completed proposal replay was not rejected.');

const anaphylaxis = createReconciliationProposal({ collectionName: 'anaphylaxis_boxes', entity: { id: 'box-1', name: 'Anaphylaxis box 1' }, kind: 'anaphylaxis' });
const anaphylaxisSearch = anaphylaxis.route.slice(anaphylaxis.route.indexOf('?'));
if (!anaphylaxis.route.includes('tab=anaphylaxis')) throw new Error('Anaphylaxis proposal routing failed.');
cancelGovernedProposal(parseGovernedProposal(anaphylaxisSearch, 'anaphylaxis_boxes').proposal, { userId: 'manager-1', role: 'Practice Manager' });
if (!parseGovernedProposal(anaphylaxisSearch, 'anaphylaxis_boxes').error?.includes('cancelled')) throw new Error('Cancelled proposal replay was not rejected.');

const expiring = createReconciliationProposal({ collectionName: 'emergency_assets', entity: { id: 'resus-2', name: 'Resus trolley 2' }, kind: 'emergency-drugs' });
const expiredAt = Date.parse(expiring.expiresAt) + 1;
if (!parseGovernedProposal(expiring.route.slice(expiring.route.indexOf('?')), 'emergency_assets', expiredAt).error?.includes('expired')) throw new Error('Expired proposal was not rejected.');

const fabricated = new URLSearchParams({
  orbAction: 'clinical-reconciliation', orbActionId: 'fabricated', orbKind: 'emergency-drugs', orbCollection: 'emergency_assets',
  orbEntityId: 'resus-1', orbEntityName: 'Resus trolley 1', orbCreatedAt: new Date().toISOString(), orbExpiresAt: new Date(Date.now() + 60000).toISOString(),
});
if (!parseGovernedProposal(`?${fabricated}`, 'emergency_assets').error?.includes('not registered')) throw new Error('Fabricated proposal was not rejected.');

if (listGovernedActionAudit().length < 3) throw new Error('Governed action audit entries were not retained.');
console.log('Orb governed-action verification passed: registration, confirmation, evidence-gated completion, expiry, cancellation and replay protection.');
