const test = require("node:test");
const assert = require("node:assert/strict");
const { notifySignificantEvent, buildSeNotification, callerMayNotify, findTeamUids } = require("../services/significantEventNotify");

const EVENT = { reference: "SE-2026-1008", title: "Wrong vaccine drawn up", reportedByUid: "rep", leadUid: "lead", reviewerUids: ["rev1", "rev2"], harm: "low" };
const USERS = {
  rep: { role: "HCA", displayName: "Rep" },
  pm: { role: "Practice Manager", displayName: "PM" },
  pm2: { role: "Practice Manager", displayName: "PM2" },
  gone: { role: "Practice Manager", displayName: "Gone", active: false },
  lead: { role: "Nurse", displayName: "Lead" },
  rev1: { role: "Nurse", displayName: "R1" },
  rev2: { role: "Nurse", displayName: "R2", active: false },
  stranger: { role: "HCA", displayName: "S" },
};
const caps = { "Practice Manager": ["governance.seTeam"], Nurse: ["inventory.read"], HCA: ["inventory.read"] };
const capsForRole = async (role) => caps[role] || [];

function fakeDb({ event = EVENT, actions = {} } = {}) {
  const written = [];
  return {
    written,
    collection: (name) => ({
      get: async () => ({ docs: Object.entries(USERS).map(([id, data]) => ({ id, data: () => data })) }),
      doc: (id) => ({
        get: async () => {
          if (name === "governance_significant_events") return { exists: id === "se1", data: () => event };
          if (name === "governance_se_actions") return { exists: Boolean(actions[id]), id, data: () => actions[id] };
          return { exists: Boolean(USERS[id]), data: () => USERS[id], ref: { collection: () => ({ doc: (nid) => ({ set: async (data) => written.push({ uid: id, id: nid, ...data }) }) }) } };
        },
      }),
    }),
  };
}

test("the team is everyone active whose role has the significant events permission", async () => {
  assert.deepEqual((await findTeamUids({ db: fakeDb(), capsForRole })).sort(), ["pm", "pm2"]);
});

test("a new report tells the team (not the reporter), with the reference and title only", async () => {
  const db = fakeDb();
  const r = await notifySignificantEvent({ db, callerUid: "rep", callerName: "Rep", callerIsTeam: false, seId: "se1", kind: "reported", capsForRole });
  assert.equal(r.sent, 2);
  assert.deepEqual(db.written.map((w) => w.uid).sort(), ["pm", "pm2"]);
  assert.equal(db.written[0].title, "New significant event reported: SE-2026-1008");
  assert.equal(db.written[0].message, "Wrong vaccine drawn up");
  assert.equal(db.written[0].read, false);
  assert.match(db.written[0].actionUrl, /significant-events\?open=se1/);
  assert.equal(db.written[0].priority, "routine");
});

test("only the reporter (or the team) can announce a report", async () => {
  await assert.rejects(() => notifySignificantEvent({ db: fakeDb(), callerUid: "stranger", callerIsTeam: false, seId: "se1", kind: "reported", capsForRole }), /can't send/);
  assert.equal(callerMayNotify({ kind: "reported", event: EVENT, callerUid: "stranger", callerIsTeam: true }).ok, true);
});

test("only the team can assign a lead, ask for reviews or assign actions", async () => {
  for (const kind of ["lead_assigned", "review_requested", "action_assigned"]) {
    assert.equal(callerMayNotify({ kind, event: EVENT, callerUid: "rep", callerIsTeam: false }).ok, false);
    assert.equal(callerMayNotify({ kind, event: EVENT, callerUid: "pm", callerIsTeam: true }).ok, true);
  }
  assert.equal(callerMayNotify({ kind: "nonsense", event: EVENT, callerUid: "pm", callerIsTeam: true }).ok, false);
});

test("a review request goes only to people actually named as reviewers, and only active ones", async () => {
  const db = fakeDb();
  const r = await notifySignificantEvent({ db, callerUid: "pm", callerName: "PM", callerIsTeam: true, seId: "se1", kind: "review_requested", targetUids: ["rev1", "rev2", "stranger"], capsForRole });
  assert.equal(r.sent, 1);
  assert.deepEqual(db.written.map((w) => w.uid), ["rev1"]);
  assert.equal(db.written[0].title, "Your review is requested: SE-2026-1008");
});

test("the lead is told they are leading, unless they assigned themselves", async () => {
  const db = fakeDb();
  assert.equal((await notifySignificantEvent({ db, callerUid: "pm", callerIsTeam: true, seId: "se1", kind: "lead_assigned", capsForRole })).sent, 1);
  assert.equal((await notifySignificantEvent({ db: fakeDb(), callerUid: "lead", callerIsTeam: true, seId: "se1", kind: "lead_assigned", capsForRole })).sent, 0);
});

test("an action's owner is told what to do, and the action must belong to the event", async () => {
  const actions = { a1: { seId: "se1", title: "Update the vaccine checklist", ownerUid: "lead" }, a2: { seId: "other", title: "x", ownerUid: "lead" } };
  const db = fakeDb({ actions });
  const r = await notifySignificantEvent({ db, callerUid: "pm", callerIsTeam: true, seId: "se1", kind: "action_assigned", actionId: "a1", capsForRole });
  assert.equal(r.sent, 1);
  assert.equal(db.written[0].message, "Update the vaccine checklist");
  await assert.rejects(() => notifySignificantEvent({ db: fakeDb({ actions }), callerUid: "pm", callerIsTeam: true, seId: "se1", kind: "action_assigned", actionId: "a2", capsForRole }), /doesn't belong/);
});

test("a serious event is marked high priority; the notification never carries patient details", () => {
  const n = buildSeNotification({ kind: "reported", seId: "se1", event: { ...EVENT, harm: "severe", emisNumber: "123", patientInitials: "AB", description: "secret" }, recipientUid: "pm", callerUid: "rep" });
  assert.equal(n.data.priority, "high");
  assert.ok(!JSON.stringify(n).match(/123|AB|secret/));
});

test("an unknown event is refused", async () => {
  await assert.rejects(() => notifySignificantEvent({ db: fakeDb(), callerUid: "pm", callerIsTeam: true, seId: "missing", kind: "reported", capsForRole }), /no longer exists/);
});
