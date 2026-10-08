import { CAPABILITY_CATALOG } from "@/core/identity/capabilities";

// What the Orb and the Pulse orb will talk about, person by person.
//
// A person's ROLE decides what they may see in Primovex. On top of that an administrator can
// narrow the Orb for one person to a few topics: for example the practice's IT lead only for
// SARs and concerns, or the caretaker only for compliance. The scope can only take away, never
// add: what the Orb can do for someone is always their role's permissions limited to the topics
// ticked here. No scope set (the default) means everything their role allows.
//
// functions/services/orbScope.js keeps the same topic list for the server; a test keeps the two
// the same.

export const ORB_TOPICS = [
  { id: "stock", label: "Stock and ordering", description: "Stock levels, where things are, expiry, reorders, suppliers, purchasing", domains: ["inventory", "purchasing", "suppliers"], pulse: ["inventory", "purchasing"] },
  { id: "governance", label: "SARs, concerns and significant events", description: "Subject access requests, concerns and significant events", domains: ["governance"], pulse: ["governance"] },
  { id: "compliance", label: "Compliance", description: "Compliance checks, assets and everything in the Compliance area", domains: ["compliance"], pulse: ["compliance"] },
  { id: "rooms", label: "Rooms, cleaning and tasks", description: "Rooms, cleaning, equipment, maintenance, tasks and alerts", domains: ["operations"], pulse: ["assets", "estates"] },
  { id: "fridges", label: "Fridges and temperature", description: "Fridge and temperature monitoring", domains: ["temperature", "connect"], pulse: ["compliance"] },
  { id: "admin", label: "Staff and settings", description: "Users, roles, audit and practice settings", domains: ["admin", "audit", "practiceAdmin", "security", "workforce"], pulse: ["workforce"] },
];

// Always allowed so "how do I...?" help keeps working for everyone.
const ALWAYS = ["dashboard.read"];

const TOPIC_IDS = new Set(ORB_TOPICS.map((t) => t.id));

// null = no limit. Otherwise a de-duplicated list of known topic ids (possibly empty: help only).
export function normaliseOrbScope(value) {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.filter((id) => TOPIC_IDS.has(id)))];
}

const domainOf = (capability) => String(capability).split(".")[0];

function allowedDomains(scope) {
  return new Set(ORB_TOPICS.filter((t) => scope.includes(t.id)).flatMap((t) => t.domains));
}

// The permissions the Orb may use for this person: their role's, limited to the ticked topics.
// A role with every permission ("*") is expanded to every permission in those topics.
export function applyOrbScope(capabilities = [], value = null) {
  const scope = normaliseOrbScope(value);
  if (!scope) return capabilities;
  const domains = allowedDomains(scope);
  const base = capabilities.includes("*") ? CAPABILITY_CATALOG.map((c) => c.id) : capabilities;
  return [...new Set([...ALWAYS, ...base.filter((c) => domains.has(domainOf(c)))])];
}

// Which Pulse modules this person sees (null = all of them).
export function pulseModulesFor(value = null) {
  const scope = normaliseOrbScope(value);
  if (!scope) return null;
  return [...new Set(ORB_TOPICS.filter((t) => scope.includes(t.id)).flatMap((t) => t.pulse))];
}

export function describeOrbScope(value = null) {
  const scope = normaliseOrbScope(value);
  if (!scope) return "Everything their role allows";
  if (!scope.length) return "How-to help only";
  return ORB_TOPICS.filter((t) => scope.includes(t.id)).map((t) => t.label).join(", ");
}
