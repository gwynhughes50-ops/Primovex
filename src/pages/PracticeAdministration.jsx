import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Icons } from "@/config/medtrakIcons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import AccessDenied from "@/components/security/AccessDenied";
import { CAPABILITY_CATALOG } from "@/core/identity/capabilities";
import PlatformModeControls from "@/components/platform/PlatformModeControls";
import SpaceBuilder from "@/modules/sense/components/SpaceBuilder";
import { loadSenseState, saveSenseState } from "@/modules/sense/services/senseStore";
import { getPlatformModeConfig, getStoredPlatformMode } from "@/config/platformMode";
import {
  addDepartment,
  addPracticeRole,
  addPracticeSite,
  DEFAULT_DEPARTMENTS,
  DEFAULT_ROLE_TEMPLATES,
  PULSE_AREAS,
  savePracticeConfig,
  seedPracticeDefaults,
  subscribeCollection,
  updateDepartment,
  updatePracticeRole,
  updatePracticeSite,
  subscribePracticeConfig,
} from "@/services/practiceAdminService";

const PERMISSION_OPTIONS = CAPABILITY_CATALOG;

const tabs = [
  { key: "overview", label: "Overview", icon: Icons.gauge },
  { key: "practice", label: "Practice", icon: Icons.practice },
  { key: "sites", label: "Sites", icon: Icons.sites },
  { key: "spaces", label: "Spaces", icon: Icons.practice },
  { key: "departments", label: "Departments", icon: Icons.departments },
  { key: "roles", label: "Roles", icon: Icons.roles },
  { key: "pulse", label: "Pulse", icon: Icons.pulse },
  { key: "platform", label: "Platform Mode", icon: Icons.settings },
];

function docsFromSnapshot(snapshot) {
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function Pill({ children }) {
  return <span className="mt-card rounded-full border px-2 py-0.5 text-xs mt-text-secondary">{children}</span>;
}

function SectionHeader({ title, children }) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-lg font-bold mt-text-primary">{title}</h2>
      {children}
    </div>
  );
}

export default function PracticeAdministration() {
  const location = useLocation();
  const { user, displayName, isAdmin, can, platformMode, loading: authLoading } = useAuth();
  const actor = useMemo(
    () => ({ uid: user?.uid || null, displayName: displayName || user?.email || "Unknown", email: user?.email || null }),
    [displayName, user]
  );

  const [activeTab, setActiveTab] = useState("overview");
  const [spaceState, setSpaceState] = useState(() => loadSenseState());
  const [practice, setPractice] = useState(null);
  const [sites, setSites] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [practiceForm, setPracticeForm] = useState({
    name: "",
    code: "",
    address: "",
    telephone: "",
    email: "",
  });

  const [siteName, setSiteName] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleDepartment, setRoleDepartment] = useState("");
  const [rolePermissions, setRolePermissions] = useState(["dashboard.read"]);
  const [pulseWeights, setPulseWeights] = useState(
    PULSE_AREAS.reduce((acc, area) => {
      acc[area.key] = area.defaultWeight;
      return acc;
    }, {})
  );

  const canRead = can("practiceAdmin.read");
  // Firestore currently restricts writes to System Admin, so the UI mirrors that rule.
  const canManage = isAdmin && can("practiceAdmin.write");
  const canListUsers = isAdmin && can("admin.manageUsers");
  const currentPlatformMode = getPlatformModeConfig(platformMode || getStoredPlatformMode());

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedTab = params.get("tab");
    if (requestedTab && tabs.some((tab) => tab.key === requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [location.search]);

  useEffect(() => {
    const refreshSpaces = () => setSpaceState(loadSenseState());
    window.addEventListener("primovex:space-registry-changed", refreshSpaces);
    window.addEventListener("primovex:sense-changed", refreshSpaces);
    return () => {
      window.removeEventListener("primovex:space-registry-changed", refreshSpaces);
      window.removeEventListener("primovex:sense-changed", refreshSpaces);
    };
  }, []);

  const commitSpaces = (next) => {
    setSpaceState(next);
    saveSenseState(next);
  };

  useEffect(() => {
    const unsubConfig = subscribePracticeConfig(
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        setPractice(data);

        if (data) {
          setPracticeForm({
            name: data.name || "",
            code: data.code || "",
            address: data.address || "",
            telephone: data.telephone || "",
            email: data.email || "",
          });
          if (data.pulse_weights) setPulseWeights(data.pulse_weights);
        }
        setLoading(false);
      },
      (err) => {
        setError(err?.message || String(err));
        setLoading(false);
      }
    );

    const unsubSites = subscribeCollection("practice_sites", (snap) => setSites(docsFromSnapshot(snap)), (err) => setError(err?.message || String(err)));
    const unsubDepartments = subscribeCollection("practice_departments", (snap) => setDepartments(docsFromSnapshot(snap)), (err) => setError(err?.message || String(err)));
    const unsubRoles = subscribeCollection("practice_roles", (snap) => setRoles(docsFromSnapshot(snap)), (err) => setError(err?.message || String(err)));
    const unsubUsers = canListUsers
      ? subscribeCollection("users", (snap) => setUsers(docsFromSnapshot(snap)), (err) => setError(err?.message || String(err)))
      : () => {};

    return () => {
      unsubConfig();
      unsubSites();
      unsubDepartments();
      unsubRoles();
      unsubUsers();
    };
  }, [canListUsers]);

  const setupComplete = !!practice?.setup_complete;
  const pulseTotal = useMemo(
    () => Object.values(pulseWeights).reduce((total, value) => total + Number(value || 0), 0),
    [pulseWeights]
  );

  const beginAction = () => {
    setError("");
    setSuccess("");
  };

  const requireManage = () => {
    if (canManage) return true;
    setError("This area is read-only. System Admin permission is required to make changes.");
    return false;
  };

  const savePractice = async () => {
    if (!requireManage()) return;
    beginAction();
    if (!practiceForm.name.trim()) {
      setError("Practice name is required.");
      return;
    }

    try {
      setBusy(true);
      await savePracticeConfig({ ...practiceForm, setup_started: true }, actor);
      setSuccess("Practice details saved.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to save practice details.");
    } finally {
      setBusy(false);
    }
  };

  const finishSetup = async () => {
    if (!requireManage()) return;
    beginAction();
    try {
      setBusy(true);
      await savePracticeConfig({ setup_complete: true, setup_completed_at: new Date().toISOString() }, actor);
      setSuccess("Practice setup marked complete.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to complete setup.");
    } finally {
      setBusy(false);
    }
  };

  const seedDefaults = async () => {
    if (!requireManage()) return;
    beginAction();
    if (!confirm("Add default departments and role templates?")) return;
    try {
      setBusy(true);
      const result = await seedPracticeDefaults(actor);
      setSuccess(`Defaults checked: ${result.departmentsAdded} departments and ${result.rolesAdded} roles added.`);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to seed defaults.");
    } finally {
      setBusy(false);
    }
  };

  const createSite = async () => {
    if (!requireManage()) return;
    beginAction();
    if (!siteName.trim()) return;
    try {
      setBusy(true);
      const ref = await addPracticeSite({ name: siteName.trim(), type: sites.length === 0 ? "main" : "branch" }, actor);
      const sharedSiteId = `SITE-${String(ref.id).toUpperCase()}`;
      const nextSpaces = {
        ...spaceState,
        sites: [...spaceState.sites, { id: sharedSiteId, practiceSiteId: ref.id, name: siteName.trim(), status: "active" }],
      };
      commitSpaces(nextSpaces);
      setSiteName("");
      setSuccess("Site added and wired into the shared Space Registry.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to add site.");
    } finally {
      setBusy(false);
    }
  };

  const createDepartment = async () => {
    if (!requireManage()) return;
    beginAction();
    if (!departmentName.trim()) return;
    try {
      setBusy(true);
      await addDepartment({ name: departmentName.trim(), description: "" }, actor);
      setDepartmentName("");
      setSuccess("Department added.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to add department.");
    } finally {
      setBusy(false);
    }
  };

  const createRole = async () => {
    if (!requireManage()) return;
    beginAction();
    if (!roleName.trim()) return;
    try {
      setBusy(true);
      await addPracticeRole(
        {
          name: roleName.trim(),
          department: roleDepartment || "Unassigned",
          permissions: rolePermissions,
          description: "",
        },
        actor
      );
      setRoleName("");
      setRoleDepartment("");
      setRolePermissions(["dashboard.read"]);
      setSuccess("Role added.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to add role.");
    } finally {
      setBusy(false);
    }
  };

  const savePulse = async () => {
    if (!requireManage()) return;
    beginAction();
    if (pulseTotal !== 100) {
      setError(`Pulse weighting must total 100%. Current total: ${pulseTotal}%.`);
      return;
    }
    try {
      setBusy(true);
      await savePracticeConfig({ pulse_weights: pulseWeights }, actor);
      setSuccess("Pulse weighting saved.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to save Pulse settings.");
    } finally {
      setBusy(false);
    }
  };

  const toggleRecord = async (type, record) => {
    if (!requireManage()) return;
    beginAction();
    try {
      const payload = { active: record.active === false };
      if (type === "site") {
        await updatePracticeSite(record.id, payload, actor);
        commitSpaces({
          ...spaceState,
          sites: spaceState.sites.map((site) => site.practiceSiteId === record.id || site.id === record.id
            ? { ...site, status: payload.active ? "active" : "inactive" }
            : site),
        });
      }
      if (type === "department") await updateDepartment(record.id, payload, actor);
      if (type === "role") await updatePracticeRole(record.id, payload, actor);
      setSuccess(`${record.name} ${payload.active ? "activated" : "deactivated"}.`);
    } catch (err) {
      setError(err?.message || `Failed to update ${type}.`);
    }
  };

  const completionScore = useMemo(() => {
    let score = 0;
    if (practice?.name) score += 20;
    if (sites.length > 0) score += 20;
    if (departments.length > 0) score += 20;
    if (roles.length > 0) score += 20;
    if (practice?.pulse_weights) score += 10;
    if (setupComplete) score += 10;
    return score;
  }, [departments.length, practice, roles.length, setupComplete, sites.length]);

  if (!authLoading && !canRead) {
    return <AccessDenied title="Practice Administration restricted" message="You do not currently have permission to view practice administration." />;
  }

  return (
    <div className="mt-theme-page space-y-5">
      <div className="rounded-3xl mt-card border p-5 shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-xs font-semibold text-teal-200">
              <Icons.pulse className="h-3.5 w-3.5" /> Primovex Administration
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Practice Administration</h1>
            <p className="mt-1 max-w-2xl text-sm mt-text-secondary">
              Set up your practice structure, sites, departments, roles, Pulse weighting and platform modes. This is the foundation that Primovex modules will use.
            </p>
          </div>

          <div className="rounded-2xl mt-card-strong border p-4 text-center">
            <div className="text-xs uppercase tracking-wide mt-text-muted">Setup Progress</div>
            <div className="mt-1 text-4xl font-black mt-accent">{completionScore}%</div>
            <div className="mt-1 text-xs mt-text-secondary">{setupComplete ? "Setup complete" : "Setup in progress"}</div>
          </div>
        </div>
      </div>

      {!canManage && <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">Read-only mode: System Admin permission is required to change practice configuration.</div>}
      {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div>}
      {success && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{success}</div>}

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition ${
                active ? "mt-button-primary" : "mt-button-secondary"
              }`}
            >
              <Icon className="h-4 w-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="mt-text-secondary">Loading practice setup...</p>
      ) : (
        <>
          {activeTab === "overview" && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="rounded-2xl mt-card border p-4 mt-text-primary">
                <SectionHeader title="Digital Twin" />
                <p className="text-sm mt-text-secondary">
                  Primovex should reflect how the practice actually works. Start with practice details, then add sites, departments and role templates.
                </p>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="mt-text-secondary">Practice</span><span>{practice?.name || "Not set"}</span></div>
                  <div className="flex justify-between"><span className="mt-text-secondary">Sites</span><span>{sites.length}</span></div>
                  <div className="flex justify-between"><span className="mt-text-secondary">Departments</span><span>{departments.length}</span></div>
                  <div className="flex justify-between"><span className="mt-text-secondary">Roles</span><span>{roles.length}</span></div>
                  <div className="flex justify-between"><span className="mt-text-secondary">Users</span><span>{canListUsers ? users.length : "Restricted"}</span></div>
                </div>
              </Card>

              <Card className="rounded-2xl mt-card border p-4 mt-text-primary">
                <SectionHeader title="Platform Mode" />
                <div className={`rounded-2xl border p-4 ${currentPlatformMode.bannerClass}`}>
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em]">
                    <span className={`h-2.5 w-2.5 rounded-full ${currentPlatformMode.dotClass}`} />
                    {currentPlatformMode.shortLabel}
                  </div>
                  <p className="mt-3 text-sm leading-6 opacity-90">{currentPlatformMode.description}</p>
                </div>
                <Button className="mt-4 rounded-full" onClick={() => setActiveTab("platform")}>Manage Platform Mode</Button>
              </Card>

              <Card className="rounded-2xl mt-card border p-4 mt-text-primary">
                <SectionHeader title="Practice Snapshot" />
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Sites", value: sites.length },
                    { label: "Departments", value: departments.length },
                    { label: "Roles", value: roles.length },
                    { label: "Users", value: canListUsers ? users.length : "Restricted" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl mt-card-strong border p-3">
                      <div className="text-xs uppercase tracking-wide mt-text-muted">{item.label}</div>
                      <div className="mt-1 text-2xl font-black mt-accent">{item.value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-2 text-sm">
                  <div className="flex items-center justify-between rounded-xl mt-card-strong border px-3 py-2">
                    <span className="mt-text-secondary">Setup</span>
                    <span className="font-semibold mt-text-primary">{setupComplete ? "Complete" : "In progress"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl mt-card-strong border px-3 py-2">
                    <span className="mt-text-secondary">Pulse weighting</span>
                    <span className="font-semibold mt-text-primary">{pulseTotal}%</span>
                  </div>
                </div>
              </Card>

              <Card className="rounded-2xl mt-card border p-4 mt-text-primary lg:col-span-3">
                <SectionHeader title="First Run Setup">
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={seedDefaults} disabled={busy || !canManage}>
                      Add Defaults
                    </Button>
                    <Button onClick={finishSetup} disabled={busy || !practice?.name || !canManage || setupComplete}>
                      Mark Setup Complete
                    </Button>
                  </div>
                </SectionHeader>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { label: "Practice details saved", done: !!practice?.name },
                    { label: "At least one site added", done: sites.length > 0 },
                    { label: "Departments configured", done: departments.length > 0 },
                    { label: "Roles configured", done: roles.length > 0 },
                    { label: "Pulse weighting configured", done: !!practice?.pulse_weights },
                    { label: "Setup marked complete", done: setupComplete },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-2 rounded-xl mt-card-strong border p-3">
                      <Icons.setupComplete className={`h-5 w-5 ${row.done ? "text-emerald-400" : "text-slate-600"}`} />
                      <span className={row.done ? "mt-text-primary" : "mt-text-muted"}>{row.label}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {activeTab === "practice" && (
            <Card className="rounded-2xl mt-card border p-4 mt-text-primary">
              <SectionHeader title="Practice Details" />
              <div className="grid gap-3 md:grid-cols-2">
                <Input disabled={!canManage} value={practiceForm.name} onChange={(e) => setPracticeForm((f) => ({ ...f, name: e.target.value }))} placeholder="Practice name" />
                <Input disabled={!canManage} value={practiceForm.code} onChange={(e) => setPracticeForm((f) => ({ ...f, code: e.target.value }))} placeholder="Practice code" />
                <Input disabled={!canManage} value={practiceForm.telephone} onChange={(e) => setPracticeForm((f) => ({ ...f, telephone: e.target.value }))} placeholder="Telephone" />
                <Input disabled={!canManage} value={practiceForm.email} onChange={(e) => setPracticeForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" />
                <textarea
                  disabled={!canManage} value={practiceForm.address}
                  onChange={(e) => setPracticeForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Address"
                  rows={4}
                  className="md:col-span-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 mt-text-primary"
                />
              </div>
              <Button className="mt-4" onClick={savePractice} disabled={busy || !canManage}>Save Practice</Button>
            </Card>
          )}

          {activeTab === "sites" && (
            <Card className="rounded-2xl mt-card border p-4 mt-text-primary">
              <SectionHeader title="Sites">
                <div className="flex gap-2">
                  <Input disabled={!canManage} value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="e.g. Main Surgery" />
                  <Button onClick={createSite} disabled={busy || !canManage}><Icons.add className="mr-1 h-4 w-4" />Add</Button>
                </div>
              </SectionHeader>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {sites.length === 0 ? <p className="text-sm mt-text-secondary">No sites added yet.</p> : sites.map((site) => (
                  <div key={site.id} className="rounded-xl mt-card-strong border p-4">
                    <div className="font-bold mt-text-primary">{site.name}</div>
                    <div className="mt-1 text-xs mt-text-secondary">{site.type || "site"} · {site.active === false ? "Inactive" : "Active"}</div>
                    {canManage && <Button className="mt-3" size="sm" variant="outline" onClick={() => toggleRecord("site", site)}>{site.active === false ? "Activate" : "Deactivate"}</Button>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeTab === "spaces" && (
            <div className="space-y-4">
              <Card className="rounded-2xl mt-card border p-4 mt-text-primary">
                <SectionHeader title="Shared Space Registry" />
                <p className="mb-4 text-sm mt-text-secondary">
                  This is the single building structure used by Practice Administration, Sense, Facilities and Primovex Mobile. A space created here appears everywhere with the same permanent Sense ID.
                </p>
                <SpaceBuilder
                  state={spaceState}
                  commit={commitSpaces}
                  actor={actor.displayName}
                />
              </Card>
            </div>
          )}


          {activeTab === "departments" && (
            <Card className="rounded-2xl mt-card border p-4 mt-text-primary">
              <SectionHeader title="Departments">
                <div className="flex gap-2">
                  <Input disabled={!canManage} value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} placeholder="e.g. Management Team" />
                  <Button onClick={createDepartment} disabled={busy || !canManage}><Icons.add className="mr-1 h-4 w-4" />Add</Button>
                </div>
              </SectionHeader>
              <div className="mb-4 flex flex-wrap gap-2">
                {DEFAULT_DEPARTMENTS.map((dept) => <Pill key={dept}>{dept}</Pill>)}
              </div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {departments.length === 0 ? <p className="text-sm mt-text-secondary">No departments added yet.</p> : departments.map((department) => (
                  <div key={department.id} className="rounded-xl mt-card-strong border p-4">
                    <div className="font-bold mt-text-primary">{department.name}</div>
                    <div className="mt-1 text-xs mt-text-secondary">{department.description || "Department"} · {department.active === false ? "Inactive" : "Active"}</div>
                    {canManage && <Button className="mt-3" size="sm" variant="outline" onClick={() => toggleRecord("department", department)}>{department.active === false ? "Activate" : "Deactivate"}</Button>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeTab === "roles" && (
            <Card className="rounded-2xl mt-card border p-4 mt-text-primary">
              <SectionHeader title="Roles & Permissions" />
              <div className="rounded-2xl mt-card-strong border p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Input disabled={!canManage} value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="Role name" />
                  <select disabled={!canManage} value={roleDepartment} onChange={(e) => setRoleDepartment(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 mt-text-primary">
                    <option value="">Select department</option>
                    {departments.map((dept) => <option key={dept.id} value={dept.name}>{dept.name}</option>)}
                  </select>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {PERMISSION_OPTIONS.map((permission) => (
                    <label key={permission.id} className="flex items-center gap-2 rounded-lg mt-card border p-2 text-sm">
                      <input
                        type="checkbox"
                        disabled={!canManage}
                        checked={rolePermissions.includes(permission.id)}
                        onChange={(e) => {
                          setRolePermissions((current) =>
                            e.target.checked ? [...new Set([...current, permission.id])] : current.filter((key) => key !== permission.id)
                          );
                        }}
                      />
                      {permission.label}
                    </label>
                  ))}
                </div>
                <Button className="mt-4" onClick={createRole} disabled={busy || !canManage}><Icons.add className="mr-1 h-4 w-4" />Add Role</Button>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {roles.length === 0 ? (
                  <div className="rounded-xl mt-card-strong border p-4 text-sm mt-text-secondary">No roles created yet. Use Add Defaults or create your own.</div>
                ) : roles.map((role) => (
                  <div key={role.id} className="rounded-xl mt-card-strong border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold mt-text-primary">{role.name}</div>
                        <div className="text-xs mt-text-secondary">{role.department || "Unassigned"}</div>
                      </div>
                      <Pill>{role.active === false ? "Inactive" : "Active"}</Pill>
                    </div>
                    {canManage && <Button size="sm" variant="outline" onClick={() => toggleRecord("role", role)}>{role.active === false ? "Activate" : "Deactivate"}</Button>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(role.permissions || []).map((permission) => <Pill key={permission}>{permission}</Pill>)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeTab === "pulse" && (
            <Card className="rounded-2xl mt-card border p-4 mt-text-primary">
              <SectionHeader title="Pulse Weighting" />
              <p className="mb-4 text-sm mt-text-secondary">
                These values define what operational health means for this practice. Future Pulse calculations will use these weights to reflect local priorities.
              </p>
              <div className="space-y-3">
                {PULSE_AREAS.map((area) => (
                  <div key={area.key} className="rounded-xl mt-card-strong border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="font-semibold mt-text-primary">{area.label}</div>
                      <div className="text-sm font-bold mt-accent">{pulseWeights[area.key] ?? area.defaultWeight}%</div>
                    </div>
                    <input
                      type="range"
                      disabled={!canManage}
                      min="0"
                      max="40"
                      value={pulseWeights[area.key] ?? area.defaultWeight}
                      onChange={(e) => setPulseWeights((current) => ({ ...current, [area.key]: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                ))}
              </div>
              <div className={`mt-4 rounded-xl border p-3 text-sm font-semibold ${pulseTotal === 100 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-100"}`}>Total weighting: {pulseTotal}% {pulseTotal === 100 ? "✓" : "— must equal 100%"}</div>
              <Button className="mt-4" onClick={savePulse} disabled={busy || !canManage || pulseTotal !== 100}>Save Pulse Weighting</Button>
            </Card>
          )}


          {activeTab === "platform" && (
            <Card className="rounded-2xl mt-card border p-4 mt-text-primary">
              <SectionHeader title="Platform Mode & Demo Controls" />
              <p className="mb-4 text-sm leading-6 mt-text-secondary">
                Switch safely between Live, Demo, Training and Staging. Demo and Training are designed for product walkthroughs and staff onboarding using synthetic data only.
              </p>
              <PlatformModeControls />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
