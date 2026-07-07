import React, { useEffect, useMemo, useState } from "react";
import {
  listAnaphylaxisBoxes,
  getLatestCheck,
  createMonthlyCheck,
  fetchSeedJson,
  seedFromJson,
} from "@/lib/checklistsFirestore";
import ChecklistManagerDialog from "@/components/Inventory/ChecklistManagerDialog";

import useStock from "@/hooks/useStock";
import { auth } from "@/lib/firebase";

const STATUSES = ["OK", "Missing", "Expired", "N/A"];

function monthKey(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function openPrintWindow(html) {
  const w = window.open("", "_blank");
  if (!w) return alert("Popup blocked - please allow popups for PDF export.");
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export default function AnaphylaxisBoxesTab() {
  const { items: stockItems } = useStock({ includeArchived: false });

  const [boxes, setBoxes] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);

  const selected = useMemo(
    () => boxes.find((b) => b.id === selectedId) || null,
    [boxes, selectedId]
  );

  const [form, setForm] = useState({ results: {}, notes: "" });
  const [latest, setLatest] = useState(null);
  const [saving, setSaving] = useState(false);

  const [seedBusy, setSeedBusy] = useState(false);
  const [seedError, setSeedError] = useState("");
  const [seedInfo, setSeedInfo] = useState("");

  const [manageOpen, setManageOpen] = useState(false);
  const [manageDoc, setManageDoc] = useState(null);

  async function reloadBoxes(selectFirst = true) {
    const list = await listAnaphylaxisBoxes();
    setBoxes(list);
    if (selectFirst) setSelectedId(list[0]?.id || "");
    return list;
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const list = await listAnaphylaxisBoxes();
        if (!mounted) return;
        setBoxes(list);
        setSelectedId(list[0]?.id || "");
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let mounted = true;
    (async () => {
      try {
        const l = await getLatestCheck("anaphylaxis_boxes", selectedId);
        if (!mounted) return;
        setLatest(l);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selected) return;
    const initial = {};
    for (const it of selected.items || []) {
      initial[it.id] = {
        status: "OK",
        qty: it.expectedQty ?? "",
        batch: it.defaultBatch ?? "",
        expiry: it.defaultExpiry ?? "",
        notes: "",
      };
    }
    setForm({ results: initial, notes: "" });
  }, [selectedId, selected]);

  async function handleSeed() {
    setSeedError("");
    setSeedInfo("");
    try {
      setSeedBusy(true);
      const seedJson = await fetchSeedJson();
      const res = await seedFromJson(seedJson);

      const list = await reloadBoxes(true);
      if (list.length === 0) {
        setSeedError(
          "Seeding completed, but no boxes were returned. Check Firestore rules / console."
        );
        return;
      }
      setSeedInfo(`Created/updated ${res.anaCount} anaphylaxis box(es).`);
    } catch (e) {
      console.error("Seed failed:", e);
      setSeedError(e?.message || String(e));
      alert(`Seed failed: ${e?.message || e}`);
    } finally {
      setSeedBusy(false);
    }
  }

  function setItem(itemId, patch) {
    setForm((prev) => ({
      ...prev,
      results: {
        ...prev.results,
        [itemId]: { ...prev.results[itemId], ...patch },
      },
    }));
  }

  function stockForBarcode(barcode) {
    if (!barcode) return null;
    const b = String(barcode).trim().toLowerCase();
    return (
      stockItems.find(
        (s) => String(s?.barcode || "").trim().toLowerCase() === b
      ) || null
    );
  }

  function exportPdf() {
    if (!selected) return;
    const mk = monthKey();

    const rows = (selected.items || []).map((it) => {
      const r = form.results?.[it.id] || {};
      const stock = it.stock_barcode ? stockForBarcode(it.stock_barcode) : null;
      const stockText = stock
        ? `${stock.current_stock ?? "-"} (min ${stock.min_stock ?? 0})`
        : it.stock_barcode
        ? "Not found"
        : "";
      return {
        name: it.name,
        status: r.status || "OK",
        qty: r.qty || "",
        batch: r.batch || "",
        expiry: r.expiry || "",
        stock: stockText,
        notes: r.notes || "",
      };
    });

    const esc = (v) =>
      String(v ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");

    const tr = rows
      .map(
        (r) => `
      <tr>
        <td>${esc(r.name)}</td>
        <td>${esc(r.status)}</td>
        <td>${esc(r.qty)}</td>
        <td>${esc(r.batch)}</td>
        <td>${esc(r.expiry)}</td>
        <td>${esc(r.stock)}</td>
        <td>${esc(r.notes)}</td>
      </tr>
    `
      )
      .join("");

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Anaphylaxis Emergency Boxes Monthly Checklist - ${esc(
      selected.name
    )} - ${esc(mk)}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
  h1 { margin: 0 0 6px 0; font-size: 18px; }
  .sub { margin: 0 0 18px 0; font-size: 12px; color:#333; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #333; padding: 6px; vertical-align: top; }
  th { background: #f2f2f2; }
  .meta { margin-top: 14px; font-size: 12px; }
  .muted { color: #444; }
</style>
</head>
<body>
  <h1>Anaphylaxis Emergency Boxes Monthly Checklist - ${esc(selected.name)}</h1>
  <p class="sub">
    Month: <strong>${esc(mk)}</strong>
    &nbsp;|&nbsp; Site: <strong>${esc(selected.site || "-")}</strong>
    &nbsp;|&nbsp; Location: <strong>${esc(selected.location || "-")}</strong>
  </p>

  <table>
    <thead>
      <tr>
        <th style="width:22%">Item</th>
        <th style="width:8%">Status</th>
        <th style="width:6%">Qty</th>
        <th style="width:10%">Batch</th>
        <th style="width:10%">Expiry</th>
        <th style="width:10%">Stock</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${tr}
    </tbody>
  </table>

  <div class="meta">
    <div><span class="muted">Overall notes:</span> ${esc(form.notes || "")}</div>
    <div style="margin-top:8px;"><span class="muted">Generated:</span> ${new Date()
      .toISOString()
      .slice(0, 16)
      .replace("T", " ")}</div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 200);
    }
  </script>
</body>
</html>`;

    openPrintWindow(html);
  }

  async function submit() {
    if (!selected) return;
    try {
      setSaving(true);
      const payload = {
        monthKey: monthKey(),
        box: {
          id: selected.id,
          name: selected.name,
          location: selected.location || null,
          site: selected.site || null,
        },
        submittedAtLocal: new Date().toISOString(),
        results: Object.entries(form.results).map(([itemId, v]) => ({
          itemId,
          status: v.status,
          qty: v.qty || null,
          batch: v.batch || null,
          expiry: v.expiry || null,
          notes: v.notes || null,
        })),
        notes: form.notes || null,
      };
      await createMonthlyCheck("anaphylaxis_boxes", selected.id, payload);
      const l = await getLatestCheck("anaphylaxis_boxes", selected.id);
      setLatest(l);
      alert("Saved anaphylaxis box check.");
    } catch (e) {
      console.error(e);
      alert("Could not save. Check console for details.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-slate-300">Loading...</div>;

  // Show manage buttons for any signed-in user. Firestore rules still enforce admin-only edits.
  const canManage = Boolean(auth?.currentUser);
  const existingIds = boxes.map((b) => b.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-100">
            Anaphylaxis Emergency Boxes - Monthly Check
          </div>
          <div className="text-sm text-slate-300">
            Quick monthly verification with expiry tracking.
          </div>
        </div>

        <div className="flex gap-2">
          {canManage && boxes.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => {
                  setManageDoc(selected || null);
                  setManageOpen(true);
                }}
                className="px-3 py-2 rounded-xl text-sm border border-slate-700 text-slate-200 hover:bg-slate-900/40"
                title="Admin only (Firestore rules enforce this)"
              >
                Manage box
              </button>

              <button
                type="button"
                onClick={() => {
                  setManageDoc(null);
                  setManageOpen(true);
                }}
                className="px-3 py-2 rounded-xl text-sm border bg-teal-600/20 border-teal-500/60 text-teal-100 hover:bg-teal-600/30"
                title="Admin only (Firestore rules enforce this)"
              >
                Add box
              </button>
            </>
          )}

          {boxes.length > 0 && (
            <button
              type="button"
              onClick={exportPdf}
              className="px-3 py-2 rounded-xl text-sm border bg-slate-900/30 border-slate-800 text-slate-200 hover:bg-slate-900/50"
              title="Opens print dialog - choose Save as PDF"
            >
              Export PDF
            </button>
          )}
        </div>
      </div>

      {boxes.length === 0 ? (
        <div className="border border-slate-800 rounded-2xl p-4 bg-slate-950/30">
          <div className="text-slate-200">No anaphylaxis boxes found.</div>
          <div className="text-xs text-slate-400 mt-1">
            Click below to create your default boxes from the seed.
          </div>

          <button
            type="button"
            onClick={handleSeed}
            disabled={seedBusy}
            className={[
              "mt-3 px-4 py-2 rounded-xl text-sm border transition",
              seedBusy
                ? "bg-slate-800/30 border-slate-700 text-slate-400 cursor-not-allowed"
                : "bg-teal-600/20 border-teal-500/60 text-teal-100 hover:bg-teal-600/30",
            ].join(" ")}
          >
            {seedBusy ? "Creating..." : "Create default set from seed"}
          </button>

          {seedInfo && (
            <div className="mt-3 text-sm text-emerald-200">{seedInfo}</div>
          )}
          {seedError && <div className="mt-3 text-sm text-rose-300">{seedError}</div>}

          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => reloadBoxes(true)}
              className="text-xs text-slate-300 underline"
            >
              Refresh list
            </button>

            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setManageDoc(null);
                  setManageOpen(true);
                }}
                className="text-xs text-teal-200 underline"
                title="Admin only (Firestore rules enforce this)"
              >
                Add manually
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-300">Box</label>
              <select
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {boxes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.location ? ` - ${b.location}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-xs text-slate-400">
              Latest check:{" "}
              {latest?.monthKey ? (
                <span className="text-slate-200">{latest.monthKey}</span>
              ) : (
                <span className="text-slate-500">None yet</span>
              )}
            </div>
          </div>

          <div className="border border-slate-800 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-950/60 text-xs text-slate-300">
              <div className="col-span-4">Item</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1">Qty</div>
              <div className="col-span-2">Batch</div>
              <div className="col-span-2">Expiry</div>
              <div className="col-span-1">Stock</div>
            </div>

            {(selected?.items || []).map((it) => {
              const stock = it.stock_barcode ? stockForBarcode(it.stock_barcode) : null;
              const stockBadge = stock ? `${stock.current_stock ?? "-"}` : (it.stock_barcode ? "!" : "");
              const stockTitle = stock
                ? `Stock: ${stock.current_stock ?? "-"} (min ${stock.min_stock ?? 0})`
                : (it.stock_barcode ? `No stock item found for barcode ${it.stock_barcode}` : "");

              return (
                <div
                  key={it.id}
                  className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-slate-800/60"
                >
                  <div className="col-span-12 sm:col-span-4">
                    <div className="text-sm text-slate-100">{it.name}</div>
                    <div className="text-xs text-slate-400">
                      {it.stock_barcode ? `link: ${it.stock_barcode}` : ""}
                    </div>

                    <textarea
                      className="mt-2 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                      placeholder="Item notes (optional)..."
                      value={form.results?.[it.id]?.notes || ""}
                      onChange={(e) => setItem(it.id, { notes: e.target.value })}
                      rows={2}
                    />
                  </div>

                  <div className="col-span-6 sm:col-span-2">
                    <select
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm"
                      value={form.results?.[it.id]?.status || "OK"}
                      onChange={(e) => setItem(it.id, { status: e.target.value })}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-6 sm:col-span-1">
                    <input
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm"
                      value={form.results?.[it.id]?.qty || ""}
                      onChange={(e) => setItem(it.id, { qty: e.target.value })}
                      placeholder="-"
                    />
                  </div>

                  <div className="col-span-6 sm:col-span-2">
                    <input
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm"
                      value={form.results?.[it.id]?.batch || ""}
                      onChange={(e) => setItem(it.id, { batch: e.target.value })}
                      placeholder="-"
                    />
                  </div>

                  <div className="col-span-6 sm:col-span-2">
                    <input
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm"
                      value={form.results?.[it.id]?.expiry || ""}
                      onChange={(e) => setItem(it.id, { expiry: e.target.value })}
                      placeholder="YYYY-MM-DD"
                    />
                  </div>

                  <div className="col-span-12 sm:col-span-1 flex items-center justify-end">
                    {it.stock_barcode ? (
                      <span
                        title={stockTitle}
                        className={[
                          "px-2 py-1 rounded-full text-xs border",
                          stock
                            ? "border-emerald-500/40 text-emerald-200 bg-emerald-500/10"
                            : "border-rose-500/40 text-rose-200 bg-rose-500/10",
                        ].join(" ")}
                      >
                        {stockBadge}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-600">-</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-300">Overall notes (optional)</label>
            <textarea
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-200"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
              placeholder="Anything to flag?"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className={[
                "px-4 py-2 rounded-xl text-sm border transition",
                saving
                  ? "bg-slate-800/30 border-slate-700 text-slate-400 cursor-not-allowed"
                  : "bg-teal-600/20 border-teal-500/60 text-teal-100 hover:bg-teal-600/30",
              ].join(" ")}
            >
              {saving ? "Saving..." : `Submit ${monthKey()} check`}
            </button>
          </div>
        </>
      )}

      <ChecklistManagerDialog
        open={manageOpen}
        onClose={async (changed) => {
          setManageOpen(false);
          setManageDoc(null);
          if (changed) {
            const list = await reloadBoxes(false);
            if (!list.find((b) => b.id === selectedId)) {
              setSelectedId(list[0]?.id || "");
            }
          }
        }}
        parentCollection="anaphylaxis_boxes"
        existingIds={existingIds}
        initialDoc={manageDoc}
        title="Manage Anaphylaxis Box"
        itemHasSection={false}
      />
    </div>
  );
}
