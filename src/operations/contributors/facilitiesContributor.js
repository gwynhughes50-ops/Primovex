import { getFacilitiesSnapshot } from '@/modules/facilities/services/facilitiesStore';

function nextCleanAt(room) {
  if (!room.lastCleanedAt) return null;
  return new Date(new Date(room.lastCleanedAt).getTime() + (room.cleaningFrequencyHours || 24) * 3600000);
}

export const facilitiesContributor = {
  id: 'facilities',
  label: 'Facilities',
  weight: 1.1,
  calculate() {
    const state = getFacilitiesSnapshot();
    const now = Date.now();
    const openIssues = state.maintenance.filter((item) => item.status !== 'closed');
    const overdueRooms = state.rooms.filter((room) => {
      const next = nextCleanAt(room);
      return !next || next.getTime() < now;
    });
    const readyRooms = state.rooms.length - overdueRooms.length;
    const cleaningScore = state.rooms.length ? (readyRooms / state.rooms.length) * 100 : 100;
    const maintenancePenalty = Math.min(30, openIssues.reduce((sum, item) => sum + ({ high: 12, medium: 7, low: 3 }[item.priority] || 5), 0));
    const readiness = Math.max(0, Math.round(cleaningScore - maintenancePenalty));

    return {
      status: readiness >= 90 ? 'healthy' : readiness >= 70 ? 'attention' : 'risk',
      readiness,
      summary: `${readyRooms} of ${state.rooms.length} rooms ready; ${openIssues.length} open maintenance ${openIssues.length === 1 ? 'issue' : 'issues'}.`,
      priorities: [
        ...overdueRooms.map((room) => ({ id: `clean-${room.id}`, title: `${room.name} cleaning overdue`, detail: 'Room has passed its next-clean time.', priority: 'high', route: '/facilities', actionLabel: 'Open room' })),
        ...openIssues.map((item) => ({ id: `maintenance-${item.id}`, title: item.title, detail: `Maintenance issue in ${state.rooms.find((room) => room.id === item.roomId)?.name || 'room'}.`, priority: item.priority === 'high' ? 'high' : 'medium', route: '/facilities', actionLabel: 'Review issue' })),
      ],
      warnings: overdueRooms.length ? [`${overdueRooms.length} room${overdueRooms.length === 1 ? '' : 's'} overdue for cleaning`] : [],
      changedSinceYesterday: [],
      recommendedActions: overdueRooms.length ? ['Complete overdue room cleaning'] : openIssues.length ? ['Review open maintenance issues'] : [],
    };
  },
};
