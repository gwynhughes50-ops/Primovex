const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { hasCapability, applyExceptions } = require("./roleCapabilities");
const { countRequest } = require("./orbRouterService");
const core = require("./rotaCore.cjs");

// The reception team's requests: swapping a shift with a colleague, and asking for an adjustment (finishing early, starting late, part of a day or a day off, a different shift). Every step goes through
// here, on the server, because only the server can see everyone's rules and time off (which the team's phones never can), check a swap against them, and change the rota.
//
// A swap: A offers a shift, picks a colleague's shift to swap it for from the swaps that work (checked against the rules and time off), B accepts. If nobody's hours change it is made at once and
// the coordinator is told; if hours change, the coordinator has to approve it. An adjustment always goes to the coordinator, who agrees it (the time off is then entered) or declines it with a reason.
// Everything is limited, audited by kind and count (never the details), and the coordinator can always see every request.
//
// Switched on by the Practice Manager (settings/rota.teamAccess). Off, nothing here does anything for the team.

const HOURLY_LIMIT = 40;
const DAILY_LIMIT = 600;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[a-z0-9]{1,24}(#\d)?$/;
const ID = /^[A-Za-z0-9]{10,40}$/;
const WEEKS_AHEAD = 4;

const STATUS_TEXT = {
  awaiting_colleague: "Waiting for your colleague",
  awaiting_coordinator: "Waiting for the coordinator",
  approved: "Agreed",
  declined_by_colleague: "Your colleague said no",
  declined: "Declined",
  cancelled: "Cancelled",
  failed: "No longer possible",
};

const refFor = (db, collection, id) => db.collection(collection).doc(id);
const todayOf = (now) => new Date(now.getTime() + 0).toISOString().slice(0, 10);

function placeRef(value) {
  const monday = String(value?.monday || ""); const day = String(value?.day || ""); const key = String(value?.key || "");
  if (!DATE.test(monday) || core.mondayOf(monday) !== monday || !core.DAYS.includes(day) || !KEY.test(key)) throw new HttpsError("invalid-argument", "That shift could not be found.");
  return { monday, day, key };
}
const isoOf = (monday, day) => core.weekDates(monday).find((d) => d.day === day).iso;

async function load(db, mondays) {
  const rules = (await refFor(db, "reception_rota_rules", "main").get()).data();
  if (!rules?.people?.length) throw new HttpsError("failed-precondition", "The rota has not been set up.");
  const absences = (await db.collection("reception_rota_absences").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const weeks = {};
  for (const m of mondays) { const snap = await refFor(db, "reception_rota_weeks", m).get(); if (snap.exists) weeks[m] = snap.data(); }
  return { rules, absences, weeks };
}

// the people who should be told about requests: those who may change the rota (the Practice Manager and the coordinator), or the administrators if nobody else can
async function findCoordinators(db, rolesCache = new Map()) {
  const snapshot = await db.collection("users").get();
  const people = [];
  for (const doc of snapshot.docs) {
    const u = doc.data() || {};
    if (u.active === false) continue;
    if (!rolesCache.has(u.role)) rolesCache.set(u.role, (await refFor(db, "roles", String(u.role || "none")).get()).data()?.capabilities || null);
    people.push({ id: doc.id, name: u.displayName || u.email || "", role: u.role, caps: u.role === "System Admin" ? ["*"] : applyExceptions(rolesCache.get(u.role) || [], u) });
  }
  const managers = people.filter((p) => p.role !== "System Admin" && hasCapability(p.caps, "rota.manage"));
  return (managers.length ? managers : people.filter((p) => p.role === "System Admin")).map((p) => p.id);
}

async function notify(db, toUid, { title, message, actionUrl, byUid, byName }) {
  const ref = db.collection("users").doc(toUid).collection("notifications").doc();
  await ref.set({
    recipientUid: toUid, module: "rota", kind: "rota-request", title, message, priority: "normal", read: false, status: "open", actionUrl, automated: true,
    createdByUid: byUid || null, createdByName: byName || "Primovex", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
}
const notifyAll = (db, uids, payload) => Promise.all([...new Set(uids)].filter((u) => u && u !== payload.byUid).map((u) => notify(db, u, payload)));

const history = (request, byUid, byName, action, now) => [...(request.history || []), { at: now.getTime(), byUid, byName, action }].slice(-20);

// ---- applying a swap ----
// Re-checks everything against the rota as it is now (it may have changed since the request was made) and, if it still works, changes the weeks and re-publishes them. Returns { ok, problems }.
async function applySwap({ db, requestId, by, now }) {
  const reqRef = refFor(db, "reception_rota_requests", requestId);
  let outcome = { ok: false, problems: ["The request could not be found."] };
  await db.runTransaction(async (tx) => {
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) return;
    const request = reqSnap.data();
    const mondays = [...new Set([request.a.monday, request.b.monday])];
    const rules = (await tx.get(refFor(db, "reception_rota_rules", "main"))).data();
    const weekSnaps = await Promise.all(mondays.map((m) => tx.get(refFor(db, "reception_rota_weeks", m))));
    const pubSnaps = await Promise.all(mondays.map((m) => tx.get(refFor(db, "reception_rota_published", m))));
    const absences = (await db.collection("reception_rota_absences").get()).docs.map((d) => d.data());
    const weeks = {}; mondays.forEach((m, i) => { if (weekSnaps[i].exists) weeks[m] = weekSnaps[i].data(); });
    const problems = [];
    const placeA = weeks[request.a.monday]?.days?.[request.a.day]?.slots?.[request.a.key];
    const placeB = weeks[request.b.monday]?.days?.[request.b.day]?.slots?.[request.b.key];
    if (isoOf(request.a.monday, request.a.day) < todayOf(now) || isoOf(request.b.monday, request.b.day) < todayOf(now)) problems.push("One of the shifts has already passed.");
    else if (placeA?.uid !== request.requesterUid || placeB?.uid !== request.targetUid) problems.push("The rota has changed since the request was made.");
    else {
      const result = core.swapPlaces({ rules, weeks, absences, a: request.a, b: request.b });
      if (!result.ok) problems.push(...result.problems);
      else {
        mondays.forEach((m, i) => {
          const next = result.weeks[m];
          tx.update(refFor(db, "reception_rota_weeks", m), { days: next.days, edited: next.edited, issues: core.checkWeek(rules, next, absences), updatedAt: FieldValue.serverTimestamp(), updatedByUid: by.uid, updatedByName: `${request.requesterName} and ${request.targetName} (a swap)` });
          if (pubSnaps[i].exists) tx.set(refFor(db, "reception_rota_published", m), { ...core.projectPublished(next, rules), publishedAt: FieldValue.serverTimestamp(), publishedByUid: by.uid, publishedByName: "A swap" });
        });
        tx.update(reqRef, { status: "approved", history: history(request, by.uid, by.name, "applied", now), updatedAt: FieldValue.serverTimestamp() });
        outcome = { ok: true, problems: [] };
        return;
      }
    }
    tx.update(reqRef, { status: "failed", failedBecause: problems.slice(0, 3), history: history(request, by.uid, by.name, "failed", now), updatedAt: FieldValue.serverTimestamp() });
    outcome = { ok: false, problems };
  });
  return outcome;
}

// ---- the actions ----
// data.action is one of: options, create_swap, accept, decline, cancel, create_adjust, approve, reject, agree_adjust.
// Returns { enabled:false } when the team's access is switched off, otherwise the result with `audit` (kind and counts only) for the caller to log.
async function rotaRequest({ db, uid, profile, capabilities, isAdmin = false, data = {}, now = new Date() }) {
  const action = String(data.action || "");
  const by = { uid, name: profile?.displayName || profile?.email || "A colleague" };
  const coordinatorAction = ["approve", "reject", "agree_adjust"].includes(action);
  const settings = (await refFor(db, "settings", "rota").get()).data() || {};

  if (coordinatorAction) {
    if (!(isAdmin || hasCapability(capabilities, "rota.manage"))) throw new HttpsError("permission-denied", "Only the person who builds the rota can do that.");
  } else {
    if (settings.teamAccess !== true) return { enabled: false };
  }
  await countRequest({ db, uid, now, prefix: "rq_", hourlyLimit: HOURLY_LIMIT, dailyLimit: DAILY_LIMIT });
  const audit = (kind, extra = {}) => ({ action: `rota.request.${kind}`, summary: `Reception rota request: ${kind.replace(/_/g, " ")}`, metadata: { kind, ...extra } });

  // ---- the person's own side ----
  if (action === "options") {
    const from = placeRef(data.from);
    const { rules, absences, weeks } = await load(db, [...Array(WEEKS_AHEAD + 1)].map((_, i) => addWeeks(from.monday, i)));
    if (!rules.people.some((p) => p.uid === uid)) throw new HttpsError("permission-denied", "You are not on the rota.");
    const options = core.swapOptions({ rules, weeks, absences, uid, from, todayIso: todayOf(now), weeksAhead: WEEKS_AHEAD });
    return { enabled: true, ok: true, options: options.slice(0, 40).map((o) => ({ withUid: o.withUid, name: o.name, monday: o.monday, day: o.day, key: o.key, label: o.label, changesHours: o.changesHours })), audit: audit("options", { count: options.length }) };
  }

  if (action === "create_swap") {
    const a = placeRef(data.from); const b = placeRef(data.to);
    const { rules, absences, weeks } = await load(db, [...new Set([a.monday, b.monday])]);
    const me = rules.people.find((p) => p.uid === uid);
    if (!me) throw new HttpsError("permission-denied", "You are not on the rota.");
    const placeA = weeks[a.monday]?.days?.[a.day]?.slots?.[a.key]; const placeB = weeks[b.monday]?.days?.[b.day]?.slots?.[b.key];
    if (placeA?.uid !== uid) throw new HttpsError("failed-precondition", "That is not your shift.");
    if (!placeB) throw new HttpsError("failed-precondition", "Nobody is on that shift.");
    if (isoOf(a.monday, a.day) < todayOf(now) || isoOf(b.monday, b.day) < todayOf(now)) throw new HttpsError("failed-precondition", "That shift has already passed.");
    const result = core.swapPlaces({ rules, weeks, absences, a, b });
    if (!result.ok) throw new HttpsError("failed-precondition", `That swap is not possible: ${result.problems[0]}.`);
    const target = rules.people.find((p) => p.uid === placeB.uid);
    const doc = {
      type: "swap", status: "awaiting_colleague", requesterUid: uid, requesterName: me.name, targetUid: target.uid, targetName: target.name,
      a: { ...a, label: core.placeLabel(rules, a.monday, a.day, a.key, placeA) }, b: { ...b, label: core.placeLabel(rules, b.monday, b.day, b.key, placeB) },
      changesHours: result.changesHours, hoursNote: core.describeHours(rules, result.hours).slice(0, 4), history: history({}, uid, me.name, "asked", now),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    };
    const ref = db.collection("reception_rota_requests").doc();
    await ref.set(doc);
    await notify(db, target.uid, { title: `${me.name} would like to swap shifts with you`, message: `Their ${doc.a.label} for your ${doc.b.label}. Open My rota to say yes or no.`, actionUrl: "/my-rota", byUid: uid, byName: me.name });
    return { enabled: true, ok: true, id: ref.id, status: doc.status, changesHours: doc.changesHours, audit: audit("swap_asked", { changesHours: doc.changesHours }) };
  }

  if (action === "create_adjust") {
    const monday = String(data.monday || ""); const day = String(data.day || "");
    if (!DATE.test(monday) || core.mondayOf(monday) !== monday || !core.DAYS.includes(day)) throw new HttpsError("invalid-argument", "Choose the day.");
    const { rules } = await load(db, []);
    const me = rules.people.find((p) => p.uid === uid);
    if (!me) throw new HttpsError("permission-denied", "You are not on the rota.");
    const iso = isoOf(monday, day);
    if (iso < todayOf(now)) throw new HttpsError("failed-precondition", "That day has already passed.");
    const checked = core.adjustmentAbsence({ rules, uid, name: me.name, day, iso, kind: String(data.kind || ""), fromTime: String(data.fromTime || ""), toTime: String(data.toTime || ""), reason: String(data.reason || "") });
    if (!checked.ok) throw new HttpsError("invalid-argument", checked.problem);
    const text = core.adjustmentText(String(data.kind), String(data.fromTime || ""), String(data.toTime || ""));
    const ref = db.collection("reception_rota_requests").doc();
    await ref.set({
      type: "adjust", status: "awaiting_coordinator", requesterUid: uid, requesterName: me.name, targetUid: null, targetName: "",
      adjust: { monday, day, iso, kind: String(data.kind), text, fromTime: String(data.fromTime || ""), toTime: String(data.toTime || ""), reason: String(data.reason) },
      changesHours: true, hoursNote: [], history: history({}, uid, me.name, "asked", now), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    await notifyAll(db, await findCoordinators(db), { title: `${me.name} has asked for an adjustment`, message: `${text} on ${iso}. Open the Reception rota, Requests.`, actionUrl: "/reception-rota", byUid: uid, byName: me.name });
    return { enabled: true, ok: true, id: ref.id, status: "awaiting_coordinator", audit: audit("adjust_asked", { kind: String(data.kind) }) };
  }

  // ---- actions on an existing request ----
  const id = String(data.id || "");
  if (!ID.test(id)) throw new HttpsError("invalid-argument", "That request could not be found.");
  const reqRef = refFor(db, "reception_rota_requests", id);
  const snap = await reqRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "That request could not be found.");
  const request = snap.data();
  const wrongState = () => new HttpsError("failed-precondition", `That request is no longer waiting (${STATUS_TEXT[request.status] || request.status}).`);

  if (action === "accept" || action === "decline") {
    if (request.type !== "swap" || request.targetUid !== uid) throw new HttpsError("permission-denied", "That request is not for you.");
    if (request.status !== "awaiting_colleague") throw wrongState();
    if (action === "decline") {
      await reqRef.update({ status: "declined_by_colleague", history: history(request, uid, by.name, "declined", now), updatedAt: FieldValue.serverTimestamp() });
      await notify(db, request.requesterUid, { title: `${by.name} cannot swap shifts`, message: `Your ${request.a.label} stays as it is.`, actionUrl: "/my-rota", byUid: uid, byName: by.name });
      return { enabled: true, ok: true, status: "declined_by_colleague", audit: audit("swap_declined") };
    }
    if (request.changesHours) {
      await reqRef.update({ status: "awaiting_coordinator", history: history(request, uid, by.name, "accepted", now), updatedAt: FieldValue.serverTimestamp() });
      await notifyAll(db, await findCoordinators(db), { title: "A shift swap needs your approval", message: `${request.requesterName} and ${request.targetName} would swap ${request.a.label} and ${request.b.label}. It changes hours: ${request.hoursNote.join("; ")}.`, actionUrl: "/reception-rota", byUid: uid, byName: by.name });
      await notify(db, request.requesterUid, { title: `${by.name} said yes`, message: "It changes someone's hours, so the coordinator has to agree it too.", actionUrl: "/my-rota", byUid: uid, byName: by.name });
      return { enabled: true, ok: true, status: "awaiting_coordinator", audit: audit("swap_accepted", { changesHours: true }) };
    }
    const done = await applySwap({ db, requestId: id, by, now });
    if (!done.ok) {
      await notify(db, request.requesterUid, { title: "The swap could not be made", message: `${done.problems[0] || "The rota has changed."}`, actionUrl: "/my-rota", byUid: uid, byName: by.name });
      return { enabled: true, ok: false, status: "failed", problems: done.problems.slice(0, 3), audit: audit("swap_failed") };
    }
    await notify(db, request.requesterUid, { title: "Your swap is done", message: `${request.targetName} now has your ${request.a.label}, and you have their ${request.b.label}.`, actionUrl: "/my-rota", byUid: uid, byName: by.name });
    await notifyAll(db, await findCoordinators(db), { title: "Two people swapped shifts", message: `${request.requesterName} and ${request.targetName} swapped ${request.a.label} and ${request.b.label}. No hours changed, so nothing needs approving.`, actionUrl: "/reception-rota", byUid: uid, byName: by.name });
    return { enabled: true, ok: true, status: "approved", audit: audit("swap_made", { changesHours: false }) };
  }

  if (action === "cancel") {
    if (request.requesterUid !== uid) throw new HttpsError("permission-denied", "That request is not yours.");
    if (!["awaiting_colleague", "awaiting_coordinator"].includes(request.status)) throw wrongState();
    await reqRef.update({ status: "cancelled", history: history(request, uid, by.name, "cancelled", now), updatedAt: FieldValue.serverTimestamp() });
    if (request.targetUid) await notify(db, request.targetUid, { title: `${by.name} cancelled the swap`, message: `Their request to swap ${request.a.label} is cancelled.`, actionUrl: "/my-rota", byUid: uid, byName: by.name });
    return { enabled: true, ok: true, status: "cancelled", audit: audit("cancelled") };
  }

  // ---- the coordinator's side ----
  if (action === "approve" || action === "reject" || action === "agree_adjust") {
    if (request.status !== "awaiting_coordinator") throw wrongState();
    if (action === "reject") {
      const reasonKey = String(data.reasonKey || "");
      if (!core.DECLINE_REASONS[reasonKey]) throw new HttpsError("invalid-argument", "Choose a reason.");
      await reqRef.update({ status: "declined", decision: { byUid: uid, byName: by.name, reasonKey, reason: core.DECLINE_REASONS[reasonKey] }, history: history(request, uid, by.name, "declined", now), updatedAt: FieldValue.serverTimestamp() });
      const what = request.type === "swap" ? `the swap of ${request.a.label}` : request.adjust.text;
      await notifyAll(db, [request.requesterUid, request.targetUid], { title: "A request was declined", message: `${what}: ${core.DECLINE_REASONS[reasonKey]}.`, actionUrl: "/my-rota", byUid: uid, byName: by.name });
      return { enabled: true, ok: true, status: "declined", audit: audit(`${request.type}_declined`, { reason: reasonKey }) };
    }
    if (action === "approve" && request.type === "swap") {
      const done = await applySwap({ db, requestId: id, by, now });
      if (!done.ok) {
        await notifyAll(db, [request.requesterUid, request.targetUid], { title: "The swap could not be made", message: done.problems[0] || "The rota has changed.", actionUrl: "/my-rota", byUid: uid, byName: by.name });
        return { enabled: true, ok: false, status: "failed", problems: done.problems.slice(0, 3), audit: audit("swap_failed") };
      }
      await notifyAll(db, [request.requesterUid, request.targetUid], { title: "Your swap was agreed", message: `${request.requesterName} has ${request.b.label} and ${request.targetName} has ${request.a.label}.`, actionUrl: "/my-rota", byUid: uid, byName: by.name });
      return { enabled: true, ok: true, status: "approved", audit: audit("swap_approved", { changesHours: true }) };
    }
    if (request.type === "adjust" && (action === "agree_adjust" || action === "approve")) {
      const { rules } = await load(db, []);
      const checked = core.adjustmentAbsence({ rules, uid: request.requesterUid, name: request.requesterName, day: request.adjust.day, iso: request.adjust.iso, kind: request.adjust.kind, fromTime: request.adjust.fromTime, toTime: request.adjust.toTime, reason: request.adjust.reason });
      if (!checked.ok) throw new HttpsError("failed-precondition", checked.problem);
      if (checked.absence) await db.collection("reception_rota_absences").doc().set({ ...checked.absence, createdAt: FieldValue.serverTimestamp(), createdByUid: uid, createdByName: by.name });
      await reqRef.update({ status: "approved", decision: { byUid: uid, byName: by.name }, history: history(request, uid, by.name, "agreed", now), updatedAt: FieldValue.serverTimestamp() });
      await notify(db, request.requesterUid, { title: "Your request was agreed", message: `${request.adjust.text} on ${request.adjust.iso}.${checked.absence ? "" : " The coordinator will be in touch."}`, actionUrl: "/my-rota", byUid: uid, byName: by.name });
      return { enabled: true, ok: true, status: "approved", enteredTimeOff: Boolean(checked.absence), audit: audit("adjust_agreed", { kind: request.adjust.kind, enteredTimeOff: Boolean(checked.absence) }) };
    }
  }
  throw new HttpsError("invalid-argument", "That is not something this can do.");
}

function addWeeks(monday, n) { const d = new Date(`${monday}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 7 * n); return d.toISOString().slice(0, 10); }

module.exports = { HOURLY_LIMIT, DAILY_LIMIT, STATUS_TEXT, applySwap, findCoordinators, rotaRequest };
