const now = new Date();
const hoursAgo = (hours) => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
const daysFromNow = (days) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const defaultRooms = [
  { id: 'RM-TR-001', slug: 'treatment-room-1', name: 'Treatment Room 1', type: 'Treatment', site: 'Main Surgery', floor: 'Ground', zone: 'Clinical', status: 'ready', nfcTagId: '', qrCode: '', cleaningFrequencyHours: 12, lastCleanedAt: hoursAgo(2), lastCleanedBy: 'Demo cleaner', notes: '' },
  { id: 'RM-TR-002', slug: 'treatment-room-2', name: 'Treatment Room 2', type: 'Treatment', site: 'Main Surgery', floor: 'Ground', zone: 'Clinical', status: 'ready', nfcTagId: '', qrCode: '', cleaningFrequencyHours: 12, lastCleanedAt: hoursAgo(3), lastCleanedBy: 'Demo cleaner', notes: '' },
  { id: 'RM-MO-001', slug: 'minor-operations', name: 'Minor Operations', type: 'Clinical', site: 'Main Surgery', floor: 'Ground', zone: 'Clinical', status: 'attention', nfcTagId: '', qrCode: '', cleaningFrequencyHours: 12, lastCleanedAt: hoursAgo(15), lastCleanedBy: 'Demo cleaner', notes: 'Enhanced clean required after procedures.' },
  { id: 'RM-VR-001', slug: 'vaccine-room', name: 'Vaccine Room', type: 'Clinical', site: 'Main Surgery', floor: 'Ground', zone: 'Clinical', status: 'ready', nfcTagId: '', qrCode: '', cleaningFrequencyHours: 12, lastCleanedAt: hoursAgo(4), lastCleanedBy: 'Demo cleaner', notes: '' },
  { id: 'RM-WR-001', slug: 'waiting-room', name: 'Waiting Room', type: 'Public', site: 'Main Surgery', floor: 'Ground', zone: 'Front of House', status: 'ready', nfcTagId: '', qrCode: '', cleaningFrequencyHours: 12, lastCleanedAt: hoursAgo(1), lastCleanedBy: 'Demo cleaner', notes: '' },
  { id: 'RM-SR-001', slug: 'staff-room', name: 'Staff Room', type: 'Staff', site: 'Main Surgery', floor: 'First', zone: 'Staff', status: 'ready', nfcTagId: '', qrCode: '', cleaningFrequencyHours: 24, lastCleanedAt: hoursAgo(5), lastCleanedBy: 'Demo cleaner', notes: '' },
];

export const defaultEquipment = [
  { id: 'EQ-ECG-001', name: 'ECG Machine', category: 'Diagnostic', roomId: 'RM-TR-002', status: 'in-service', lastSeenAt: hoursAgo(1), lastSeenBy: 'Demo user', serviceDue: daysFromNow(80), patDue: daysFromNow(120), notes: '' },
  { id: 'EQ-NEB-001', name: 'Nebuliser', category: 'Clinical', roomId: 'RM-TR-001', status: 'in-service', lastSeenAt: hoursAgo(8), lastSeenBy: 'Demo user', serviceDue: daysFromNow(45), patDue: daysFromNow(90), notes: '' },
  { id: 'EQ-DOP-001', name: 'Doppler', category: 'Diagnostic', roomId: 'RM-MO-001', status: 'in-service', lastSeenAt: hoursAgo(20), lastSeenBy: 'Demo user', serviceDue: daysFromNow(28), patDue: daysFromNow(75), notes: '' },
];

export const defaultMaintenance = [
  { id: 'MT-001', roomId: 'RM-MO-001', title: 'Check flickering ceiling light', priority: 'medium', status: 'open', assignedTo: 'Caretaker', reportedAt: hoursAgo(5), reportedBy: 'Demo user' },
];

export const defaultCleaningLogs = defaultRooms
  .filter((room) => room.lastCleanedAt)
  .map((room, index) => ({ id: `CL-${String(index + 1).padStart(3, '0')}`, roomId: room.id, roomName: room.name, cleanedAt: room.lastCleanedAt, cleanedBy: room.lastCleanedBy, method: 'demo-seed' }));
