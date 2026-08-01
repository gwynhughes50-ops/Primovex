import { defaultCleaningLogs, defaultEquipment, defaultMaintenance } from '../data/defaultFacilities';
import { loadSpaceRegistry, resetSpaceRegistry, saveSpaceRegistry } from '@/modules/sense/services/sharedSpaceRegistry';
import {
  equipmentToFacilitiesItem,
  listEquipment,
  saveEquipmentRegistry,
  loadEquipmentRegistry,
} from '@/modules/equipment/services/equipmentRegistry';

const KEY = 'primovex.facilities.v3';
const LEGACY_KEY = 'primovex.facilities.v2';
const clone = (value) => JSON.parse(JSON.stringify(value));

function operationalBase() {
  return {
    schemaVersion: 3,
    roomOperational: {},
    equipment: clone(defaultEquipment),
    maintenance: clone(defaultMaintenance),
    cleaningLogs: clone(defaultCleaningLogs),
    equipmentMovements: [],
  };
}

function loadOperationalState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...operationalBase(), ...JSON.parse(raw), schemaVersion: 3 };

    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    const base = operationalBase();
    if (legacy) {
      base.equipment = Array.isArray(legacy.equipment) ? legacy.equipment : base.equipment;
      base.maintenance = Array.isArray(legacy.maintenance) ? legacy.maintenance : base.maintenance;
      base.cleaningLogs = Array.isArray(legacy.cleaningLogs) ? legacy.cleaningLogs : base.cleaningLogs;
      base.equipmentMovements = Array.isArray(legacy.equipmentMovements) ? legacy.equipmentMovements : [];
      for (const room of legacy.rooms || []) {
        base.roomOperational[room.id] = {
          lastCleanedAt: room.lastCleanedAt || null,
          lastCleanedBy: room.lastCleanedBy || '',
          cleaningFrequencyHours: room.cleaningFrequencyHours || 24,
          operationalStatus: room.status || 'ready',
          notes: room.notes || '',
        };
      }
    }
    localStorage.setItem(KEY, JSON.stringify(base));
    return base;
  } catch (error) {
    console.error('Unable to load facilities operations', error);
    return operationalBase();
  }
}

function spaceToRoom(space, registry, operational) {
  const details = operational.roomOperational?.[space.id] || {};
  const site = registry.sites.find((item) => item.id === space.siteId);
  const floor = registry.floors.find((item) => item.id === space.floorId);
  const zone = registry.zones.find((item) => item.id === space.zoneId);
  return {
    ...space,
    site: site?.name || space.siteName || space.site || '',
    floor: floor?.name || space.floorName || space.floor || '',
    zone: zone?.name || space.zoneName || space.zone || '',
    status: details.operationalStatus || space.status || 'ready',
    cleaningFrequencyHours: details.cleaningFrequencyHours || space.cleaningFrequencyHours || 24,
    lastCleanedAt: details.lastCleanedAt || null,
    lastCleanedBy: details.lastCleanedBy || '',
    notes: details.notes ?? space.notes ?? '',
  };
}

export function loadFacilitiesState() {
  const registry = loadSpaceRegistry();
  const operational = loadOperationalState();
  return {
    ...operational,
    equipment: listEquipment().map(equipmentToFacilitiesItem),
    equipmentMovements: loadEquipmentRegistry().movements || [],
    rooms: registry.spaces.filter((space) => space.status !== 'archived').map((space) => spaceToRoom(space, registry, operational)),
  };
}

export function saveFacilitiesState(state) {
  const registry = loadSpaceRegistry();
  const roomOperational = { ...(state.roomOperational || {}) };
  for (const room of state.rooms || []) {
    roomOperational[room.id] = {
      lastCleanedAt: room.lastCleanedAt || null,
      lastCleanedBy: room.lastCleanedBy || '',
      cleaningFrequencyHours: room.cleaningFrequencyHours || 24,
      operationalStatus: room.status || 'ready',
      notes: room.notes || '',
    };
  }
  const payload = {
    schemaVersion: 3,
    roomOperational,
    equipment: state.equipment || [],
    maintenance: state.maintenance || [],
    cleaningLogs: state.cleaningLogs || [],
    equipmentMovements: state.equipmentMovements || [],
  };
  localStorage.setItem(KEY, JSON.stringify(payload));
  const equipmentRegistry = loadEquipmentRegistry();
  saveEquipmentRegistry({
    ...equipmentRegistry,
    equipment: state.equipment || equipmentRegistry.equipment,
    movements: state.equipmentMovements || equipmentRegistry.movements,
  }, 'facilities');

  const statusById = new Map((state.rooms || []).map((room) => [room.id, room.status]));
  saveSpaceRegistry({
    ...registry,
    spaces: registry.spaces.map((space) => statusById.has(space.id) ? { ...space, status: statusById.get(space.id) } : space),
  });
  window.dispatchEvent(new CustomEvent('primovex:facilities-changed'));
}

export function resetFacilitiesState() {
  resetSpaceRegistry();
  const state = operationalBase();
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('primovex:facilities-changed'));
  return loadFacilitiesState();
}

export function getFacilitiesSnapshot() {
  return loadFacilitiesState();
}
