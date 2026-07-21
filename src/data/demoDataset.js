// src/data/demoDataset.js
// Synthetic MedTrak+ demonstration data. No real patient, staff or practice data.

const today = new Date();
const isoDate = (offsetDays = 0) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};
const dateObj = (offsetDays = 0) => new Date(`${isoDate(offsetDays)}T09:00:00`);

export const demoPractice = {
  name: "Oakfield Medical Centre",
  subtitle: "Synthetic GP practice used for safe MedTrak+ demonstrations and staff training",
  sites: ["Main Surgery", "Branch Surgery", "Research Store"],
  staffCount: 42,
  registeredPatients: 18420,
};

export const demoStockItems = [
  { id: "stk-001", name: "Hand Sanitiser 500ml", category: "Infection Control", site: "Main Surgery", location: "Treatment Room 1", current_stock: 6, min_stock: 18, reorder_level: 18, unit: "bottles", expiry_date: isoDate(240), supplier_name: "NHS Supply Chain", verificationConfidence: 84, lastVerifiedAt: isoDate(-46), cost: 2.95 },
  { id: "stk-002", name: "Blue Needles 23G", category: "Clinical Consumables", site: "Main Surgery", location: "Treatment Room 2", current_stock: 220, min_stock: 150, reorder_level: 180, unit: "each", expiry_date: isoDate(520), supplier_name: "Medisave", verificationConfidence: 96, lastVerifiedAt: isoDate(-12), cost: 0.03 },
  { id: "stk-003", name: "Gauze Swabs 10x10", category: "Dressings", site: "Main Surgery", location: "Stock Room", current_stock: 18, min_stock: 45, reorder_level: 50, unit: "packs", expiry_date: isoDate(90), supplier_name: "Williams Medical", verificationConfidence: 72, lastVerifiedAt: isoDate(-79), cost: 1.2 },
  { id: "stk-004", name: "Urine Dipsticks", category: "Diagnostics", site: "Main Surgery", location: "Nurse Room", current_stock: 4, min_stock: 10, reorder_level: 12, unit: "tubs", expiry_date: isoDate(27), supplier_name: "Henry Schein", verificationConfidence: 78, lastVerifiedAt: isoDate(-58), cost: 8.5 },
  { id: "stk-005", name: "Flu Vaccine 2026", category: "Vaccines", site: "Main Surgery", location: "Vaccine Fridge", current_stock: 126, min_stock: 80, reorder_level: 100, unit: "doses", expiry_date: isoDate(33), supplier_name: "ImmForm", verificationConfidence: 99, lastVerifiedAt: isoDate(-2), cost: 0 },
  { id: "stk-006", name: "Shingles Vaccine", category: "Vaccines", site: "Main Surgery", location: "Vaccine Fridge", current_stock: 14, min_stock: 12, reorder_level: 16, unit: "doses", expiry_date: isoDate(18), supplier_name: "ImmForm", verificationConfidence: 99, lastVerifiedAt: isoDate(-1), cost: 0 },
  { id: "stk-007", name: "Dressings 10cm x 10cm", category: "Dressings", site: "Branch Surgery", location: "Treatment Room", current_stock: 12, min_stock: 20, reorder_level: 24, unit: "packs", expiry_date: isoDate(160), supplier_name: "NHS Supply Chain", verificationConfidence: 63, lastVerifiedAt: isoDate(-114), cost: 3.4 },
  { id: "stk-008", name: "Nebido Injection Kit", category: "Medicines", site: "Main Surgery", location: "Medicine Fridge", current_stock: 5, min_stock: 2, reorder_level: 3, unit: "kits", expiry_date: isoDate(210), supplier_name: "Local Pharmacy", verificationConfidence: 92, lastVerifiedAt: isoDate(-19), cost: 88 },
  { id: "stk-009", name: "Syringes 5ml", category: "Clinical Consumables", site: "Main Surgery", location: "Stock Room", current_stock: 72, min_stock: 100, reorder_level: 120, unit: "each", expiry_date: isoDate(450), supplier_name: "Medisave", verificationConfidence: 69, lastVerifiedAt: isoDate(-88), cost: 0.06 },
  { id: "stk-010", name: "Printer Labels", category: "Administration", site: "Main Surgery", location: "Reception", current_stock: 9, min_stock: 8, reorder_level: 10, unit: "rolls", expiry_date: "", supplier_name: "Office Supplier", verificationConfidence: 90, lastVerifiedAt: isoDate(-28), cost: 4.9 },
  ...Array.from({ length: 42 }).map((_, index) => ({
    id: `stk-extra-${index + 1}`,
    name: ["Cotton Wool", "Specimen Pots", "ECG Electrodes", "Tongue Depressors", "Alcohol Wipes", "Gloves Medium", "Gloves Large"][index % 7] + ` Demo ${index + 1}`,
    category: ["Clinical Consumables", "Diagnostics", "Dressings", "Infection Control"][index % 4],
    site: index % 5 === 0 ? "Branch Surgery" : "Main Surgery",
    location: ["Stock Room", "Treatment Room 1", "Treatment Room 2", "Nurse Room"][index % 4],
    current_stock: 20 + ((index * 7) % 140),
    min_stock: 18 + (index % 8) * 5,
    reorder_level: 24 + (index % 8) * 5,
    unit: index % 3 === 0 ? "packs" : "each",
    expiry_date: isoDate(60 + index * 11),
    supplier_name: ["NHS Supply Chain", "Medisave", "Williams Medical", "Henry Schein"][index % 4],
    verificationConfidence: 58 + ((index * 9) % 42),
    lastVerifiedAt: isoDate(-((index * 13) % 180)),
    cost: Number((0.35 + (index % 9) * 1.4).toFixed(2)),
  })),
];

export const demoConnectDevices = [
  { id: "DEV-DEMO-001", name: "Vaccine Fridge 1", type: "fridge", site: "Main Surgery", room: "Treatment Room 1", location: "Treatment Room 1", equipment: "Main vaccine fridge", currentValue: 4.1, reading: "4.1°C", unit: "°C", min: 2, max: 8, status: "online", battery: 96, signal: 92, health: 99, range: "2°C to 8°C", provider: "simulator", providerLabel: "Simulator", firmware: "1.0.4", lastSeenMinutes: 1 },
  { id: "DEV-DEMO-002", name: "Drug Fridge", type: "fridge", site: "Main Surgery", room: "Treatment Room 2", location: "Treatment Room 2", equipment: "Drug fridge", currentValue: 3.8, reading: "3.8°C", unit: "°C", min: 2, max: 8, status: "online", battery: 88, signal: 87, health: 98, range: "2°C to 8°C", provider: "simulator", providerLabel: "Simulator", firmware: "1.0.4", lastSeenMinutes: 3 },
  { id: "DEV-DEMO-003", name: "Research Freezer", type: "freezer", site: "Research Store", room: "Research Store", location: "Research Store", equipment: "-40°C sample freezer", currentValue: -39.6, reading: "-39.6°C", unit: "°C", min: -45, max: -35, status: "online", battery: 94, signal: 81, health: 96, range: "-45°C to -35°C", provider: "simulator", providerLabel: "Simulator", firmware: "1.0.3", lastSeenMinutes: 2 },
  { id: "DEV-DEMO-004", name: "Server Room Sensor", type: "room_sensor", site: "Main Surgery", room: "Server Room", location: "Server Room", equipment: "Ambient sensor", currentValue: 23.9, reading: "23.9°C", unit: "°C", min: 15, max: 27, humidity: 41, status: "online", battery: 76, signal: 70, health: 91, range: "15°C to 27°C", provider: "simulator", providerLabel: "Simulator", firmware: "1.0.1", lastSeenMinutes: 6 },
  { id: "DEV-DEMO-005", name: "Branch Vaccine Fridge", type: "fridge", site: "Branch Surgery", room: "Treatment Room", location: "Branch Treatment Room", equipment: "Branch vaccine fridge", currentValue: 7.6, reading: "7.6°C", unit: "°C", min: 2, max: 8, status: "online", battery: 42, signal: 64, health: 84, range: "2°C to 8°C", provider: "simulator", providerLabel: "Simulator", firmware: "1.0.2", lastSeenMinutes: 9 },
];

export const demoGovernanceCases = [
  { id: "demo-concern-001", reference: "CN-DEMO-2026-001", identifier: "EMIS: 000000-001", emisNumber: "000000-001", initials: "A.D.", patientInitials: "A.D.", dob: "01/01/1950", dateOfBirth: "1950-01-01", summary: "Medication query requiring explanation and learning review", priority: "medium", stage: "Listen & Act", status: "listening", health: 88, owner: "Practice Manager", ownerName: "Practice Manager", due: "Due in 3 days", receivedAt: dateObj(-4), acknowledgementDueAt: dateObj(1), earlyResolutionDueAt: dateObj(6), finalResponseDueAt: dateObj(22), acknowledgedAt: dateObj(-3), listeningDiscussionOfferedAt: dateObj(-2), desiredOutcome: "Clear explanation and reassurance that learning has been recorded.", learningRequired: true, clinicalReviewRequired: false },
  { id: "demo-concern-002", reference: "CN-DEMO-2026-002", identifier: "EMIS: 000000-002", emisNumber: "000000-002", initials: "B.P.", patientInitials: "B.P.", dob: "14/03/1972", dateOfBirth: "1972-03-14", summary: "Concern about appointment access and communication", priority: "low", stage: "Early Resolution", status: "early_resolution", health: 96, owner: "Reception Lead", ownerName: "Reception Lead", due: "Listening discussion complete", receivedAt: dateObj(-2), acknowledgementDueAt: dateObj(3), earlyResolutionDueAt: dateObj(9), finalResponseDueAt: dateObj(28), acknowledgedAt: dateObj(-1), listeningDiscussionOfferedAt: dateObj(-1), listeningDiscussionCompletedAt: dateObj(0), desiredOutcome: "An apology and clearer information about available appointment routes.", learningRequired: true },
  { id: "demo-concern-003", reference: "CN-DEMO-2026-003", identifier: "EMIS: 000000-003", emisNumber: "000000-003", initials: "C.R.", patientInitials: "C.R.", dob: "22/09/1948", dateOfBirth: "1948-09-22", summary: "Clinical care concern awaiting GP statement", priority: "high", stage: "Investigate, Respond & Learn", status: "investigation", health: 71, owner: "Senior Partner", ownerName: "Senior Partner", due: "Response due this week", receivedAt: dateObj(-18), acknowledgementDueAt: dateObj(-13), earlyResolutionDueAt: dateObj(-3), finalResponseDueAt: dateObj(5), acknowledgedAt: dateObj(-17), listeningDiscussionOfferedAt: dateObj(-16), listeningDiscussionCompletedAt: dateObj(-15), desiredOutcome: "Written response and evidence of clinical review.", learningRequired: true, clinicalReviewRequired: true, mddusRequired: true },
  { id: "demo-concern-004", reference: "CN-DEMO-2026-004", identifier: "EMIS: 000000-004", emisNumber: "000000-004", initials: "D.S.", patientInitials: "D.S.", dob: "09/07/1965", dateOfBirth: "1965-07-09", summary: "Results communication concern requiring process review", priority: "medium", stage: "Respond", status: "response", health: 82, owner: "Admin Lead", ownerName: "Admin Lead", due: "Final response due today", receivedAt: dateObj(-29), acknowledgementDueAt: dateObj(-24), earlyResolutionDueAt: dateObj(-14), finalResponseDueAt: dateObj(0), acknowledgedAt: dateObj(-28), listeningDiscussionOfferedAt: dateObj(-27), desiredOutcome: "Confirmation that results communication process has been reviewed.", learningRequired: true },
  { id: "demo-concern-005", reference: "CN-DEMO-2026-005", identifier: "EMIS: 000000-005", emisNumber: "000000-005", initials: "E.M.", patientInitials: "E.M.", dob: "16/11/1984", dateOfBirth: "1984-11-16", summary: "Reception interaction resolved by telephone discussion", priority: "low", stage: "Closed", status: "closed", health: 100, owner: "Reception Lead", ownerName: "Reception Lead", due: "Closed", receivedAt: dateObj(-11), acknowledgementDueAt: dateObj(-6), finalResponseDueAt: dateObj(19), acknowledgedAt: dateObj(-10), listeningDiscussionOfferedAt: dateObj(-9), listeningDiscussionCompletedAt: dateObj(-9), desiredOutcome: "To be listened to and for staff reminder to be issued.", learningRequired: true, learningRecordedAt: dateObj(-8) },
];

export const demoConcernTimeline = {
  "demo-concern-003": [
    { id: "tl-1", title: "Concern received", message: "Anonymised concern opened through Demo Centre.", type: "created", createdAt: dateObj(-18), actorName: "Demo Practice Manager" },
    { id: "tl-2", title: "Listening discussion completed", message: "Desired outcome and key questions recorded.", type: "listening", createdAt: dateObj(-15), actorName: "Demo Governance Lead" },
    { id: "tl-3", title: "GP statement requested", message: "Clinical review requested from named GP.", type: "investigation", createdAt: dateObj(-8), actorName: "Demo Governance Lead" },
  ],
};

export const demoLearningActions = {
  "demo-concern-003": [
    { id: "learn-1", title: "Review results communication template", status: "open", ownerName: "Admin Lead", dueAt: dateObj(7), createdAt: dateObj(-5) },
    { id: "learn-2", title: "Share learning at next governance meeting", status: "open", ownerName: "Practice Manager", dueAt: dateObj(14), createdAt: dateObj(-4) },
  ],
};

export const demoActivity = [
  { id: "act-001", time: "09:42", user: "Liz Howard", action: "updated a governance case", module: "Governance" },
  { id: "act-002", time: "09:31", user: "Sarah Jones", action: "completed a smart stock verification", module: "Inventory" },
  { id: "act-003", time: "09:18", user: "Rebecca Evans", action: "acknowledged a cold-chain alert drill", module: "Connect" },
  { id: "act-004", time: "08:56", user: "Ben Lane", action: "approved a purchase order", module: "Purchasing" },
  { id: "act-005", time: "08:41", user: "Admin Team", action: "cleared 12 inbox items", module: "Operations" },
];

export const demoNotifications = [
  { id: "demo-notification-001", title: "Final response due today", body: "Case CN-DEMO-2026-004 needs final response review.", module: "governance", priority: "critical", status: "open", dueDate: dateObj(0), actionUrl: "/governance/concerns", read: false },
  { id: "demo-notification-002", title: "Smart stock verification", body: "Seven items are due for rolling verification today.", module: "inventory", priority: "routine", status: "open", dueDate: dateObj(0), actionUrl: "/inventory", read: false },
  { id: "demo-notification-003", title: "Branch fridge battery low", body: "Branch Vaccine Fridge battery is below ideal level.", module: "temperature", priority: "high", status: "open", dueDate: dateObj(1), actionUrl: "/connect", read: false },
  { id: "demo-notification-004", title: "Purchase order delayed", body: "One supplier order is two days later than expected.", module: "purchasing", priority: "routine", status: "open", dueDate: dateObj(2), actionUrl: "/purchasing", read: true },
];

export const demoSecuritySignals = [
  { label: "MFA readiness", value: "Planned", status: "amber" },
  { label: "Audit logging", value: "Active", status: "green" },
  { label: "Demo data safety", value: "Enabled", status: "green" },
  { label: "Admin re-checks", value: "Required", status: "green" },
];

export const demoMedAiBrief = [
  "Practice operations are stable in this synthetic demo environment.",
  "One governance case has a high priority score and is awaiting a GP statement.",
  "All connected cold-chain devices are reporting within their configured ranges.",
  "Inventory confidence remains high with two smart verification tasks due today.",
];

export const demoScenarios = {
  "gp-practice": {
    pulse: 96,
    focus: "Governance case review and stock verification",
    organisationName: demoPractice.name,
    stats: [
      { title: "Open cases", value: "4", note: "1 high priority" },
      { title: "Connect", value: "5/5", note: "Devices online" },
      { title: "Stock checks", value: "7", note: "Due today" },
      { title: "Security", value: "92%", note: "Release readiness" },
    ],
    brief: demoMedAiBrief,
  },
  "research-practice": {
    pulse: 94,
    focus: "Research freezer assurance and calibration readiness",
    organisationName: "Oakfield Research Practice",
    stats: [
      { title: "ULT freezers", value: "2", note: "Within range" },
      { title: "Samples", value: "148", note: "Synthetic records" },
      { title: "Calibration", value: "1", note: "Due in 14 days" },
      { title: "Security", value: "94%", note: "Audit-ready" },
    ],
    brief: [
      "Research cold-chain devices are stable, including simulated -40°C freezer monitoring.",
      "One calibration review is due within the next fortnight.",
      "No live patient identifiers are present in this scenario.",
      "MedAI recommends reviewing freezer escalation contacts before demonstration.",
    ],
  },
  "large-health-centre": {
    pulse: 91,
    focus: "Operational workload and team activity overview",
    organisationName: "Oakfield Health Centre Group",
    stats: [
      { title: "Teams", value: "6", note: "Demo departments" },
      { title: "Actions", value: "84", note: "Completed today" },
      { title: "Cases", value: "8", note: "2 due this week" },
      { title: "Connect", value: "9/10", note: "1 warning" },
    ],
    brief: [
      "Operational demand is higher than the standard GP Practice scenario.",
      "One connected device has a simulated signal warning.",
      "Two governance cases are due this week and should be prioritised.",
      "MedAI recommends reviewing workload balance across admin and nursing teams.",
    ],
  },
  "training-mode": {
    pulse: 99,
    focus: "Safe staff training and product walkthrough",
    organisationName: "MedTrak Training Environment",
    stats: [
      { title: "Training tasks", value: "5", note: "Guided examples" },
      { title: "Risks", value: "0", note: "No live data" },
      { title: "Cases", value: "2", note: "Simple examples" },
      { title: "Connect", value: "2/2", note: "Simulated" },
    ],
    brief: [
      "Training Mode is designed for staff onboarding and demonstrations.",
      "All examples are synthetic and deliberately low risk.",
      "Use this mode to explain stock, Connect, governance and MedAI workflows.",
      "Reset demo data before each session for a clean walkthrough.",
    ],
  },
};

export function getDemoScenario(profileId = "gp-practice") {
  return demoScenarios[profileId] || demoScenarios["gp-practice"];
}

export function getDemoStockSummary() {
  const lowStock = demoStockItems.filter((item) => Number(item.current_stock) <= Number(item.min_stock));
  const expiringSoon = demoStockItems.filter((item) => item.expiry_date && new Date(item.expiry_date) <= dateObj(45));
  const avgConfidence = Math.round(demoStockItems.reduce((sum, item) => sum + Number(item.verificationConfidence || 0), 0) / demoStockItems.length);
  return { totalItems: demoStockItems.length, lowStockItems: lowStock.length, expiringSoon: expiringSoon.length, verificationDue: 7, confidence: avgConfidence };
}

export function getDemoOperationsSnapshot(profileId = "gp-practice") {
  const scenario = getDemoScenario(profileId);
  const stock = getDemoStockSummary();
  const openCases = demoGovernanceCases.filter((c) => !["closed", "archived"].includes(c.status));
  const highCases = openCases.filter((c) => c.priority === "high");
  return {
    scenario,
    stock,
    governance: { open: openCases.length, high: highCases.length, dueToday: 1, learningOpen: 2 },
    connect: { devices: demoConnectDevices.length, online: demoConnectDevices.filter((d) => d.status === "online").length, warnings: 1 },
    activity: demoActivity,
  };
}
