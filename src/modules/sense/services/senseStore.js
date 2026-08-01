import { defaultAssetPassports, defaultSenseTimeline } from '../data/defaultSense';
import { loadSpaceRegistry, replaceRegistryStructure, resetSpaceRegistry } from './sharedSpaceRegistry';
import {
  equipmentToSenseAsset,
  listEquipment,
  loadEquipmentRegistry,
  saveEquipmentRegistry,
} from '@/modules/equipment/services/equipmentRegistry';

const KEY = 'primovex.sense.v1';
const clone = (value) => JSON.parse(JSON.stringify(value));

function initialState() {
  return {
    schemaVersion: 2,
    sites: [],
    floors: [],
    zones: [],
    spaces: [],
    assets: clone(defaultAssetPassports),
    timeline: clone(defaultSenseTimeline),
    nfcTags: [],
    activeContext: { spaceId: null, provider: null, confidence: null, detectedAt: null, confirmed: false },
  };
}

export function loadSenseState() {
  const registry = loadSpaceRegistry();
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      ...initialState(),
      ...parsed,
      sites: registry.sites,
      floors: registry.floors,
      zones: registry.zones,
      spaces: registry.spaces,
      assets: listEquipment().map(equipmentToSenseAsset),
      timeline: Array.isArray(parsed.timeline) ? parsed.timeline : clone(defaultSenseTimeline),
      nfcTags: Array.isArray(parsed.nfcTags) ? parsed.nfcTags : [],
      schemaVersion: 3,
    };
  } catch (error) {
    console.error('Unable to load Primovex Sense state', error);
    return { ...initialState(), ...registry, assets: clone(defaultAssetPassports), timeline: clone(defaultSenseTimeline) };
  }
}

export function saveSenseState(state) {
  replaceRegistryStructure({ sites: state.sites, floors: state.floors, zones: state.zones, spaces: state.spaces });
  const { sites, floors, zones, spaces, ...senseOnly } = state;
  localStorage.setItem(KEY, JSON.stringify({ ...senseOnly, schemaVersion: 3 }));
  const registry = loadEquipmentRegistry();
  saveEquipmentRegistry({ ...registry, equipment: state.assets || registry.equipment }, 'sense');
  window.dispatchEvent(new CustomEvent('primovex:sense-changed'));
}

export function resetSenseState() {
  resetSpaceRegistry();
  const state = { ...initialState(), ...loadSpaceRegistry() };
  saveSenseState(state);
  return state;
}

export function calculateSpaceReadiness(space, senseState, facilitiesState = {}) {
  const facilityRoom = (facilitiesState.rooms || []).find((room) => room.id === space.id);
  const openMaintenance = (facilitiesState.maintenance || []).filter((item) => item.roomId === space.id && item.status !== 'closed');
  const expectedAssets = space.expectedAssetIds || [];
  const presentAssets = senseState.assets.filter((asset) => asset.currentSpaceId === space.id && expectedAssets.includes(asset.id));
  const cleaningFresh = facilityRoom?.lastCleanedAt ? Date.now() - new Date(facilityRoom.lastCleanedAt).getTime() <= (facilityRoom.cleaningFrequencyHours || 24) * 3600000 : false;
  const equipmentScore = expectedAssets.length ? Math.round((presentAssets.length / expectedAssets.length) * 100) : 100;
  const cleaningScore = cleaningFresh ? 100 : 40;
  const maintenanceScore = openMaintenance.length ? Math.max(20, 100 - openMaintenance.length * 35) : 100;
  const overall = Math.round((equipmentScore * 0.4) + (cleaningScore * 0.35) + (maintenanceScore * 0.25));
  return {
    overall,
    modules: { equipment: equipmentScore, cleaning: cleaningScore, maintenance: maintenanceScore },
    explanation: [
      `${presentAssets.length}/${expectedAssets.length || 0} expected assets confirmed`,
      cleaningFresh ? 'Cleaning is current' : 'Cleaning confirmation is overdue or unavailable',
      openMaintenance.length ? `${openMaintenance.length} open maintenance issue${openMaintenance.length === 1 ? '' : 's'}` : 'No open maintenance issues',
    ],
  };
}

export function confirmSpaceContext(state, spaceId, actor = 'Signed-in user', provider = 'manual', confidence = 1) {
  const now = new Date().toISOString();
  const space = state.spaces.find((item) => item.id === spaceId);
  return {
    ...state,
    activeContext: { spaceId, provider, confidence, detectedAt: now, confirmed: true },
    timeline: [{ id: crypto.randomUUID(), type: 'space-confirmed', spaceId, assetId: null, message: `${space?.name || 'Space'} confirmed`, occurredAt: now, actor }, ...state.timeline],
  };
}

export function moveAsset(state, assetId, toSpaceId, actor = 'Signed-in user', method = 'manual') {
  const asset = state.assets.find((item) => item.id === assetId);
  const space = state.spaces.find((item) => item.id === toSpaceId);
  if (!asset || !space || asset.currentSpaceId === toSpaceId) return state;
  const now = new Date().toISOString();
  return {
    ...state,
    assets: state.assets.map((item) => item.id === assetId ? { ...item, currentSpaceId: toSpaceId, lastConfirmedAt: now, lastConfirmedBy: actor } : item),
    timeline: [{ id: crypto.randomUUID(), type: 'asset-moved', spaceId: toSpaceId, assetId, message: `${asset.name} moved to ${space.name}`, occurredAt: now, actor, method }, ...state.timeline],
  };
}


export function upsertNfcTag(state, input, actor = 'Signed-in user') {
  const now = new Date().toISOString();
  const existing = (state.nfcTags || []).find((tag) => tag.id === input.id);
  const duplicate = (state.nfcTags || []).find((tag) => tag.id !== input.id && tag.entityType === input.entityType && tag.entityId === input.entityId && tag.status === 'active');
  const tag = {
    id: input.id || crypto.randomUUID(),
    label: input.label || '',
    entityType: input.entityType,
    entityId: input.entityId,
    url: input.url,
    serialNumber: input.serialNumber || existing?.serialNumber || '',
    status: input.status || 'active',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastTestedAt: input.lastTestedAt || existing?.lastTestedAt || null,
    createdBy: existing?.createdBy || actor,
    updatedBy: actor,
  };
  let tags = (state.nfcTags || []).map((item) => item.id === tag.id ? tag : item);
  if (!existing) tags = [tag, ...tags];
  if (duplicate) tags = tags.map((item) => item.id === duplicate.id ? { ...item, status: 'replaced', updatedAt: now, updatedBy: actor } : item);
  return {
    ...state,
    nfcTags: tags,
    timeline: [{ id: crypto.randomUUID(), type: existing ? 'nfc-updated' : 'nfc-registered', spaceId: input.entityType === 'space' ? input.entityId : null, assetId: input.entityType === 'asset' ? input.entityId : null, message: `NFC tag ${existing ? 'updated' : 'registered'} for ${input.label || input.entityId}`, occurredAt: now, actor }, ...state.timeline],
  };
}

export function updateNfcTagStatus(state, tagId, status, actor = 'Signed-in user') {
  const now = new Date().toISOString();
  return { ...state, nfcTags: (state.nfcTags || []).map((tag) => tag.id === tagId ? { ...tag, status, updatedAt: now, updatedBy: actor } : tag) };
}

export function markNfcTagTested(state, tagId, serialNumber = '', actor = 'Signed-in user') {
  const now = new Date().toISOString();
  return { ...state, nfcTags: (state.nfcTags || []).map((tag) => tag.id === tagId ? { ...tag, serialNumber: serialNumber || tag.serialNumber, lastTestedAt: now, updatedAt: now, updatedBy: actor } : tag) };
}
