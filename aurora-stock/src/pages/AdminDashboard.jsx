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
} from "lucide-react";

import AddUser from "./admin/AddUser";

// ✅ Firestore activity feed
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase";

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
const defaultRoles = [
  {
    id: "role-user",
    name: "User",
    description: "Standard access for stock tasks.",
    permissions: ["stock:read", "stock:write"],
    protected: true,
  },
  {
    id: "role-readonly",
    name: "ReadOnly",
    description: "View-only access.",
    permissions: ["stock:read"],
    protected: true,
  },
  {
    id: "role-admin",
    name: "System Admin",
    description: "Full access including admin tools.",
    permissions: ["*"],
    protected: true,
  },
];

// ✅ Human-friendly permission labels (values stay the same)
const PERMISSIONS = [
  { id: "stock:read", label: "View stock" },
  { id: "stock:write", label: "Edit stock" },
  { id: "admin:read", label: "Access admin tools" },
];

function slugifyRole(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

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
  // NOTE: Scaffold admin
  const isAdmin = true;
  const authLoading = false;

  const { totalItems, lowStockItems, loading: stockLoading } = useStockSummary();

  const seed = useMemo(
    () => ({
      sites: [
        {
          id: "main",
          name: "Main Surgery",
          address: "123 Medical Centre, High Street",
          phone: "0101 234 5678",
          locations: [
            { id: "l1", name: "Treatment Room 1", type: "Room" },
            { id: "l2", name: "Treatment Room 2", type: "Room" },
            { id: "l3", name: "Vaccine Fridge A", type: "Fridge" },
            { id: "l4", name: "Store Cupboard", type: "Storage" },
            { id: "l5", name: "Reception", type: "Area" },
          ],
          itemCount: 12,
        },
        {
          id: "branch",
          name: "Branch Surgery",
          address: "45 Branch Road",
          phone: "0101 987 6543",
          locations: [
            { id: "b1", name: "Treatment Room", type: "Room" },
            { id: "b2", name: "Vaccine Fridge", type: "Fridge" },
            { id: "b3", name: "Storage", type: "Storage" },
          ],
          itemCount: 0,
        },
      ],
      users: [
        {
          id: "u1",
          display: "gwyn.hughes",
          email: "gwyn.hughes@wales.nhs.uk",
          role: "User",
          joined: "04 Dec 2025",
        },
        {
          id: "u2",
          display: "Gwyn Hughes",
          email: "gwynhughes50@gmail.com",
          role: "System Admin",
          joined: "04 Dec 2025",
        },
      ],
      deleteItems: [
        { id: "d1", name: "Disposable Bed Rolls", meta: "non_medical • 45 rolls" },
        { id: "d2", name: "Surgical Masks (Box 50)", meta: "non_medical • 8 boxes" },
        { id: "d3", name: "Blood Collection Tubes (Red)", meta: "non_medical • 120 tubes" },
        { id: "d4", name: "Paracetamol 500mg", meta: "medicinal • 25 packs" },
      ],
    }),
    []
  );

  const [sites, setSites] = useState(seed.sites);
  const [users, setUsers] = useState(seed.users);
  const [activeSiteId, setActiveSiteId] = useState(seed.sites[0]?.id || "main");

  // ✅ NEW: keep activeSiteId valid when sites change (this is what makes delete reliable)
  useEffect(() => {
    if (!sites || sites.length === 0) {
      if (activeSiteId !== "") setActiveSiteId("");
      return;
    }
    const exists = sites.some((s) => s.id === activeSiteId);
    if (!exists) setActiveSiteId(sites[0].id);
  }, [sites, activeSiteId]);

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

  // Roles (stateful)
  const [roles, setRoles] = useState(defaultRoles);
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);
  const [newRole, setNewRole] = useState({
    name: "",
    description: "",
    permissions: ["stock:read"],
  });

  // Role assignment modal
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState(null);
  const [assignRoleId, setAssignRoleId] = useState("");

  // Add Site modal
  const [isAddSiteOpen, setIsAddSiteOpen] = useState(false);
  const [newSite, setNewSite] = useState({ name: "", address: "", phone: "" });

  // ✅ Edit Site modal
  const [isEditSiteOpen, setIsEditSiteOpen] = useState(false);
  const [editSite, setEditSite] = useState({ id: "", name: "", address: "", phone: "" });

  // Add Location modal
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [newLocation, setNewLocation] = useState({ name: "", type: "Room" });

  // ✅ Edit Location modal
  const [isEditLocationOpen, setIsEditLocationOpen] = useState(false);
  const [editLocation, setEditLocation] = useState({ id: "", name: "", type: "Room" });

  // Danger zone state
  const [deleteChecks, setDeleteChecks] = useState(() => new Set());

  // Derived
  const totalSites = sites.length;
  const totalLocations = sites.reduce((a, s) => a + s.locations.length, 0);
  const totalUsers = users.length;
  const activeSite = sites.find((s) => s.id === activeSiteId) || sites[0];

  const roleOptions = useMemo(() => roles.map((r) => ({ id: r.id, name: r.name })), [roles]);
  const getRoleByName = (name) => roles.find((r) => r.name.toLowerCase() === String(name || "").toLowerCase());

  const addSite = () => {
    const name = newSite.name.trim();
    if (!name) return;

    const siteId = makeId("site");
    const siteToAdd = {
      id: siteId,
      name,
      address: newSite.address.trim(),
      phone: newSite.phone.trim(),
      locations: [],
      itemCount: 0,
    };

    setSites((prev) => [...prev, siteToAdd]);
    setActiveSiteId(siteId);
    setNewSite({ name: "", address: "", phone: "" });
    setIsAddSiteOpen(false);
  };

  const openEditSite = () => {
    if (!activeSite) return;
    setEditSite({
      id: activeSite.id,
      name: activeSite.name || "",
      address: activeSite.address || "",
      phone: activeSite.phone || "",
    });
    setIsEditSiteOpen(true);
  };

  const saveEditSite = () => {
    const name = editSite.name.trim();
    if (!editSite.id || !name) return;

    setSites((prev) =>
      prev.map((s) =>
        s.id === editSite.id
          ? {
              ...s,
              name,
              address: (editSite.address || "").trim(),
              phone: (editSite.phone || "").trim(),
            }
          : s
      )
    );

    setIsEditSiteOpen(false);
    setEditSite({ id: "", name: "", address: "", phone: "" });
  };

  // ✅ FIXED: deleteSite is now simple + reliable (activeSiteId is handled by the effect)
  const deleteSite = (siteId) => {
    if (!siteId) return;
    setSites((prev) => prev.filter((s) => s.id !== siteId));
  };

  const addLocation = () => {
    const name = newLocation.name.trim();
    if (!name) return;

    setSites((prev) =>
      prev.map((s) =>
        s.id === activeSiteId
          ? {
              ...s,
              locations: [...s.locations, { id: makeId("loc"), name, type: newLocation.type }],
            }
          : s
      )
    );

    setNewLocation({ name: "", type: "Room" });
    setIsAddLocationOpen(false);
  };

  const openEditLocation = (loc) => {
    if (!loc?.id) return;
    setEditLocation({ id: loc.id, name: loc.name || "", type: loc.type || "Room" });
    setIsEditLocationOpen(true);
  };

  const saveEditLocation = () => {
    const name = editLocation.name.trim();
    if (!name || !editLocation.id) return;

    setSites((prev) =>
      prev.map((s) =>
        s.id === activeSiteId
          ? {
              ...s,
              locations: (s.locations || []).map((l) =>
                l.id === editLocation.id ? { ...l, name, type: editLocation.type } : l
              ),
            }
          : s
      )
    );

    setIsEditLocationOpen(false);
    setEditLocation({ id: "", name: "", type: "Room" });
  };

  const deleteLocation = (locId) => {
    setSites((prev) =>
      prev.map((s) =>
        s.id === activeSiteId ? { ...s, locations: s.locations.filter((l) => l.id !== locId) } : s
      )
    );
  };

  const openAssignRole = (userId, currentRoleName) => {
    setAssignUserId(userId);
    const current = getRoleByName(currentRoleName);
    setAssignRoleId(current?.id || "");
    setIsAssignOpen(true);
  };

  const saveAssignedRole = () => {
    if (!assignUserId) return;
    const picked = roles.find((r) => r.id === assignRoleId);
    const roleNameToStore = picked?.name || "No Role";

    setUsers((prev) => prev.map((u) => (u.id === assignUserId ? { ...u, role: roleNameToStore } : u)));

    setIsAssignOpen(false);
    setAssignUserId(null);
    setAssignRoleId("");
  };

  const addRole = () => {
    const name = newRole.name.trim();
    if (!name) return;

    if (name.toLowerCase().includes("admin")) {
      alert("Admin roles are protected. Create non-admin roles only.");
      return;
    }
    if (roles.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      alert("Role already exists.");
      return;
    }

    const id = `role-${slugifyRole(name) || Date.now()}`;

    setRoles((prev) => [
      ...prev,
      {
        id,
        name,
        description: newRole.description.trim(),
        permissions: newRole.permissions,
        protected: false,
      },
    ]);

    setNewRole({ name: "", description: "", permissions: ["stock:read"] });
    setIsAddRoleOpen(false);
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
                      {sites.map((s) => (
                        <div
                          key={s.id}
                          className="rounded-xl bg-slate-950/40 border border-slate-800/70 p-4 flex items-center justify-between"
                        >
                          <div>
                            <div className="font-semibold text-slate-50">{s.name}</div>
                            <div className="text-sm text-slate-400">{s.locations.length} locations</div>
                          </div>
                          <Badge variant="outline" className="border-slate-700/70 text-slate-200">
                            {s.itemCount || 0} items
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>
            }
          />

          {/* Sites */}
          <Route
            path="sites"
            element={
              <div className="mt-6 space-y-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <Tabs value={activeSiteId} onValueChange={setActiveSiteId}>
                    <TabsList className="bg-slate-900/40 border border-slate-800/60 rounded-2xl">
                      {sites.map((s) => (
                        <TabsTrigger
                          key={s.id}
                          value={s.id}
                          className="data-[state=active]:bg-slate-800/60 data-[state=active]:text-slate-50"
                        >
                          {s.name}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                      onClick={() => setIsAddLocationOpen(true)}
                      disabled={!activeSite}
                      title={!activeSite ? "No site selected" : ""}
                    >
                      <Plus className="h-4 w-4 mr-2" /> Add Location
                    </Button>

                    <Button
                      className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30"
                      onClick={() => setIsAddSiteOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" /> Add Site
                    </Button>
                  </div>
                </div>

                {/* Active Site details */}
                <Card className="rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 backdrop-blur">
                  <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Pin className="h-4 w-4 text-teal-300" />
                        {activeSite?.name || "Site"}
                      </CardTitle>
                      <CardDescription className="text-slate-300/80">
                        {activeSite?.address || "No address set"} {activeSite?.phone ? `• ${activeSite.phone}` : ""}
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-slate-700/70 text-slate-200">
                        {activeSite?.locations?.length || 0} locations
                      </Badge>

                      <Button
                        variant="outline"
                        className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                        onClick={openEditSite}
                        disabled={!activeSite}
                      >
                        <Pencil className="h-4 w-4 mr-2" /> Edit Site
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            className="rounded-full border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15"
                            disabled={!activeSite}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete Site
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="border border-slate-700/60 bg-slate-950 text-slate-100">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this site?</AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-300">
                              Are you sure you want to delete{" "}
                              <span className="text-slate-100 font-medium">
                                {activeSite?.name || "this site"}
                              </span>
                              ? This will remove the site and all its locations from the admin scaffold.
                              <br />
                              <br />
                              <span className="text-rose-200">This cannot be undone.</span>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="bg-slate-900 text-slate-200 border-slate-700/70">
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-rose-500 text-white hover:bg-rose-600"
                              onClick={() => activeSite?.id && deleteSite(activeSite.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <Separator className="bg-slate-800/70 mb-4" />

                    <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 overflow-hidden">
                      <div className="px-4 py-3 flex items-center justify-between">
                        <div className="font-semibold text-slate-50">Locations</div>
                        <div className="text-xs text-slate-400">Site = building • Location = room/cupboard</div>
                      </div>

                      <Table>
                        <TableHeader>
                          <TableRow className="border-slate-800/70">
                            <TableHead className="text-slate-300">Name</TableHead>
                            <TableHead className="text-slate-300">Type</TableHead>
                            <TableHead className="text-slate-300 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(activeSite?.locations || []).length === 0 ? (
                            <TableRow className="border-slate-800/70">
                              <TableCell colSpan={3} className="text-slate-400 py-8 text-center">
                                No locations yet. Click <span className="text-slate-200 font-medium">Add Location</span>.
                              </TableCell>
                            </TableRow>
                          ) : (
                            activeSite.locations.map((loc) => (
                              <TableRow key={loc.id} className="border-slate-800/70">
                                <TableCell className="text-slate-100">{loc.name}</TableCell>
                                <TableCell className="text-slate-300">{loc.type}</TableCell>
                                <TableCell className="text-right">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="outline"
                                        className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                                      >
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="border border-slate-700/60 bg-slate-950 text-slate-100">
                                      <DropdownMenuItem className="cursor-pointer" onClick={() => openEditLocation(loc)}>
                                        <Pencil className="h-4 w-4 mr-2" /> Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="cursor-pointer text-rose-200 focus:text-rose-200"
                                        onClick={() => deleteLocation(loc.id)}
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
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
                              <TableHead className="text-slate-300">Joined</TableHead>
                              <TableHead className="text-slate-300 text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {users.map((u) => (
                              <TableRow key={u.id} className="border-slate-800/70">
                                <TableCell className="text-slate-100">{u.display}</TableCell>
                                <TableCell className="text-slate-300">{u.email}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="border-slate-700/70 text-slate-200">
                                    {u.role}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-slate-300">{u.joined}</TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="outline"
                                    className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                                    onClick={() => openAssignRole(u.id, u.role)}
                                  >
                                    <KeyRound className="h-4 w-4 mr-2" /> Assign role
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="mt-3 text-xs text-slate-400">
                        Note: this is currently using scaffold user data. Next step is wiring users to Firestore.
                      </div>
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
                        Scaffold roles list (later: store roles in Firestore).
                      </CardDescription>
                    </div>
                    <Button
                      className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30"
                      onClick={() => setIsAddRoleOpen(true)}
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

      {/* Add Site Modal */}
      {isAddSiteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800/70 bg-slate-900/95 p-5 shadow-2xl text-slate-100">
            <div className="text-lg font-semibold text-slate-50">Add Site</div>
            <div className="text-xs text-slate-400 mt-1">Create a new building/site.</div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-300">Site name</label>
                <Input
                  value={newSite.name}
                  onChange={(e) => setNewSite((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Main Surgery"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300">Address</label>
                <Input
                  value={newSite.address}
                  onChange={(e) => setNewSite((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300">Phone</label>
                <Input
                  value={newSite.phone}
                  onChange={(e) => setNewSite((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                onClick={() => {
                  setNewSite({ name: "", address: "", phone: "" });
                  setIsAddSiteOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30"
                onClick={addSite}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Edit Site Modal */}
      {isEditSiteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800/70 bg-slate-900/95 p-5 shadow-2xl text-slate-100">
            <div className="text-lg font-semibold text-slate-50">Edit Site</div>
            <div className="text-xs text-slate-400 mt-1">Update site name, address and phone.</div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-300">Site name</label>
                <Input
                  value={editSite.name}
                  onChange={(e) => setEditSite((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Main Surgery"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300">Address</label>
                <Input
                  value={editSite.address}
                  onChange={(e) => setEditSite((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300">Phone</label>
                <Input
                  value={editSite.phone}
                  onChange={(e) => setEditSite((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                onClick={() => {
                  setIsEditSiteOpen(false);
                  setEditSite({ id: "", name: "", address: "", phone: "" });
                }}
              >
                Cancel
              </Button>
              <Button
                className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30"
                onClick={saveEditSite}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Location Modal */}
      {isAddLocationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800/70 bg-slate-900/95 p-5 shadow-2xl text-slate-100">
            <div className="text-lg font-semibold text-slate-50">Add Location</div>
            <div className="text-xs text-slate-400 mt-1">
              Add a room/cupboard for:{" "}
              <span className="text-slate-200 font-medium">{activeSite?.name || "Site"}</span>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-300">Location name</label>
                <Input
                  value={newLocation.name}
                  onChange={(e) => setNewLocation((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Treatment Room 1"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300">Type</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={newLocation.type}
                  onChange={(e) => setNewLocation((p) => ({ ...p, type: e.target.value }))}
                >
                  <option value="Room">Room</option>
                  <option value="Storage">Storage</option>
                  <option value="Fridge">Fridge</option>
                  <option value="Freezer">Freezer</option>
                  <option value="Area">Area</option>
                  <option value="Cupboard">Cupboard</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                onClick={() => {
                  setNewLocation({ name: "", type: "Room" });
                  setIsAddLocationOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30"
                onClick={addLocation}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Edit Location Modal */}
      {isEditLocationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800/70 bg-slate-900/95 p-5 shadow-2xl text-slate-100">
            <div className="text-lg font-semibold text-slate-50">Edit Location</div>
            <div className="text-xs text-slate-400 mt-1">Update location name and type.</div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-300">Location name</label>
                <Input
                  value={editLocation.name}
                  onChange={(e) => setEditLocation((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Treatment Room 1"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300">Type</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={editLocation.type}
                  onChange={(e) => setEditLocation((p) => ({ ...p, type: e.target.value }))}
                >
                  <option value="Room">Room</option>
                  <option value="Storage">Storage</option>
                  <option value="Fridge">Fridge</option>
                  <option value="Freezer">Freezer</option>
                  <option value="Area">Area</option>
                  <option value="Cupboard">Cupboard</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                onClick={() => {
                  setIsEditLocationOpen(false);
                  setEditLocation({ id: "", name: "", type: "Room" });
                }}
              >
                Cancel
              </Button>
              <Button
                className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30"
                onClick={saveEditLocation}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

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

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                onClick={() => {
                  setIsAssignOpen(false);
                  setAssignUserId(null);
                  setAssignRoleId("");
                }}
              >
                Cancel
              </Button>
              <Button
                className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30"
                onClick={saveAssignedRole}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Role Modal */}
      {isAddRoleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800/70 bg-slate-900/95 p-5 shadow-2xl text-slate-100">
            <div className="text-lg font-semibold text-slate-50">Add Role</div>
            <div className="text-xs text-slate-400 mt-1">Create a non-admin role.</div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-300">Role name</label>
                <Input
                  value={newRole.name}
                  onChange={(e) => setNewRole((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Stock Manager"
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

              <div>
                <label className="text-xs text-slate-300">Permissions</label>
                <div className="mt-2 space-y-2 text-sm">
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
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                onClick={() => {
                  setNewRole({ name: "", description: "", permissions: ["stock:read"] });
                  setIsAddRoleOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30"
                onClick={addRole}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


