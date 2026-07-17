import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { Building2, Globe2, Mail, Phone } from "lucide-react";

import { db } from "@/lib/firebase";

const ORDERING_METHODS = [
  { value: "manual", label: "Manual" },
  { value: "email", label: "Email" },
  { value: "portal", label: "Supplier Portal" },
  { value: "csv", label: "CSV Upload" },
  { value: "api", label: "API" },
  { value: "edi", label: "EDI / NHS Procurement" },
];

const emptyForm = {
  name: "",
  contact_name: "",
  email: "",
  phone: "",
  website: "",
  ordering_method: "manual",
  ordering_email: "",
  portal_url: "",
  account_number: "",
  api_provider: "",
  lead_time_days: "",
  delivery_days: "",
  notes: "",
  supports_auto_ordering: false,
  requires_login: false,
  preferred: false,
};

function clean(value) {
  return String(value || "").trim();
}

function titleCase(value) {
  const text = String(value || "manual").replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function SupplierDirectory() {
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const qSuppliers = query(collection(db, "suppliers"));

    const unsub = onSnapshot(qSuppliers, (snap) => {
      const rows = snap.docs.map((row) => ({
        id: row.id,
        ...row.data(),
      }));

      setSuppliers(rows);
    });

    return () => unsub();
  }, []);

  const activeSuppliers = useMemo(
    () => suppliers.filter((supplier) => supplier.active !== false),
    [suppliers]
  );

  const integrationReady = useMemo(
    () => suppliers.filter((supplier) => supplier.ordering_method && supplier.ordering_method !== "manual"),
    [suppliers]
  );

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const addSupplier = async () => {
    const name = clean(form.name);

    if (!name) {
      alert("Supplier name required");
      return;
    }

    try {
      setSaving(true);

      await addDoc(collection(db, "suppliers"), {
        name,
        contact_name: clean(form.contact_name),
        email: clean(form.email),
        phone: clean(form.phone),
        website: clean(form.website),
        ordering_method: form.ordering_method || "manual",
        ordering_email: clean(form.ordering_email) || clean(form.email),
        portal_url: clean(form.portal_url) || clean(form.website),
        account_number: clean(form.account_number),
        api_provider: clean(form.api_provider),
        lead_time_days: Number(form.lead_time_days || 0),
        delivery_days: clean(form.delivery_days),
        notes: clean(form.notes),
        supports_auto_ordering: Boolean(form.supports_auto_ordering),
        requires_login: Boolean(form.requires_login),
        preferred: Boolean(form.preferred),
        active: true,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      setForm(emptyForm);
    } catch (err) {
      console.error(err);
      alert("Failed to add supplier");
    } finally {
      setSaving(false);
    }
  };

  const updateSupplier = async (supplierId, patch) => {
    try {
      await updateDoc(doc(db, "suppliers", supplierId), {
        ...patch,
        updated_at: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
      alert("Failed to update supplier");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-300">
          <Building2 className="h-6 w-6" />
        </div>

        <div>
          <h1 className="text-2xl font-bold">Suppliers</h1>
          <p className="text-sm text-slate-400">
            Manage supplier details, ordering methods, portal links and future integration settings.
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Active Suppliers</div>
          <div className="mt-2 text-3xl font-bold text-white">{activeSuppliers.length}</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Integration Ready</div>
          <div className="mt-2 text-3xl font-bold text-white">{integrationReady.length}</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Preferred Suppliers</div>
          <div className="mt-2 text-3xl font-bold text-white">{suppliers.filter((s) => s.preferred).length}</div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-4 font-semibold text-white">Add Supplier</h2>

        <div className="grid gap-3 md:grid-cols-3">
          <input
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="Supplier name *"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
          />

          <input
            value={form.contact_name}
            onChange={(e) => updateField("contact_name", e.target.value)}
            placeholder="Contact name"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
          />

          <input
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="General email"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
          />

          <input
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            placeholder="Phone"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
          />

          <input
            value={form.website}
            onChange={(e) => updateField("website", e.target.value)}
            placeholder="Website"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
          />

          <input
            value={form.account_number}
            onChange={(e) => updateField("account_number", e.target.value)}
            placeholder="Account number"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
          />

          <select
            value={form.ordering_method}
            onChange={(e) => updateField("ordering_method", e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
          >
            {ORDERING_METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>

          <input
            value={form.ordering_email}
            onChange={(e) => updateField("ordering_email", e.target.value)}
            placeholder="Ordering email"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
          />

          <input
            value={form.portal_url}
            onChange={(e) => updateField("portal_url", e.target.value)}
            placeholder="Ordering portal URL"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
          />

          <input
            value={form.api_provider}
            onChange={(e) => updateField("api_provider", e.target.value)}
            placeholder="API provider / integration name"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
          />

          <input
            type="number"
            value={form.lead_time_days}
            onChange={(e) => updateField("lead_time_days", e.target.value)}
            placeholder="Lead time days"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
          />

          <input
            value={form.delivery_days}
            onChange={(e) => updateField("delivery_days", e.target.value)}
            placeholder="Delivery days e.g. Mon/Wed/Fri"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
          />
        </div>

        <textarea
          value={form.notes}
          onChange={(e) => updateField("notes", e.target.value)}
          placeholder="Notes, ordering instructions, carriage rules, login details location etc."
          rows={3}
          className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
        />

        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.supports_auto_ordering}
              onChange={(e) => updateField("supports_auto_ordering", e.target.checked)}
            />
            Supports auto ordering
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.requires_login}
              onChange={(e) => updateField("requires_login", e.target.checked)}
            />
            Requires portal login
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.preferred}
              onChange={(e) => updateField("preferred", e.target.checked)}
            />
            Preferred supplier
          </label>
        </div>

        <button
          type="button"
          onClick={addSupplier}
          disabled={saving}
          className="mt-4 rounded-xl bg-cyan-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-50"
        >
          {saving ? "Adding..." : "Add Supplier"}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-4 font-semibold text-white">Supplier Directory</h2>

        {suppliers.length === 0 ? (
          <p className="text-sm text-slate-400">No suppliers yet.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {suppliers.map((supplier) => (
              <div key={supplier.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-white">{supplier.name}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {supplier.contact_name || "No contact"}
                      {supplier.lead_time_days ? ` • ${supplier.lead_time_days} day lead time` : ""}
                    </div>
                  </div>

                  <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs font-semibold text-cyan-200">
                    {titleCase(supplier.ordering_method || "manual")}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
                  <div className="flex items-center gap-2 truncate">
                    <Mail className="h-4 w-4 text-slate-500" />
                    <span className="truncate">{supplier.ordering_email || supplier.email || "No email"}</span>
                  </div>

                  <div className="flex items-center gap-2 truncate">
                    <Phone className="h-4 w-4 text-slate-500" />
                    <span className="truncate">{supplier.phone || "No phone"}</span>
                  </div>

                  <div className="flex items-center gap-2 truncate md:col-span-2">
                    <Globe2 className="h-4 w-4 text-slate-500" />
                    <span className="truncate">{supplier.portal_url || supplier.website || "No portal or website"}</span>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">
                  <div>Account: {supplier.account_number || "Not recorded"}</div>
                  <div>Delivery days: {supplier.delivery_days || "Not recorded"}</div>
                  <div>API provider: {supplier.api_provider || "Not configured"}</div>
                </div>

                {supplier.notes && (
                  <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
                    {supplier.notes}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => updateSupplier(supplier.id, { active: supplier.active === false })}
                    className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    {supplier.active === false ? "Mark Active" : "Mark Inactive"}
                  </button>

                  <button
                    type="button"
                    onClick={() => updateSupplier(supplier.id, { preferred: !supplier.preferred })}
                    className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200"
                  >
                    {supplier.preferred ? "Preferred ✓" : "Set Preferred"}
                  </button>

                  {supplier.supports_auto_ordering && (
                    <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200">
                      Auto-order ready
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
