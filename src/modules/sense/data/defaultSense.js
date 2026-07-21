import { defaultEquipment, defaultRooms } from '@/modules/facilities/data/defaultFacilities';
import { DEFAULT_FLOORS, DEFAULT_SITES, DEFAULT_ZONES, getSpaceTemplate } from './spaceTemplates';

const now = new Date();
const minsAgo = (minutes) => new Date(now.getTime() - minutes * 60000).toISOString();

export const defaultSites = DEFAULT_SITES;
export const defaultFloors = DEFAULT_FLOORS;
export const defaultZones = DEFAULT_ZONES;

const inferTypeId = (room) => {
  const value = `${room.name} ${room.type}`.toLowerCase();
  if (value.includes('treatment')) return 'treatment-room';
  if (value.includes('minor')) return 'minor-ops-room';
  if (value.includes('waiting')) return 'waiting-area';
  if (value.includes('staff')) return 'staff-room';
  if (value.includes('vaccine')) return 'store-room';
  return 'consulting-room';
};

export const defaultSpaces = defaultRooms.map((room, index) => {
  const typeId = inferTypeId(room);
  const template = getSpaceTemplate(typeId);
  const floorId = room.floor === 'Ground' ? 'FLOOR-GROUND' : room.floor === 'First' ? 'FLOOR-FIRST' : 'FLOOR-SECOND';
  const zoneId = room.zone === 'Clinical' ? 'ZONE-CLINICAL' : room.zone === 'Front of House' ? 'ZONE-PUBLIC' : room.zone === 'Staff' ? 'ZONE-STAFF' : 'ZONE-ADMIN';
  return ({
  id: room.id,
  slug: room.slug,
  name: room.name,
  typeId,
  type: template.label,
  category: template.group,
  capabilities: template.capabilities,
  siteId: 'SITE-MAIN',
  floorId,
  linkedFloorIds: [],
  zoneId,
  parentSpaceId: null,
  site: room.site,
  floor: room.floor,
  zone: room.zone,
  status: room.status,
  senseNode: {
    provider: 'mock-ble',
    beaconId: `PVX-${String(index + 1).padStart(3, '0')}`,
    enabled: index < 3,
    batteryPercent: index < 3 ? 92 - index * 7 : null,
    lastSeenAt: index < 3 ? minsAgo(2 + index * 4) : null,
  },
  nfcTagId: room.nfcTagId || '',
  expectedAssetIds: defaultEquipment.filter((item) => item.roomId === room.id).map((item) => item.id),
  cleaningFrequencyHours: room.cleaningFrequencyHours || 24,
  notes: room.notes || '',
  archivedAt: null,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
});
});

const extraAssets = [
  { id: 'EQ-US-001', name: 'Portable Ultrasound Scanner', category: 'Diagnostic', roomId: 'RM-TR-001', status: 'in-service', mobilityProfile: 'shared', trackerProvider: 'mock-ble', trackerId: 'ASSET-US-001' },
  { id: 'EQ-DERM-001', name: 'Dermatoscope', category: 'Diagnostic', roomId: 'RM-TR-002', status: 'in-service', mobilityProfile: 'shared', trackerProvider: 'mock-ble', trackerId: 'ASSET-DERM-001' },
];

export const defaultAssetPassports = [...defaultEquipment, ...extraAssets].map((item, index) => ({
  id: item.id,
  name: item.name,
  category: item.category,
  status: item.status,
  mobilityProfile: item.mobilityProfile || (item.name.includes('ECG') || item.name.includes('Doppler') ? 'shared' : 'fixed'),
  homeSpaceId: item.roomId,
  currentSpaceId: item.roomId,
  lastConfirmedAt: item.lastSeenAt || minsAgo(25 + index * 5),
  lastConfirmedBy: item.lastSeenBy || 'Demo user',
  tracker: {
    provider: item.trackerProvider || 'none',
    trackerId: item.trackerId || '',
    batteryPercent: item.trackerProvider ? 88 - index * 3 : null,
    lastSeenAt: item.trackerProvider ? minsAgo(3 + index * 2) : null,
  },
  serviceDue: item.serviceDue || null,
  patDue: item.patDue || null,
  notes: item.notes || '',
}));

export const defaultSenseTimeline = [
  { id: 'SE-001', type: 'space-detected', spaceId: 'RM-TR-002', assetId: null, message: 'Treatment Room 2 detected by mock Sense provider', occurredAt: minsAgo(4), actor: 'Primovex Sense' },
  { id: 'SE-002', type: 'asset-confirmed', spaceId: 'RM-TR-002', assetId: 'EQ-ECG-001', message: 'ECG Machine confirmed in its home space', occurredAt: minsAgo(12), actor: 'Demo user' },
];
