const AUDIT_KEY = 'primovex.orb.governedActions.v1';
export const ACTION_TTL_MS = 15 * 60 * 1000;

function readAudit() {
  try { return JSON.parse(globalThis.localStorage?.getItem(AUDIT_KEY) || '[]'); } catch { return []; }
}

function writeAudit(rows) {
  globalThis.localStorage?.setItem(AUDIT_KEY, JSON.stringify(rows.slice(0, 500)));
}

function append(entry) {
  const rows = readAudit();
  writeAudit([entry, ...rows.filter((item) => item.id !== entry.id)]);
  globalThis.dispatchEvent?.(new CustomEvent('primovex:orb-governed-actions-changed', { detail: entry }));
  return entry;
}

export function createReconciliationProposal({ collectionName, entity, kind }) {
  const createdAt = new Date();
  const proposal = {
    id: globalThis.crypto?.randomUUID?.() || `orb-action-${Date.now()}`,
    type: 'clinical-reconciliation',
    kind,
    collectionName,
    entityId: entity?.id || '',
    entityName: entity?.name || 'Clinical asset',
    location: entity?.location || null,
    requiredCapability: 'inventory.verify',
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + ACTION_TTL_MS).toISOString(),
  };
  const params = new URLSearchParams({
    tab: collectionName === 'anaphylaxis_boxes' ? 'anaphylaxis' : 'emergency',
    orbAction: proposal.type,
    orbActionId: proposal.id,
    orbKind: kind,
    orbCollection: collectionName,
    orbEntityId: proposal.entityId,
    orbEntityName: proposal.entityName,
    orbCreatedAt: proposal.createdAt,
    orbExpiresAt: proposal.expiresAt,
  });
  append({ ...proposal, status: 'proposed' });
  return { ...proposal, route: `/inventory?${params.toString()}` };
}

export function parseGovernedProposal(search, expectedCollection, now = Date.now()) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  if (params.get('orbAction') !== 'clinical-reconciliation') return { proposal: null, error: null };
  const proposal = {
    id: params.get('orbActionId') || '', type: 'clinical-reconciliation', kind: params.get('orbKind') || '',
    collectionName: params.get('orbCollection') || '', entityId: params.get('orbEntityId') || '',
    entityName: params.get('orbEntityName') || 'Clinical asset', createdAt: params.get('orbCreatedAt') || '',
    expiresAt: params.get('orbExpiresAt') || '', requiredCapability: 'inventory.verify',
  };
  if (!proposal.id || !proposal.entityId || !proposal.createdAt || !proposal.expiresAt) return { proposal: null, error: 'Orb action proposal is incomplete.' };
  if (proposal.collectionName !== expectedCollection) return { proposal: null, error: 'Orb action proposal does not match this checklist.' };
  if (Date.parse(proposal.expiresAt) <= now) return { proposal: null, error: 'Orb action proposal expired. Ask Orb to prepare a new reconciliation.' };
  const existing = readAudit().find((item) => item.id === proposal.id);
  if (!existing) return { proposal: null, error: 'This Orb action is not registered on this device. Ask Orb to prepare a new proposal.' };
  if (existing.collectionName !== proposal.collectionName || existing.entityId !== proposal.entityId || existing.expiresAt !== proposal.expiresAt) {
    return { proposal: null, error: 'This Orb action does not match its governed proposal record.' };
  }
  if (existing?.status === 'completed') return { proposal: null, error: 'This Orb action has already been completed.' };
  if (existing?.status === 'cancelled') return { proposal: null, error: 'This Orb action was cancelled.' };
  return { proposal: { ...proposal, ...existing }, error: null };
}

export function confirmGovernedProposal(proposal, actor = {}) {
  if (!proposal?.id || Date.parse(proposal.expiresAt) <= Date.now()) throw new Error('This Orb proposal has expired.');
  const existing = readAudit().find((item) => item.id === proposal.id);
  if (existing?.status === 'completed' || existing?.status === 'cancelled') throw new Error('This Orb proposal cannot be replayed.');
  return append({ ...proposal, status: 'confirmed', confirmedAt: new Date().toISOString(), confirmedBy: { userId: actor.userId || null, role: actor.role || null } });
}

export function completeGovernedProposal(id, checkId, actor = {}) {
  const existing = readAudit().find((item) => item.id === id);
  if (!existing || existing.status !== 'confirmed') throw new Error('Orb action was not confirmed.');
  if (!checkId) throw new Error('A saved checklist record is required to complete an Orb action.');
  return append({ ...existing, status: 'completed', checkId, completedAt: new Date().toISOString(), completedBy: { userId: actor.userId || null, role: actor.role || null } });
}

export function cancelGovernedProposal(proposal, actor = {}) {
  if (!proposal?.id) return null;
  return append({ ...proposal, status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: { userId: actor.userId || null, role: actor.role || null } });
}

export function listGovernedActionAudit() { return readAudit(); }
