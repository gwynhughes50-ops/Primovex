import { useMemo, useState, useEffect } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import useStockSummary from "@/hooks/useStockSummary";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { ScrollArea } from "@/components/ui/scroll-area";

import {
  Shield,
  Settings,
  LayoutDashboard,
  MapPin,
  Users,
  Activity,
  Bell,
  KeyRound,
  AlertTriangle,
  Pencil,
  Trash2,
  Plus,
  Boxes,
  Package,
  UserPlus,
  MoreVertical,
  Pin,
  BrainCircuit,
  Ban,
  RotateCcw,
  Link2,
  Copy,
} from "lucide-react";

import AddUser from "./admin/AddUser";
import OrbLearningReview from "@/orb/OrbLearningReview";
import OrbKnowledgeManager from "@/orb/OrbKnowledgeManager";
import SpaceBuilder from "@/modules/sense/components/SpaceBuilder";
import { loadSenseState, saveSenseState } from "@/modules/sense/services/senseStore";
import { loadFacilitiesState } from "@/modules/facilities/services/facilitiesStore";

// ✅ Firestore activity feed
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { CAPABILITY_CATALOG, ROLE_TEMPLATES } from "@/core/identity/capabilities";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeUsers, updateUserRole, setUserActive, deleteUserAccount, createPasswordLink } from "@/services/adminUserService";

// --------------------------
// ✅ Route Guard (Admin only)
// --------------------------
function RequireAdmin({ isAdmin, loading, children }) {
  if (loading) {
    return (
      <div className="mt-6 rounded-2xl border border-slate-800/70 bg-slate-900/60 p-6 text-slate-300">
        Checking access…
      </div>
    );
  }
  if (!isAdmin) return <Navigate to=".." replace />;
  return children;
}

// --------------------------
// Helpers / Defaults
// --------------------------
const defaultRoles = Object.entries(ROLE_TEMPLATES).map(([name, permissions]) => ({
  id: `role-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  name,
  description:
    name === "System Admin"
      ? "Full platform access including identity, permissions and admin tools."
      : name === "Practice Manager"
        ? "Operational management access across MedTrak+ modules."
        : `${name} capability template.`,
  permissions,
  protected: ["System Admin", "User", "ReadOnly"].includes(name),
}));

// Capability catalogue drives Role Builder and keeps permissions consistent.
const PERMISSIONS = CAPABILITY_CATALOG;

function makeId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function StatCard({ label, value, icon }) {
  return (
    <Card className="rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 shadow-sm backdrop-blur">
      <CardContent className="p-6 flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-400">{label}</div>
          <div className="text-3xl font-semibold text-slate-50 mt-2">{value}</div>
        </div>
        <div className="h-11 w-11 rounded-xl bg-slate-800/60 flex items-center justify-center text-teal-300">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

// ✅ Relative tabs: works whether mounted at /admin or nested elsewhere
function AdminTabs({ showUsers }) {
  const items = [
    { to: ".", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, end: true },
    { to: "sites", label: "Sites & Locations", icon: <MapPin className="h-4 w-4" /> },
    ...(showUsers
      ? [
          { to: "users", label: "Users", icon: <Users className="h-4 w-4" /> },
          { to: "users/add", label: "Add User", icon: <UserPlus className="h-4 w-4" /> },
          { to: "orb-learning", label: "Orb Learning", icon: <BrainCircuit className="h-4 w-4" /> },
        ]
      : []),
    { to: "activity", label: "Activity Log", icon: <Activity className="h-4 w-4" /> },
    { to: "notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
    { to: "roles", label: "Roles & Permissions", icon: <KeyRound className="h-4 w-4" /> },
    { to: "danger", label: "Danger Zone", icon: <AlertTriangle className="h-4 w-4" />, danger: true },
  ];

  return (
    <div className="mt-5">
      <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-1 inline-flex gap-1 flex-wrap">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={!!it.end}>
            {({ isActive }) => (
              <button
                className={[
                  "px-3 py-2 rounded-xl text-sm inline-flex items-center gap-2 transition",
                  isActive
                    ? it.danger
                      ? "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/25"
                      : "bg-slate-800/70 text-slate-50 ring-1 ring-slate-700/60"
                    : it.danger
                      ? "text-rose-200 hover:bg-rose-500/10"
                      : "text-slate-300 hover:bg-slate-800/40",
                ].join(" ")}
              >
                {it.icon}
                {it.label}
              </button>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

// --------------------------
// Activity helpers (Firestore)
// --------------------------
const MOVES_COL = "stock_movements";

function fmtTs(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
    return d ? d.toLocaleString() : "";
  } catch {
    return "";
  }
}

function activityLabel(m) {
  const type = m?.type || "activity";
  if (type === "receive") return `Received +${m.delta ?? ""}`;
  if (type === "use") return `Used ${Math.abs(m.delta ?? 0)}`;
  if (type === "adjust") return `Adjusted ${m.qty_before ?? "—"} → ${m.qty_after ?? "—"}`;
  if (type === "create") return `Created item`;
  if (type === "edit") return `Edited item`;
  if (type === "archive") return `Archived item`;
  if (type === "unarchive") return `Restored item`;
  return type;
}

function prettyPermissions(perms = []) {
  if (!Array.isArray(perms)) return "—";
  if (perms.includes("*")) return "All permissions (*)";
  return perms.join(", ");
}

export default function AdminDashboard() {
  const { isAdmin, loading: authLoading, can, displayName, user, customRoles: liveCustomRoles } = useAuth();

  const { totalItems, lowStockItems, loading: stockLoading } = useStockSummary();

  const seed = useMemo(
    () => ({
      deleteItems: [
        { id: "d1", name: "Disposable Bed Rolls", meta: "non_medical • 45 rolls" },
        { id: "d2", name: "Surgical Masks (Box 50)", meta: "non_medical • 8 boxes" },
        { id: "d3", name: "Blood Collection Tubes (Red)", meta: "non_medical • 120 tubes" },
        { id: "d4", name: "Paracetamol 500mg", meta: "medicinal • 25 packs" },
      ],
    }),
    []
  );

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);

  // Sites & Locations now reads/writes the real Sense space registry (same
  // data as Facilities/Spaces/ClinFlow) via SpaceBuilder, instead of the old
  // in-memory-only fake site/location list that never persisted anywhere.
  const [senseState, setSenseState] = useState(() => loadSenseState());
  function commitSense(next) {
    setSenseState(next);
    saveSenseState(next);
  }
  useEffect(() => {
    const refresh = () => setSenseState(loadSenseState());
    window.addEventListener("primovex:sense-changed", refresh);
    return () => window.removeEventListener("primovex:sense-changed", refresh);
  }, []);

  useEffect(() => {
    const unsub = subscribeUsers(
      (rows) => { setUsers(rows); setUsersLoading(false); },
      () => setUsersLoading(false)
    );
    return () => unsub?.();
  }, []);

  // Notifications scaffold state
  const [pushEnabled, setPushEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(true);

  // Firestore activity feed
  const [activityRows, setActivityRows] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState(null);

  useEffect(() => {
    const q = query(collection(db, MOVES_COL), orderBy("created_at", "desc"), limit(200));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setActivityRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setActivityLoading(false);
        setActivityError(null);
      },
      (err) => {
        setActivityError(err);
        setActivityLoading(false);
      }
    );

    return () => unsub?.();
  }, []);

  // Roles: built-in templates (hardcoded, from ROLE_TEMPLATES) plus any
  // admin-created roles, live from Firestore via AuthContext's "roles"
  // subscription — see capabilities.js/getCapabilitiesForProfile for how
  // these feed into actual permission checks app-wide.
  const roles = useMemo(
    () => [
      ...defaultRoles,
      ...liveCustomRoles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description || `${r.name} custom role.`,
        permissions: r.capabilities || [],
        protected: false,
        custom: true,
      })),
    ],
    [liveCustomRoles]
  );
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [newRole, setNewRole] = useState({
    name: "",
    description: "",
    permissions: ["inventory.read"],
  });

  const openEditRole = (role) => {
    setEditingRole(role);
    setNewRole({ name: role.name, description: role.description || "", permissions: role.permissions || [] });
    setAddRoleError("");
    setIsAddRoleOpen(true);
  };

  // Role assignment modal
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState(null);
  const [assignRoleId, setAssignRoleId] = useState("");

  // Danger zone state
  const [deleteChecks, setDeleteChecks] = useState(() => new Set());

  // Derived
  const totalSites = senseState.sites.length;
  const totalLocations = senseState.spaces.filter((space) => space.status !== "archived").length;
  const totalUsers = users.length;

  const roleOptions = useMemo(() => roles.map((r) => ({ id: r.id, name: r.name })), [roles]);
  const getRoleByName = (name) => roles.find((r) => r.name.toLowerCase() === String(name || "").toLowerCase());

  const openAssignRole = (userId, currentRoleName) => {
    setAssignUserId(userId);
    const current = getRoleByName(currentRoleName);
    setAssignRoleId(current?.id || "");
    setIsAssignOpen(true);
  };

  const [assignRoleError, setAssignRoleError] = useState("");
  const [assignRoleBusy, setAssignRoleBusy] = useState(false);

  const saveAssignedRole = async () => {
    if (!assignUserId) return;
    const picked = roles.find((r) => r.id === assignRoleId);
    const roleNameToStore = picked?.name || "No Role";

    setAssignRoleBusy(true);
    setAssignRoleError("");
    try {
      await updateUserRole(assignUserId, roleNameToStore);
      setIsAssignOpen(false);
      setAssignUserId(null);
      setAssignRoleId("");
    } catch (error) {
      setAssignRoleError(error?.message || "Could not save this role change.");
    } finally {
      setAssignRoleBusy(false);
    }
  };

  // Deactivate / reactivate (reversible — see deleteUserAccount for the
  // permanent one, gated separately below via a confirm dialog).
  const [activeActionUid, setActiveActionUid] = useState(null);
  const [activeActionError, setActiveActionError] = useState("");

  const toggleUserActive = async (targetUser) => {
    setActiveActionUid(targetUser.id);
    setActiveActionError("");
    try {
      await setUserActive(targetUser.id, targetUser.active === false);
    } catch (error) {
      setActiveActionError(error?.message || "Could not update this account.");
    } finally {
      setActiveActionUid(null);
    }
  };

  // Permanent delete — only offered once an account is already deactivated,
  // so removing access is always the first, reversible step.
  const [deleteUserTarget, setDeleteUserTarget] = useState(null);
  const [deleteUserBusy, setDeleteUserBusy] = useState(false);
  const [deleteUserError, setDeleteUserError] = useState("");

  const confirmDeleteUser = async () => {
    if (!deleteUserTarget) return;
    setDeleteUserBusy(true);
    setDeleteUserError("");
    try {
      await deleteUserAccount(deleteUserTarget.id);
      setDeleteUserTarget(null);
    } catch (error) {
      setDeleteUserError(error?.message || "Could not delete this account.");
    } finally {
      setDeleteUserBusy(false);
    }
  };

  // Password-set links from Add User expire after an hour (Firebase's fixed
  // limit) — this issues a fresh one on demand. Nothing is generated until
  // the admin confirms, since each one is an audited credential-setting link.
  const [resetLinkTarget, setResetLinkTarget] = useState(null);
  const [resetLinkBusy, setResetLinkBusy] = useState(false);
  const [resetLinkError, setResetLinkError] = useState("");
  const [resetLinkResult, setResetLinkResult] = useState(null);
  const [resetLinkCopied, setResetLinkCopied] = useState(false);

  const closeResetLink = () => {
    setResetLinkTarget(null);
    setResetLinkResult(null);
    setResetLinkError("");
    setResetLinkCopied(false);
  };

  const generateResetLink = async () => {
    if (!resetLinkTarget) return;
    setResetLinkBusy(true);
    setResetLinkError("");
    try {
      setResetLinkResult(await createPasswordLink(resetLinkTarget.id));
    } catch (error) {
      setResetLinkError(error?.message || "Could not generate a password link.");
    } finally {
      setResetLinkBusy(false);
    }
  };

  const copyResetLink = async () => {
    try {
      await navigator.clipboard.writeText(resetLinkResult.link);
      setResetLinkCopied(true);
      window.setTimeout(() => setResetLinkCopied(false), 2000);
    } catch {
      setResetLinkError("Could not copy the link — select and copy it manually.");
    }
  };

  const [addRoleError, setAddRoleError] = useState("");
  const [addRoleBusy, setAddRoleBusy] = useState(false);

  const addRole = async () => {
    const name = newRole.name.trim();
    setAddRoleError("");
    if (!name) return;

    if (name.toLowerCase().includes("admin")) {
      setAddRoleError("Admin roles are protected. Create non-admin roles only.");
      return;
    }
    if (!editingRole && roles.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      setAddRoleError("Role already exists.");
      return;
    }

    setAddRoleBusy(true);
    try {
      // Doc id is the exact role name — every other place that reads this
      // collection (createUserAccount Cloud Function, AddUser's dropdown)
      // looks a role up by that same name, so no separate slug/id mapping.
      // merge:true so editing an existing role only touches these fields —
      // a plain setDoc would silently wipe createdAt/createdByUid/active.
      await setDoc(
        doc(db, "roles", name),
        {
          name,
          description: newRole.description.trim(),
          capabilities: newRole.permissions,
          builtIn: false,
          ...(editingRole ? {} : { createdAt: serverTimestamp(), createdByUid: user?.uid || null, active: true }),
        },
        { merge: true }
      );

      setNewRole({ name: "", description: "", permissions: ["inventory.read"] });
      setEditingRole(null);
      setIsAddRoleOpen(false);
    } catch (error) {
      setAddRoleError(error?.message || "Could not save this role.");
    } finally {
      setAddRoleBusy(false);
    }
  };

  const toggleDeleteCheck = (id) => {
    setDeleteChecks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearDangerSelection = () => setDeleteChecks(new Set());

  return (
    <div className="min-h-screen">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-2xl bg-slate-900/70 text-teal-300 flex items-center justify-center shadow-sm border border-slate-800/60">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-50">Admin Dashboard</div>
            <div className="text-slate-300/80 -mt-0.5">Manage sites, locations, users, and roles</div>
          </div>
        </div>

        <AdminTabs showUsers={isAdmin} />

        <Routes>
          {/* Overview */}
          <Route
            index
            element={
              <div className="mt-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                  <StatCard label="Total Sites" value={totalSites} icon={<MapPin className="h-5 w-5" />} />
                  <StatCard label="Locations" value={totalLocations} icon={<Boxes className="h-5 w-5" />} />
                  <StatCard
                    label="Stock Items"
                    value={stockLoading ? "—" : totalItems}
                    icon={<Package className="h-5 w-5" />}
                  />
                  <StatCard
                    label="Low Stock"
                    value={stockLoading ? "—" : lowStockItems}
                    icon={<AlertTriangle className="h-5 w-5" />}
                  />
                  <StatCard label="Users" value={totalUsers} icon={<Users className="h-5 w-5" />} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 backdrop-blur">
                    <CardHeader>
                      <CardTitle>Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {activityLoading && (
                        <div className="h-60 rounded-xl bg-slate-950/40 border border-slate-800/70 flex items-center justify-center text-slate-400">
                          Loading activity…
                        </div>
                      )}

                      {!activityLoading && activityError && (
                        <div className="h-60 rounded-xl bg-slate-950/40 border border-slate-800/70 p-4 text-rose-200 text-sm overflow-auto">
                          {String(activityError?.message || activityError)}
                        </div>
                      )}

                      {!activityLoading && !activityError && activityRows.length === 0 && (
                        <div className="h-60 rounded-xl bg-slate-950/40 border border-dashed border-slate-800/70 flex items-center justify-center text-slate-400">
                          No recent activity
                        </div>
                      )}

                      {!activityLoading && !activityError && activityRows.length > 0 && (
                        <div className="space-y-2">
                          {activityRows.slice(0, 8).map((m) => (
                            <div
                              key={m.id}
                              className="rounded-xl bg-slate-950/40 border border-slate-800/70 p-3 flex items-start justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-50 truncate">{activityLabel(m)}</div>
                                <div className="text-xs text-slate-400 mt-1 truncate">
                                  {m.item_name ? `Item: ${m.item_name}` : m.item_id ? `Item ID: ${m.item_id}` : "—"}
                                  {m.notes ? ` • ${m.notes}` : ""}
                                </div>
                              </div>
                              <div className="text-xs text-slate-500 whitespace-nowrap">{fmtTs(m.created_at)}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 backdrop-blur">
                    <CardHeader>
                      <CardTitle>Sites Overview</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {senseState.sites.length === 0 ? (
                        <p className="text-sm text-slate-400">No sites yet — add one under Sites & Locations.</p>
                      ) : (() => {
                        const equipment = loadFacilitiesState().equipment || [];
                        return senseState.sites.map((s) => {
                        const siteSpaceIds = new Set(senseState.spaces.filter((space) => space.siteId === s.id && space.status !== "archived").map((space) => space.id));
                        const itemCount = equipment.filter((item) => siteSpaceIds.has(item.roomId)).length;
                        return (
                          <div
                            key={s.id}
                            className="rounded-xl bg-slate-950/40 border border-slate-800/70 p-4 flex items-center justify-between"
                          >
                            <div>
                              <div className="font-semibold text-slate-50">{s.name}</div>
                              <div className="text-sm text-slate-400">{siteSpaceIds.size} locations</div>
                            </div>
                            <Badge variant="outline" className="border-slate-700/70 text-slate-200">
                              {itemCount} items
                            </Badge>
                          </div>
                        );
                        });
                      })()}
                    </CardContent>
                  </Card>
                </div>
              </div>
            }
          />

          {/* Sites & Locations — real Sense space registry (same data as
              Facilities/Spaces/ClinFlow), not a separate local system. */}
          <Route
            path="sites"
            element={
              <div className="mt-6 space-y-5">
                <Card className="rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 backdrop-blur">
                  <CardHeader>
                    <CardTitle>Sites & Locations</CardTitle>
                    <CardDescription className="text-slate-300/80">
                      This is the same site/floor/zone/room structure used across Facilities, Sense and ClinFlow — changes here show up everywhere immediately.
                    </CardDescription>
                  </CardHeader>
                </Card>
                <SpaceBuilder state={senseState} commit={commitSense} actor={displayName || user?.email || "Admin"} />
              </div>
            }
          />

          {/* Users (Admin-only) */}
          <Route
            path="users"
            element={
              <RequireAdmin isAdmin={isAdmin} loading={authLoading}>
                <div className="mt-6">
                  <Card className="rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 backdrop-blur">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Team Members</CardTitle>
                        <CardDescription className="text-slate-300/80">Assign roles and manage access.</CardDescription>
                      </div>
                      <NavLink to="add">
                        <Button className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30">
                          <Plus className="h-4 w-4 mr-2" /> Add User
                        </Button>
                      </NavLink>
                    </CardHeader>

                    <CardContent>
                      <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-slate-800/70">
                              <TableHead className="text-slate-300">Name</TableHead>
                              <TableHead className="text-slate-300">Email</TableHead>
                              <TableHead className="text-slate-300">Role</TableHead>
                              <TableHead className="text-slate-300">Status</TableHead>
                              <TableHead className="text-slate-300">Joined</TableHead>
                              <TableHead className="text-slate-300 text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {usersLoading ? (
                              <TableRow><TableCell colSpan={6} className="text-center text-slate-400">Loading…</TableCell></TableRow>
                            ) : users.length === 0 ? (
                              <TableRow><TableCell colSpan={6} className="text-center text-slate-400">No users found.</TableCell></TableRow>
                            ) : users.map((u) => {
                              const isInactive = u.active === false;
                              return (
                              <TableRow key={u.id} className="border-slate-800/70">
                                <TableCell className="text-slate-100">{u.displayName || "—"}</TableCell>
                                <TableCell className="text-slate-300">{u.email || "—"}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="border-slate-700/70 text-slate-200">
                                    {u.role || "No role"}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {isInactive ? (
                                    <Badge className="bg-rose-500/15 text-rose-200 hover:bg-rose-500/15">Inactive</Badge>
                                  ) : (
                                    <Badge className="bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15">Active</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-slate-300">{u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString("en-GB") : "—"}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2 flex-wrap">
                                    <Button
                                      variant="outline"
                                      className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                                      onClick={() => openAssignRole(u.id, u.role)}
                                    >
                                      <KeyRound className="h-4 w-4 mr-2" /> Assign role
                                    </Button>
                                    <Button
                                      variant="outline"
                                      className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60 disabled:opacity-40"
                                      disabled={isInactive}
                                      title={isInactive ? "Reactivate the account first" : "Generate a new password-set link"}
                                      onClick={() => setResetLinkTarget(u)}
                                    >
                                      <Link2 className="h-4 w-4 mr-2" /> Reset password
                                    </Button>
                                    <Button
                                      variant="outline"
                                      className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                                      disabled={activeActionUid === u.id}
                                      onClick={() => toggleUserActive(u)}
                                    >
                                      {isInactive ? <RotateCcw className="h-4 w-4 mr-2" /> : <Ban className="h-4 w-4 mr-2" />}
                                      {activeActionUid === u.id ? "Working…" : isInactive ? "Reactivate" : "Deactivate"}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      className="rounded-full border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 disabled:opacity-40"
                                      disabled={!isInactive}
                                      title={!isInactive ? "Deactivate the account first" : "Permanently delete this account"}
                                      onClick={() => setDeleteUserTarget(u)}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );})}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="mt-3 text-xs text-slate-400">
                        {users.length} real account{users.length === 1 ? "" : "s"}, live from Firestore.
                      </div>
                      {activeActionError && (
                        <div className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-100">
                          {activeActionError}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </RequireAdmin>
            }
          />

          {/* Add User (Admin-only) */}
          <Route
            path="users/add"
            element={
              <RequireAdmin isAdmin={isAdmin} loading={authLoading}>
                <AddUser />
              </RequireAdmin>
            }
          />

          {/* Orb Learning (Admin-only) — phrase-learning suggestions Orb has
              picked up from clarification prompts, awaiting approve/reject. */}
          <Route
            path="orb-learning"
            element={
              <RequireAdmin isAdmin={isAdmin} loading={authLoading}>
                <div className="mt-6 space-y-6">
                  <OrbLearningReview />
                  <OrbKnowledgeManager />
                </div>
              </RequireAdmin>
            }
          />

          {/* Activity */}
          <Route
            path="activity"
            element={
              <div className="mt-6">
                <Card className="rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 backdrop-blur">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-teal-300" />
                      Activity Log
                    </CardTitle>
                    <CardDescription className="text-slate-300/80">
                      Live feed from Firestore collection{" "}
                      <span className="text-slate-200 font-medium">stock_movements</span>.
                    </CardDescription>
                  </CardHeader>

                  <CardContent>
                    {activityLoading && (
                      <div className="h-72 rounded-xl bg-slate-950/40 border border-slate-800/70 flex items-center justify-center text-slate-400">
                        Loading activity…
                      </div>
                    )}

                    {!activityLoading && activityError && (
                      <div className="rounded-xl bg-slate-950/40 border border-slate-800/70 p-4 text-rose-200 text-sm overflow-auto">
                        {String(activityError?.message || activityError)}
                      </div>
                    )}

                    {!activityLoading && !activityError && activityRows.length === 0 && (
                      <div className="h-72 rounded-xl bg-slate-950/40 border border-dashed border-slate-800/70 flex items-center justify-center text-slate-400">
                        No activity found yet.
                      </div>
                    )}

                    {!activityLoading && !activityError && activityRows.length > 0 && (
                      <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 overflow-hidden">
                        <ScrollArea className="h-[420px]">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-slate-800/70">
                                <TableHead className="text-slate-300">Time</TableHead>
                                <TableHead className="text-slate-300">Action</TableHead>
                                <TableHead className="text-slate-300">Item</TableHead>
                                <TableHead className="text-slate-300">Notes</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {activityRows.map((m) => (
                                <TableRow key={m.id} className="border-slate-800/70">
                                  <TableCell className="text-slate-300 whitespace-nowrap">{fmtTs(m.created_at)}</TableCell>
                                  <TableCell className="text-slate-100">
                                    <div className="font-semibold">{activityLabel(m)}</div>
                                    <div className="text-xs text-slate-400 mt-0.5">
                                      {m.site ? `Site: ${m.site}` : ""}
                                      {m.location ? ` • Location: ${m.location}` : ""}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-slate-200">{m.item_name || m.item_id || "—"}</TableCell>
                                  <TableCell className="text-slate-300">{m.notes || "—"}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            }
          />

          {/* Notifications */}
          <Route
            path="notifications"
            element={
              <div className="mt-6 space-y-6">
                <Card className="rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 backdrop-blur">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="h-5 w-5 text-teal-300" />
                      Notifications
                    </CardTitle>
                    <CardDescription className="text-slate-300/80">
                      Basic settings scaffold (we can wire to Firebase + device push later).
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/40 p-4">
                      <div>
                        <div className="font-semibold text-slate-50">Email alerts</div>
                        <div className="text-xs text-slate-400 mt-0.5">Low stock + critical alerts via email</div>
                      </div>
                      <Checkbox checked={emailEnabled} onCheckedChange={(v) => setEmailEnabled(!!v)} />
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/40 p-4">
                      <div>
                        <div className="font-semibold text-slate-50">Push notifications</div>
                        <div className="text-xs text-slate-400 mt-0.5">Requires device registration (future)</div>
                      </div>
                      <Checkbox checked={pushEnabled} onCheckedChange={(v) => setPushEnabled(!!v)} />
                    </div>

                    <div className="text-xs text-slate-400">
                      Next step: store these settings in Firestore per user or per practice.
                    </div>
                  </CardContent>
                </Card>
              </div>
            }
          />

          {/* Roles */}
          <Route
            path="roles"
            element={
              <div className="mt-6 space-y-6">
                <Card className="rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 backdrop-blur">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <KeyRound className="h-5 w-5 text-teal-300" />
                        Roles & Permissions
                      </CardTitle>
                      <CardDescription className="text-slate-300/80">
                        Built-in roles plus any custom roles your practice has created.
                      </CardDescription>
                    </div>
                    <Button
                      className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30"
                      onClick={() => {
                        setEditingRole(null);
                        setNewRole({ name: "", description: "", permissions: ["inventory.read"] });
                        setAddRoleError("");
                        setIsAddRoleOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" /> Add Role
                    </Button>
                  </CardHeader>

                  <CardContent>
                    <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-slate-800/70">
                            <TableHead className="text-slate-300">Role</TableHead>
                            <TableHead className="text-slate-300">Description</TableHead>
                            <TableHead className="text-slate-300">Permissions</TableHead>
                            <TableHead className="text-slate-300 text-right">Protected</TableHead>
                            <TableHead className="text-slate-300 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {roles.map((r) => (
                            <TableRow key={r.id} className="border-slate-800/70">
                              <TableCell className="text-slate-100 font-semibold">{r.name}</TableCell>
                              <TableCell className="text-slate-300">{r.description || "—"}</TableCell>
                              <TableCell className="text-slate-300">{prettyPermissions(r.permissions)}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant="outline" className="border-slate-700/70 text-slate-200">
                                  {r.protected ? "Yes" : "No"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {r.custom && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                                    onClick={() => openEditRole(r)}
                                  >
                                    Edit
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="mt-3 text-xs text-slate-400">
                      Note: System Admin role is protected. Users/roles enforcement comes from Firestore rules (already configured in your rules).
                    </div>
                  </CardContent>
                </Card>
              </div>
            }
          />

          {/* Danger */}
          <Route
            path="danger"
            element={
              <div className="mt-6 space-y-6">
                <Card className="rounded-2xl border border-rose-400/25 bg-rose-500/5 text-slate-100 backdrop-blur">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-rose-200">
                      <AlertTriangle className="h-5 w-5" />
                      Danger Zone
                    </CardTitle>
                    <CardDescription className="text-slate-300/80">
                      Scaffold only. We’ll wire real deletes to Firestore with safeguards once you confirm the workflow.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="rounded-xl border border-rose-400/20 bg-slate-950/30 p-4">
                      <div className="text-sm font-semibold text-slate-50">Bulk delete (example list)</div>
                      <div className="text-xs text-slate-400 mt-1">Select items then confirm delete.</div>

                      <div className="mt-4 space-y-2">
                        {seed.deleteItems.map((it) => (
                          <div
                            key={it.id}
                            className="flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/40 p-3"
                          >
                            <div>
                              <div className="font-semibold text-slate-100">{it.name}</div>
                              <div className="text-xs text-slate-400">{it.meta}</div>
                            </div>
                            <Checkbox checked={deleteChecks.has(it.id)} onCheckedChange={() => toggleDeleteCheck(it.id)} />
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex items-center gap-2 justify-end">
                        <Button
                          variant="outline"
                          className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                          onClick={clearDangerSelection}
                        >
                          Clear
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              className="rounded-full bg-rose-500 text-white hover:bg-rose-600"
                              disabled={deleteChecks.size === 0}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete selected
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="border border-slate-700/60 bg-slate-950 text-slate-100">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete selected items?</AlertDialogTitle>
                              <AlertDialogDescription className="text-slate-300">
                                This scaffold does not delete Firestore yet. When you’re ready, we’ll wire it safely with admin-only rules + audit logging.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="bg-slate-900 text-slate-200 border-slate-700/70">
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-rose-500 text-white hover:bg-rose-600"
                                onClick={() => {
                                  alert(`Selected: ${deleteChecks.size} item(s). (Wire to Firestore next)`);
                                  clearDangerSelection();
                                }}
                              >
                                Confirm
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            }
          />

          {/* ✅ Fallback */}
          <Route path="*" element={<Navigate to="." replace />} />
        </Routes>

        <div className="mt-10 text-xs text-slate-400 flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" /> Aurora Stock Control • Admin UI scaffold
        </div>
      </div>

      {/* =========================
          MODALS
         ========================= */}

      {/* Assign Role Modal */}
      {isAssignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800/70 bg-slate-900/95 p-5 shadow-2xl text-slate-100">
            <div className="text-lg font-semibold text-slate-50">Assign role</div>
            <div className="text-xs text-slate-400 mt-1">Pick a role for this user.</div>

            <div className="mt-4">
              <label className="text-xs text-slate-300">Role</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                value={assignRoleId}
                onChange={(e) => setAssignRoleId(e.target.value)}
              >
                <option value="">No role</option>
                {roleOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            {assignRoleError && (
              <div className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-100">
                {assignRoleError}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                disabled={assignRoleBusy}
                onClick={() => {
                  setIsAssignOpen(false);
                  setAssignUserId(null);
                  setAssignRoleId("");
                  setAssignRoleError("");
                }}
              >
                Cancel
              </Button>
              <Button
                className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30"
                onClick={saveAssignedRole}
                disabled={assignRoleBusy}
              >
                {assignRoleBusy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Link */}
      {resetLinkTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800/70 bg-slate-900/95 p-5 shadow-2xl text-slate-100">
            <div className="flex items-center gap-2 text-lg font-semibold text-slate-50">
              <Link2 className="h-5 w-5" /> Password link for {resetLinkTarget.displayName || resetLinkTarget.email}
            </div>

            {!resetLinkResult ? (
              <div className="text-sm text-slate-300 mt-2">
                This generates a fresh link that lets <strong className="text-slate-100">{resetLinkTarget.email}</strong> set a new password. It's recorded in the audit log. Their current password keeps working until they use the link.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
                  <div className="text-xs text-slate-400 mb-1">Password-set link for {resetLinkResult.email}</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate text-xs text-slate-200">{resetLinkResult.link}</code>
                    <Button type="button" size="sm" variant="outline" className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60 shrink-0" onClick={copyResetLink}>
                      <Copy className="h-3.5 w-3.5 mr-1.5" /> {resetLinkCopied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-100">
                  This link expires in <strong>one hour</strong>, so send it to them directly and only when they're ready to use it. Anyone who has the link can set this account's password — don't post it in a shared channel.
                </div>
              </div>
            )}

            {resetLinkError && (
              <div className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-100">
                {resetLinkError}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                disabled={resetLinkBusy}
                onClick={closeResetLink}
              >
                {resetLinkResult ? "Done" : "Cancel"}
              </Button>
              {!resetLinkResult && (
                <Button className="rounded-full bg-teal-500 text-slate-950 hover:bg-teal-400" disabled={resetLinkBusy} onClick={generateResetLink}>
                  {resetLinkBusy ? "Generating…" : "Generate link"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirmation */}
      {deleteUserTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900/95 p-5 shadow-2xl text-slate-100">
            <div className="flex items-center gap-2 text-lg font-semibold text-rose-200">
              <AlertTriangle className="h-5 w-5" /> Delete this account permanently?
            </div>
            <div className="text-sm text-slate-300 mt-2">
              <strong className="text-slate-100">{deleteUserTarget.displayName || deleteUserTarget.email}</strong> ({deleteUserTarget.email}) will be permanently removed — sign-in access and their profile. This can't be undone. If you might need this account again, use Reactivate instead of Delete.
            </div>

            {deleteUserError && (
              <div className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-100">
                {deleteUserError}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                disabled={deleteUserBusy}
                onClick={() => { setDeleteUserTarget(null); setDeleteUserError(""); }}
              >
                Cancel
              </Button>
              <Button
                className="rounded-full bg-rose-500 text-white hover:bg-rose-600"
                disabled={deleteUserBusy}
                onClick={confirmDeleteUser}
              >
                {deleteUserBusy ? "Deleting…" : "Delete permanently"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Role Modal */}
      {isAddRoleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur p-4">
          <div className="flex w-full max-w-md max-h-[85vh] flex-col rounded-2xl border border-slate-800/70 bg-slate-900/95 shadow-2xl text-slate-100">
            <div className="p-5 pb-0">
              <div className="text-lg font-semibold text-slate-50">{editingRole ? "Edit Role" : "Add Role"}</div>
              <div className="text-xs text-slate-400 mt-1">{editingRole ? `Update ${editingRole.name}'s permissions.` : "Create a non-admin role."}</div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs text-slate-300">Role name</label>
                  <Input
                    value={newRole.name}
                    onChange={(e) => setNewRole((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Stock Manager"
                    disabled={!!editingRole}
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300">Description</label>
                  <Input
                    value={newRole.description}
                    onChange={(e) => setNewRole((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex-1 min-h-0 overflow-y-auto px-5">
              <label className="text-xs text-slate-300">Permissions</label>
              <div className="mt-2 space-y-2 text-sm pb-2">
                {PERMISSIONS.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-slate-200">
                    <Checkbox
                      checked={newRole.permissions.includes(p.id)}
                      onCheckedChange={(v) => {
                        setNewRole((prev) => {
                          const next = new Set(prev.permissions);
                          if (v) next.add(p.id);
                          else next.delete(p.id);
                          return { ...prev, permissions: Array.from(next) };
                        });
                      }}
                    />
                    <span className="text-slate-100">{p.label}</span>
                    <span className="text-[11px] text-slate-400 ml-1">({p.id})</span>
                  </label>
                ))}
              </div>
            </div>

            {addRoleError && (
              <div className="mx-5 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-100">
                {addRoleError}
              </div>
            )}

            <div className="flex justify-end gap-2 p-5 pt-4 border-t border-slate-800/70">
              <Button
                variant="outline"
                className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                disabled={addRoleBusy}
                onClick={() => {
                  setNewRole({ name: "", description: "", permissions: ["inventory.read"] });
                  setEditingRole(null);
                  setAddRoleError("");
                  setIsAddRoleOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30"
                disabled={addRoleBusy}
                onClick={addRole}
              >
                {addRoleBusy ? "Saving…" : editingRole ? "Save changes" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


