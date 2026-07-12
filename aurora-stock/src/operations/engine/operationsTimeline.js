import { getFacilitiesSnapshot } from '@/modules/facilities/services/facilitiesStore';

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function event({ id, at, module, type, title, detail, route, priority = 'routine', actor }) {
  const date = toDate(at);
  if (!date) return null;
  return { id, at: date.toISOString(), module, type, title, detail, route, priority, actor };
}

export function buildOperationsTimeline(context = {}) {
  const facilities = getFacilitiesSnapshot();
  const rows = [];

  facilities.cleaningLogs.forEach((log) => rows.push(event({
    id: `cleaning-${log.id}`,
    at: log.cleanedAt,
    module: 'Facilities',
    type: 'cleaning',
    title: `${log.roomName} cleaned`,
    detail: log.cleanedBy ? `Completed by ${log.cleanedBy}` : 'Cleaning completed',
    actor: log.cleanedBy,
    route: '/facilities',
  })));

  facilities.maintenance.forEach((item) => {
    rows.push(event({
      id: `maintenance-open-${item.id}`,
      at: item.reportedAt,
      module: 'Facilities',
      type: 'maintenance',
      title: item.title,
      detail: `Issue reported${item.assignedTo ? ` · assigned to ${item.assignedTo}` : ''}`,
      actor: item.reportedBy,
      priority: item.priority === 'high' ? 'high' : 'routine',
      route: '/facilities',
    }));
    if (item.closedAt) rows.push(event({
      id: `maintenance-close-${item.id}`,
      at: item.closedAt,
      module: 'Facilities',
      type: 'maintenance',
      title: `${item.title} completed`,
      detail: item.closedBy ? `Completed by ${item.closedBy}` : 'Maintenance completed',
      actor: item.closedBy,
      route: '/facilities',
    }));
  });

  facilities.equipmentMovements.forEach((move) => {
    const equipment = facilities.equipment.find((item) => item.id === move.equipmentId);
    const room = facilities.rooms.find((item) => item.id === move.toRoomId);
    rows.push(event({
      id: `equipment-${move.id}`,
      at: move.movedAt,
      module: 'Facilities',
      type: 'equipment',
      title: `${equipment?.name || 'Equipment'} moved`,
      detail: `Now recorded in ${room?.name || 'another room'}`,
      actor: move.movedBy,
      route: '/facilities',
    }));
  });

  (context.recentMoves || []).forEach((move) => {
    const delta = Number(move.delta || 0);
    const kind = String(move.type || 'movement').toLowerCase();
    rows.push(event({
      id: `stock-${move.id}`,
      at: move.created_at || move.createdAt,
      module: 'Inventory',
      type: 'stock',
      title: `${move.item_name || move.itemName || 'Stock item'} ${kind}`,
      detail: Number.isFinite(delta) && delta !== 0 ? `${delta > 0 ? '+' : ''}${delta} units` : 'Inventory updated',
      route: '/inventory',
    }));
  });

  if (context.temperature?.readingAt) rows.push(event({
    id: `temperature-${context.temperature.readingAt}`,
    at: context.temperature.readingAt,
    module: 'Cold chain',
    type: 'temperature',
    title: context.temperature.within === false ? 'Temperature exception recorded' : 'Fridge temperature recorded',
    detail: context.temperature.detail || 'Latest cold-chain reading',
    priority: context.temperature.within === false ? 'critical' : 'routine',
    route: '/temperature',
  }));

  return rows.filter(Boolean).sort((a, b) => new Date(b.at) - new Date(a.at));
}

export function changesSince(timeline, since) {
  const boundary = toDate(since)?.getTime() || 0;
  return timeline.filter((item) => new Date(item.at).getTime() >= boundary);
}
