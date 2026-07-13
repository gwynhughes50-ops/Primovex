export const inventoryContributor = {
  id: 'inventory',
  label: 'Inventory',
  weight: 1,
  calculate(context) {
    const total = Number(context.inventory?.totalItems || 0);
    const low = Number(context.inventory?.lowStockItems || 0);
    const expiring = Number(context.inventory?.expiringSoon || 0);
    const loading = Boolean(context.inventory?.loading);
    if (loading) return { status: 'loading', readiness: null, priorities: [], warnings: [], summary: 'Inventory loading.' };
    const denominator = Math.max(total, 1);
    const readiness = Math.max(0, Math.round(100 - (low / denominator) * 70 - Math.min(expiring * 4, 20)));
    return {
      status: readiness >= 90 ? 'healthy' : readiness >= 70 ? 'attention' : 'risk',
      readiness,
      summary: `${low} low-stock and ${expiring} expiring-soon item${low + expiring === 1 ? '' : 's'}.`,
      priorities: [
        ...(low ? [{ id: 'inventory-low', title: `${low} stock item${low === 1 ? '' : 's'} need attention`, detail: 'At or below minimum stock level.', priority: low > 5 ? 'high' : 'medium', route: '/inventory', actionLabel: 'Review stock' }] : []),
        ...(expiring ? [{ id: 'inventory-expiring', title: `${expiring} item${expiring === 1 ? '' : 's'} expiring soon`, detail: 'Expiry within the configured review window.', priority: 'medium', route: '/inventory', actionLabel: 'Review expiry' }] : []),
      ],
      warnings: [],
      changedSinceYesterday: [],
      recommendedActions: low ? ['Review low-stock items'] : [],
    };
  },
};
