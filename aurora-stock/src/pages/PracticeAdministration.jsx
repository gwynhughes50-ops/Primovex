import { useEffect, useMemo, useState } from "react";
import { Icons } from "@/config/medtrakIcons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
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
  subscribePracticeConfig,
} from "@/services/practiceAdminService";

const PERMISSION_OPTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "inventory", label: "Inventory" },
  { key: "reorder", label: "Reorder Centre" },
  { key: "purchasing", label: "Purchasing" },
  { key: "suppliers", label: "Suppliers" },
  { key: "temperature", label: "Temperature" },
  { key: "compliance", label: "Compliance" },
  { key: "governance", label: "Governance" },
  { key: "assets", label: "Assets" },
  { key: "estates", label: "Estates" },
  { key: "workforce", label: "Workforce" },
  { key: "reports", label: "Reports" },
  { key: "practice_admin", label: "Practice Administration" },
];

const tabs = [
  { key: "overview", label: "Overview", icon: Icons.gauge },
  { key: "practice", label: "Practice", icon: Icons.practice },
  { key: "sites", label: "Sites", icon: Icons.sites },
  { key: "departments", label: "Departments", icon: Icons.departments },
  { key: "roles", label: "Roles", icon: Icons.roles },
  { key: "pulse", label: "Pulse", icon: Icons.pulse },
];

function docsFromSnapshot(snapshot) {
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function Pill({ children }) {
  return <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-300">{children}</span>;
}

function SectionHeader({ title, children }) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      {children}
    </div>
  );
}

export default function PracticeAdministration() {
  const { user, displayName, isAdmin } = useAuth();
  const actor = useMemo(
    () => ({ uid: user?.uid || null, displayName: displayName || user?.email || "Unknown", email: user?.email || null }),
    [displayName, user]
  );

  const [activeTab, setActiveTab] = useState("overview");
  const [practice, setPractice] = useState(null);
  const [sites, setSites] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
  const [rolePermissions, setRolePermissions] = useState(["dashboard"]);
  const [pulseWeights, setPulseWeights] = useState(
    PULSE_AREAS.reduce((acc, area) => {
      acc[area.key] = area.defaultWeight;
      return acc;
    }, {})
  );

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
    const unsubUsers = subscribeCollection("users", (snap) => setUsers(docsFromSnapshot(snap)), (err) => setError(err?.message || String(err)));

    return () => {
      unsubConfig();
      unsubSites();
      unsubDepartments();
      unsubRoles();
      unsubUsers();
    };
  }, []);

  const setupComplete = !!practice?.setup_complete;

  const savePractice = async () => {
    if (!practiceForm.name.trim()) {
      alert("Practice name is required");
      return;
    }

    try {
      setBusy(true);
      await savePracticeConfig({ ...practiceForm, setup_started: true }, actor);
    } catch (err) {
      console.error(err);
      alert("Failed to save practice details");
    } finally {
      setBusy(false);
    }
  };

  const finishSetup = async () => {
    try {
      setBusy(true);
      await savePracticeConfig({ setup_complete: true, setup_completed_at: new Date().toISOString() }, actor);
    } catch (err) {
      console.error(err);
      alert("Failed to complete setup");
    } finally {
      setBusy(false);
    }
  };

  const seedDefaults = async () => {
    if (!confirm("Add default departments and role templates?")) return;
    try {
      setBusy(true);
      await seedPracticeDefaults(actor);
    } catch (err) {
      console.error(err);
      alert("Failed to seed defaults. Some records may already have been created.");
    } finally {
      setBusy(false);
    }
  };

  const createSite = async () => {
    if (!siteName.trim()) return;
    try {
      setBusy(true);
      await addPracticeSite({ name: siteName.trim(), type: sites.length === 0 ? "main" : "branch" }, actor);
      setSiteName("");
    } catch (err) {
      console.error(err);
      alert("Failed to add site");
    } finally {
      setBusy(false);
    }
  };

  const createDepartment = async () => {
    if (!departmentName.trim()) return;
    try {
      setBusy(true);
      await addDepartment({ name: departmentName.trim(), description: "" }, actor);
      setDepartmentName("");
    } catch (err) {
      console.error(err);
      alert("Failed to add department");
    } finally {
      setBusy(false);
    }
  };

  const createRole = async () => {
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
      setRolePermissions(["dashboard"]);
    } catch (err) {
      console.error(err);
      alert("Failed to add role");
    } finally {
      setBusy(false);
    }
  };

  const savePulse = async () => {
    try {
      setBusy(true);
      await savePracticeConfig({ pulse_weights: pulseWeights }, actor);
    } catch (err) {
      console.error(err);
      alert("Failed to save Pulse settings");
    } finally {
      setBusy(false);
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

  return (
    <div className="space-y-5 text-white">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-xs font-semibold text-teal-200">
              <Icons.pulse className="h-3.5 w-3.5" /> Sprint 14 Foundation
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Practice Administration</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Set up your practice structure, sites, departments, roles and Pulse weighting. This is the foundation that future MedTrak+ modules will use.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-center">
            <div className="text-xs uppercase tracking-wide text-slate-500">Setup Progress</div>
            <div className="mt-1 text-4xl font-black text-teal-300">{completionScore}%</div>
            <div className="mt-1 text-xs text-slate-400">{setupComplete ? "Setup complete" : "Setup in progress"}</div>
          </div>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div>}

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
                active ? "bg-teal-400 text-slate-950" : "bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <Icon className="h-4 w-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-slate-400">Loading practice setup...</p>
      ) : (
        <>
          {activeTab === "overview" && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-100">
                <SectionHeader title="Digital Twin" />
                <p className="text-sm text-slate-400">
                  MedTrak+ should reflect how the practice actually works. Start with practice details, then add sites, departments and role templates.
                </p>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-400">Practice</span><span>{practice?.name || "Not set"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Sites</span><span>{sites.length}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Departments</span><span>{departments.length}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Roles</span><span>{roles.length}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Users</span><span>{users.length}</span></div>
                </div>
              </Card>

              <Card className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-100 lg:col-span-2">
                <SectionHeader title="First Run Setup">
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={seedDefaults} disabled={busy}>
                      Add Defaults
                    </Button>
                    <Button onClick={finishSetup} disabled={busy || !practice?.name}>
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
                    <div key={row.label} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3">
                      <Icons.setupComplete className={`h-5 w-5 ${row.done ? "text-emerald-400" : "text-slate-600"}`} />
                      <span className={row.done ? "text-slate-100" : "text-slate-500"}>{row.label}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {activeTab === "practice" && (
            <Card className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-100">
              <SectionHeader title="Practice Details" />
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={practiceForm.name} onChange={(e) => setPracticeForm((f) => ({ ...f, name: e.target.value }))} placeholder="Practice name" />
                <Input value={practiceForm.code} onChange={(e) => setPracticeForm((f) => ({ ...f, code: e.target.value }))} placeholder="Practice code" />
                <Input value={practiceForm.telephone} onChange={(e) => setPracticeForm((f) => ({ ...f, telephone: e.target.value }))} placeholder="Telephone" />
                <Input value={practiceForm.email} onChange={(e) => setPracticeForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" />
                <textarea
                  value={practiceForm.address}
                  onChange={(e) => setPracticeForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Address"
                  rows={4}
                  className="md:col-span-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
                />
              </div>
              <Button className="mt-4" onClick={savePractice} disabled={busy}>Save Practice</Button>
            </Card>
          )}

          {activeTab === "sites" && (
            <Card className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-100">
              <SectionHeader title="Sites">
                <div className="flex gap-2">
                  <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="e.g. Main Surgery" />
                  <Button onClick={createSite} disabled={busy}><Icons.add className="mr-1 h-4 w-4" />Add</Button>
                </div>
              </SectionHeader>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {sites.length === 0 ? <p className="text-sm text-slate-400">No sites added yet.</p> : sites.map((site) => (
                  <div key={site.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="font-bold text-white">{site.name}</div>
                    <div className="mt-1 text-xs text-slate-400">{site.type || "site"}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeTab === "departments" && (
            <Card className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-100">
              <SectionHeader title="Departments">
                <div className="flex gap-2">
                  <Input value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} placeholder="e.g. Management Team" />
                  <Button onClick={createDepartment} disabled={busy}><Icons.add className="mr-1 h-4 w-4" />Add</Button>
                </div>
              </SectionHeader>
              <div className="mb-4 flex flex-wrap gap-2">
                {DEFAULT_DEPARTMENTS.map((dept) => <Pill key={dept}>{dept}</Pill>)}
              </div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {departments.length === 0 ? <p className="text-sm text-slate-400">No departments added yet.</p> : departments.map((department) => (
                  <div key={department.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="font-bold text-white">{department.name}</div>
                    <div className="mt-1 text-xs text-slate-400">{department.description || "Department"}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeTab === "roles" && (
            <Card className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-100">
              <SectionHeader title="Roles & Permissions" />
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="Role name" />
                  <select value={roleDepartment} onChange={(e) => setRoleDepartment(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white">
                    <option value="">Select department</option>
                    {departments.map((dept) => <option key={dept.id} value={dept.name}>{dept.name}</option>)}
                  </select>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {PERMISSION_OPTIONS.map((permission) => (
                    <label key={permission.key} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2 text-sm">
                      <input
                        type="checkbox"
                        checked={rolePermissions.includes(permission.key)}
                        onChange={(e) => {
                          setRolePermissions((current) =>
                            e.target.checked ? [...new Set([...current, permission.key])] : current.filter((key) => key !== permission.key)
                          );
                        }}
                      />
                      {permission.label}
                    </label>
                  ))}
                </div>
                <Button className="mt-4" onClick={createRole} disabled={busy}><Icons.add className="mr-1 h-4 w-4" />Add Role</Button>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {roles.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">No roles created yet. Use Add Defaults or create your own.</div>
                ) : roles.map((role) => (
                  <div key={role.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-white">{role.name}</div>
                        <div className="text-xs text-slate-400">{role.department || "Unassigned"}</div>
                      </div>
                      <Pill>{role.active === false ? "Inactive" : "Active"}</Pill>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(role.permissions || []).map((permission) => <Pill key={permission}>{permission}</Pill>)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeTab === "pulse" && (
            <Card className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-100">
              <SectionHeader title="Pulse Weighting" />
              <p className="mb-4 text-sm text-slate-400">
                These values define what operational health means for this practice. Future Pulse calculations will use these weights to reflect local priorities.
              </p>
              <div className="space-y-3">
                {PULSE_AREAS.map((area) => (
                  <div key={area.key} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="font-semibold text-white">{area.label}</div>
                      <div className="text-sm font-bold text-teal-300">{pulseWeights[area.key] ?? area.defaultWeight}%</div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={pulseWeights[area.key] ?? area.defaultWeight}
                      onChange={(e) => setPulseWeights((current) => ({ ...current, [area.key]: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                ))}
              </div>
              <Button className="mt-4" onClick={savePulse} disabled={busy}>Save Pulse Weighting</Button>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
