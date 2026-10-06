// Covers the staff import (src/lib/staffImport.js) with a made-up practice, never
// real staff or emails.
import assert from "node:assert/strict";
import { assignableRoles, cleanEmail, displayNameFor, parseCsv, parseRoster, planImport, runImport } from "../src/lib/staffImport.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const ta = async (name, fn) => { await fn(); n++; console.log("ok  " + name); };

const CSV = [
  "﻿Name (as on website),Website job title,Proposed department,Suggested Primovex role,Suggested reports to,Work email (to fill in),Notes",
  "Dr Alex Partner,Senior Partner,Partners,Partner,Partnership,alex.partner@example.org,",
  "Pat Manager,Practice Manager,Management Team,Practice Manager,Dr Alex Partner,pat.manager@example.org,Account already exists",
  "Sam,Management Assistant,Management Team,User,Pat Manager,Sam.Assistant2@Example.org ,\"Surname needed, check\"",
  "Robin (reception 1),Receptionist,Reception,Reception,Lee Lead,robin.rec@example.org�,",
  "Lee Lead,Team Leader,Reception,Reception,Pat Manager,lee.lead@example.org,",
  "Chris,Domestic,Facilities,Cleaner,Gordon,n/a,",
  "Dana Dup,Nurse,Nursing,Nurse,Pat Manager,pat.manager@example.org,",
  "Bad Email,Nurse,Nursing,Nurse,,not-an-email,",
  "Zed Role,Clerk,Prescribing Team,Wizard,Pat Manager,zed.role@example.org,",
  "Loop A,Clerk,Nursing,User,Loop B,loop.a@example.org,",
  "Loop B,Clerk,Nursing,User,Loop A,loop.b@example.org,",
  "Gordon,Caretaker,Facilities,Caretaker,Pat Manager,gordon.c@example.org,",
].join("\r\n");

const existing = [{ id: "u-pat", displayName: "Pat Manager", email: "Pat.Manager@example.org", role: "System Admin" }];
const roles = assignableRoles(["User", "Nurse", "HCA", "Reception", "Caretaker", "Cleaner", "Partner", "Practice Manager"], [{ name: "Medical Secretary" }, { name: "Old", active: false }]);
const run = () => planImport({ ...parseRoster(CSV), existing, roleNames: roles, departments: ["Partners", "Reception"] });

t("a CSV is read with quoted commas, CRLF and a byte-order mark", () => {
  const rows = parseCsv('a,"b, c",d\r\n"x ""y"" z",,\r\n');
  assert.deepEqual(rows, [["a", "b, c", "d"], ['x "y" z', "", ""]]);
  const roster = parseRoster(CSV);
  assert.equal(roster.rows.length, 12);
  assert.equal(roster.rows[2].name, "Sam");
  assert.equal(roster.rows[2].reportsTo, "Pat Manager");
  assert.equal(roster.missing.length, 0);
});

t("columns are found by their headings, in any order, and missing ones are reported", () => {
  const r = parseRoster("Work email,Name\nx@example.org,Sam Smith");
  assert.equal(r.rows[0].email, "x@example.org");
  assert.equal(r.rows[0].name, "Sam Smith");
  assert.deepEqual(parseRoster("Foo,Bar\n1,2").missing, ["name", "email"]);
});

t("emails are cleaned: spaces, capitals, stray symbols and 'n/a'", () => {
  assert.equal(cleanEmail("  Sam.Assistant2@Example.org "), "sam.assistant2@example.org");
  assert.equal(cleanEmail("robin.rec@example.org�"), "robin.rec@example.org");
  assert.equal(cleanEmail("n/a"), "");
  assert.equal(cleanEmail(""), "");
  assert.equal(cleanEmail(undefined), "");
});

t("names: written names are kept; first names and labels are built from the email", () => {
  assert.equal(displayNameFor("Dr Alex Partner", "alex.partner@x.org"), "Dr Alex Partner");
  assert.equal(displayNameFor("Sam", "sam.assistant2@x.org"), "Sam Assistant");
  assert.equal(displayNameFor("Karen (management)", "karen.shaw@x.org"), "Karen Shaw");
  assert.equal(displayNameFor("Liza", "liza.galea-tostevin2@x.org"), "Liza Galea-Tostevin");
  assert.equal(displayNameFor("Cherryl", ""), "Cherryl");
});

t("the plan sorts people into new, existing, skipped and problems", () => {
  const plan = run();
  const by = (name) => plan.rows.find((r) => r.name === name);
  assert.equal(by("Dr Alex Partner").status, "new");
  assert.equal(by("Pat Manager").status, "existing");
  assert.equal(by("Pat Manager").uid, "u-pat");
  assert.equal(by("Chris").status, "skip"); // n/a email
  assert.equal(by("Bad Email").status, "error");
  assert.equal(by("Dana Dup").status, "error"); // same email as another row
  assert.deepEqual(plan.summary, { newAccounts: 7, existing: 1, skipped: 1, errors: 3, total: 12 });
});

t("an unknown role, or a duplicate or invalid email, stops that row only, with a reason", () => {
  const plan = run();
  const zed = plan.rows.find((r) => r.name === "Zed Role");
  assert.equal(zed.status, "error");
  assert.match(zed.problems[0], /"Wizard" doesn't exist/);
  assert.match(plan.rows.find((r) => r.name === "Bad Email").problems[0], /isn't a valid email/);
  assert.match(plan.rows.find((r) => r.name === "Dana Dup").problems[0], /same email/i);
});

t("a new person with the same name as an existing account (different email) is warned about", () => {
  const plan = planImport({
    rows: parseRoster(["Name,Email,Role", "Pat Manager,pat.m@example.org,User", "New Person,np@example.org,User"].join("\n")).rows,
    existing: [{ id: "u1", displayName: "Pat Manager", email: "pat.manager@example.org", role: "User" }],
    roleNames: ["User"],
  });
  assert.match(plan.rows[0].warnings.join(" "), /already has an account called "Pat Manager" \(pat.manager@example.org\)/);
  assert.equal(plan.rows[0].status, "new"); // warned, not blocked: the administrator decides
  assert.deepEqual(plan.rows[1].warnings, []);
});

t("an inactive custom role isn't assignable; an existing account keeps its role", () => {
  assert.ok(roles.includes("Medical Secretary"));
  assert.ok(!roles.includes("Old"));
  const pat = run().rows.find((r) => r.name === "Pat Manager");
  assert.equal(pat.role, "System Admin");
  assert.match(pat.warnings.join(" "), /left as it is/);
});

t("reporting lines resolve to people in the file or already in Primovex; a group name is left at the top", () => {
  const plan = run();
  const by = (name) => plan.rows.find((r) => r.name === name);
  assert.equal(by("Dr Alex Partner").managerKey, null); // "Partnership" is a group
  assert.match(by("Dr Alex Partner").warnings.join(" "), /Partnership.*top of the chart/);
  assert.equal(by("Pat Manager").managerKey, by("Dr Alex Partner").key); // "Dr Alex Partner"
  assert.equal(by("Sam").managerKey, by("Pat Manager").key); // an existing account
  assert.equal(by("Robin (reception 1)").managerKey, by("Lee Lead").key); // later in the file
  assert.equal(by("Gordon").managerKey, by("Pat Manager").key);
});

t("a reporting loop is dropped with a note, and the rest of the row is kept", () => {
  const plan = run();
  const a = plan.rows.find((r) => r.name === "Loop A");
  const b = plan.rows.find((r) => r.name === "Loop B");
  assert.ok(!a.managerKey || !b.managerKey);
  assert.match([...a.warnings, ...b.warnings].join(" "), /loop/);
  assert.equal(a.status, "new");
});

t("a name that matches two people is not guessed", () => {
  const plan = planImport({
    rows: parseRoster("Name,Email,Reports to,Role\nAnn A,a@x.org,Sam,User\nSam,s1@x.org,,User\nSam,s2@x.org,,User").rows,
    roleNames: ["User"],
  });
  assert.equal(plan.rows[0].managerKey, null);
  assert.match(plan.rows[0].warnings.join(" "), /more than one person/);
});

t("departments that don't exist yet are listed once", () => {
  assert.deepEqual(run().newDepartments.sort(), ["Facilities", "Management Team", "Nursing", "Prescribing Team"]);
});

// ---- carrying it out

function fakeDeps({ failFor = [] } = {}) {
  const log = { departments: [], accounts: [], dept: [], reports: [], emailed: 0 };
  let counter = 0;
  return {
    log,
    deps: {
      addDepartment: async (name) => { log.departments.push(name); },
      createAccount: async (acct) => {
        if (failFor.includes(acct.email)) throw new Error("An account with this email already exists.");
        counter += 1;
        log.accounts.push(acct);
        return { uid: `uid-${counter}`, inviteLink: "https://secret.example/reset" };
      },
      setDepartment: async (uid, name) => { log.dept.push([uid, name]); },
      setReportsTo: async (uid, managers) => { log.reports.push([uid, managers]); },
    },
  };
}

await ta("importing creates accounts, adds departments, sets departments and reporting lines, and skips problem rows", async () => {
  const { log, deps } = fakeDeps();
  const plan = run();
  const progress = [];
  const out = await runImport(plan, deps, { onProgress: (p) => progress.push(p) });
  assert.equal(log.accounts.length, 7);
  assert.ok(!log.accounts.some((a) => ["pat.manager@example.org", "not-an-email"].includes(a.email))); // existing / invalid never created
  assert.deepEqual(log.departments.sort(), ["Facilities", "Management Team", "Nursing", "Prescribing Team"]);
  // everyone created and the existing account get their department
  assert.equal(log.dept.length, 8);
  assert.ok(log.dept.some(([uid, d]) => uid === "u-pat" && d === "Management Team"));
  // Sam reports to the existing account's real id
  const sam = out.results.find((r) => r.name === "Sam Assistant");
  assert.ok(sam.created && !sam.failed);
  assert.ok(log.reports.some(([, managers]) => managers[0] === "u-pat"));
  assert.equal(progress[progress.length - 1].done, progress[progress.length - 1].total);
});

await ta("nothing is emailed and the sign-in links are not kept", async () => {
  const { deps } = fakeDeps();
  const out = await runImport(run(), deps);
  assert.ok(!JSON.stringify(out).includes("secret.example"));
  assert.ok(!Object.keys(deps).some((k) => /mail|send|invite|link/i.test(k)));
});

await ta("one account failing doesn't stop the others, and is reported; the person's reporting line is not left dangling", async () => {
  const { log, deps } = fakeDeps({ failFor: ["lee.lead@example.org"] });
  const out = await runImport(run(), deps);
  const lee = out.results.find((r) => r.name === "Lee Lead");
  assert.ok(lee.failed && !lee.created);
  assert.equal(lee.steps[0].step, "Create account");
  assert.ok(out.results.filter((r) => r.created).length >= 6);
  const robin = out.results.find((r) => r.name === "Robin Rec");
  assert.ok(robin.failed);
  assert.match(robin.steps[0].error, /manager's account couldn't be created/);
  assert.ok(log.dept.length > 0);
});

console.log(`\n${n} passed`);
