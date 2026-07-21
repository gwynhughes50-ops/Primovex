const rank = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

export function normalisePriority(item, moduleId) {
  return {
    id: item.id || `${moduleId}-${crypto.randomUUID()}`,
    moduleId,
    title: item.title || 'Operational item',
    detail: item.detail || '',
    priority: rank[item.priority] === undefined ? 'medium' : item.priority,
    dueAt: item.dueAt || null,
    route: item.route || null,
    actionLabel: item.actionLabel || 'Review',
  };
}

export function buildPriorityQueue(contributions) {
  return contributions
    .flatMap((entry) => (entry.priorities || []).map((item) => normalisePriority(item, entry.id)))
    .sort((a, b) => {
      const priorityDifference = rank[b.priority] - rank[a.priority];
      if (priorityDifference) return priorityDifference;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt) - new Date(b.dueAt);
    });
}
