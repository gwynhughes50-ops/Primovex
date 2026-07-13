import { defaultCleaningLogs, defaultEquipment, defaultMaintenance, defaultRooms } from '../data/defaultFacilities';

const KEY = 'primovex.facilities.v2';
const LEGACY_KEY = 'primovex.facilities.v1';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function initialState() {
  return {
    schemaVersion: 2,
    rooms: clone(defaultRooms),
    equipment: clone(defaultEquipment),
    maintenance: clone(defaultMaintenance),
    cleaningLogs: clone(defaultCleaningLogs),
    equipmentMovements: [],
  };
}

function normaliseState(parsed) {
  const base = initialState();
  if (!parsed || !Array.isArray(parsed.rooms)) return base;
  const hasStableIds = parsed.rooms.every((room) => /^RM-/.test(room.id || ''));
  if (!hasStableIds) return base;
  return {
    ...base,
    ...parsed,
    schemaVersion: 2,
    equipmentMovements: Array.isArray(parsed.equipmentMovements) ? parsed.equipmentMovements : [],
  };
}

export function loadFacilitiesState() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return normaliseState(JSON.parse(saved));
    if (localStorage.getItem(LEGACY_KEY)) localStorage.removeItem(LEGACY_KEY);
    const state = initialState();
    saveFacilitiesState(state);
    return state;
  } catch (error) {
    console.error('Unable to load facilities state', error);
    return initialState();
  }
}

export function saveFacilitiesState(state) {
  localStorage.setItem(KEY, JSON.stringify({ ...state, schemaVersion: 2 }));
}

export function resetFacilitiesState() {
  const state = initialState();
  saveFacilitiesState(state);
  return state;
}

export function getFacilitiesSnapshot() {
  return loadFacilitiesState();
}
