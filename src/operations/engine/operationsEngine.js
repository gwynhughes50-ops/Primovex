import { getOperationsContributors } from './contributorRegistry';
import { calculateReadiness } from './readinessEngine';
import { buildPriorityQueue } from './priorityEngine';

export function runOperationsEngine(context = {}) {
  const contributions = getOperationsContributors().map((contributor) => {
    try {
      return {
        id: contributor.id,
        label: contributor.label || contributor.id,
        weight: contributor.weight || 1,
        connected: true,
        ...contributor.calculate(context),
      };
    } catch (error) {
      console.error(`Operations contributor failed: ${contributor.id}`, error);
      return {
        id: contributor.id,
        label: contributor.label || contributor.id,
        connected: false,
        status: 'unavailable',
        readiness: null,
        priorities: [],
        warnings: ['Contributor unavailable'],
      };
    }
  });

  const readiness = calculateReadiness(contributions);
  const priorities = buildPriorityQueue(contributions);
  const connected = contributions.filter((entry) => entry.connected && Number.isFinite(entry.readiness)).length;

  return {
    generatedAt: new Date().toISOString(),
    readiness,
    priorities,
    contributions,
    headline: priorities.some((item) => item.priority === 'critical')
      ? 'Critical action required'
      : priorities.length
        ? 'Stable, with work due'
        : connected
          ? 'Operating normally'
          : 'Awaiting connected data',
    connectedModules: connected,
  };
}
