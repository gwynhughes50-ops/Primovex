import { routeApprovedTool } from '../src/ai/tools/intentRouter.js';
import { PermissionGateway } from '../src/orb/PermissionGateway.js';
import { TrustPolicy } from '../src/orb/TrustPolicy.js';

const intentCases = [
  ['Tell me about the emergency drugs', 'emergency.readiness'],
  ['How is the anaphylaxis box', 'anaphylaxis.readiness'],
  ['Reconcile the resus trolley', 'emergency.readiness'],
  ['Reconcile the recess trolley', 'emergency.readiness'],
  ['How many practice spaces are registered', 'spaces.summary'],
  ['Are we compliant', 'compliance.summary'],
  ['What operational tasks are open', 'tasks.summary'],
  ['Are there any active alerts', 'alerts.summary'],
];

for (const [phrase, expected] of intentCases) {
  const routedIntent = routeApprovedTool(phrase);
  const actual = routedIntent?.toolId;
  if (/reconcile/i.test(phrase) && routedIntent?.input?.mode !== 'reconcile') throw new Error(`Governed workflow mode failed for ${phrase}.`);
  if (actual !== expected) throw new Error(`Intent failure: “${phrase}” expected ${expected}, received ${actual}`);
}

const trust = new TrustPolicy();
const now = Date.parse('2026-07-19T12:00:00Z');
const unknown = trust.apply({ answer: 'No alerts are currently visible.', confidence: 0.98, knownState: 'unknown', sources: [], domain: 'alerts' }, { now });
if (unknown.confidence > 0.49 || !unknown.answer.includes('cannot confirm an all-clear')) throw new Error('Unknown evidence was not safely constrained.');

const partial = trust.apply({ answer: 'Two checks were found.', confidence: 0.96, knownState: 'partial', sources: [{ title: 'Checks' }], domain: 'compliance' }, { now });
if (partial.confidence > 0.74 || !partial.answer.includes('partial operational view')) throw new Error('Partial evidence was not safely constrained.');

const stale = trust.apply({ answer: 'Fridge 2 is in range.', confidence: 0.97, knownState: 'known', sources: [{ title: 'Temperature' }], domain: 'temperature', observedAt: '2026-07-19T10:00:00Z' }, { now });
if (stale.confidence > 0.79 || stale.freshness.state !== 'stale' || !stale.answer.includes('Evidence: Stale')) throw new Error('Stale evidence was not surfaced.');

const gateway = new PermissionGateway();
const filtered = gateway.filterResponse({ data: { title: 'Repair', createdBy: 'Named User', assignedTo: 'Named User', history: [{ by: 'Named User' }] }, sources: [], withheld: [] }, { capabilities: ['operations.read'] });
if ('createdBy' in filtered.data || 'assignedTo' in filtered.data || 'history' in filtered.data || filtered.withheld.length !== 3) throw new Error('Named operational fields were not withheld.');
if (gateway.canAccess('compliance.read', { capabilities: ['operations.read'] })) throw new Error('Capability isolation failed.');
if (!gateway.canAccess('compliance.read', { capabilities: ['compliance.read'] })) throw new Error('Valid capability was denied.');

console.log(`Orb trust verification passed: ${intentCases.length} intents, evidence constraints, freshness and permission disclosure.`);
