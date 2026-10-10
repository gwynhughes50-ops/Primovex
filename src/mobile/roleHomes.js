import { ClipboardCheck, FileText, ListChecks, MessageSquare, Mic, NotebookPen, Package, ScanLine, ShieldAlert, Sparkles, SprayCan, Stethoscope, Thermometer, TriangleAlert, Wrench } from "lucide-react";

// What each kind of person sees on the phone: the home screen's tiles and the bottom bar. Pure data, so
// it can be tested. A tile marked with a capability is only shown to people who hold it, and a bottom-bar
// place is only listed here if that role uses it. (The Cleaner has its own single screen: MobileCleanerHome.)

const norm = (value = "") => String(value).trim().toLowerCase();
const has = (capabilities, id) => capabilities.includes("*") || capabilities.includes(id);

// Every place the bottom bar can show. 'home' and 'me' are always there.
export const NAV_PLACES = {
  home: { label: "Home", icon: "home" },
  stock: { label: "Stock", icon: "stock" },
  facilities: { label: "Facilities", icon: "facilities" },
  checks: { label: "Checks", icon: "checks" },
  rooms: { label: "Rooms", icon: "rooms" },
  messages: { label: "Messages", icon: "messages" },
  sars: { label: "SARs", icon: "sars" },
  concerns: { label: "Concerns", icon: "concerns" },
  me: { label: "Me", icon: "me" },
};

const ORB = { key: "orb", label: "Ask Orb", helper: "Type or speak", Icon: Sparkles, compact: true };

export function getRoleHome(role, capabilities = []) {
  const key = norm(role);

  if (key.includes("practice manager") || key.includes("system admin") || key === "manager" || key.includes("manager")) {
    return {
      id: "manager", eyebrow: "Operational command", headline: "See what needs attention, then act", attention: true, primary: ORB,
      actions: [
        { key: "stock", label: "Inventory", helper: "Exceptions and low stock", Icon: Package },
        { key: "room", label: "Spaces", helper: "Practice context", Icon: ScanLine },
        { key: "checks", label: "Compliance", helper: "Outstanding work", Icon: ClipboardCheck },
        { key: "temperature", label: "Temperature", helper: "Cold-chain status", Icon: Thermometer },
        { key: "fridge-check", label: "Fridge check", helper: "Scan the tag on the fridge", Icon: Thermometer, capability: "temperature.write" },
        { key: "concerns", label: "Concerns", helper: "Listening to People", Icon: ShieldAlert, capability: "governance.read" },
        { key: "sars", label: "SARs", helper: "View, add and chase", Icon: FileText, capability: "governance.read" },
        { key: "significant-events", label: "Significant events", helper: "Report and review", Icon: TriangleAlert },
        { key: "briefing", label: "What needs attention?", helper: "Your briefing from the Orb", Icon: ListChecks },
      ],
      nav: ["home", "stock", "facilities", "me"],
    };
  }

  if (key.includes("nurse") || key.includes("hca") || key.includes("clinician")) {
    return {
      id: "clinical", eyebrow: "Clinical", headline: "Quick actions for the clinic day", attention: false,
      primary: { key: "scan-stock", label: "Scan stock", helper: "Use 1, 2 or more in seconds", Icon: ScanLine },
      actions: [
        { key: "orb-voice", label: "Take items by voice", helper: "Say what you took", Icon: Mic },
        { key: "stock", label: "Stock", helper: "Use or find an item", Icon: Package },
        { key: "kits", label: "Kits and boxes", helper: "Check emergency and anaphylaxis", Icon: Stethoscope },
        { key: "temperature", label: "Temperature", helper: "Review the readings", Icon: Thermometer },
        { key: "fridge-check", label: "Fridge check", helper: "Scan the tag on the fridge", Icon: Thermometer, capability: "temperature.write" },
        { key: "issue", label: "Report an issue", helper: "To the right person", Icon: Wrench },
        { key: "quick-note", label: "Quick note", helper: "A reminder for yourself", Icon: NotebookPen },
        { key: "messages", label: "Messages", helper: "From colleagues", Icon: MessageSquare },
      ],
      nav: ["home", "stock", "checks", "me"],
    };
  }

  if (key.includes("caretaker") || key.includes("maintenance") || key.includes("estates")) {
    return {
      id: "caretaker", eyebrow: "Facilities", headline: "Identify the space and act immediately", attention: false,
      primary: { key: "scan-room", label: "Scan space or asset", helper: "NFC, QR or barcode", Icon: ScanLine },
      actions: [
        { key: "checks", label: "Fire and water checks", helper: "Record checks", Icon: ClipboardCheck },
        { key: "room", label: "Space context", helper: "Open the right passport", Icon: Wrench },
        { key: "issue", label: "Report an issue", helper: "Photo and priority", Icon: TriangleAlert },
        { key: "clean", label: "Cleaning status", helper: "Which rooms are done", Icon: SprayCan },
        { key: "quick-note", label: "Quick note", helper: "A reminder for yourself", Icon: NotebookPen },
        { key: "messages", label: "Messages", helper: "From colleagues", Icon: MessageSquare },
      ],
      nav: ["home", "facilities", "checks", "me"],
    };
  }

  if (key.includes("reception")) {
    return {
      id: "reception", eyebrow: "Front desk", headline: "Report it, check a room, leave a note", attention: false,
      primary: { key: "issue", label: "Report an issue", helper: "A room, a fault, something missing", Icon: Wrench },
      actions: [
        { key: "room", label: "Room status", helper: "What's the room doing", Icon: ScanLine },
        { key: "quick-note", label: "Quick note", helper: "A reminder for yourself", Icon: NotebookPen },
        { key: "messages", label: "Messages", helper: "From colleagues", Icon: MessageSquare },
        { key: "orb", label: "Ask the Orb", helper: "Type or speak", Icon: Sparkles },
      ],
      nav: ["home", "rooms", "messages", "me"],
    };
  }

  if (key.includes("partner")) {
    return {
      id: "partner", eyebrow: "Oversight", headline: "The practice at a glance", attention: true, primary: ORB,
      actions: [
        { key: "sars", label: "SARs", helper: "Where they are up to", Icon: FileText, capability: "governance.read" },
        { key: "concerns", label: "Concerns", helper: "Listening to People", Icon: ShieldAlert, capability: "governance.read" },
        { key: "significant-events", label: "Significant events", helper: "Review and learn", Icon: TriangleAlert },
        { key: "briefing", label: "What needs attention?", helper: "Your briefing from the Orb", Icon: ListChecks },
        { key: "messages", label: "Messages", helper: "From colleagues", Icon: MessageSquare },
      ],
      nav: ["home", "sars", "concerns", "me"],
    };
  }

  const canStock = has(capabilities, "inventory.write") || has(capabilities, "inventory.adjust");
  const canChecks = has(capabilities, "compliance.recordChecks");
  return {
    id: "general", eyebrow: "Your mobile workspace", headline: "The actions you use most, ready first", attention: false,
    primary: { key: canStock ? "scan-stock" : "scan-room", label: canStock ? "Scan stock" : "Scan room", helper: "Fast, context-aware action", Icon: ScanLine },
    actions: [
      ...(canStock ? [{ key: "stock", label: "Stock", helper: "Find or use items", Icon: Package }] : []),
      { key: "room", label: "Spaces", helper: "NFC or QR", Icon: ScanLine },
      ...(canChecks ? [{ key: "checks", label: "Checks", helper: "Record compliance", Icon: ClipboardCheck }] : []),
      { key: "quick-note", label: "Quick note", helper: "A reminder for yourself", Icon: NotebookPen },
      { key: "messages", label: "Messages", helper: "From colleagues", Icon: MessageSquare },
    ],
    nav: ["home", canStock ? "stock" : "rooms", "messages", "me"],
  };
}

// The tiles this person may see.
export function visibleActions(home, capabilities = []) {
  return home.actions.filter((action) => !action.capability || has(capabilities, action.capability));
}

// Always four places (two each side of the Orb): home first, me last, and two of the role's own in between.
export function navFor(home) {
  const middle = (home.nav || []).filter((k) => k !== "home" && k !== "me");
  while (middle.length < 2) middle.push(middle.includes("messages") ? "rooms" : "messages");
  return ["home", ...middle.slice(0, 2), "me"];
}
