export const placeholderContributors = [
  ['sars', 'SARs'], ['concerns', 'Concerns'], ['tasks', 'Tasks'], ['reports', 'Reports'], ['pulse', 'Practice Pulse'],
].map(([id, label]) => ({
  id, label, weight: 1,
  calculate() {
    return { connected: false, status: 'not-connected', readiness: null, summary: 'Contributor reserved; live operational tool not connected yet.', priorities: [], warnings: [], changedSinceYesterday: [], recommendedActions: [] };
  },
}));
