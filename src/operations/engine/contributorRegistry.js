const contributors = new Map();

export function registerOperationsContributor(contributor) {
  if (!contributor?.id || typeof contributor.calculate !== 'function') {
    throw new Error('Operations contributors require an id and calculate function.');
  }
  contributors.set(contributor.id, contributor);
  return () => contributors.delete(contributor.id);
}

export function getOperationsContributors() {
  return [...contributors.values()];
}

export function clearOperationsContributors() {
  contributors.clear();
}
