import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { defaultFloors, defaultSites, defaultSpaces, defaultZones } from '../data/defaultSense';

const KEY = 'primovex.spaceRegistry.v1';
const BACKUP_KEY = 'primovex.spaceRegistry.backups.v1';
const SENSE_KEY = 'primovex.sense.v1';
const FACILITIES_KEY = 'primovex.facilities.v2';
const REMOTE_COLLECTION = 'space_registries';
const REMOTE_DOCUMENT = 'primary';
const SCHEMA_VERSION = 3;
const MIGRATION_VERSION = '44.0.0';
const clone = (value) => JSON.parse(JSON.stringify(value));

let remoteWriteTimer = null;
let applyingRemote = false;

function isAndroidClient() {
  return document.documentElement.dataset.primovexClient === 'android'
    || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function nowIso() { return new Date().toISOString(); }

function baseRegistry() {
  return {
    schemaVersion: SCHEMA_VERSION,
    migrationVersion: MIGRATION_VERSION,
    registryRevision: 1,
    sites: clone(defaultSites),
    floors: clone(defaultFloors),
    zones: clone(defaultZones),
    spaces: clone(defaultSpaces),
    updatedAt: nowIso(),
    lastSuccessfulMigration: nowIso(),
  };
}

function normaliseSpace(space) {
  return {
    ...space,
    id: space.id,
    spaceId: space.spaceId || space.id,
    name: space.name || 'Unnamed space',
    status: space.status || 'ready',
    capabilities: Array.isArray(space.capabilities) ? space.capabilities : [],
    linkedFloorIds: Array.isArray(space.linkedFloorIds) ? space.linkedFloorIds : [],
    archivedAt: space.archivedAt || null,
  };
}

function normaliseRegistry(registry = {}) {
  return {
    ...baseRegistry(),
    ...registry,
    schemaVersion: SCHEMA_VERSION,
    migrationVersion: MIGRATION_VERSION,
    registryRevision: Number(registry.registryRevision || 1),
    sites: Array.isArray(registry.sites) ? registry.sites : clone(defaultSites),
    floors: Array.isArray(registry.floors) ? registry.floors : clone(defaultFloors),
    zones: Array.isArray(registry.zones) ? registry.zones : clone(defaultZones),
    spaces: Array.isArray(registry.spaces) ? registry.spaces.map(normaliseSpace) : clone(defaultSpaces).map(normaliseSpace),
    updatedAt: registry.updatedAt || nowIso(),
    lastSuccessfulMigration: registry.lastSuccessfulMigration || nowIso(),
  };
}

function mergeById(primary = [], secondary = []) {
  const map = new Map();
  [...secondary, ...primary].forEach((item) => {
    if (!item?.id) return;
    map.set(item.id, { ...(map.get(item.id) || {}), ...item });
  });
  return [...map.values()];
}

function snapshotBackup(label, payload) {
  try {
    const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
    const next = [{ id: crypto.randomUUID(), label, createdAt: nowIso(), payload }, ...backups].slice(0, 8);
    localStorage.setItem(BACKUP_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('Unable to create Space Registry backup', error);
  }
}

function migrateLegacy() {
  const registry = baseRegistry();
  const sourceSnapshot = { sense: null, facilities: null };
  try {
    const sense = JSON.parse(localStorage.getItem(SENSE_KEY) || 'null');
    sourceSnapshot.sense = sense;
    if (sense) {
      registry.sites = mergeById(sense.sites, registry.sites);
      registry.floors = mergeById(sense.floors, registry.floors);
      registry.zones = mergeById(sense.zones, registry.zones);
      registry.spaces = mergeById(sense.spaces, registry.spaces).map(normaliseSpace);
    }
  } catch (error) { console.warn('Unable to migrate legacy Sense spaces', error); }

  try {
    const facilities = JSON.parse(localStorage.getItem(FACILITIES_KEY) || 'null');
    sourceSnapshot.facilities = facilities;
    if (Array.isArray(facilities?.rooms)) {
      const asSpaces = facilities.rooms.map((room) => normaliseSpace({
        ...room, id: room.id, spaceId: room.id, typeId: room.typeId || 'other',
        siteId: room.siteId || 'SITE-MAIN', floorId: room.floorId || null,
        zoneId: room.zoneId || null, linkedFloorIds: room.linkedFloorIds || [],
        parentSpaceId: room.parentSpaceId || null,
      }));
      registry.spaces = mergeById(registry.spaces, asSpaces).map(normaliseSpace);
    }
  } catch (error) { console.warn('Unable to migrate legacy Facilities rooms', error); }

  snapshotBackup('Sprint 44 legacy migration source', sourceSnapshot);
  return normaliseRegistry(registry);
}

function projectRegistryIntoSense(registry) {
  try {
    const current = JSON.parse(localStorage.getItem(SENSE_KEY) || 'null') || {};
    localStorage.setItem(SENSE_KEY, JSON.stringify({
      ...current,
      schemaVersion: 3,
      sites: registry.sites,
      floors: registry.floors,
      zones: registry.zones,
      spaces: registry.spaces,
    }));
  } catch (error) { console.warn('Unable to project registry into Sense cache', error); }
}

function emitRegistryChanged(registry) {
  window.dispatchEvent(new CustomEvent('primovex:space-registry-changed', { detail: registry }));
  window.dispatchEvent(new CustomEvent('primovex:sense-changed'));
  window.dispatchEvent(new CustomEvent('primovex:facilities-changed'));
}

function writeLocal(registry, { broadcast = true, backupLabel = null } = {}) {
  const next = normaliseRegistry(registry);
  if (backupLabel) snapshotBackup(backupLabel, loadSpaceRegistry({ migrate: false }));
  localStorage.setItem(KEY, JSON.stringify(next));
  projectRegistryIntoSense(next);
  if (broadcast) emitRegistryChanged(next);
  return next;
}

function remotePayload(registry) {
  return { ...normaliseRegistry(registry), updatedByUid: auth.currentUser?.uid || null, sourceClient: isAndroidClient() ? 'android' : 'desktop' };
}

async function pushRegistryToFirestore(registry) {
  if (!auth.currentUser || applyingRemote) return;
  await setDoc(doc(db, REMOTE_COLLECTION, REMOTE_DOCUMENT), remotePayload(registry));
}

function queueRemoteWrite(registry) {
  if (!auth.currentUser || applyingRemote) return;
  window.clearTimeout(remoteWriteTimer);
  remoteWriteTimer = window.setTimeout(() => pushRegistryToFirestore(registry).catch((error) => {
    console.error('Unable to sync Space Registry to Firestore', error);
    window.dispatchEvent(new CustomEvent('primovex:space-sync-error', { detail: error }));
  }), 350);
}

export function loadSpaceRegistry(options = {}) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      if (options.migrate === false) return null;
      const migrated = migrateLegacy();
      writeLocal(migrated, { broadcast: false });
      return migrated;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.spaces)) throw new Error('Invalid shared space registry');
    return normaliseRegistry(parsed);
  } catch (error) {
    console.error('Unable to load shared Space Registry', error);
    const fallback = migrateLegacy();
    writeLocal(fallback, { broadcast: false });
    return fallback;
  }
}

export function saveSpaceRegistry(registry, options = {}) {
  const current = loadSpaceRegistry();
  const next = writeLocal({
    ...registry,
    registryRevision: Number(current?.registryRevision || 0) + 1,
    updatedAt: nowIso(),
  }, { ...options, backupLabel: options.backupLabel || 'Before local registry change' });
  if (options.sync !== false) queueRemoteWrite(next);
  return next;
}

export function subscribeToSharedSpaceRegistry(onStatus) {
  if (!auth.currentUser) return () => {};
  const reference = doc(db, REMOTE_COLLECTION, REMOTE_DOCUMENT);
  return onSnapshot(reference, async (snapshot) => {
    const local = loadSpaceRegistry();
    if (!snapshot.exists()) {
      if (!isAndroidClient() && local.spaces.length > 0) {
        try { await pushRegistryToFirestore(local); onStatus?.({ state: 'published', registry: local }); }
        catch (error) { onStatus?.({ state: 'error', error }); }
      } else onStatus?.({ state: 'waiting-for-registry', registry: local });
      return;
    }

    const remote = normaliseRegistry(snapshot.data());
    const remoteRevision = Number(remote.registryRevision || 0);
    const localRevision = Number(local.registryRevision || 0);
    const remoteTime = Date.parse(remote.updatedAt || 0) || 0;
    const localTime = Date.parse(local.updatedAt || 0) || 0;

    // Firestore is authoritative once it exists. A local cache can only publish
    // automatically when it has a strictly newer revision and is non-empty.
    const safeLocalPublish = !isAndroidClient()
      && local.spaces.length > 0
      && localRevision > remoteRevision
      && localTime > remoteTime + 1000;

    if (safeLocalPublish) {
      try { await pushRegistryToFirestore(local); onStatus?.({ state: 'published-newer-revision', registry: local }); }
      catch (error) { onStatus?.({ state: 'error', error }); }
      return;
    }

    applyingRemote = true;
    try {
      snapshotBackup('Before remote registry applied', local);
      const applied = writeLocal(remote);
      onStatus?.({ state: 'synced', registry: applied });
    } finally { applyingRemote = false; }
  }, (error) => {
    console.error('Space Registry Firestore subscription failed', error);
    onStatus?.({ state: 'error', error });
    window.dispatchEvent(new CustomEvent('primovex:space-sync-error', { detail: error }));
  });
}

export function updateRegistrySpace(space) {
  const registry = loadSpaceRegistry();
  const exists = registry.spaces.some((item) => item.id === space.id);
  const spaces = exists ? registry.spaces.map((item) => item.id === space.id ? normaliseSpace({ ...item, ...space }) : item) : [normaliseSpace(space), ...registry.spaces];
  return saveSpaceRegistry({ ...registry, spaces });
}

export function replaceRegistryStructure({ sites, floors, zones, spaces }) {
  const registry = loadSpaceRegistry();
  return saveSpaceRegistry({ ...registry, sites: sites || registry.sites, floors: floors || registry.floors, zones: zones || registry.zones, spaces: spaces || registry.spaces });
}

export function getSpaceRegistryDiagnostics() {
  const registry = loadSpaceRegistry();
  const ids = registry.spaces.map((space) => space.id).filter(Boolean);
  return {
    schemaVersion: registry.schemaVersion,
    migrationVersion: registry.migrationVersion,
    registryRevision: registry.registryRevision,
    updatedAt: registry.updatedAt,
    spaceCount: registry.spaces.length,
    duplicateSpaceIds: ids.filter((id, index) => ids.indexOf(id) !== index),
    syncState: document.documentElement.dataset.spaceSync || 'unknown',
  };
}

export function exportSpaceRegistryBackup() {
  return { registry: loadSpaceRegistry(), backups: JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]') };
}

export function resetSpaceRegistry() {
  snapshotBackup('Before manual registry reset', loadSpaceRegistry());
  return saveSpaceRegistry(baseRegistry(), { backupLabel: 'Manual reset' });
}
