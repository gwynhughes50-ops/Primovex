import { getOperationsContributors } from './contributorRegistry';
import { calculateReadiness } from './readinessEngine';
import { buildPriorityQueue } from './priorityEngine';
import { contributionsToOperationalFacts } from './contributionFactAdapter';
import { runOperationalIntelligence } from './operationalIntelligenceEngine';

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

  const generatedAt = new Date().toISOString();
  const readiness = calculateReadiness(contributions);
  const priorities = buildPriorityQueue(contributions);
  const connected = contributions.filter((entry) => entry.connected && Number.isFinite(entry.readiness)).length;
  const intelligence = runOperationalIntelligence(contributionsToOperationalFacts(contributions, generatedAt), context, { now: generatedAt });

  return {
    generatedAt,
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
    intelligence,
  };
}
