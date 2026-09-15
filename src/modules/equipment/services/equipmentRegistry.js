import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { defaultEquipment } from '@/modules/facilities/data/defaultFacilities';
import { defaultAssetPassports } from '@/modules/sense/data/defaultSense';

const KEY = 'primovex.equipmentRegistry.v1';
const FACILITIES_KEYS = ['primovex.facilities.v3', 'primovex.facilities.v2'];
const SENSE_KEY = 'primovex.sense.v1';
const REMOTE_COLLECTION = 'equipment_registry';
const REMOTE_DOCUMENT = 'primary';
const clone = (value) => JSON.parse(JSON.stringify(value));

// Real, cross-device equipment registry. This was localStorage-only (per
// browser/device), so equipment added or linked to a Tuya sensor on one
// device — the desktop, say — was invisible everywhere else, including the
// phone that's meant to scan its NFC tag. Mirrors sharedSpaceRegistry.js's
// pattern exactly: reads/writes stay synchronous against a local cache (this
// function has dozens of call sites that can't all become async), and a
// debounced background push keeps Firestore in sync. subscribeToSharedEquipmentRegistry
// (called once, from EquipmentRegistrySync.jsx) pulls remote changes back in.
let remoteWriteTimer = null;
let applyingRemote = false;

function isAndroidClient() {
  return document.documentElement.dataset.primovexClient === 'android'
    || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function audit(detail) {
  try { window.dispatchEvent(new CustomEvent('primovex:governed-audit', { detail })); } catch { /* local registry remains available offline */ }
}

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
    // Cheap BLE beacon tags (e.g. the DX-CP35) can't be reconfigured to
    // broadcast a Primovex URL directly — Eddystone-URL's ~17-byte payload
    // limit after compression can't fit our URLs. Instead we bind the tag's
    // existing iBeacon identity (UUID is shared per batch, Major/Minor are
    // per-tag) straight to the equipment record; see MobileFridgeSheet.jsx's
    // "Link this BLE tag" flow.
    bleTag: input.bleTag === null
      ? null
      : input.bleTag?.uuid
        ? { uuid: String(input.bleTag.uuid).toLowerCase(), major: Number(input.bleTag.major), minor: Number(input.bleTag.minor) }
        : (fallback.bleTag || null),
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

function remotePayload(registry) {
  return { ...registry, updatedByUid: auth.currentUser?.uid || null, sourceClient: isAndroidClient() ? 'android' : 'desktop' };
}

async function pushRegistryToFirestore(registry) {
  if (!auth.currentUser || applyingRemote) return;
  await setDoc(doc(db, REMOTE_COLLECTION, REMOTE_DOCUMENT), remotePayload(registry));
}

function queueRemoteWrite(registry) {
  if (!auth.currentUser || applyingRemote) return;
  window.clearTimeout(remoteWriteTimer);
  remoteWriteTimer = window.setTimeout(() => pushRegistryToFirestore(registry).catch((error) => {
    console.error('Unable to sync Equipment Registry to Firestore', error);
  }), 350);
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
  if (source !== 'remote-sync') queueRemoteWrite(payload);
  return payload;
}

export function subscribeToSharedEquipmentRegistry(onStatus) {
  if (!auth.currentUser) return () => {};
  const reference = doc(db, REMOTE_COLLECTION, REMOTE_DOCUMENT);
  return onSnapshot(reference, async (snapshot) => {
    const local = loadEquipmentRegistry();
    if (!snapshot.exists()) {
      if (!isAndroidClient() && local.equipment.length > 0) {
        try { await pushRegistryToFirestore(local); onStatus?.({ state: 'published' }); }
        catch (error) { onStatus?.({ state: 'error', error }); }
      } else onStatus?.({ state: 'waiting-for-registry' });
      return;
    }

    const remote = snapshot.data();
    const remoteRevision = Number(remote.revision || 0);
    const localRevision = Number(local.revision || 0);
    const remoteTime = Date.parse(remote.updatedAt || 0) || 0;
    const localTime = Date.parse(local.updatedAt || 0) || 0;

    // Firestore is authoritative once it exists — a local cache can only
    // publish automatically when it has a strictly newer revision (same
    // conflict rule sharedSpaceRegistry.js already uses for spaces).
    const safeLocalPublish = !isAndroidClient()
      && local.equipment.length > 0
      && localRevision > remoteRevision
      && localTime > remoteTime + 1000;

    if (safeLocalPublish) {
      try { await pushRegistryToFirestore(local); onStatus?.({ state: 'published-newer-revision' }); }
      catch (error) { onStatus?.({ state: 'error', error }); }
      return;
    }

    applyingRemote = true;
    try {
      const applied = saveEquipmentRegistry(remote, 'remote-sync');
      onStatus?.({ state: 'synced', registry: applied });
    } finally { applyingRemote = false; }
  }, (error) => {
    console.error('Equipment Registry Firestore subscription failed', error);
    onStatus?.({ state: 'error', error });
  });
}

export function listEquipment() {
  return loadEquipmentRegistry().equipment;
}

export function findEquipmentByBleTag(uuid, major, minor) {
  const needle = String(uuid || '').toLowerCase();
  const majorNum = Number(major);
  const minorNum = Number(minor);
  if (!needle || !Number.isFinite(majorNum) || !Number.isFinite(minorNum)) return null;
  return listEquipment().find((item) => item.bleTag?.uuid === needle && item.bleTag?.major === majorNum && item.bleTag?.minor === minorNum) || null;
}

export function upsertEquipment(input, source = 'equipment-wizard') {
  const registry = loadEquipmentRegistry();
  const id = String(input.equipmentId || input.id || '').trim();
  if (!id) throw new Error('equipmentId is required');
  const existing = registry.equipment.find((item) => item.id === id);
  const equipment = normaliseEquipment({ ...existing, ...input, id, equipmentId: id }, existing);
  const saved = saveEquipmentRegistry({
    ...registry,
    equipment: existing
      ? registry.equipment.map((item) => item.id === id ? equipment : item)
      : [equipment, ...registry.equipment],
  }, source);
  audit({ action: existing ? 'equipment.update' : 'equipment.register', module: 'equipment', targetType: 'equipment', targetId: id, summary: existing ? 'Equipment registry record updated' : 'Equipment registered', metadata: { source, equipmentType: equipment.equipmentType, spaceId: equipment.currentSpaceId || '', assignmentType: equipment.assignment?.type || 'unassigned' } });
  return saved;
}

export function moveEquipmentInRegistry(equipmentId, spaceId, actor = 'Signed-in user') {
  const registry = loadEquipmentRegistry();
  const existing = registry.equipment.find((item) => item.id === equipmentId);
  if (!existing || existing.currentSpaceId === spaceId) return registry;
  const movedAt = nowIso();
  const saved = saveEquipmentRegistry({
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
  audit({ action: 'equipment.move', module: 'equipment', targetType: 'equipment', targetId: equipmentId, summary: 'Equipment location changed', metadata: { fromSpaceId: existing.currentSpaceId || '', toSpaceId: spaceId || '' } });
  return saved;
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
