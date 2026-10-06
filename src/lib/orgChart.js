// The organisation chart's maths and its print documents. Pure (no React, no
// Firestore), so it can be tested with a practice-sized staff list.

export const NO_DEPARTMENT = "No department";
// Beyond this many people the chart opens collapsed to the top two levels.
export const SMALL_PRACTICE = 25;

export const nameOf = (user) => String(user?.displayName || user?.email || "Unnamed").trim() || "Unnamed";
const byName = (a, b) => nameOf(a).localeCompare(nameOf(b), "en", { sensitivity: "base" });
// Highlighted people (e.g. a senior partner) first, then by name.
const byRank = (a, b) => Number(Boolean(b.orgHighlight)) - Number(Boolean(a.orgHighlight)) || byName(a, b);

export const departmentOf = (user) => String(user?.department || "").trim();

// reportsTo may be a single legacy string, a list, or missing entirely. Only
// managers that exist in the list are kept - a manager who left, or a stale or
// self-referencing value, is dropped rather than hiding the person.
export function managersOf(user, byId) {
  const raw = Array.isArray(user.reportsTo) ? user.reportsTo : user.reportsTo ? [user.reportsTo] : [];
  return [...new Set(raw)].filter((id) => id && id !== user.id && byId.has(id));
}

// manager -> direct reports (sorted), and the people at the top. Someone with
// more than one manager appears under each of them.
export function buildTree(users) {
  const byId = new Map(users.map((u) => [u.id, u]));
  const childrenOf = new Map();
  const roots = [];
  for (const user of users) {
    const managers = managersOf(user, byId);
    if (managers.length === 0) { roots.push(user); continue; }
    for (const managerId of managers) {
      if (!childrenOf.has(managerId)) childrenOf.set(managerId, []);
      childrenOf.get(managerId).push(user);
    }
  }
  for (const list of childrenOf.values()) list.sort(byRank);
  roots.sort(byRank);
  return { byId, childrenOf, roots };
}

// Everyone below this person by any path. Stops the "reports to" picker letting
// someone be placed under their own subordinate (a loop); the visited set guards
// against a loop already in the data.
export function collectDescendants(uid, childrenOf, acc = new Set(), visited = new Set()) {
  if (visited.has(uid)) return acc;
  visited.add(uid);
  for (const child of childrenOf.get(uid) || []) {
    if (!acc.has(child.id)) {
      acc.add(child.id);
      collectDescendants(child.id, childrenOf, acc, visited);
    }
  }
  return acc;
}

// ---- departments --------------------------------------------------------------

// The departments to offer and group by: the practice's configured, active ones in
// their order, then any department a person already has that isn't configured (so
// nobody silently loses theirs), then "No department" if anyone has none. Each with
// its head count.
export function departmentSummary(users, configured = []) {
  const counts = new Map();
  let none = 0;
  users.forEach((u) => {
    const dept = departmentOf(u);
    if (!dept) none += 1;
    else counts.set(dept, (counts.get(dept) || 0) + 1);
  });
  const names = configured.filter((d) => d && d.active !== false && d.name).map((d) => String(d.name).trim());
  const ordered = [...new Set(names)];
  [...counts.keys()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })).forEach((dept) => { if (!ordered.includes(dept)) ordered.push(dept); });
  const rows = ordered.map((name) => ({ name, count: counts.get(name) || 0, configured: names.includes(name) }));
  if (none) rows.push({ name: NO_DEPARTMENT, count: none, configured: false });
  return rows;
}

// The people in one department ("" = everyone). Anyone whose manager is in
// another department becomes the top of their own branch here; `outsideManagers`
// says who they report to outside it.
export function usersInDepartment(users, department) {
  if (!department) return users;
  if (department === NO_DEPARTMENT) return users.filter((u) => !departmentOf(u));
  return users.filter((u) => departmentOf(u) === department);
}

export function outsideManagers(user, allById, shownIds) {
  return managersOf(user, allById).filter((id) => !shownIds.has(id)).map((id) => nameOf(allById.get(id)));
}

// ---- big teams ------------------------------------------------------------------

// A manager with this many direct reports, none of whom manage anyone, has them
// hang down in one column under the manager (like a list on a branch) instead of
// one very wide row: 20 receptionists in a row is 3,000+ pixels, in a column it is
// a narrow strip. Anyone with reports of their own keeps the normal tree.
export const LEAF_GROUP_MIN = 5;
export function isLeafGroup(kids, childrenOf) {
  return kids.length >= LEAF_GROUP_MIN && !kids.some((kid) => (childrenOf.get(kid.id) || []).length > 0);
}

// Beside managers who have teams of their own, three or more people with no reports
// are gathered into one stack (a box of cards) instead of each taking a column.
export const STACK_MIN = 3;
export function splitKids(kids, childrenOf) {
  const leaves = kids.filter((kid) => (childrenOf.get(kid.id) || []).length === 0);
  const branches = kids.filter((kid) => (childrenOf.get(kid.id) || []).length > 0);
  return { leaves, branches, stacked: branches.length > 0 && leaves.length >= STACK_MIN };
}

// ---- collapsing ---------------------------------------------------------------

export const descendantCount = (id, childrenOf) => collectDescendants(id, childrenOf).size;

// Which people start expanded. A small practice opens fully; a large one opens
// to the top two levels, so a 60-person chart is readable before anyone clicks.
export function defaultExpanded(roots, childrenOf, staffCount) {
  const open = new Set();
  const visit = (user, depth, seen) => {
    if (seen.has(user.id)) return;
    const next = new Set(seen).add(user.id);
    if ((childrenOf.get(user.id) || []).length && (staffCount <= SMALL_PRACTICE || depth < 1)) open.add(user.id);
    (childrenOf.get(user.id) || []).forEach((child) => visit(child, depth + 1, next));
  };
  roots.forEach((root) => visit(root, 0, new Set()));
  return open;
}

// Everything that has people below it (for "Expand all").
export function allWithReports(childrenOf) {
  return new Set([...childrenOf.entries()].filter(([, list]) => list.length).map(([id]) => id));
}

// People matching a search, and the managers above them (who must be expanded
// for the match to be visible).
export function searchPath(users, term) {
  const needle = String(term || "").trim().toLowerCase();
  if (!needle) return { matches: new Set(), open: new Set() };
  const { byId } = buildTree(users);
  const matches = new Set(users.filter((u) => `${nameOf(u)} ${u.role || ""} ${departmentOf(u)}`.toLowerCase().includes(needle)).map((u) => u.id));
  const open = new Set();
  const climb = (id, seen) => {
    if (seen.has(id)) return;
    seen.add(id);
    managersOf(byId.get(id), byId).forEach((managerId) => { open.add(managerId); climb(managerId, seen); });
  };
  matches.forEach((id) => climb(id, new Set()));
  return { matches, open };
}

// ---- printing -----------------------------------------------------------------

export const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const PRINT_CSS = `
@page { size: PAPER landscape; margin: 10mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; }
.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }
h1 { font-size: 18px; margin: 0; }
h2 { font-size: 15px; margin: 0; }
.meta { color: #475569; font-size: 11px; margin: 2px 0 10px; }
.note { color: #92400e; font-size: 11px; margin: 0 0 8px; }
.fit { display: table; margin: 0 auto; }
.tree, .tree ul { list-style: none; margin: 0; padding: 0; display: flex; justify-content: center; }
.tree ul { padding-top: 22px; position: relative; }
.tree ul::before { content: ""; position: absolute; top: 0; left: 50%; height: 11px; border-left: 1.5px solid #64748b; }
.tree li { position: relative; display: flex; flex-direction: column; align-items: center; padding: 22px 6px 0; }
.tree > li { padding-top: 0; }
.tree li::before, .tree li::after { content: ""; position: absolute; top: 11px; width: 50%; height: 11px; border-top: 1.5px solid #64748b; }
.tree li::before { right: 50%; }
.tree li::after { left: 50%; border-left: 1.5px solid #64748b; }
.tree > li::before, .tree > li::after, .tree li:only-child::before, .tree li:only-child::after { display: none; }
.tree li:only-child { padding-top: 0; }
.tree li:first-child::before, .tree li:last-child::after { border-top: none; }
.tree li:last-child::before { border-right: 1.5px solid #64748b; }
.hang { position: relative; width: 150px; padding-top: 12px; }
.hang::before { content: ""; position: absolute; top: 0; left: 16px; height: 12px; border-left: 1.5px solid #64748b; }
.hang-item { position: relative; padding: 3px 0 3px 32px; }
.hang-item::before { content: ""; position: absolute; left: 16px; top: 0; bottom: 0; border-left: 1.5px solid #64748b; }
.hang-item:last-child::before { bottom: 50%; }
.hang-item::after { content: ""; position: absolute; left: 16px; top: 50%; width: 16px; border-top: 1.5px solid #64748b; }
.hang-item .node { width: 118px; }
.stack { border: 1.5px dashed #94a3b8; border-radius: 10px; padding: 6px; display: flex; flex-direction: column; gap: 5px; align-items: center; }
.node { border: 1px solid #94a3b8; border-radius: 8px; padding: 5px 8px; text-align: center; width: 150px; background: #fff; }
.node.hl { border-color: #d97706; background: #fffbeb; }
.node b { display: block; font-size: 11px; }
.node span { display: block; font-size: 9.5px; color: #475569; }
.node i { display: block; font-size: 8.5px; color: #64748b; margin-top: 2px; }
table { border-collapse: collapse; width: 100%; font-size: 11px; }
th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #f1f5f9; }
`;

const card = (user, others, outside) => `<div class="node${user.orgHighlight ? " hl" : ""}"><b>${escapeHtml(nameOf(user))}</b><span>${escapeHtml(user.role || "No role")}</span>`
  + (others.length ? `<i>Also reports to: ${escapeHtml(others.join(", "))}</i>` : "")
  + (outside.length ? `<i>Reports to ${escapeHtml(outside.join(", "))}</i>` : "")
  + "</div>";

// The same box-and-line tree as on screen, as static HTML.
export function treeHtml(users, allUsers = users) {
  const { byId, childrenOf, roots } = buildTree(users);
  const allById = new Map(allUsers.map((u) => [u.id, u]));
  const shown = new Set(users.map((u) => u.id));
  const node = (user, parentId, ancestors) => {
    const others = managersOf(user, byId).filter((id) => id !== parentId).map((id) => nameOf(byId.get(id)));
    const outside = parentId === null ? outsideManagers(user, allById, shown) : [];
    const kids = (childrenOf.get(user.id) || []).filter((k) => !ancestors.has(k.id));
    const next = new Set(ancestors).add(user.id);
    const hang = isLeafGroup(kids, childrenOf);
    const { leaves, branches, stacked } = splitKids(kids, childrenOf);
    const kidCard = (k) => card(k, managersOf(k, byId).filter((id) => id !== user.id).map((id) => nameOf(byId.get(id))), []);
    const row = stacked
      ? [...branches.map((k) => node(k, user.id, next)), `<li><div class="stack">${leaves.map(kidCard).join("")}</div></li>`]
      : kids.map((k) => node(k, user.id, next));
    return `<li>${card(user, others, outside)}`
      + (hang
        ? `<div class="hang">${kids.map((k) => `<div class="hang-item">${kidCard(k)}</div>`).join("")}</div>`
        : kids.length ? `<ul>${row.join("")}</ul>` : "")
      + "</li>";
  };
  return `<ul class="tree">${roots.map((r) => node(r, null, new Set())).join("")}</ul>`;
}

// Paper in CSS pixels (portrait). A chart is shrunk only if it has to be, and the
// document is printed portrait or landscape - whichever lets the chart stay larger.
export const PAPER = { A4: { width: 794, height: 1123 }, A3: { width: 1123, height: 1587 } };

const fitScript = (paper) => `<script>
(function () {
  var PW = ${paper.width}, PH = ${paper.height}, MARGIN = 76, HEADING = 90;
  var fits = [].slice.call(document.querySelectorAll(".fit"));
  if (!fits.length) return;
  var sizes = fits.map(function (el) { return { w: el.offsetWidth, h: el.offsetHeight }; });
  function usable(o) { return o === "portrait" ? { w: PW - MARGIN, h: PH - MARGIN - HEADING } : { w: PH - MARGIN, h: PW - MARGIN - HEADING }; }
  function worst(o) {
    var u = usable(o);
    return Math.min.apply(null, sizes.map(function (s) { return Math.min(1, u.w / s.w, u.h / s.h); }));
  }
  var orient = worst("portrait") > worst("landscape") ? "portrait" : "landscape";
  var u = usable(orient);
  fits.forEach(function (el, i) {
    var s = Math.min(1, u.w / sizes[i].w, u.h / sizes[i].h);
    if (s < 1) el.style.zoom = String(s);
  });
  var style = document.createElement("style");
  style.textContent = "@page { size: ${paper.name} " + orient + "; margin: 10mm; }";
  document.head.appendChild(style);
})();
</script>`;

function documentHtml({ title, body, paper = "A4" }) {
  const size = PAPER[paper] ? paper : "A4";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_CSS.replace("PAPER", size)}</style></head><body>${body}${fitScript({ ...PAPER[size], name: size })}</body></html>`;
}

const when = (now) => now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function pageHtml({ heading, meta, note = "", body }) {
  return `<section class="page"><h1>${escapeHtml(heading)}</h1><p class="meta">${escapeHtml(meta)}</p>${note ? `<p class="note">${escapeHtml(note)}</p>` : ""}<div class="fit">${body}</div></section>`;
}

const people = (n) => `${n} ${n === 1 ? "person" : "people"}`;

// One chart: everyone, or one department.
export function chartPrintHtml({ users, department = "", practiceName = "Practice", now = new Date(), paper = "A4" }) {
  const shown = usersInDepartment(users, department);
  const heading = department ? `${practiceName} - ${department}` : `${practiceName} - organisation chart`;
  const note = !department && shown.length > SMALL_PRACTICE ? `${people(shown.length)}: this is scaled to fit one page. For a larger print choose A3, or print each department on its own page.` : "";
  return documentHtml({
    title: heading,
    paper,
    body: pageHtml({ heading, meta: `${people(shown.length)} - printed ${when(now)}`, note, body: treeHtml(shown, users) }),
  });
}

// One page per department, each its own chart.
export function departmentPagesPrintHtml({ users, departments = [], practiceName = "Practice", now = new Date(), paper = "A4" }) {
  const pages = departmentSummary(users, departments)
    .filter((d) => d.count > 0)
    .map((d) => {
      const members = usersInDepartment(users, d.name);
      return pageHtml({ heading: `${practiceName} - ${d.name}`, meta: `${people(members.length)} - printed ${when(now)}`, body: treeHtml(members, users) });
    });
  return documentHtml({ title: `${practiceName} - departments`, paper, body: pages.join("") || "<p>No staff to print.</p>" });
}

// A plain staff list grouped by department: who, role, who they report to.
export function staffListPrintHtml({ users, departments = [], practiceName = "Practice", now = new Date() }) {
  const byId = new Map(users.map((u) => [u.id, u]));
  const sections = departmentSummary(users, departments)
    .filter((d) => d.count > 0)
    .map((d) => {
      const rows = usersInDepartment(users, d.name).slice().sort(byName).map((u) => {
        const bosses = managersOf(u, byId).map((id) => nameOf(byId.get(id))).join(", ");
        return `<tr><td>${escapeHtml(nameOf(u))}</td><td>${escapeHtml(u.role || "No role")}</td><td>${escapeHtml(bosses || "-")}</td></tr>`;
      }).join("");
      return `<h2 style="margin-top:14px">${escapeHtml(d.name)} (${d.count})</h2><table><thead><tr><th>Name</th><th>Role</th><th>Reports to</th></tr></thead><tbody>${rows}</tbody></table>`;
    });
  const heading = `${practiceName} - staff by department`;
  return documentHtml({
    title: heading,
    body: `<section><h1>${escapeHtml(heading)}</h1><p class="meta">${people(users.length)} - printed ${when(now)}</p>${sections.join("")}</section>`,
  });
}
