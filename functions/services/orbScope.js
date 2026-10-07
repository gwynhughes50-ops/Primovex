// The server's copy of src/lib/orbScope.js (a frontend ES module the functions can't import).
// A test (scripts/verify-orb-scope.mjs) keeps the topic list the same in both places.
//
// The Orb can be narrowed for one person to a few topics. It only ever takes permissions away.

const ORB_TOPICS = [
  { id: "stock", domains: ["inventory", "purchasing", "suppliers"] },
  { id: "governance", domains: ["governance"] },
  { id: "compliance", domains: ["compliance"] },
  { id: "rooms", domains: ["operations"] },
  { id: "fridges", domains: ["temperature", "connect"] },
  { id: "admin", domains: ["admin", "audit", "practiceAdmin", "security", "workforce"] },
];

const ALWAYS = ["dashboard.read"];
const TOPIC_IDS = new Set(ORB_TOPICS.map((t) => t.id));

function normaliseOrbScope(value) {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.filter((id) => TOPIC_IDS.has(id)))];
}

// allCapabilities: every permission id that exists, used to expand a role that has them all ("*").
function applyOrbScope(capabilities = [], value = null, allCapabilities = []) {
  const scope = normaliseOrbScope(value);
  if (!scope) return capabilities;
  const domains = new Set(ORB_TOPICS.filter((t) => scope.includes(t.id)).flatMap((t) => t.domains));
  const base = capabilities.includes("*") ? allCapabilities : capabilities;
  return [...new Set([...ALWAYS, ...base.filter((c) => domains.has(String(c).split(".")[0]))])];
}

const { BUILT_IN_ROLE_CAPABILITIES, getEffectiveCapabilities } = require("./roleCapabilities");

const EVERY_CAPABILITY = [...new Set(Object.values(BUILT_IN_ROLE_CAPABILITIES).flat().filter((c) => c !== "*"))];

// What the Orb may use for this person: their role's permissions, limited to their Orb topics.
async function getOrbCapabilities(db, profile = {}) {
  const capabilities = await getEffectiveCapabilities(db, profile.role);
  return applyOrbScope(capabilities, profile.orbScope, EVERY_CAPABILITY);
}

module.exports = { ORB_TOPICS, normaliseOrbScope, applyOrbScope, getOrbCapabilities };
