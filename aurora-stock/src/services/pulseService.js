export const PULSE_MODULES = [
  { key: 'inventory', label: 'Inventory', weight: 20 },
  { key: 'purchasing', label: 'Purchasing', weight: 20 },
  { key: 'compliance', label: 'Compliance', weight: 25 },
  { key: 'assets', label: 'Assets', weight: 10 },
  { key: 'estates', label: 'Estates', weight: 10 },
  { key: 'workforce', label: 'Workforce', weight: 10 },
  { key: 'governance', label: 'Governance', weight: 5 },
];

export function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function getPulseBand(score) {
  const s = clampScore(score);

  if (s >= 95) {
    return {
      tone: 'green',
      label: 'Excellent',
      message: 'Everything operating normally.',
      ringClass: 'text-emerald-400',
      dotClass: 'bg-emerald-400',
      borderClass: 'border-emerald-400/40',
      glowClass: 'shadow-emerald-500/30',
    };
  }

  if (s >= 85) {
    return {
      tone: 'amber',
      label: 'Good',
      message: 'A few items need attention.',
      ringClass: 'text-amber-400',
      dotClass: 'bg-amber-400',
      borderClass: 'border-amber-400/40',
      glowClass: 'shadow-amber-500/30',
    };
  }

  if (s >= 75) {
    return {
      tone: 'orange',
      label: 'Needs Attention',
      message: 'Action recommended today.',
      ringClass: 'text-orange-400',
      dotClass: 'bg-orange-400',
      borderClass: 'border-orange-400/40',
      glowClass: 'shadow-orange-500/30',
    };
  }

  return {
    tone: 'red',
    label: 'Action Required',
    message: 'Immediate attention required.',
    ringClass: 'text-rose-500',
    dotClass: 'bg-rose-500',
    borderClass: 'border-rose-500/40',
    glowClass: 'shadow-rose-500/30',
  };
}

function activeItems(items) {
  return (items || []).filter((item) => {
    const archived = item?.archived_at;
    return archived === null || archived === undefined || archived === '';
  });
}

export function calculateInventoryPulse(items = []) {
  const rows = activeItems(items);
  const lowStock = rows.filter((item) => Number(item.current_stock || 0) <= Number(item.min_stock || 0));
  const emptyStock = rows.filter((item) => Number(item.current_stock || 0) <= 0 && Number(item.min_stock || 0) > 0);

  const score = clampScore(100 - lowStock.length * 2 - emptyStock.length * 6);

  return {
    key: 'inventory',
    label: 'Inventory',
    score,
    issues: [
      ...emptyStock.slice(0, 3).map((item) => `${item.name || 'Stock item'} is out of stock`),
      ...lowStock.slice(0, 3).map((item) => `${item.name || 'Stock item'} is at or below minimum stock`),
    ],
    meta: {
      lowStock: lowStock.length,
      emptyStock: emptyStock.length,
      activeItems: rows.length,
    },
  };
}

export function calculatePurchasingPulse({ reorderRequests = [], purchaseOrders = [] } = {}) {
  const approved = reorderRequests.filter((request) => (request.status || 'pending') === 'approved');
  const pending = reorderRequests.filter((request) => (request.status || 'pending') === 'pending');
  const awaitingDelivery = purchaseOrders.filter((order) => ['sent', 'awaiting_delivery', 'part_delivered'].includes(order.status || 'draft'));
  const draftOrders = purchaseOrders.filter((order) => ['draft', 'ready'].includes(order.status || 'draft'));

  const score = clampScore(
    100 - pending.length * 1 - approved.length * 2 - awaitingDelivery.length * 2 - draftOrders.length * 1
  );

  return {
    key: 'purchasing',
    label: 'Purchasing',
    score,
    issues: [
      ...(approved.length ? [`${approved.length} approved reorder request${approved.length === 1 ? '' : 's'} waiting for purchasing`] : []),
      ...(awaitingDelivery.length ? [`${awaitingDelivery.length} order${awaitingDelivery.length === 1 ? '' : 's'} awaiting delivery`] : []),
      ...(pending.length ? [`${pending.length} reorder request${pending.length === 1 ? '' : 's'} awaiting review`] : []),
    ],
    meta: {
      approved: approved.length,
      pending: pending.length,
      awaitingDelivery: awaitingDelivery.length,
      draftOrders: draftOrders.length,
    },
  };
}

export function calculateCompliancePulse({ temperatureIncidents = [] } = {}) {
  const openIncidents = temperatureIncidents.filter((incident) => {
    const status = String(incident.status || incident.state || '').toLowerCase();
    const resolved = incident.resolved === true || incident.resolved_at || status === 'resolved' || status === 'closed';
    return !resolved;
  });

  const score = clampScore(100 - openIncidents.length * 8);

  return {
    key: 'compliance',
    label: 'Compliance',
    score,
    issues: [
      ...(openIncidents.length ? [`${openIncidents.length} open temperature incident${openIncidents.length === 1 ? '' : 's'}`] : []),
    ],
    meta: {
      openTemperatureIncidents: openIncidents.length,
    },
  };
}

export function placeholderModule(key, label, score = 100) {
  return {
    key,
    label,
    score: clampScore(score),
    issues: [],
    meta: {},
  };
}

export function calculateOverallPulse(modules = []) {
  const scoreMap = modules.reduce((acc, module) => {
    acc[module.key] = module;
    return acc;
  }, {});

  const weightedTotal = PULSE_MODULES.reduce((sum, module) => {
    const row = scoreMap[module.key] || placeholderModule(module.key, module.label, 100);
    return sum + clampScore(row.score) * module.weight;
  }, 0);

  const totalWeight = PULSE_MODULES.reduce((sum, module) => sum + module.weight, 0) || 1;
  const overall = clampScore(weightedTotal / totalWeight);

  const moduleRows = PULSE_MODULES.map((module) => ({
    ...module,
    ...(scoreMap[module.key] || placeholderModule(module.key, module.label, 100)),
  }));

  const issues = moduleRows.flatMap((module) =>
    (module.issues || []).map((issue) => ({
      moduleKey: module.key,
      moduleLabel: module.label,
      text: issue,
      score: module.score,
    }))
  );

  return {
    score: overall,
    band: getPulseBand(overall),
    modules: moduleRows,
    issues,
    updatedAt: new Date(),
  };
}
