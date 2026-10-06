// Bulk import of staff from a spreadsheet (CSV): who to create accounts for, their
// role, department and who they report to. Pure (no Firestore, no React), so the
// plan can be tested and shown to the administrator before anything is created.
// Nothing here sends an email: accounts are created without telling anyone, and
// each person's sign-in link is sent by the administrator later, in their own time.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- reading the file ---------------------------------------------------------

// A CSV into rows of cells: quoted cells, doubled quotes, commas and line breaks
// inside quotes, CRLF or LF, and a leading byte-order mark.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

const norm = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Which column is which, by what the header says (so the file can be edited or
// reordered freely).
const COLUMNS = {
  name: (h) => h.startsWith("name"),
  title: (h) => h.includes("job title"),
  department: (h) => h.includes("department"),
  role: (h) => h.includes("role"),
  reportsTo: (h) => h.includes("reports to"),
  email: (h) => h.includes("email"),
  notes: (h) => h.startsWith("notes") || h === "note",
};

export function parseRoster(text) {
  const [header, ...body] = parseCsv(text);
  if (!header) return { rows: [], missing: ["name", "email"] };
  const index = {};
  header.forEach((h, i) => {
    const key = Object.keys(COLUMNS).find((k) => index[k] === undefined && COLUMNS[k](norm(h)));
    if (key) index[key] = i;
  });
  const missing = ["name", "email"].filter((k) => index[k] === undefined);
  const cell = (r, key) => (index[key] === undefined ? "" : String(r[index[key]] ?? "").trim());
  const rows = body.map((r, i) => ({
    line: i + 2,
    name: cell(r, "name"),
    jobTitle: cell(r, "title"),
    department: cell(r, "department"),
    role: cell(r, "role"),
    reportsTo: cell(r, "reportsTo"),
    email: cell(r, "email"),
  }));
  return { rows, missing };
}

// An email as typed into a spreadsheet: stray spaces, stray symbols (a replacement
// character from a bad copy and paste) and capitals are cleaned off. "n/a" and
// blanks mean no email.
export function cleanEmail(raw) {
  const text = String(raw ?? "").replace(/[\u0000-\u001f\u007f-\u009f�​﻿ \s]+/g, "").toLowerCase();
  if (!text || ["n/a", "na", "none", "-"].includes(text)) return "";
  return text;
}

const titleCase = (word) => word.charAt(0).toUpperCase() + word.slice(1);

// What the account is called. As written in the file, unless that is only a first
// name or a label like "Karen (management)" - then it is built from the email
// (karen.shaw2@... becomes "Karen Shaw").
export function displayNameFor(name, email) {
  const written = String(name ?? "").trim();
  const bare = written.replace(/\s+/g, " ");
  const usable = bare && !bare.includes("(") && bare.includes(" ");
  if (usable) return bare;
  const local = String(email || "").split("@")[0].replace(/[0-9]+/g, "");
  const parts = local.split(/[._]+/).filter(Boolean);
  if (parts.length >= 2) return parts.map((p) => p.split("-").map(titleCase).join("-")).join(" ");
  return bare || "Unnamed user";
}

// ---- planning -------------------------------------------------------------------

const withoutTitle = (value) => norm(value).replace(/^(dr|mr|mrs|ms|miss|prof)\s+/, "");

// Everyone who can be named as someone's manager, by every way the file or the
// system might write their name. A name that matches more than one person is
// ambiguous and is left unresolved rather than guessed.
function nameIndex(entries) {
  const map = new Map();
  const put = (key, id) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(id);
  };
  entries.forEach((e) => {
    [e.name, e.displayName].forEach((n) => { put(norm(n), e.key); put(withoutTitle(n), e.key); });
  });
  return map;
}

// The plan for a file: for each row whether it is a new account, an account that
// already exists (only its department and reporting line are set), or can't be
// done, and why. `existing` = current user profiles; `roleNames` = every role that
// can be assigned; `departments` = current department names.
export function planImport({ rows, existing = [], roleNames = [], departments = [] }) {
  const byEmail = new Map(existing.filter((u) => u.email).map((u) => [String(u.email).trim().toLowerCase(), u]));
  const roleSet = new Set(roleNames);
  const seenEmail = new Map();
  const deptSet = new Set(departments.map((d) => norm(d)));
  const newDepartments = [];

  const planned = rows.map((row) => {
    const email = cleanEmail(row.email);
    const problems = [];
    const warnings = [];
    let status = "new";
    const found = email ? byEmail.get(email) : null;

    if (!row.name && !email) { status = "skip"; problems.push("Empty row."); }
    else if (!email) {
      status = "skip";
      warnings.push("No work email, so no login is created. Add an email to include them.");
    } else if (!EMAIL.test(email)) {
      status = "error";
      problems.push(`"${row.email.trim()}" isn't a valid email address.`);
    } else if (seenEmail.has(email)) {
      status = "error";
      problems.push(`The same email appears on line ${seenEmail.get(email)} already.`);
    } else if (found) {
      status = "existing";
    }
    if (email && !seenEmail.has(email)) seenEmail.set(email, row.line);

    // A "new" person who has the same name as someone already in Primovex under a
    // different email is probably a duplicate: say so before a second account is made.
    if (status === "new") {
      const wanted = [norm(row.name), norm(displayNameFor(row.name, email))].filter(Boolean);
      const twin = existing.find((u) => u.email && wanted.includes(norm(u.displayName)));
      if (twin) warnings.push(`Primovex already has an account called "${twin.displayName}" (${twin.email}). If that is the same person, fix the email here, or they will get a second account.`);
    }

    const role = row.role.trim();
    if (status === "new") {
      if (!role) problems.push("No role chosen.");
      else if (!roleSet.has(role)) problems.push(`The role "${role}" doesn't exist. Add it under Roles & Permissions, or change the role.`);
    }
    if (status === "new" && problems.length) status = "error";
    if (status === "existing" && role && found.role && found.role !== role) {
      warnings.push(`Already has the role "${found.role}". The file says "${role}"; the role is left as it is.`);
    }

    const department = row.department.trim();
    if (department && !deptSet.has(norm(department)) && !newDepartments.some((d) => norm(d) === norm(department))) newDepartments.push(department);

    if (status === "error" || status === "skip") {
      return { ...row, email, displayName: displayNameFor(row.name, email), status, problems, warnings, key: `row${row.line}` };
    }
    return {
      ...row,
      email,
      role: status === "existing" ? found.role || role : role,
      displayName: status === "existing" ? found.displayName || displayNameFor(row.name, email) : String(row.displayNameOverride || "").trim() || displayNameFor(row.name, email),
      uid: found?.id || null,
      status,
      problems,
      warnings,
      department,
      key: `row${row.line}`,
    };
  });

  // Who each person reports to: people in the file, or already in the system.
  const people = [
    ...planned.filter((p) => p.status === "new" || p.status === "existing").map((p) => ({ key: p.key, name: p.name, displayName: p.displayName })),
    ...existing.filter((u) => !planned.some((p) => p.uid === u.id)).map((u) => ({ key: `uid:${u.id}`, name: u.displayName, displayName: u.displayName })),
  ];
  const index = nameIndex(people);
  planned.forEach((p) => {
    p.managerKey = null;
    const wanted = p.reportsTo.trim();
    if (!wanted || p.status === "error" || p.status === "skip") return;
    const hits = new Set([...(index.get(norm(wanted)) || []), ...(index.get(withoutTitle(wanted)) || [])]);
    hits.delete(p.key);
    if (hits.size === 1) p.managerKey = [...hits][0];
    else if (hits.size === 0) p.warnings.push(`"${wanted}" isn't someone being added or already in Primovex, so they are left at the top of the chart.`);
    else p.warnings.push(`"${wanted}" matches more than one person, so they are left at the top of the chart.`);
  });

  // A reporting loop (A reports to B, B reports to A) is dropped, not created.
  const managerOf = new Map(planned.filter((p) => p.managerKey).map((p) => [p.key, p.managerKey]));
  planned.forEach((p) => {
    if (!p.managerKey) return;
    const seen = new Set([p.key]);
    for (let next = managerOf.get(p.key); next; next = managerOf.get(next)) {
      if (seen.has(next)) { p.managerKey = null; p.warnings.push("Their reporting line would loop back to themselves, so it is left out."); break; }
      seen.add(next);
    }
  });

  const count = (status) => planned.filter((p) => p.status === status).length;
  return {
    rows: planned,
    newDepartments,
    summary: { newAccounts: count("new"), existing: count("existing"), skipped: count("skip"), errors: count("error"), total: planned.length },
  };
}

// The role names that can be assigned: the built-in ones and the practice's own.
export const assignableRoles = (builtIn = [], custom = []) => [...new Set([...builtIn, ...custom.filter((r) => r && r.active !== false).map((r) => r.name)])];

// ---- doing it ---------------------------------------------------------------------

// Carries out a plan. The things it does are passed in, so it can be tested and so
// the screen decides what is real. It never sends an email, and it does not keep the
// sign-in link the account function returns.
//   addDepartment(name)             -> void
//   createAccount({displayName,email,role}) -> { uid }
//   setDepartment(uid, name)        -> void
//   setReportsTo(uid, [managerUid]) -> void
// Every step is recorded per person; one failure never stops the rest, and running
// the same file again skips accounts that now exist, so a half-finished import can
// simply be re-run.
export async function runImport(plan, deps, { onProgress = () => {}, concurrency = 3 } = {}) {
  const results = new Map(plan.rows.map((p) => [p.key, { key: p.key, name: p.displayName, status: p.status, created: false, steps: [], failed: false }]));
  const uidOf = new Map(plan.rows.filter((p) => p.uid).map((p) => [p.key, p.uid]));
  const created = plan.rows.filter((p) => p.status === "new").length;
  const total = plan.newDepartments.length + created + plan.rows.filter((p) => p.status === "new" || p.status === "existing").length;
  let done = 0;
  const tick = () => { done += 1; onProgress({ done: Math.min(done, total), total }); };
  const fail = (key, step, error) => { const r = results.get(key); r.failed = true; r.steps.push({ step, error: error?.message || String(error) }); };

  const pool = async (items, work) => {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) { const item = items[next]; next += 1; await work(item); }
    }));
  };

  const departmentFailures = [];
  for (const name of plan.newDepartments) {
    try { await deps.addDepartment(name); } catch (error) { departmentFailures.push({ name, error: error?.message || String(error) }); }
    tick();
  }

  // 1. accounts
  await pool(plan.rows.filter((p) => p.status === "new"), async (p) => {
    try {
      const made = await deps.createAccount({ displayName: p.displayName, email: p.email, role: p.role });
      if (!made?.uid) throw new Error("The account was created but no id came back.");
      uidOf.set(p.key, made.uid);
      results.get(p.key).created = true;
    } catch (error) { fail(p.key, "Create account", error); }
    tick();
  });

  // 2. department and reporting line, once everyone has an id
  await pool(plan.rows.filter((p) => (p.status === "new" || p.status === "existing") && uidOf.has(p.key)), async (p) => {
    const uid = uidOf.get(p.key);
    if (p.department) {
      try { await deps.setDepartment(uid, p.department); } catch (error) { fail(p.key, "Set department", error); }
    }
    if (p.managerKey) {
      const managerUid = uidOf.get(p.managerKey) || (p.managerKey.startsWith("uid:") ? p.managerKey.slice(4) : null);
      if (managerUid) {
        try { await deps.setReportsTo(uid, [managerUid]); } catch (error) { fail(p.key, "Set reports to", error); }
      } else fail(p.key, "Set reports to", new Error("Their manager's account couldn't be created, so the reporting line wasn't set."));
    }
    tick();
  });

  return { results: [...results.values()], departmentFailures };
}
