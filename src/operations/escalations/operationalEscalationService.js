const STORAGE_KEY = "primovex.operational.escalations.v1";

export const DOMAIN_ROUTING = {
  facilities: { team: "Caretaker / Facilities", priority: "medium" },
  cleaning: { team: "Cleaning Team", priority: "medium" },
  inventory: { team: "Nursing Team", priority: "medium" },
  cold_chain: { team: "Nursing Team", priority: "high" },
  governance: { team: "Concerns Team", priority: "high" },
  it: { team: "IT / System Administrator", priority: "medium" },
  workforce: { team: "Management Team", priority: "medium" },
};

function readAll() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function writeAll(rows) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  window.dispatchEvent(new CustomEvent("primovex:operational-escalations-changed"));
}
export function getOperationalEscalations() { return readAll(); }
export function createOperationalEscalation(payload, actor = {}) {
  const route = DOMAIN_ROUTING[payload.domain] || DOMAIN_ROUTING.workforce;
  const entry = {
    id: crypto.randomUUID(),
    status: "raised",
    createdAt: new Date().toISOString(),
    createdBy: actor.displayName || actor.email || "Unknown user",
    domain: payload.domain,
    objectType: payload.objectType || payload.domain,
    objectId: payload.objectId || "",
    title: payload.title || "Operational issue",
    note: payload.note || "",
    ownerTeam: payload.ownerTeam || route.team,
    priority: payload.priority || route.priority,
    dueAt: payload.dueAt || null,
    history: [{ status: "raised", at: new Date().toISOString(), by: actor.displayName || actor.email || "Unknown user", note: payload.note || "" }],
  };
  const rows = [entry, ...readAll()];
  writeAll(rows);
  return entry;
}
export function resolveOperationalEscalation(id, actor = {}) {
  const rows = readAll().map((item) => item.id === id ? {
    ...item,
    status: "resolved",
    resolvedAt: new Date().toISOString(),
    resolvedBy: actor.displayName || actor.email || "Unknown user",
    history: [...(item.history || []), { status: "resolved", at: new Date().toISOString(), by: actor.displayName || actor.email || "Unknown user" }],
  } : item);
  writeAll(rows);
}
