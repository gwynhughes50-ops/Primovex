import { loadSpaceRegistry, saveSpaceRegistry } from './sharedSpaceRegistry';
import { getSpaceTemplate } from '../data/spaceTemplates';

function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function makeId(prefix = 'SP') {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export function createSpaceRecord(input) {
  const template = getSpaceTemplate(input.typeId);
  const now = new Date().toISOString();
  return {
    id: input.id || makeId('SP'),
    slug: slugify(input.name),
    name: String(input.name || '').trim(),
    typeId: template.id,
    type: template.label,
    category: template.group,
    siteId: input.siteId,
    floorId: input.floorId || null,
    linkedFloorIds: Array.isArray(input.linkedFloorIds) ? input.linkedFloorIds : [],
    zoneId: input.zoneId || null,
    parentSpaceId: input.parentSpaceId || null,
    status: input.status || 'ready',
    capabilities: Array.isArray(input.capabilities) && input.capabilities.length ? input.capabilities : [...template.capabilities],
    cleaningFrequencyHours: Number(input.cleaningFrequencyHours || 24),
    notes: String(input.notes || '').trim(),
    nfcTagId: input.nfcTagId || '',
    qrCode: input.qrCode || '',
    createdAt: input.createdAt || now,
    updatedAt: now,
    archivedAt: input.archivedAt || null,
    senseNode: input.senseNode || { provider: 'none', beaconId: '', enabled: false, batteryPercent: null, lastSeenAt: null },
    expectedAssetIds: Array.isArray(input.expectedAssetIds) ? input.expectedAssetIds : [],
  };
}

export function addSpace(state, input) {
  const space = createSpaceRecord(input);
  const next = {
    ...state,
    spaces: [space, ...state.spaces],
    timeline: [{ id: crypto.randomUUID(), type: 'space-created', spaceId: space.id, assetId: null, message: `${space.name} created`, occurredAt: new Date().toISOString(), actor: input.actor || 'Signed-in user' }, ...state.timeline],
  };
  syncSpaceToRegistry(space);
  return next;
}

export function updateSpace(state, spaceId, patch, actor = 'Signed-in user') {
  let updated;
  const spaces = state.spaces.map((space) => {
    if (space.id !== spaceId) return space;
    const template = patch.typeId ? getSpaceTemplate(patch.typeId) : null;
    updated = { ...space, ...patch, type: template?.label || patch.type || space.type, category: template?.group || space.category, updatedAt: new Date().toISOString() };
    return updated;
  });
  if (updated) syncSpaceToRegistry(updated);
  return { ...state, spaces, timeline: [{ id: crypto.randomUUID(), type: 'space-updated', spaceId, assetId: null, message: `${updated?.name || 'Space'} updated`, occurredAt: new Date().toISOString(), actor }, ...state.timeline] };
}

export function archiveSpace(state, spaceId, actor = 'Signed-in user') {
  return updateSpace(state, spaceId, { status: 'archived', archivedAt: new Date().toISOString() }, actor);
}


export function deleteHierarchyItem(state, collection, itemId) {
  if (!['sites', 'floors', 'zones'].includes(collection)) return state;

  if (collection === 'sites') {
    const hasChildren = state.floors.some((item) => item.siteId === itemId)
      || state.zones.some((item) => item.siteId === itemId)
      || state.spaces.some((item) => item.siteId === itemId && item.status !== 'archived');
    if (hasChildren) return state;
    return { ...state, sites: state.sites.filter((item) => item.id !== itemId) };
  }

  if (collection === 'floors') {
    return {
      ...state,
      floors: state.floors.filter((item) => item.id !== itemId),
      spaces: state.spaces.map((space) => ({
        ...space,
        floorId: space.floorId === itemId ? null : space.floorId,
        linkedFloorIds: (space.linkedFloorIds || []).filter((floorId) => floorId !== itemId),
        updatedAt: (space.floorId === itemId || (space.linkedFloorIds || []).includes(itemId)) ? new Date().toISOString() : space.updatedAt,
      })),
    };
  }

  return {
    ...state,
    zones: state.zones.filter((item) => item.id !== itemId),
    spaces: state.spaces.map((space) => space.zoneId === itemId
      ? { ...space, zoneId: null, updatedAt: new Date().toISOString() }
      : space),
  };
}

export function addHierarchyItem(state, collection, input) {
  const idPrefix = collection === 'sites' ? 'SITE' : collection === 'floors' ? 'FLOOR' : 'ZONE';
  const item = { id: input.id || makeId(idPrefix), ...input };
  return { ...state, [collection]: [...(state[collection] || []), item] };
}

export function syncSpaceToRegistry(space) {
  const registry = loadSpaceRegistry();
  const exists = registry.spaces.some((item) => item.id === space.id);
  const spaces = exists
    ? registry.spaces.map((item) => item.id === space.id ? { ...item, ...space } : item)
    : [space, ...registry.spaces];
  saveSpaceRegistry({ ...registry, spaces });
}
