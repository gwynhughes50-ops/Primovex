// A demo reception rota for demo and training mode: invented people, four weeks already built (the first two published to the team) and a few absences and requests, kept in memory so the whole rota
// page and the phone screens work (build, change a place, publish, add time off, swap, ask) without touching any real data. Nothing here is saved anywhere: reloading the page starts again.
import { DAYS, DEFAULT_SETTINGS, DEFAULT_SHIFTS, addDays, mondayOf, newPerson } from "./rotaModel.js";
import { generateWeeks } from "./rotaEngine.js";
import { withNames } from "./rotaWeek.js";
import { projectPublished } from "./rotaPublish.js";
import { adjustmentAbsence, adjustmentText, swapOptions, swapPlaces } from "./rotaSwap.js";

const LATEST = Object.fromEntries(DAYS.map((d) => [d, "18:30"]));
const person = (uid, name, extra = {}) => ({ ...newPerson(`demo-${uid}`, name), ...extra });
export const DEMO_ME = "demo-eve"; // who the phone screens show in demo mode

export const demoRules = () => ({
  shifts: DEFAULT_SHIFTS.map((s) => ({ ...s })),
  settings: { ...DEFAULT_SETTINGS },
  people: [
    person("dan", "Dan", { mode: "usual", shift: "desk", coverShifts: ["early1", "early2", "mid", "late"], cannotDo: ["tyelan"] }),
    person("jo", "Jo", { mode: "fixed", shift: "admin2" }),
    person("hana", "Hana", { earliest: { mon: "09:00", tue: "08:00", wed: "08:00", thu: "09:00", fri: "09:00" }, latest: LATEST, maxPerWeek: { late: 1 } }),
    person("eve", "Eve"), person("finn", "Finn"), person("gus", "Gus"), person("ivy", "Ivy"), person("kit", "Kit"),
    person("lena", "Lena", { dayRules: { wed: { shift: "group:early", until: "12:00" } } }),
    person("mia", "Mia", { mode: "only", onlyShifts: ["desk2"], days: ["wed", "thu", "fri"] }),
    person("noor", "Noor", { mode: "only", onlyShifts: ["desk2"], days: ["tue", "wed", "thu"] }),
  ],
});

export function demoAbsences(monday) {
  const d = (week, day) => addDays(monday, 7 * week + day);
  return [
    { id: "demo-a1", uid: "demo-ivy", name: "Ivy", from: d(0, 3), to: d(0, 3), fromTime: "14:00", reason: "other", createdByName: "Demo" },
    { id: "demo-a2", uid: "demo-finn", name: "Finn", from: d(1, 1), to: d(1, 2), reason: "leave", createdByName: "Demo" },
    { id: "demo-a3", uid: "demo-kit", name: "Kit", from: d(1, 0), to: d(1, 0), toTime: "13:00", reason: "other", createdByName: "Demo" },
    { id: "demo-a4", uid: "demo-gus", name: "Gus", from: d(2, 4), to: d(2, 4), reason: "toil", createdByName: "Demo" },
  ];
}

export function demoWeeks(rules, absences, monday) {
  const built = generateWeeks({ rules, firstMonday: monday, weeks: 4, absences });
  return Object.fromEntries(built.map((w) => [w.mondayIso, { ...withNames(w, rules), edited: {} }]));
}

const demoRequests = (monday) => [
  { id: "demo-r1", type: "adjust", status: "awaiting_coordinator", requesterUid: "demo-kit", requesterName: "Kit", targetUid: null, targetName: "", adjust: { monday: addDays(monday, 7), day: "wed", iso: addDays(monday, 9), kind: "finish_early", text: "Finish early at 14", fromTime: "14:00", toTime: "", reason: "toil" }, changesHours: true, hoursNote: [], history: [] },
  { id: "demo-r2", type: "adjust", status: "approved", requesterUid: "demo-gus", requesterName: "Gus", targetUid: null, targetName: "", adjust: { monday: addDays(monday, 14), day: "fri", iso: addDays(monday, 18), kind: "day_off", text: "The whole day off", fromTime: "", toTime: "", reason: "toil" }, changesHours: true, hoursNote: [], history: [] },
];

// A small in-memory store with listeners, so the pages update as they would from the database.
let store = null;
export function demoStore() {
  if (store) return store;
  const monday = mondayOf(new Date());
  const rules = demoRules();
  const absences = demoAbsences(monday);
  const weeks = demoWeeks(rules, absences, monday);
  const published = Object.fromEntries(Object.values(weeks).slice(0, 2).map((w) => [w.mondayIso, projectPublished(w, rules)]));
  const state = { rules, weeks, absences, published, requests: demoRequests(monday), teamAccess: { teamAccess: true } };
  const listeners = Object.fromEntries(Object.keys(state).map((k) => [k, new Set()]));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const emit = (kind) => listeners[kind].forEach((cb) => cb(clone(state[kind])));
  store = {
    state: () => state,
    subscribe(kind, cb) { listeners[kind].add(cb); setTimeout(() => cb(clone(state[kind])), 0); return () => listeners[kind].delete(cb); },
    set(kind, value) { state[kind] = clone(value); emit(kind); },
    saveWeek(week) { state.weeks = { ...state.weeks, [week.mondayIso]: clone(week) }; emit("weeks"); },
    removeWeek(mondayIso) { const next = { ...state.weeks }; delete next[mondayIso]; state.weeks = next; emit("weeks"); },
    addAbsence(row) { state.absences = [...state.absences, { id: `demo-${Date.now()}`, createdByName: "Demo", ...clone(row) }].sort((x, y) => String(x.from).localeCompare(String(y.from))); emit("absences"); },
    removeAbsence(id) { state.absences = state.absences.filter((a) => a.id !== id); emit("absences"); },
    publish(week) { state.published = { ...state.published, [week.mondayIso]: projectPublished(week, state.rules) }; emit("published"); },
    // What the server does, for demo mode: options, asking, answering. Simplified: nobody else answers, so a swap waits.
    answer(data) {
      const today = new Date().toISOString().slice(0, 10);
      if (data.action === "options") return { ok: true, options: swapOptions({ rules: state.rules, weeks: state.weeks, absences: state.absences, uid: DEMO_ME, from: data.from, todayIso: today }) };
      if (data.action === "create_swap") {
        const r = swapPlaces({ rules: state.rules, weeks: state.weeks, absences: state.absences, a: data.from, b: data.to });
        if (!r.ok) throw new Error(`That swap is not possible: ${r.problems[0]}.`);
        state.requests = [{ id: `demo-r${Date.now()}`, type: "swap", status: "awaiting_colleague", requesterUid: DEMO_ME, requesterName: "Eve", targetUid: state.weeks[data.to.monday].days[data.to.day].slots[data.to.key].uid, targetName: state.weeks[data.to.monday].days[data.to.day].slots[data.to.key].name, a: { ...data.from, label: data.fromLabel || "Your shift" }, b: { ...data.to, label: data.toLabel || "Their shift" }, changesHours: r.changesHours, hoursNote: [], history: [] }, ...state.requests];
        emit("requests"); return { ok: true, status: "awaiting_colleague" };
      }
      if (data.action === "create_adjust") {
        const rules = state.rules; const iso = (state.weeks[data.monday]?.days?.[data.day]?.iso) || data.monday;
        const c = adjustmentAbsence({ rules, uid: DEMO_ME, name: "Eve", day: data.day, iso, kind: data.kind, fromTime: data.fromTime || "", toTime: data.toTime || "", reason: data.reason });
        if (!c.ok) throw new Error(c.problem);
        state.requests = [{ id: `demo-r${Date.now()}`, type: "adjust", status: "awaiting_coordinator", requesterUid: DEMO_ME, requesterName: "Eve", targetUid: null, targetName: "", adjust: { monday: data.monday, day: data.day, iso, kind: data.kind, text: adjustmentText(data.kind, data.fromTime, data.toTime), fromTime: data.fromTime || "", toTime: data.toTime || "", reason: data.reason }, changesHours: true, hoursNote: [], history: [] }, ...state.requests];
        emit("requests"); return { ok: true, status: "awaiting_coordinator" };
      }
      const setStatus = (status) => { state.requests = state.requests.map((r) => (r.id === data.id ? { ...r, status } : r)); emit("requests"); return { ok: true, status }; };
      if (data.action === "approve" || data.action === "agree_adjust") return setStatus("approved");
      if (data.action === "reject") return setStatus("declined");
      if (data.action === "cancel") return setStatus("cancelled");
      if (data.action === "decline") return setStatus("declined_by_colleague");
      if (data.action === "accept") return setStatus("approved");
      return { ok: false };
    },
    setTeamAccess(on) { state.teamAccess = { teamAccess: Boolean(on) }; emit("teamAccess"); },
  };
  return store;
}
