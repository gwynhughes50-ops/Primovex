import { defaultEquipment } from '@/modules/facilities/data/defaultFacilities';
import { defaultAssetPassports } from '@/modules/sense/data/defaultSense';

const KEY = 'primovex.equipmentRegistry.v1';
const FACILITIES_KEYS = ['primovex.facilities.v3', 'primovex.facilities.v2'];
const SENSE_KEY = 'primovex.sense.v1';
const clone = (value) => JSON.parse(JSON.stringify(value));

function nowIso() {
  return new Date().toISOString();
}

function normaliseEquipment(input = {}, fallback = {}) {
  const id = String(input.equipmentId || input.id || fallback.id || '').trim();
  const spaceId = input.spaceId || input.currentSpaceId || input.roomId || fallback.spaceId || fallback.currentSpaceId || fallback.roomId || null;
  const connected = input.connected || input.connection || {};
  const identity = input.identity || {};
  const compliance = input.compliance || {};
  const tracking = input.tracking || input.tracker || {};
  const assignment = input.assignment || input.custody || {};
  const assignedToName = assignment.assignedToName || input.assignedToName || input.assignedTo || '';
  const assignmentType = assignment.type || input.assignmentType || (assignedToName ? 'permanent' : 'unassigned');
  return {
    id,
    equipmentId: id,
    name: input.name || fallback.name || 'Unnamed equipment',
    category: input.category || fallback.category || 'General',
    equipmentType: input.equipmentType || input.type || fallback.equipmentType || 'equipment',
    make: input.make || '',
    model: input.model || input.makeModel || '',
    serialNumber: input.serialNumber || '',
    assetTag: input.assetTag || input.tag || '',
    status: input.status || fallback.status || 'in-service',
    homeSpaceId: input.homeSpaceId || fallback.homeSpaceId || spaceId,
    currentSpaceId: spaceId,
    roomId: spaceId,
    mobilityProfile: input.mobilityProfile || fallback.mobilityProfile || 'fixed',
    assignment: {
      type: ['unassigned', 'permanent', 'loan'].includes(assignmentType) ? assignmentType : 'unassigned',
      assignedToUid: assignment.assignedToUid || input.assignedToUid || '',
      assignedToName,
      assignedAt: assignment.assignedAt || input.assignedAt || null,
      loanDueDate: assignment.loanDueDate || input.loanDueDate || null,
      returnedAt: assignment.returnedAt || input.returnedAt || null,
      notes: assignment.notes || input.assignmentNotes || '',
    },
    identity: {
      barcode: identity.barcode || input.barcode || '',
      qrCode: identity.qrCode || input.qrCode || '',
      nfcTagId: identity.nfcTagId || input.nfcTagId || '',
    },
    tracking: {
      provider: tracking.provider || input.trackerProvider || 'none',
      trackerId: tracking.trackerId || input.trackerId || '',
      batteryPercent: tracking.batteryPercent ?? null,
      lastSeenAt: tracking.lastSeenAt || null,
    },
    connected: {
      provider: connected.provider || input.provider || 'none',
      deviceId: connected.deviceId || input.deviceId || '',
      enabled: Boolean(connected.enabled || connected.deviceId || input.deviceId),
      probe: connected.probe || input.probe || 'none',
    },
    monitoring: {
      enabled: Boolean(input.monitoring?.enabled || input.monitoringEnabled || connected.deviceId || input.deviceId),
      min: Number.isFinite(Number(input.monitoring?.min ?? input.min)) ? Number(input.monitoring?.min ?? input.min) : null,
      max: Number.isFinite(Number(input.monitoring?.max ?? input.max)) ? Number(input.monitoring?.max ?? input.max) : null,
      unit: input.monitoring?.unit || input.unit || '°C',
      fridgeId: input.monitoring?.fridgeId || input.fridgeId || '',
    },
    compliance: {
      patRequired: Boolean(compliance.patRequired ?? input.patRequired),
      patAssetId: compliance.patAssetId || input.patAssetId || '',
      patDue: compliance.patDue || input.patDue || null,
      serviceDue: compliance.serviceDue || input.serviceDue || null,
    },
    lastConfirmedAt: input.lastConfirmedAt || input.lastSeenAt || fallback.lastConfirmedAt || null,
    lastConfirmedBy: input.lastConfirmedBy || input.lastSeenBy || fallback.lastConfirmedBy || '',
    notes: input.notes || '',
    createdAt: input.createdAt || fallback.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso(),
    schemaVersion: 2,
  };
}

function collectLegacyEquipment() {
  const rows = [...clone(defaultEquipment), ...clone(defaultAssetPassports)];
  for (const key of FACILITIES_KEYS) {
    try {
      const data = JSON.parse(localStorage.getItem(key) || 'null');
      if (Array.isArray(data?.equipment)) rows.push(...data.equipment);
    } catch {
      // A corrupt legacy cache must not block the protected registry migration.
    }
  }
  try {
    const sense = JSON.parse(localStorage.getItem(SENSE_KEY) || 'null');
    if (Array.isArray(sense?.assets)) rows.push(...sense.assets);
  } catch {
    // Ignore invalid legacy Sense cache and retain safe defaults.
  }
  const byId = new Map();
  rows.forEach((row) => {
    const id = row?.equipmentId || row?.id;
    if (!id) return;
    byId.set(id, normaliseEquipment(row, byId.get(id)));
  });
  return [...byId.values()];
}

function initialRegistry() {
  return {
    schemaVersion: 2,
    revision: 1,
    migratedAt: nowIso(),
    updatedAt: nowIso(),
    equipment: collectLegacyEquipment(),
    movements: [],
  };
}

export function loadEquipmentRegistry() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const seeded = initialRegistry();
      localStorage.setItem(KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    return {
      ...initialRegistry(),
      ...parsed,
      equipment: Array.isArray(parsed.equipment) ? parsed.equipment.map((item) => normaliseEquipment(item)) : collectLegacyEquipment(),
    };
  } catch (error) {
    console.error('Unable to load Unified Equipment Registry', error);
    return initialRegistry();
  }
}

export function saveEquipmentRegistry(registry, source = 'equipment-registry') {
  const current = loadEquipmentRegistry();
  const payload = {
    ...current,
    ...registry,
    schemaVersion: 2,
    revision: Math.max(current.revision || 0, registry.revision || 0) + 1,
    updatedAt: nowIso(),
    updatedBySource: source,
    equipment: (registry.equipment || []).map((item) => normaliseEquipment(item)),
  };
  localStorage.setItem(KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent('primovex:equipment-registry-changed', { detail: { revision: payload.revision, source } }));
  return payload;
}

export function listEquipment() {
  return loadEquipmentRegistry().equipment;
}

export function upsertEquipment(input, source = 'equipment-wizard') {
  const registry = loadEquipmentRegistry();
  const id = String(input.equipmentId || input.id || '').trim();
  if (!id) throw new Error('equipmentId is required');
  const existing = registry.equipment.find((item) => item.id === id);
  const equipment = normaliseEquipment({ ...existing, ...input, id, equipmentId: id }, existing);
  return saveEquipmentRegistry({
    ...registry,
    equipment: existing
      ? registry.equipment.map((item) => item.id === id ? equipment : item)
      : [equipment, ...registry.equipment],
  }, source);
}

export function moveEquipmentInRegistry(equipmentId, spaceId, actor = 'Signed-in user') {
  const registry = loadEquipmentRegistry();
  const existing = registry.equipment.find((item) => item.id === equipmentId);
  if (!existing || existing.currentSpaceId === spaceId) return registry;
  const movedAt = nowIso();
  return saveEquipmentRegistry({
    ...registry,
    equipment: registry.equipment.map((item) => item.id === equipmentId
      ? normaliseEquipment({ ...item, currentSpaceId: spaceId, roomId: spaceId, lastConfirmedAt: movedAt, lastConfirmedBy: actor })
      : item),
    movements: [{
      id: crypto.randomUUID(),
      equipmentId,
      fromSpaceId: existing.currentSpaceId,
      toSpaceId: spaceId,
      movedAt,
      movedBy: actor,
    }, ...(registry.movements || [])],
  }, 'equipment-movement');
}

export function equipmentToFacilitiesItem(item) {
  return {
    ...item,
    id: item.equipmentId,
    roomId: item.currentSpaceId,
    lastSeenAt: item.lastConfirmedAt || item.tracking?.lastSeenAt,
    lastSeenBy: item.lastConfirmedBy,
    serviceDue: item.compliance?.serviceDue,
    patDue: item.compliance?.patDue,
  };
}

export function equipmentToSenseAsset(item) {
  return {
    ...item,
    id: item.equipmentId,
    homeSpaceId: item.homeSpaceId,
    currentSpaceId: item.currentSpaceId,
    tracker: item.tracking,
    serviceDue: item.compliance?.serviceDue,
    patDue: item.compliance?.patDue,
  };
}
