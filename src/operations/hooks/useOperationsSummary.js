import { useMemo } from 'react';
import { registerDefaultOperationsContributors } from '../engine/registerDefaultContributors';
import { runOperationsEngine } from '../engine/operationsEngine';

registerDefaultOperationsContributors();

export default function useOperationsSummary(context) {
  return useMemo(() => runOperationsEngine(context), [context]);
}
