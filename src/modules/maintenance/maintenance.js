// Maintenance issues (a light that doesn't work, a blocked sink): anyone can raise one, the caretaker and practice manager
// work them. Shared between everyone's devices (maintenance_issues in Firestore). Pure rules, no screens.

export const ISSUE_STATUS = { open: "open", inProgress: "in_progress", closed: "closed" };
export const PRIORITIES = [
  { key: "high", label: "Urgent" },
  { key: "medium", label: "Normal" },
  { key: "low", label: "Can wait" },
];
export const statusLabel = { open: "Open", in_progress: "In progress", closed: "Done" };

const trim = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const toMs = (value) => (value?.toMillis ? value.toMillis() : value?.toDate ? value.toDate().getTime() : value ? new Date(value).getTime() || 0 : 0);

export function validateIssue({ roomName, note }) {
  const problems = [];
  if (!trim(roomName, 120)) problems.push("Choose the room it is in.");
  if (!trim(note, 400)) problems.push("Say what the problem is.");
  return problems;
}

// the document for a newly raised issue; urgent raises the priority to Urgent
export function buildIssue({ roomId = "", roomName, site = "", note, urgent = false, priority = "", source = "phone", actor = {} }) {
  return {
    roomId: trim(roomId, 160), roomName: trim(roomName, 120), site: trim(site, 120),
    title: trim(note, 400), priority: PRIORITIES.some((p) => p.key === priority) ? priority : urgent ? "high" : "medium", status: ISSUE_STATUS.open,
    source, assignedTo: "Caretaker",
    reportedByUid: actor.uid || "", reportedBy: trim(actor.displayName || actor.name || actor.email, 80) || "A colleague", reportedAtMs: Date.now(),
    updates: [],
  };
}

export const isOpenIssue = (issue) => issue?.status !== ISSUE_STATUS.closed;

export function updateEntry({ text = "", status, actor = {} }) {
  return { text: trim(text, 300), status: status || "", by: trim(actor.displayName || actor.name || actor.email, 80) || "A colleague", byUid: actor.uid || "", atMs: Date.now() };
}

export const reportedMs = (issue) => toMs(issue?.reportedAt) || Number(issue?.reportedAtMs) || toMs(issue?.created_at) || 0;

export function ageDays(issue, now = new Date()) {
  const start = reportedMs(issue);
  return start ? Math.max(0, Math.floor((now.getTime() - start) / 86400000)) : 0;
}

// urgent first, then oldest first; closed ones last (newest first)
export function sortIssues(list = []) {
  const rank = { high: 0, medium: 1, low: 2 };
  return [...list].sort((a, b) => {
    const open = Number(isOpenIssue(b)) - Number(isOpenIssue(a));
    if (open) return open;
    if (!isOpenIssue(a)) return reportedMs(b) - reportedMs(a);
    return (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1) || reportedMs(a) - reportedMs(b);
  });
}

export function issueSummary(list = [], now = new Date()) {
  const open = list.filter(isOpenIssue);
  return {
    open: open.length,
    urgent: open.filter((i) => i.priority === "high").length,
    oldestDays: open.reduce((max, i) => Math.max(max, ageDays(i, now)), 0),
  };
}

// open issues in one room (for a room card)
export const openIssuesIn = (list, roomId, roomName) => list.filter((i) => isOpenIssue(i) && ((roomId && i.roomId === roomId) || (roomName && String(i.roomName || "").toLowerCase() === String(roomName).toLowerCase())));
