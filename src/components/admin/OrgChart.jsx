import { useMemo } from "react";
import "./OrgChart.css";

// reportsTo may be a single legacy string, a list, or missing entirely.
// Always work with a clean list of manager ids that actually exist in the
// (active) users list - a manager who left, or a stale/self-referencing
// value, is dropped rather than silently hiding the person.
function managersOf(user, byId) {
  const raw = Array.isArray(user.reportsTo) ? user.reportsTo : user.reportsTo ? [user.reportsTo] : [];
  return [...new Set(raw)].filter((id) => id && id !== user.id && byId.has(id));
}

// Builds manager -> direct-reports. A person with more than one manager is
// added under each of them - see the "also reports to" note in OrgNode for
// how that's shown without it reading as two different people.
function buildTree(users) {
  const byId = new Map(users.map((u) => [u.id, u]));
  const childrenOf = new Map();
  const roots = [];

  for (const user of users) {
    const managers = managersOf(user, byId);
    if (managers.length === 0) {
      roots.push(user);
      continue;
    }
    for (const managerId of managers) {
      if (!childrenOf.has(managerId)) childrenOf.set(managerId, []);
      childrenOf.get(managerId).push(user);
    }
  }
  return { byId, childrenOf, roots };
}

// Everyone reachable below this person, by any path - used to stop the
// "reports to" picker from letting someone be assigned under their own
// subordinate, which would otherwise describe a loop. Visited-set guards
// against a loop that already exists in the data.
function collectDescendants(uid, childrenOf, acc = new Set(), visited = new Set()) {
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

function ManagerPicker({ user, users, blocked, busy, onChangeManager }) {
  const current = new Set(managersOf(user, new Map(users.map((u) => [u.id, u]))));
  const candidates = users.filter((candidate) => !blocked.has(candidate.id));

  const toggle = (candidateId, checked) => {
    const next = new Set(current);
    if (checked) next.add(candidateId);
    else next.delete(candidateId);
    onChangeManager(user.id, [...next]);
  };

  return (
    <div className="mt-2 max-h-28 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-left">
      {candidates.length === 0 ? (
        <p className="px-1 text-[11px] mt-text-secondary">No valid managers to pick from.</p>
      ) : (
        candidates.map((candidate) => (
          <label key={candidate.id} className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[11px] mt-text-primary">
            <input
              type="checkbox"
              checked={current.has(candidate.id)}
              disabled={busy}
              onChange={(e) => toggle(candidate.id, e.target.checked)}
            />
            {candidate.displayName || candidate.email}
          </label>
        ))
      )}
    </div>
  );
}

function OrgNode({ user, parentId, childrenOf, users, byId, canManage, onChangeManager, onToggleHighlight, busy, ancestors }) {
  const kids = childrenOf.get(user.id) || [];
  // Defensive only: buildTree already keeps managers acyclic against the
  // whole list via the picker's own "blocked" filter, this also stops a
  // branch re-including its own ancestor if bad data ever gets through.
  const safeKids = kids.filter((k) => !ancestors.has(k.id));
  const blocked = useMemo(() => {
    const s = collectDescendants(user.id, childrenOf);
    s.add(user.id);
    return s;
  }, [user.id, childrenOf]);
  const nextAncestors = useMemo(() => new Set([...ancestors, user.id]), [ancestors, user.id]);

  const managers = managersOf(user, byId);
  const otherManagerNames = managers
    .filter((id) => id !== parentId)
    .map((id) => byId.get(id)?.displayName || byId.get(id)?.email)
    .filter(Boolean);

  return (
    <li>
      <div className="org-node">
        <div
          className={`min-w-[150px] rounded-xl border px-3 py-2 text-center ${
            user.orgHighlight ? "border-amber-400/60 bg-amber-400/10" : "mt-card-strong"
          }`}
        >
          <div className="text-sm font-bold mt-text-primary">{user.displayName || user.email || "Unnamed"}</div>
          <div className="text-xs mt-text-secondary">{user.role || "No role"}</div>
          {otherManagerNames.length > 0 && (
            <div className="mt-1 text-[10px] italic mt-text-secondary">Also reports to: {otherManagerNames.join(", ")}</div>
          )}
          {canManage && (
            <>
              <ManagerPicker user={user} users={users} blocked={blocked} busy={busy} onChangeManager={onChangeManager} />
              <label className="mt-2 flex items-center justify-center gap-1.5 text-[11px] mt-text-secondary">
                <input
                  type="checkbox"
                  checked={!!user.orgHighlight}
                  disabled={busy}
                  onChange={(e) => onToggleHighlight(user.id, e.target.checked)}
                />
                Highlight (e.g. senior partner)
              </label>
            </>
          )}
        </div>
      </div>
      {safeKids.length > 0 && (
        <ul>
          {safeKids.map((child) => (
            <OrgNode
              key={`${user.id}>${child.id}`}
              user={child}
              parentId={user.id}
              childrenOf={childrenOf}
              users={users}
              byId={byId}
              canManage={canManage}
              onChangeManager={onChangeManager}
              onToggleHighlight={onToggleHighlight}
              busy={busy}
              ancestors={nextAncestors}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// Named-staff organisation chart for Practice Administration > Departments.
// Reads/writes each person's reportsTo (a list of manager uids, empty for
// the top of the chart) - see updateUserReportsTo in adminUserService.js.
// Someone with more than one manager is rendered once under each of them
// (a plain tree can't show one box with two parents), with a small "also
// reports to" note under every appearance after the first so it reads as
// one person in two places, not two people. Only meaningful for whoever can
// already see the full users list (admin.manageUsers), since Firestore only
// lets that same audience read other people's profiles.
export default function OrgChart({ users, canManage, onChangeManager, onToggleHighlight, busy }) {
  const active = useMemo(() => users.filter((u) => u.active !== false), [users]);
  const { byId, childrenOf, roots } = useMemo(() => buildTree(active), [active]);

  if (active.length === 0) {
    return <p className="text-sm mt-text-secondary">No staff to show yet.</p>;
  }

  return (
    <div className="overflow-x-auto pb-4">
      <ul className="org-tree">
        {roots.map((root) => (
          <OrgNode
            key={root.id}
            user={root}
            parentId={null}
            childrenOf={childrenOf}
            users={active}
            byId={byId}
            canManage={canManage}
            onChangeManager={onChangeManager}
            onToggleHighlight={onToggleHighlight}
            busy={busy}
            ancestors={new Set()}
          />
        ))}
      </ul>
    </div>
  );
}
