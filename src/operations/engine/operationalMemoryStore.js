import { createOperationalFact, mergeOperationalFact } from './operationalFact';

const STORAGE_KEY = 'primovex.operational-memory.v1';
const listeners = new Set();
let memoryFallback = [];

function hasLocalStorage() {
  try { return typeof window !== 'undefined' && Boolean(window.localStorage); } catch { return false; }
}

function readRows() {
  if (!hasLocalStorage()) return memoryFallback;
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function writeRows(rows) {
  memoryFallback = rows;
  if (hasLocalStorage()) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  listeners.forEach((listener) => listener(rows));
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('primovex:operational-memory-changed', { detail: rows }));
}

export function getOperationalFacts() {
  return readRows().map(createOperationalFact);
}

export function getOperationalFact(id) {
  return getOperationalFacts().find((fact) => fact.id === id) || null;
}

export function upsertOperationalFact(input) {
  const rows = getOperationalFacts();
  const index = rows.findIndex((fact) => fact.id === input.id || (`${fact.domain}:${fact.subjectId}:${fact.key}` === `${input.domain}:${input.subjectId}:${input.key}`));
  const fact = index >= 0 ? mergeOperationalFact(rows[index], input) : createOperationalFact(input);
  if (index >= 0) rows[index] = fact;
  else rows.unshift(fact);
  writeRows(rows);
  return fact;
}

export function removeOperationalFact(id) {
  writeRows(getOperationalFacts().filter((fact) => fact.id !== id));
}

export function clearOperationalMemory() {
  writeRows([]);
}

export function subscribeOperationalMemory(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
