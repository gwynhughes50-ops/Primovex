import { routeApprovedTool } from '../src/ai/tools/intentRouter.js';
import { PermissionGateway } from '../src/orb/PermissionGateway.js';

const cases = [
  ['How many practice spaces are registered?', 'spaces.summary'],
  ['Are we compliant?', 'compliance.summary'],
  ['What operational tasks are open?', 'tasks.summary'],
  ['Are there any active alerts?', 'alerts.summary'],
  ['How is the anaphylaxis box?', 'anaphylaxis.readiness'],
  ['Reconcile the recess trolley', 'emergency.readiness'],
];

for (const [phrase, expected] of cases) {
  const actual = routeApprovedTool(phrase)?.toolId;
  if (actual !== expected) throw new Error(`${phrase}: expected ${expected}, received ${actual}`);
}

const gateway = new PermissionGateway();
const filtered = gateway.filterResponse({
  data: { title: 'Repair light', createdBy: 'Named User', history: [{ by: 'Named User' }] },
  sources: [], withheld: [],
}, { capabilities: ['operations.read'] });
if ('createdBy' in filtered.data || 'history' in filtered.data || filtered.withheld.length < 2) throw new Error('Named operational detail was not withheld.');

console.log(`Orb Data Fabric verification passed (${cases.length} intents + disclosure filter).`);
