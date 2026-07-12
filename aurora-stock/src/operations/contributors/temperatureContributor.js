export const temperatureContributor = {
  id: 'temperature',
  label: 'Cold chain',
  weight: 1.2,
  calculate(context) {
    if (context.temperature?.loading) return { status: 'loading', readiness: null, priorities: [], warnings: [], summary: 'Temperature loading.' };
    if (!context.temperature?.hasReading) return {
      status: 'attention', readiness: 70, summary: 'No temperature reading available.',
      priorities: [{ id: 'temperature-missing', title: 'Temperature check not available', detail: 'No latest cold-chain reading was found.', priority: 'high', route: '/temperature', actionLabel: 'Open temperatures' }],
      warnings: ['No latest temperature reading'], changedSinceYesterday: [], recommendedActions: ['Record fridge temperature'],
    };
    const within = context.temperature.within !== false;
    return {
      status: within ? 'healthy' : 'risk', readiness: within ? 100 : 20,
      summary: within ? 'Latest temperature is within range.' : 'Latest temperature is outside the configured range.',
      priorities: within ? [] : [{ id: 'temperature-range', title: 'Fridge temperature out of range', detail: context.temperature.detail || 'Review immediately.', priority: 'critical', route: '/temperature', actionLabel: 'Review reading' }],
      warnings: within ? [] : ['Cold-chain exception'], changedSinceYesterday: [], recommendedActions: within ? [] : ['Follow cold-chain escalation procedure'],
    };
  },
};
