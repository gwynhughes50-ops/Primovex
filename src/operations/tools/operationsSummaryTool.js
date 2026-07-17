import { registerDefaultOperationsContributors } from '../engine/registerDefaultContributors';
import { runOperationsEngine } from '../engine/operationsEngine';

export function getOperationsSummary(context = {}) {
  registerDefaultOperationsContributors();
  return runOperationsEngine(context);
}
