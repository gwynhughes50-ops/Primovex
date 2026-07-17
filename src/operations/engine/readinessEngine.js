export function calculateReadiness(contributions) {
  const scored = contributions.filter((entry) => Number.isFinite(entry.readiness));
  if (!scored.length) return { overall: null, modules: [], explanation: 'No connected contributors supplied a readiness score.' };

  const weightedTotal = scored.reduce((sum, entry) => sum + entry.readiness * (entry.weight || 1), 0);
  const totalWeight = scored.reduce((sum, entry) => sum + (entry.weight || 1), 0);
  const overall = Math.round(weightedTotal / totalWeight);

  return {
    overall,
    modules: scored.map((entry) => ({ id: entry.id, label: entry.label, score: entry.readiness, status: entry.status })),
    explanation: `${scored.length} connected operational ${scored.length === 1 ? 'area contributes' : 'areas contribute'} to this transparent score.`,
  };
}
