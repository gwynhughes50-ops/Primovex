// Covers Ask Primovex for a line manager's sign-offs: what is waiting, and the cards that sign off timesheets or approve mileage.
import assert from "node:assert/strict";
import { decisionSummary, parseSignoff, runDecisions, signoffAnswer, signoffReply, waitingClaims, waitingSheets } from "../src/ai/me/signoffs.js";

let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`ok  ${name}`); };
const ME = "mgr-1";
const periods = [{ id: "pp-2026-11-01", name: "", from: "2026-11-01", to: "2026-11-28", due: "2026-11-30" }];
const sheet = (id, staffName, extra = {}) => ({ id, uid: `u-${id}`, staffName, managerUid: ME, periodId: "pp-2026-11-01", from: "2026-11-01", to: "2026-11-28", state: "submitted", kind: "no-change", ...extra });
const claim = (id, staffName, extra = {}) => ({ id, uid: `u-${id}`, staffName, managerUid: ME, status: "submitted", date: "2026-11-10", fromName: "Main Surgery", toName: "District Hospital", miles: 12, returnTrip: true, ...extra });
const sheets = [
  sheet("a", "Sarah Jones"), sheet("b", "Ann Evans"),
  sheet("c", "Bryn Price", { kind: "changes", totals: { B: 3 } }),
  sheet("d", "Done Already", { state: "approved" }),
  sheet("e", "Someone Else's", { managerUid: "other" }),
  sheet("f", "Me Myself", { uid: ME }),
];
const claims = [claim("x", "Sarah Jones"), claim("y", "Ann Evans", { miles: 5, returnTrip: false }), claim("z", "Old One", { status: "approved" })];

await t("sign-off asks and requests are understood, and how-to questions and other subjects are left alone", () => {
  const p = (q) => parseSignoff(q);
  assert.equal(p("What is waiting for me to sign off?").toolId, "signoff.waiting");
  assert.equal(p("any timesheets to approve").toolId, "signoff.waiting");
  assert.equal(p("any timesheets to approve").input.what, "timesheets");
  assert.equal(p("how many mileage claims need approving").input.what, "mileage");
  assert.equal(p("sign off the timesheets").toolId, "signoff.draft");
  assert.equal(p("approve all the mileage").input.what, "mileage");
  assert.equal(p("Sign off Sarah's timesheet").input.name, "Sarah");
  assert.equal(p("approve Ann Evans's mileage").input.name, "Ann Evans");
  assert.equal(p("sign off the timesheet for Bryn Price").input.name, "Bryn Price");
  assert.equal(p("sign off everything").input.what, "both");
  for (const q of ["how do I sign off timesheets", "approve the reorder", "sign off the SAR", "approve my leave", "show my shifts", "have I sent my timesheet", ""]) assert.equal(p(q), null, q);
});

await t("only what is waiting for this manager is counted: not their own, not other managers', not finished ones", () => {
  assert.deepEqual(waitingSheets({ sheets, uid: ME }).map((s) => s.id), ["a", "b", "c"]);
  assert.deepEqual(waitingClaims({ claims, uid: ME }).map((c) => c.id), ["x", "y"]);
  const unassigned = [sheet("g", "No Manager", { managerUid: null })];
  assert.equal(waitingSheets({ sheets: unassigned, uid: ME }).length, 0);
  assert.equal(waitingSheets({ sheets: unassigned, uid: ME, canManage: true }).length, 1);
});

await t("the answer lists who is waiting, separates usual hours from changes, and totals the miles", () => {
  const a = signoffAnswer({ sheets, claims, periods, uid: ME });
  assert.match(a.text, /Timesheets to sign off \(3\)/);
  assert.match(a.text, /2 people said their hours were as normal: Sarah Jones, Ann Evans/);
  assert.match(a.text, /Bryn Price: overtime, standard rate 3h/i);
  assert.match(a.text, /Mileage claims to approve \(2, 29 miles in all\)/);
  assert.match(a.text, /Nothing changes until you press the button/);
  assert.equal(a.sheets, 3); assert.equal(a.claims, 2);
  assert.doesNotMatch(a.text, /Done Already|Me Myself|Someone Else/);
});

await t("nothing waiting, and not being anyone's line manager, are said plainly", () => {
  assert.equal(signoffAnswer({ sheets: [], claims: [], uid: ME, canManage: true }).text, "Nothing is waiting for you to sign off or approve.");
  assert.match(signoffAnswer({ sheets: [], claims: [], uid: ME }).text, /Nobody has you down as their line manager/);
  assert.equal(signoffAnswer({ sheets, claims, periods, uid: ME, what: "mileage" }).sheets, 0);
});

await t("open payroll queries raised with the manager are mentioned", () => {
  const a = signoffAnswer({ sheets: [], claims: [], queries: [{ status: "open" }, { status: "resolved" }], uid: ME, canManage: true });
  assert.match(a.text, /Payroll queries waiting for your answer: 1/);
});

await t("'sign off the timesheets' prepares a card for the usual-hours ones only, and says what is left for the page", () => {
  const r = signoffReply({ what: "timesheets", sheets, claims, periods, uid: ME });
  assert.equal(r.proposal.kind, "timesheet-signoff");
  assert.deepEqual(r.proposal.params.items.map((i) => i.id), ["a", "b"]);
  assert.match(r.text, /1 other had something different from usual/);
  assert.equal(r.proposal.confirmLabel, "Sign off 2");
  assert.equal(r.proposal.requiredCapability, null);
  assert.match(r.proposal.lines[0], /Sarah Jones/);
});

await t("a named person's timesheet is prepared even when their hours changed, showing what changed", () => {
  const r = signoffReply({ what: "timesheets", name: "bryn", sheets, periods, uid: ME });
  assert.deepEqual(r.proposal.params.items.map((i) => i.id), ["c"]);
  assert.match(r.proposal.lines[0], /different from usual \(overtime, standard rate 3h\)/);
});

await t("a name that matches nobody, or two people, is not guessed", () => {
  assert.match(signoffReply({ what: "timesheets", name: "Zoe", sheets, uid: ME }).text, /I can't see a timesheet from “Zoe”/);
  const two = [sheet("p", "Sam Lee"), sheet("q", "Sam Reed")];
  const r = signoffReply({ what: "timesheets", name: "Sam", sheets: two, uid: ME });
  assert.equal(r.proposal, undefined);
  assert.match(r.text, /More than one person matches “Sam”: Sam Lee, Sam Reed/);
});

await t("only changed timesheets waiting means no bulk card", () => {
  const r = signoffReply({ what: "timesheets", sheets: [sheet("c", "Bryn Price", { kind: "changes", totals: { B: 3 } })], uid: ME });
  assert.equal(r.proposal, undefined);
  assert.match(r.text, /something different from usual/);
});

await t("mileage: a card for all, or for one person", () => {
  const all = signoffReply({ what: "mileage", claims, uid: ME });
  assert.equal(all.proposal.kind, "mileage-approve");
  assert.deepEqual(all.proposal.params.items.map((i) => i.id), ["x", "y"]);
  assert.match(all.proposal.lines[0], /Sarah Jones, 10\/11\/2026: Main Surgery to District Hospital and back, 24 miles/);
  const one = signoffReply({ what: "mileage", name: "Ann Evans", claims, uid: ME });
  assert.deepEqual(one.proposal.params.items.map((i) => i.id), ["y"]);
  assert.equal(signoffReply({ what: "mileage", claims: [], uid: ME }).proposal, undefined);
});

await t("not saying which asks which, with buttons", () => {
  const r = signoffReply({ what: "both", sheets, claims, uid: ME });
  assert.equal(r.proposal, undefined);
  assert.equal(r.followUps.length, 2);
  assert.equal(signoffReply({ what: "both", sheets: [], claims: [], uid: ME }).text, "Nothing is waiting for you to sign off or approve.");
});

await t("confirming re-reads each one and leaves alone anything no longer waiting", async () => {
  const live = { a: { id: "a", state: "submitted" }, b: { id: "b", state: "draft" } };
  const decided = [];
  const result = await runDecisions([{ id: "a" }, { id: "b" }, { id: "gone" }], {
    read: async (i) => live[i.id] || null, waiting: (s) => s.state === "submitted", decide: async (i) => { decided.push(i.id); },
  });
  assert.deepEqual(decided, ["a"]);
  assert.equal(result.done.length, 1); assert.equal(result.skipped.length, 2);
  assert.match(decisionSummary(result, { one: "timesheet", many: "timesheets", did: "Signed off" }), /^Signed off 1 timesheet\. 2 were no longer waiting/);
});

await t("a failure on one does not stop the rest, and is reported", async () => {
  const result = await runDecisions([{ id: "a" }, { id: "b" }], {
    read: async (i) => ({ id: i.id, state: "submitted" }), waiting: () => true,
    decide: async (i) => { if (i.id === "a") throw new Error("You don't have permission."); },
  });
  assert.equal(result.done.length, 1); assert.equal(result.failed.length, 1);
  assert.match(decisionSummary(result, { one: "claim", many: "claims", did: "Approved" }), /Approved 1 claim\. 1 didn't save: You don't have permission\./);
});

console.log(`\n${n} tests passed`);
