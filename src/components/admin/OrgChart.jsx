import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Printer, Search, X } from "lucide-react";
import { printHtmlDocument } from "@/lib/printHtmlDocument";
import {
  NO_DEPARTMENT,
  SMALL_PRACTICE,
  allWithReports,
  buildTree,
  chartPrintHtml,
  collectDescendants,
  defaultExpanded,
  departmentOf,
  departmentPagesPrintHtml,
  departmentSummary,
  descendantCount,
  leafColumns,
  managersOf,
  nameOf,
  outsideManagers,
  searchPath,
  staffListPrintHtml,
  usersInDepartment,
} from "@/lib/orgChart";
import "./OrgChart.css";

const ZOOMS = [
  { id: 1, label: "100%" },
  { id: 0.75, label: "75%" },
  { id: 0.5, label: "50%" },
];

// ---- editing one person (their department, who they report to, highlight) -------

function PersonEditor({ user, users, byId, childrenOf, departments, busy, onChangeManager, onChangeDepartment, onToggleHighlight, onClose }) {
  const [filter, setFilter] = useState("");
  const current = useMemo(() => new Set(managersOf(user, byId)), [user, byId]);
  // Nobody can be placed under their own subordinate (that would be a loop).
  const blocked = useMemo(() => {
    const set = collectDescendants(user.id, childrenOf);
    set.add(user.id);
    return set;
  }, [user.id, childrenOf]);
  const candidates = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return users
      .filter((c) => !blocked.has(c.id) && (!needle || `${nameOf(c)} ${c.role || ""}`.toLowerCase().includes(needle)))
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b), "en", { sensitivity: "base" }));
  }, [users, blocked, filter]);
  const deptNames = departmentSummary(users, departments).filter((d) => d.name !== NO_DEPARTMENT).map((d) => d.name);
  const dept = departmentOf(user);

  const toggle = (id, checked) => {
    const next = new Set(current);
    if (checked) next.add(id); else next.delete(id);
    onChangeManager(user.id, [...next]);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Edit ${nameOf(user)}`}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 mt-text-primary" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">{nameOf(user)}</h3>
            <p className="text-sm mt-text-secondary">{user.role || "No role"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg border border-slate-700 p-1.5"><X className="h-4 w-4" /></button>
        </div>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide mt-text-secondary">Department
          <select
            value={dept}
            disabled={busy}
            onChange={(event) => onChangeDepartment(user.id, event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm normal-case mt-text-primary"
          >
            <option value="">{NO_DEPARTMENT}</option>
            {deptNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          {deptNames.length === 0 && <span className="mt-1 block text-[11px] normal-case font-normal">Add departments above first, then pick one here.</span>}
        </label>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide mt-text-secondary">Reports to {current.size > 0 && `(${current.size})`}</p>
          <p className="text-[11px] mt-text-secondary">Tick more than one if they genuinely report to several people. Leave all unticked to put them at the top.</p>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Find a manager…"
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
          <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-1.5">
            {candidates.length === 0 ? <p className="px-1 py-1 text-xs mt-text-secondary">Nobody matches.</p> : candidates.map((c) => (
              <label key={c.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_14%,transparent)]">
                <input type="checkbox" checked={current.has(c.id)} disabled={busy} onChange={(event) => toggle(c.id, event.target.checked)} />
                <span className="min-w-0 flex-1 truncate">{nameOf(c)}</span>
                <span className="shrink-0 text-[11px] mt-text-secondary">{c.role || ""}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm mt-text-secondary">
          <input type="checkbox" checked={!!user.orgHighlight} disabled={busy} onChange={(event) => onToggleHighlight(user.id, event.target.checked)} />
          Highlight (e.g. senior partner)
        </label>
        <button type="button" onClick={onClose} className="mt-5 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white">Done</button>
      </div>
    </div>
  );
}

// ---- the chart ------------------------------------------------------------------

// The box for one person (used for a manager in the tree and for each person in a
// grid of a big team).
function PersonCard({ user, parentId, ctx, children = null }) {
  const { byId, matches, canManage, onEdit, showDept, allById, shownIds } = ctx;
  const others = managersOf(user, byId).filter((id) => id !== parentId).map((id) => nameOf(byId.get(id)));
  const outside = parentId === null ? outsideManagers(user, allById, shownIds) : [];
  const dept = departmentOf(user);
  return (
    <div className={`min-w-[140px] max-w-[190px] rounded-xl border px-2.5 py-2 text-center ${user.orgHighlight ? "border-amber-400/60 bg-amber-400/10" : "mt-card-strong"} ${matches.has(user.id) ? "ring-2 ring-sky-400" : ""}`}>
      {canManage ? (
        <button type="button" onClick={() => onEdit(user.id)} className="block w-full text-center" title="Change department or who they report to">
          <span className="block text-sm font-bold mt-text-primary">{nameOf(user)}</span>
          <span className="block text-xs mt-text-secondary">{user.role || "No role"}</span>
        </button>
      ) : (
        <>
          <div className="text-sm font-bold mt-text-primary">{nameOf(user)}</div>
          <div className="text-xs mt-text-secondary">{user.role || "No role"}</div>
        </>
      )}
      {showDept && <div className="mt-0.5 text-[10px] uppercase tracking-wide mt-text-secondary">{dept || NO_DEPARTMENT}</div>}
      {others.length > 0 && <div className="mt-1 text-[10px] italic mt-text-secondary">Also reports to: {others.join(", ")}</div>}
      {outside.length > 0 && <div className="mt-1 text-[10px] italic mt-text-secondary">Reports to {outside.join(", ")}</div>}
      {children}
    </div>
  );
}

function OrgNode({ user, parentId, ancestors, ctx }) {
  const { childrenOf, expanded, toggle } = ctx;
  const kids = (childrenOf.get(user.id) || []).filter((k) => !ancestors.has(k.id));
  const isOpen = kids.length > 0 && expanded.has(user.id);
  const nextAncestors = useMemo(() => new Set([...ancestors, user.id]), [ancestors, user.id]);
  const columns = leafColumns(kids, childrenOf);

  return (
    <li>
      <div className="org-node">
        <PersonCard user={user} parentId={parentId} ctx={ctx}>
          {kids.length > 0 && (
            <button
              type="button"
              onClick={() => toggle(user.id)}
              aria-expanded={isOpen}
              className="mx-auto mt-1.5 flex items-center gap-1 rounded-full border border-slate-600 px-2 py-0.5 text-[11px] mt-text-secondary hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_14%,transparent)]"
              title={isOpen ? "Hide this team" : "Show this team"}
            >
              {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {kids.length} direct{descendantCount(user.id, childrenOf) > kids.length ? ` · ${descendantCount(user.id, childrenOf)} in team` : ""}
            </button>
          )}
        </PersonCard>
      </div>
      {isOpen && (columns ? (
        <div className="org-leaves" style={{ gridTemplateColumns: `repeat(${columns}, auto)` }}>
          {kids.map((child) => <PersonCard key={child.id} user={child} parentId={user.id} ctx={ctx} />)}
        </div>
      ) : (
        <ul>
          {kids.map((child) => <OrgNode key={`${user.id}>${child.id}`} user={child} parentId={user.id} ancestors={nextAncestors} ctx={ctx} />)}
        </ul>
      ))}
    </li>
  );
}

// ---- by department ---------------------------------------------------------------

function DepartmentView({ users, departments, byId, matches, canManage, onEdit }) {
  const groups = departmentSummary(users, departments).filter((d) => d.count > 0);
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => {
        const members = usersInDepartment(users, group.name).slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b), "en", { sensitivity: "base" }));
        return (
          <section key={group.name} className="rounded-xl mt-card-strong border p-3">
            <h4 className="flex items-center justify-between font-bold mt-text-primary">{group.name}<span className="rounded-full border border-slate-600 px-2 text-xs mt-text-secondary">{group.count}</span></h4>
            <ul className="mt-2 divide-y divide-slate-800">
              {members.map((member) => {
                const bosses = managersOf(member, byId).map((id) => nameOf(byId.get(id))).join(", ");
                const body = (
                  <>
                    <span className="block text-sm font-semibold mt-text-primary">{nameOf(member)}{member.orgHighlight ? " ★" : ""}</span>
                    <span className="block text-xs mt-text-secondary">{member.role || "No role"}{bosses ? ` · reports to ${bosses}` : ""}</span>
                  </>
                );
                return (
                  <li key={member.id} className={`py-1.5 ${matches.has(member.id) ? "rounded bg-sky-500/10" : ""}`}>
                    {canManage ? <button type="button" onClick={() => onEdit(member.id)} className="block w-full text-left">{body}</button> : body}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// Named-staff organisation chart for Practice Administration > Departments.
// Reads/writes each person's reportsTo (manager ids), department and highlight.
// Built for a whole practice: a large chart opens collapsed to the top two levels,
// each team can be opened or closed, the chart can be cut down to one department
// or shown grouped by department, and it prints as a chart, one page per
// department, or a staff list. Editing happens in a panel (not inside every box),
// so the chart stays compact however many people there are. Only meaningful for
// whoever can already see the full users list (admin.manageUsers).
export default function OrgChart({ users, departments = [], practiceName = "Practice", canManage, onChangeManager, onChangeDepartment, onToggleHighlight, busy }) {
  const active = useMemo(() => users.filter((u) => u.active !== false), [users]);
  const [view, setView] = useState("chart");
  const [department, setDepartment] = useState("");
  const [zoom, setZoom] = useState(1);
  const [paper, setPaper] = useState("A4");
  const [term, setTerm] = useState("");
  const [editingId, setEditingId] = useState(null);

  const everyone = useMemo(() => buildTree(active), [active]);
  const summary = useMemo(() => departmentSummary(active, departments), [active, departments]);
  const scoped = useMemo(() => usersInDepartment(active, department), [active, department]);
  const { byId, childrenOf, roots } = useMemo(() => buildTree(scoped), [scoped]);
  const shownIds = useMemo(() => new Set(scoped.map((u) => u.id)), [scoped]);
  const { matches, open: searchOpen } = useMemo(() => searchPath(scoped, term), [scoped, term]);

  const [expanded, setExpanded] = useState(() => defaultExpanded(roots, childrenOf, scoped.length));
  // Start again from the sensible default whenever the people shown change (a
  // different department, or staff added or removed).
  const signature = `${department}|${scoped.map((u) => u.id).join(",")}`;
  useEffect(() => { setExpanded(defaultExpanded(roots, childrenOf, scoped.length)); }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleExpanded = useMemo(() => new Set([...expanded, ...searchOpen]), [expanded, searchOpen]);
  const toggle = (id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  if (active.length === 0) return <p className="text-sm mt-text-secondary">No staff to show yet.</p>;

  const editing = editingId ? active.find((u) => u.id === editingId) : null;
  const ctx = { childrenOf, byId, expanded: visibleExpanded, toggle, matches, canManage, onEdit: setEditingId, showDept: !department, allById: everyone.byId, shownIds };
  const scopeLabel = department || "everyone";

  const print = (kind) => {
    const common = { users: active, practiceName, now: new Date(), paper };
    if (kind === "chart") printHtmlDocument(chartPrintHtml({ ...common, department }));
    else if (kind === "departments") printHtmlDocument(departmentPagesPrintHtml({ ...common, departments }));
    else printHtmlDocument(staffListPrintHtml({ ...common, departments }));
  };

  const btn = "rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-semibold mt-text-primary hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_14%,transparent)]";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-700 text-xs font-semibold">
          {[["chart", "Chart"], ["departments", "By department"]].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setView(id)} className={`px-3 py-1.5 ${view === id ? "bg-sky-600 text-white" : "mt-text-secondary"}`}>{label}</button>
          ))}
        </div>

        {view === "chart" && (
          <select value={department} onChange={(event) => setDepartment(event.target.value)} aria-label="Show department" className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs mt-text-primary">
            <option value="">All staff ({active.length})</option>
            {summary.map((d) => <option key={d.name} value={d.name}>{d.name} ({d.count})</option>)}
          </select>
        )}

        <label className="flex min-w-[10rem] flex-1 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs">
          <Search className="h-3.5 w-3.5 mt-text-secondary" />
          <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Find a person, role or department…" className="min-w-0 flex-1 bg-transparent py-0.5 outline-none" />
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {view === "chart" && (
          <>
            <button type="button" className={btn} onClick={() => setExpanded(allWithReports(childrenOf))}>Expand all</button>
            <button type="button" className={btn} onClick={() => setExpanded(new Set())}>Collapse all</button>
            <label className="flex items-center gap-1 text-xs mt-text-secondary">Size
              <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs mt-text-primary">
                {ZOOMS.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
              </select>
            </label>
          </>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <Printer className="h-4 w-4 mt-text-secondary" aria-hidden="true" />
          <label className="flex items-center gap-1 text-xs mt-text-secondary">Paper
            <select value={paper} onChange={(event) => setPaper(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs mt-text-primary">
              <option value="A4">A4</option>
              <option value="A3">A3 (large chart)</option>
            </select>
          </label>
          {view === "chart" && <button type="button" className={btn} onClick={() => print("chart")}>Print {department ? department : "chart"}</button>}
          <button type="button" className={btn} onClick={() => print("departments")}>Print each department</button>
          <button type="button" className={btn} onClick={() => print("list")}>Print staff list</button>
        </span>
      </div>

      {active.length > SMALL_PRACTICE && view === "chart" && !department && (
        <p className="mb-3 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs">
          {active.length} people, so teams start closed below the top two levels. Open a team with its button, pick a department above to see just that team, or use the department print for one page each.
        </p>
      )}
      {term.trim() && <p className="mb-2 text-xs mt-text-secondary">{matches.size} {matches.size === 1 ? "match" : "matches"} for “{term.trim()}” in {scopeLabel}{matches.size > 0 && view === "chart" ? " (highlighted in the chart)" : ""}.</p>}

      {view === "chart" ? (
        scoped.length === 0 ? <p className="text-sm mt-text-secondary">Nobody is in {department} yet.</p> : (
          <div className="overflow-x-auto pb-4">
            <div style={{ zoom }}>
              <ul className="org-tree">
                {roots.map((root) => <OrgNode key={root.id} user={root} parentId={null} ancestors={new Set()} ctx={ctx} />)}
              </ul>
            </div>
          </div>
        )
      ) : (
        <DepartmentView users={active} departments={departments} byId={everyone.byId} matches={matches} canManage={canManage} onEdit={setEditingId} />
      )}

      {editing && (
        <PersonEditor
          user={editing}
          users={active}
          byId={everyone.byId}
          childrenOf={everyone.childrenOf}
          departments={departments}
          busy={busy}
          onChangeManager={onChangeManager}
          onChangeDepartment={onChangeDepartment}
          onToggleHighlight={onToggleHighlight}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
