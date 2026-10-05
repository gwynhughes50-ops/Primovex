// Turns the stored sign-in sessions into what an administrator reads: who was in,
// when, what areas they used and for how long, and anything unusual. Pure, so it
// can be tested.

export const ACTIVE_WITHIN_MS = 10 * 60 * 1000;
export const LONG_SESSION_HOURS = 12;
// Sign-ins outside these hours are flagged for a second look (not as wrong:
// out-of-hours working is normal for some roles).
export const NORMAL_HOURS = { from: 6, to: 22 };

const AREA_NAMES = {
  "/": "Home",
  "/dashboard": "Dashboard",
  "/inventory": "Inventory",
  "/alerts": "Alerts",
  "/notifications": "Notifications",
  "/purchasing": "Purchasing",
  "/suppliers": "Suppliers",
  "/reorder-centre": "Reorder centre",
  "/temperature": "Temperature",
  "/compliance": "Compliance",
  "/connect": "Connect",
  "/facilities": "Facilities",
  "/spaces": "Spaces",
  "/governance": "Governance",
  "/governance/concerns": "Concerns",
  "/governance/sars": "Subject access requests",
  "/security-centre": "Security Centre",
  "/help": "Help",
  "/admin": "Administration",
  "/reports": "Reports",
  "/sense/open": "Space or asset scan",
};

export function areaLabel(path) {
  if (AREA_NAMES[path]) return AREA_NAMES[path];
  const top = `/${String(path || "").split("/").filter(Boolean)[0] || ""}`;
  const base = AREA_NAMES[top];
  const rest = String(path || "").split("/").filter(Boolean).slice(1).join(" / ");
  if (base && rest) return `${base} / ${rest}`;
  const text = String(path || "/").replace(/^\//, "").replace(/[-_/]/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Home";
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total}s`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function outOfHours(date) {
  const hour = date.getHours();
  return hour < NORMAL_HOURS.from || hour >= NORMAL_HOURS.to;
}

// One session as the report shows it.
export function describeSession(raw, now = new Date()) {
  const startedAt = toDate(raw.startedAt);
  const lastSeenAt = toDate(raw.lastSeenAt) || startedAt;
  const endedAt = toDate(raw.endedAt);
  const finish = endedAt || lastSeenAt;
  const status = endedAt ? "ended" : now - lastSeenAt <= ACTIVE_WITHIN_MS ? "active" : "lapsed";
  const spanSeconds = startedAt && finish ? Math.max(0, Math.round((finish - startedAt) / 1000)) : 0;
  const flags = [];
  if (startedAt && outOfHours(startedAt)) flags.push("Signed in outside normal hours");
  if (spanSeconds > LONG_SESSION_HOURS * 3600) flags.push(`Session over ${LONG_SESSION_HOURS} hours`);
  return {
    id: raw.id,
    uid: raw.uid,
    name: raw.displayName || "Unnamed user",
    role: raw.role || "Unknown role",
    startedAt,
    lastSeenAt,
    endedAt,
    endReason: raw.endReason || "",
    status,
    spanSeconds,
    activeSeconds: Number(raw.activeSeconds) || 0,
    client: raw.client || "",
    platform: raw.platform || "",
    deviceId: raw.deviceId || "",
    appVersion: raw.appVersion || "",
    pages: Array.isArray(raw.pages) ? raw.pages : [],
    flags,
  };
}

const END_TEXT = { signed_out: "Signed out", session_timeout: "Timed out", closed: "Closed", "": "" };

export function endText(session) {
  if (session.status === "active") return "Active now";
  if (session.status === "lapsed") return "Left without signing out";
  return END_TEXT[session.endReason] ?? "Ended";
}

// Per person: how often and how long they were in, where they spent it, and flags.
export function summariseUsers(rawSessions = [], now = new Date()) {
  const sessions = rawSessions.map((raw) => describeSession(raw, now)).filter((s) => s.startedAt);
  const people = new Map();

  sessions.forEach((session) => {
    if (!people.has(session.uid)) {
      people.set(session.uid, { uid: session.uid, name: session.name, role: session.role, sessions: [], days: new Set(), areaSeconds: new Map(), devices: new Set(), devicesByDay: new Map() });
    }
    const person = people.get(session.uid);
    person.sessions.push(session);
    const day = dayKey(session.startedAt);
    person.days.add(day);
    if (session.deviceId) {
      person.devices.add(session.deviceId);
      if (!person.devicesByDay.has(day)) person.devicesByDay.set(day, new Set());
      person.devicesByDay.get(day).add(session.deviceId);
    }
    session.pages.forEach((page) => person.areaSeconds.set(page.path, (person.areaSeconds.get(page.path) || 0) + (Number(page.seconds) || 0)));
  });

  return [...people.values()]
    .map((person) => {
      const sorted = person.sessions.sort((a, b) => b.startedAt - a.startedAt);
      const flags = [];
      const outHours = sorted.filter((s) => s.startedAt && outOfHours(s.startedAt)).length;
      if (outHours) flags.push(`${outHours} sign-in${outHours === 1 ? "" : "s"} outside normal hours`);
      const long = sorted.filter((s) => s.spanSeconds > LONG_SESSION_HOURS * 3600).length;
      if (long) flags.push(`${long} session${long === 1 ? "" : "s"} over ${LONG_SESSION_HOURS} hours`);
      const multi = [...person.devicesByDay.values()].filter((set) => set.size > 1).length;
      if (multi) flags.push(`Used more than one device on ${multi} day${multi === 1 ? "" : "s"}`);
      const topAreas = [...person.areaSeconds.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([path, seconds]) => ({ path, label: areaLabel(path), seconds }));
      return {
        uid: person.uid,
        name: person.name,
        role: person.role,
        sessionCount: sorted.length,
        daysActive: person.days.size,
        activeSeconds: sorted.reduce((total, s) => total + s.activeSeconds, 0),
        lastSignIn: sorted[0].startedAt,
        lastSeen: sorted.reduce((latest, s) => (s.lastSeenAt > latest ? s.lastSeenAt : latest), sorted[0].lastSeenAt),
        deviceCount: person.devices.size,
        topAreas,
        flags,
        sessions: sorted,
      };
    })
    .sort((a, b) => b.lastSignIn - a.lastSignIn);
}

// Headline numbers for the range.
export function overview(users = []) {
  return {
    people: users.length,
    sessions: users.reduce((n, u) => n + u.sessionCount, 0),
    activeSeconds: users.reduce((n, u) => n + u.activeSeconds, 0),
    flagged: users.filter((u) => u.flags.length).length,
  };
}

// Quoted, and neutralised if a spreadsheet would read it as a formula.
const csvCell = (value) => {
  const text = String(value ?? "");
  const safe = /^[=+@-]/.test(text) || /^\s/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

// One row per session; the areas used are listed with their times.
export function sessionsToCsv(users = []) {
  const header = ["Name", "Role", "Signed in", "Last active", "Ended", "How it ended", "Time in session", "Active time", "Device", "Areas used (time)", "Flags"];
  const rows = [];
  users.forEach((user) => user.sessions.forEach((s) => {
    rows.push([
      s.name,
      s.role,
      s.startedAt?.toISOString() || "",
      s.lastSeenAt?.toISOString() || "",
      s.endedAt?.toISOString() || "",
      endText(s),
      formatDuration(s.spanSeconds),
      formatDuration(s.activeSeconds),
      [s.client, s.platform].filter(Boolean).join(" / "),
      s.pages.map((p) => `${areaLabel(p.path)} (${formatDuration(p.seconds)})`).join("; "),
      s.flags.join("; "),
    ]);
  }));
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
