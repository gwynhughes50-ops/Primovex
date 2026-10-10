import { hasCapability } from "../../core/identity/capabilities";

// "Go to purchase orders" / "show me the alerts" / "open the reorder centre": the Orb takes the person
// there. Only ever opens a screen (never changes anything), and only one they are allowed into. On the
// phone the app is a set of tabs plus a few pages; screens that only exist on the desktop say so.

export const DESTINATIONS = [
  { id: "dashboard", label: "the Dashboard", path: "/dashboard", mobile: { tab: "home" }, phrases: ["dashboard", "home", "home page", "home screen", "main page", "start page", "my dashboard"] },
  { id: "inventory", label: "Inventory", path: "/inventory", mobile: { tab: "stock" }, capability: "inventory.read", phrases: ["inventory", "stock", "stock list", "stock page"] },
  { id: "emergency", label: "Emergency drugs", path: "/inventory?tab=emergency", mobile: { tab: "stock" }, capability: "inventory.read", phrases: ["emergency drugs", "emergency kit", "emergency kits", "resus trolley", "crash trolley", "emergency equipment"] },
  { id: "anaphylaxis", label: "Anaphylaxis boxes", path: "/inventory?tab=anaphylaxis", mobile: { tab: "stock" }, capability: "inventory.read", phrases: ["anaphylaxis boxes", "anaphylaxis box", "anaphylaxis kits", "anaphylaxis"] },
  { id: "alerts", label: "Alerts", path: "/alerts", mobile: null, phrases: ["alerts", "alerts page", "active alerts"] },
  { id: "notifications", label: "Notifications", path: "/notifications", mobile: null, phrases: ["notifications", "my notifications", "inbox"] },
  { id: "reorder", label: "the Reorder Centre", path: "/reorder-centre", mobile: null, capability: "purchasing.read", phrases: ["reorder centre", "reorder center", "reorder requests", "pending reorders"] },
  { id: "purchasing", label: "Purchasing", path: "/purchasing", mobile: null, capability: "purchasing.read", phrases: ["purchasing", "purchase orders", "purchase order", "deliveries"] },
  { id: "suppliers", label: "Suppliers", path: "/suppliers", mobile: null, capability: "suppliers.read", phrases: ["suppliers", "supplier directory", "the suppliers"] },
  { id: "compliance", label: "Compliance", path: "/compliance", mobile: { tab: "compliance" }, capability: "compliance.read", phrases: ["compliance", "compliance checks", "fire checks", "fire alarm checks", "water checks"] },
  { id: "temperature", label: "Temperature", path: "/temperature", mobile: { tab: "temperature" }, capability: "temperature.read", phrases: ["temperature", "temperature log", "temperature page", "fridge log"] },
  { id: "connect", label: "Connected Practice", path: "/connect", mobile: { tab: "connect" }, capability: "connect.view", phrases: ["connect", "connected practice"] },
  { id: "facilities", label: "Facilities", path: "/facilities", mobile: { tab: "facilities" }, capability: "operations.read", phrases: ["facilities", "cleaning rota"] },
  { id: "spaces", label: "Spaces", path: "/spaces", mobile: { tab: "sense" }, capability: "operations.read", phrases: ["spaces", "rooms", "sense", "spaces and sense"] },
  { id: "concerns", label: "Concerns", path: "/governance/concerns", mobile: { path: "/governance/concerns" }, capability: "governance.read", phrases: ["concerns", "the concerns", "complaints", "listening to people"] },
  { id: "sars", label: "SARs", path: "/governance/sars", mobile: { path: "/governance/sars" }, capability: "governance.read", phrases: ["sars", "sar", "subject access requests", "subject access"] },
  { id: "significant-events", label: "Significant events", path: "/governance/significant-events", mobile: { path: "/governance/significant-events" }, phrases: ["significant events", "significant event"] },
  { id: "reports", label: "Reports", path: "/reports", mobile: null, capability: "reports.read", phrases: ["reports", "report", "reporting"] },
  { id: "clinflow", label: "ClinFlow", path: "/clinflow", mobile: null, capability: "clinflow.read", phrases: ["clinflow", "clin flow"] },
  { id: "security", label: "the Security Centre", path: "/security-centre", mobile: null, capability: "security.read", phrases: ["security centre", "security center", "sign in records", "usage report"] },
  { id: "practice-admin", label: "Practice Admin", path: "/practice-admin", mobile: null, capability: "practiceAdmin.read", phrases: ["practice admin", "practice administration", "practice settings"] },
  { id: "admin", label: "Advanced Administration", path: "/admin", mobile: null, capability: "admin.access", phrases: ["admin", "administration", "advanced admin", "advanced administration", "user management"] },
  { id: "help", label: "Help", path: "/help", mobile: null, phrases: ["help", "help page", "user guide", "the guide"] },
];

const VERB = /^(?:(?:please|orb|ok|okay)[,\s]+)*(?:(?:can|could|would|will) you\s+)?(?:(?:please)\s+)?(?:go to|go over to|go into|take me to|take me into|bring me to|navigate to|open up|open|show me|show|switch to|jump to|pull up|bring up|load|launch|head to)\s+/i;
const FILLER = /\b(?:the|my|our|page|screen|tab|section|area|module|please|now|for me|up)\b/g;

const clean = (text) => String(text || "").toLowerCase().replace(/[’‘']/g, "").replace(/[^a-z0-9\s]/g, " ").replace(FILLER, " ").replace(/\s+/g, " ").trim();

// The destination a sentence names, if the whole of it is "<go to> <place>".
export function parseNavigation(text) {
  const t = String(text || "").trim().replace(/[.!?]+$/g, "");
  const verb = t.match(VERB);
  if (!verb) return null;
  const wanted = clean(t.slice(verb[0].length));
  if (!wanted) return null;
  let best = null;
  for (const destination of DESTINATIONS) {
    for (const phrase of destination.phrases) {
      if (clean(phrase) === wanted) { best = destination; break; }
    }
    if (best) break;
  }
  return best ? { id: best.id } : null;
}

export const looksLikeNavigation = (text) => Boolean(parseNavigation(text));

// What to say and do: { text, action? } for this person on this device.
export function resolveNavigation({ id } = {}, { capabilities = [], platform = "desktop" } = {}) {
  const destination = DESTINATIONS.find((d) => d.id === id);
  if (!destination) return { text: "I'm not sure where you mean. Try “go to the alerts” or “open purchase orders”." };
  if (destination.capability && !hasCapability(capabilities, destination.capability)) {
    return { text: `You don't have access to ${destination.label}, so I can't open it.` };
  }
  if (platform === "mobile") {
    if (!destination.mobile) return { text: `${cap(destination.label)} is only on the desktop app, so I can't open it on your phone.` };
    return { text: `Opening ${destination.label}.`, action: { label: `Open ${destination.label}`, route: destination.mobile.path || destination.path, tab: destination.mobile.tab || null, auto: true } };
  }
  return { text: `Opening ${destination.label}.`, action: { label: `Open ${destination.label}`, route: destination.path, auto: true } };
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
