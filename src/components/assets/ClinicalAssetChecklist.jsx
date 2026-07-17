import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  MapPin,
  PackageCheck,
  Printer,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import ChecklistManagerDialog from "@/components/Inventory/ChecklistManagerDialog";
import ClinicalChecklistItemRow from "@/components/assets/ClinicalChecklistItemRow";
import useStock from "@/hooks/useStock";
import { auth } from "@/lib/firebase";
import {
  buildAssetQrPayload,
  calculateAssetReadiness,
  daysUntil,
  formatLastChecked,
  getMedTrakAssetId,
  openAssetLabelPrintWindow,
} from "@/services/assets/assetLabelService";

const STATUSES = ["OK", "Missing", "Expired", "N/A"];

function monthKey(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

function openPrintWindow(html) {
  const w = window.open("", "_blank");
  if (!w) return alert("Popup blocked - please allow popups for print/export.");
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function readinessCopy(status) {
  if (status === "critical") {
    return {
      title: "Action required before use",
      icon: AlertTriangle,
      badge: "",
      tone: "danger",
    };
  }
  if (status === "action") {
    return {
      title: "Check required",
      icon: CalendarClock,
      badge: "",
      tone: "warning",
    };
  }
  return {
    title: "Ready for use",
    icon: CheckCircle2,
    badge: "",
    tone: "success",
  };
}

function semanticStatusStyle(tone) {
  const colour = tone === "danger" ? "#dc2626" : tone === "warning" ? "#d97706" : "#059669";
  return {
    borderColor: `color-mix(in srgb, ${colour} 42%, var(--medtrak-border))`,
    background: `color-mix(in srgb, ${colour} 12%, var(--medtrak-panel))`,
    color: `color-mix(in srgb, ${colour} 78%, var(--medtrak-text))`,
  };
}

function themedHeroStyle() {
  return {
    borderColor: "color-mix(in srgb, var(--medtrak-accent) 30%, var(--medtrak-border))",
    background: "linear-gradient(135deg, color-mix(in srgb, var(--medtrak-accent) 14%, var(--medtrak-panel)), color-mix(in srgb, var(--medtrak-accent-2) 7%, var(--medtrak-panel)))",
    color: "var(--medtrak-text)",
  };
}

function itemStatusClass(status, expiryDays) {
  if (status === "Missing" || status === "Expired" || (expiryDays !== null && expiryDays < 0)) {
    return "border-destructive/40 bg-destructive/10 text-rose-100";
  }
  if (expiryDays !== null && expiryDays <= 30) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  }
  if (status === "N/A") return "border-[color:var(--medtrak-border)] bg-[color:color-mix(in_srgb,var(--medtrak-muted)_12%,var(--medtrak-panel))] text-[color:var(--medtrak-muted)]";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
}

function StatCard({ label, value, detail, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel-soft)] p-4 text-[color:var(--medtrak-text)] shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--medtrak-muted)]">{label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--medtrak-text)]">{value}</div>
          {detail && <div className="mt-1 text-xs text-[color:var(--medtrak-muted)]">{detail}</div>}
        </div>
        {Icon && (
          <div className="rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:color-mix(in_srgb,var(--medtrak-bg)_88%,var(--medtrak-panel))] p-3 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ClinicalAssetChecklist({
  title,
  subtitle,
  collectionName,
  entityLabel = "asset",
  entityLabelPlural = "assets",
  listEntities,
  createCheck,
  getLatestCheck,
  fetchSeedJson,
  seedFromJson,
  seedResultKey,
  seedButtonLabel,
  checklistTitle,
  enableSections = false,
}) {
  const { items: stockItems } = useStock({ includeArchived: false });
  const [entities, setEntities] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ results: {}, notes: "" });
  const [latest, setLatest] = useState(null);
  const [saving, setSaving] = useState(false);
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedError, setSeedError] = useState("");
  const [seedInfo, setSeedInfo] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [manageDoc, setManageDoc] = useState(null);

  const selected = useMemo(
    () => entities.find((item) => item.id === selectedId) || null,
    [entities, selectedId]
  );

  const readiness = useMemo(
    () => calculateAssetReadiness({ asset: selected, latest, results: form.results }),
    [selected, latest, form.results]
  );

  const statusMeta = readinessCopy(readiness.status);
  const StatusIcon = statusMeta.icon;

  async function reloadEntities(selectFirst = true) {
    const list = await listEntities();
    setEntities(list);
    if (selectFirst) setSelectedId(list[0]?.id || "");
    return list;
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const list = await listEntities();
        if (!mounted) return;
        setEntities(list);
        setSelectedId(list[0]?.id || "");
      } catch (error) {
        console.error(error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [listEntities]);

  useEffect(() => {
    if (!selectedId) return;
    let mounted = true;
    (async () => {
      try {
        const record = await getLatestCheck(collectionName, selectedId);
        if (!mounted) return;
        setLatest(record);
      } catch (error) {
        console.error(error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [collectionName, getLatestCheck, selectedId]);

  useEffect(() => {
    if (!selected) return;
    const initial = {};
    for (const item of selected.items || []) {
      initial[item.id] = {
        status: "OK",
        qty: item.expectedQty ?? "",
        batch: item.defaultBatch ?? "",
        expiry: item.defaultExpiry ?? "",
        notes: "",
      };
    }
    setForm({ results: initial, notes: "" });
  }, [selectedId, selected]);

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
    return stockItems.find((s) => String(s?.barcode || "").trim().toLowerCase() === b) || null;
  }

  async function handleSeed() {
    setSeedError("");
    setSeedInfo("");
    try {
      setSeedBusy(true);
      const seedJson = await fetchSeedJson();
      const result = await seedFromJson(seedJson);
      const list = await reloadEntities(true);
      if (list.length === 0) {
        setSeedError(`Seeding completed, but no ${entityLabelPlural} were returned. Check Firestore rules.`);
        return;
      }
      setSeedInfo(`Created/updated ${result?.[seedResultKey] ?? list.length} ${entityLabelPlural}.`);
    } catch (error) {
      console.error("Seed failed:", error);
      setSeedError(error?.message || String(error));
      alert(`Seed failed: ${error?.message || error}`);
    } finally {
      setSeedBusy(false);
    }
  }

  async function submit() {
    if (!selected) return;
    try {
      setSaving(true);
      const payload = {
        monthKey: monthKey(),
        asset: {
          id: selected.id,
          medtrakAssetId: getMedTrakAssetId(collectionName, selected.id),
          name: selected.name,
          location: selected.location || null,
          site: selected.site || null,
        },
        readiness: {
          score: readiness.score,
          status: readiness.status,
          missing: readiness.missing,
          expired: readiness.expired,
          expiringSoon: readiness.expiringSoon,
        },
        submittedAtLocal: new Date().toISOString(),
        results: Object.entries(form.results).map(([itemId, value]) => ({
          itemId,
          status: value.status,
          qty: value.qty || null,
          batch: value.batch || null,
          expiry: value.expiry || null,
          notes: value.notes || null,
        })),
        notes: form.notes || null,
      };
      await createCheck(collectionName, selected.id, payload);
      const record = await getLatestCheck(collectionName, selected.id);
      setLatest(record);
      alert(`${checklistTitle} saved.`);
    } catch (error) {
      console.error(error);
      alert("Could not save. Check console for details.");
    } finally {
      setSaving(false);
    }
  }

  function exportPdf() {
    if (!selected) return;
    const mk = monthKey();
    const rows = (selected.items || [])
      .map((item) => {
        const result = form.results?.[item.id] || {};
        const stock = item.stock_barcode ? stockForBarcode(item.stock_barcode) : null;
        const stockText = stock
          ? `${stock.current_stock ?? "-"} (min ${stock.min_stock ?? 0})`
          : item.stock_barcode
          ? "Linked item not found"
          : "Kit item - no barcode";
        return {
          section: item.section || "General",
          name: item.name,
          status: result.status || "OK",
          qty: result.qty || "",
          batch: result.batch || "",
          expiry: result.expiry || "",
          stock: stockText,
          notes: result.notes || "",
        };
      })
      .map((row) => `
        <tr>
          ${enableSections ? `<td>${escapeHtml(row.section)}</td>` : ""}
          <td>${escapeHtml(row.name)}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${escapeHtml(row.qty)}</td>
          <td>${escapeHtml(row.batch)}</td>
          <td>${escapeHtml(row.expiry)}</td>
          <td>${escapeHtml(row.stock)}</td>
          <td>${escapeHtml(row.notes)}</td>
        </tr>`)
      .join("");

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(checklistTitle)} - ${escapeHtml(selected.name)} - ${escapeHtml(mk)}</title>
<style>
  body { font-family: Arial, sans-serif; color:#111827; margin:24px; }
  h1 { margin:0 0 4px 0; font-size:20px; }
  .sub { color:#475569; font-size:12px; margin:0 0 18px 0; }
  .summary { border:1px solid #cbd5e1; border-radius:14px; padding:12px; margin-bottom:16px; display:flex; gap:18px; font-size:12px; }
  .summary strong { font-size:16px; display:block; color:#0f766e; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  th, td { border:1px solid #334155; padding:6px; vertical-align:top; }
  th { background:#f1f5f9; }
  .meta { margin-top:14px; font-size:12px; color:#334155; }
</style>
</head>
<body>
  <h1>${escapeHtml(checklistTitle)} - ${escapeHtml(selected.name)}</h1>
  <p class="sub">Asset ID: ${escapeHtml(getMedTrakAssetId(collectionName, selected.id))} | Month: ${escapeHtml(mk)} | Location: ${escapeHtml(selected.location || "-")}</p>
  <div class="summary">
    <div><strong>${readiness.score}%</strong>Readiness</div>
    <div><strong>${readiness.itemCount}</strong>Items</div>
    <div><strong>${readiness.missing}</strong>Missing</div>
    <div><strong>${readiness.expiringSoon}</strong>Expiring soon</div>
    <div><strong>${readiness.expired}</strong>Expired</div>
  </div>
  <table>
    <thead>
      <tr>
        ${enableSections ? "<th>Section</th>" : ""}
        <th>Item</th><th>Status</th><th>Qty</th><th>Batch</th><th>Expiry</th><th>Stock</th><th>Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="meta">Overall notes: ${escapeHtml(form.notes || "")}<br/>Generated: ${new Date().toLocaleString()}</div>
  <script>window.onload = () => setTimeout(() => window.print(), 200);</script>
</body>
</html>`;
    openPrintWindow(html);
  }

  if (loading) {
    return <div className="rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] p-5 text-[color:var(--medtrak-text)]">Loading {entityLabelPlural}...</div>;
  }

  const canManage = Boolean(auth?.currentUser);
  const existingIds = entities.map((entity) => entity.id);
  const qrPayload = selected ? buildAssetQrPayload(collectionName, selected.id) : "";
  const medtrakAssetId = selected ? getMedTrakAssetId(collectionName, selected.id) : "";

  if (entities.length === 0) {
    return (
      <div className="rounded-3xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] p-6 text-[color:var(--medtrak-text)] shadow-sm">
        <div className="max-w-3xl">
          <div className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Clinical Asset Platform
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[color:var(--medtrak-text)]">No {entityLabelPlural} found</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--medtrak-muted)]">
            Create the default set from your seed checklist or add a custom asset manually. Each asset can receive a MedTrak ID and QR label so staff can scan the physical kit and open the correct workflow instantly.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSeed}
              disabled={seedBusy}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {seedBusy ? "Creating..." : seedButtonLabel}
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setManageDoc(null);
                  setManageOpen(true);
                }}
                className="rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--medtrak-text)] transition hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_10%,var(--medtrak-panel))]"
              >
                Add manually
              </button>
            )}
          </div>
          {seedInfo && <div className="mt-4 text-sm text-emerald-300">{seedInfo}</div>}
          {seedError && <div className="mt-4 text-sm text-rose-300">{seedError}</div>}
        </div>
        <ChecklistManagerDialog
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          parentCollection={collectionName}
          existingIds={existingIds}
          initialDoc={manageDoc}
          onSaved={async (savedId) => {
            const list = await reloadEntities(false);
            setSelectedId(savedId || list[0]?.id || "");
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 text-[color:var(--medtrak-text)]">
      <section
        className="relative overflow-hidden rounded-3xl border p-5 shadow-sm"
        style={themedHeroStyle()}
      >
        <div className="pointer-events-none absolute bottom-5 right-6 hidden rounded-full border border-[color:var(--medtrak-border)]/60 bg-[color:color-mix(in_srgb,var(--medtrak-bg)_90%,var(--medtrak-panel))] p-5 opacity-20 2xl:block">
          <ShieldCheck className="h-12 w-12 text-primary" />
        </div>
        <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <StatusIcon className="h-3.5 w-3.5" />
              Clinical Readiness
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[color:var(--medtrak-text)]">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[color:var(--medtrak-muted)]">{subtitle}</p>
            {selected && (
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[color:var(--medtrak-muted)]">
                <span className="rounded-full border border-[color:var(--medtrak-border)] bg-[color:color-mix(in_srgb,var(--medtrak-bg)_88%,var(--medtrak-panel))] px-3 py-1">
                  {medtrakAssetId}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--medtrak-border)] bg-[color:color-mix(in_srgb,var(--medtrak-bg)_88%,var(--medtrak-panel))] px-3 py-1">
                  <MapPin className="h-3.5 w-3.5" /> {selected.location || "Location not set"}
                </span>
                <span className="rounded-full border border-[color:var(--medtrak-border)] bg-[color:color-mix(in_srgb,var(--medtrak-bg)_88%,var(--medtrak-panel))] px-3 py-1">
                  Last check: {formatLastChecked(latest)}
                </span>
              </div>
            )}
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:w-[320px]">
            <div className="rounded-3xl border border-[color:var(--medtrak-border)] bg-[color:color-mix(in_srgb,var(--medtrak-bg)_88%,var(--medtrak-panel))] p-4 text-center shadow-sm">
              <div className="text-4xl font-bold tracking-tight text-[color:var(--medtrak-text)]">{readiness.score}%</div>
              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[color:var(--medtrak-muted)]">Readiness</div>
            </div>
            <div
              className="rounded-3xl border p-4 text-center shadow-sm"
              style={semanticStatusStyle(statusMeta.tone)}
            >
              <StatusIcon className="mx-auto h-7 w-7" />
              <div className="mt-2 text-sm font-semibold">{statusMeta.title}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Assets" value={entities.length} detail={`Tracked ${entityLabelPlural}`} icon={Boxes} />
        <StatCard label="Kit Items" value={readiness.itemCount} detail="Expected contents" icon={PackageCheck} />
        <StatCard label="Missing" value={readiness.missing} detail="Must be resolved" icon={AlertTriangle} />
        <StatCard label="Expiring" value={readiness.expiringSoon} detail="Within 30 days" icon={CalendarClock} />
        <StatCard label="QR Ready" value="Yes" detail="Print asset label" icon={QrCode} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <div className="rounded-3xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] p-4 text-[color:var(--medtrak-text)] shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="text-sm font-medium text-[color:var(--medtrak-muted)]">{capitalise(entityLabel)}</label>
                <select
                  className="min-w-[260px] rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-3 py-2 text-sm text-[color:var(--medtrak-text)] outline-none ring-offset-background focus:ring-2 focus:ring-ring"
                  value={selectedId}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}{entity.location ? ` - ${entity.location}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setManageDoc(selected || null);
                        setManageOpen(true);
                      }}
                      className="rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-3 py-2 text-sm font-medium text-[color:var(--medtrak-text)] transition hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_10%,var(--medtrak-panel))]"
                    >
                      Manage
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setManageDoc(null);
                        setManageOpen(true);
                      }}
                      className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/15"
                    >
                      Add {entityLabel}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={exportPdf}
                  className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-3 py-2 text-sm font-medium text-[color:var(--medtrak-text)] transition hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_10%,var(--medtrak-panel))]"
                >
                  <FileDown className="h-4 w-4" /> Export check
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] text-[color:var(--medtrak-text)] shadow-sm">
            <div className="border-b border-[color:var(--medtrak-border)] px-5 py-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-[color:var(--medtrak-text)]">Verification checklist</h3>
                  <p className="text-sm text-[color:var(--medtrak-muted)]">Tick through the expected contents. Individual vials may not have a barcode once removed from the original packaging, so this check belongs to the asset QR code.</p>
                </div>
                <div className="rounded-full border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-3 py-1 text-xs text-[color:var(--medtrak-muted)]">{monthKey()}</div>
              </div>
            </div>

            <div className="divide-y divide-border">
              {(selected?.items || []).map((item) => {
                const result = form.results?.[item.id] || {};
                const expiryDays = daysUntil(result.expiry || item.defaultExpiry);
                const stock = item.stock_barcode ? stockForBarcode(item.stock_barcode) : null;
                const status = result.status || "OK";
                return (
                  <ClinicalChecklistItemRow
                    key={item.id}
                    item={item}
                    result={result}
                    status={status}
                    statuses={STATUSES}
                    statusLabel={expiryLabel(status, expiryDays)}
                    statusClass={itemStatusClass(status, expiryDays)}
                    enableSections={enableSections}
                    stock={stock}
                    onChange={(patch) => setItem(item.id, patch)}
                  />
                );
              })}
            </div>

            <div className="border-t border-[color:var(--medtrak-border)] p-5">
              <label className="text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--medtrak-muted)]">Overall notes</label>
              <textarea
                className="mt-2 min-h-[90px] w-full rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-3 py-2 text-sm text-[color:var(--medtrak-text)] placeholder:text-[color:var(--medtrak-muted)] outline-none focus:ring-2 focus:ring-ring"
                placeholder="Overall notes, missing item action, replacement ordered, or reason for delay..."
                value={form.notes}
                onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
              />
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-[color:var(--medtrak-muted)]">Saved checks are audit records. Use notes to explain any missing, expired or replaced items.</p>
                <button
                  type="button"
                  onClick={submit}
                  disabled={saving || !selected}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ClipboardCheck className="h-4 w-4" /> {saving ? "Saving..." : "Save verification"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-3xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] p-5 text-[color:var(--medtrak-text)] shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3 text-primary">
                <QrCode className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-[color:var(--medtrak-text)]">Asset QR Label</h3>
                <p className="text-xs text-[color:var(--medtrak-muted)]">Retrofit physical kits with a Primovex identity.</p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] p-4 text-center">
              <img
                className="mx-auto h-36 w-36 rounded-xl border border-[color:var(--medtrak-border)] bg-white p-2"
                alt={`QR code for ${medtrakAssetId}`}
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(qrPayload)}`}
              />
              <div className="mt-3 font-mono text-sm font-semibold text-[color:var(--medtrak-text)]">{medtrakAssetId}</div>
              <div className="mt-1 text-xs text-[color:var(--medtrak-muted)]">{selected?.location || "No location set"}</div>
            </div>
            <button
              type="button"
              onClick={() => openAssetLabelPrintWindow({ asset: selected, collectionName, title: checklistTitle })}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-4 py-2.5 text-sm font-semibold text-[color:var(--medtrak-text)] transition hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_10%,var(--medtrak-panel))]"
            >
              <Printer className="h-4 w-4" /> Print / save label
            </button>
            <p className="mt-3 text-xs leading-5 text-[color:var(--medtrak-muted)]">The manufacturer barcode remains useful for boxed stock. Once a kit is assembled or split into individual vials, use this Primovex QR code to identify the kit and verify contents.</p>
          </div>

          <div className="rounded-3xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] p-5 text-[color:var(--medtrak-text)] shadow-sm">
            <h3 className="font-semibold text-[color:var(--medtrak-text)]">Primovex AI readiness notes</h3>
            <div className="mt-4 space-y-3 text-sm text-[color:var(--medtrak-muted)]">
              <InsightLine icon={ShieldCheck} text={`${readiness.score}% readiness score calculated from missing, expired, expiring and overdue verification items.`} />
              <InsightLine icon={CalendarClock} text={readiness.checkOverdue ? "Verification is overdue or missing. Add this to today's clinical readiness queue." : "Verification cadence is currently within tolerance."} />
              <InsightLine icon={PackageCheck} text={readiness.missing > 0 ? `${readiness.missing} expected item(s) are missing and should be replaced before the asset is marked ready.` : "All expected items are present unless marked otherwise."} />
              <InsightLine icon={AlertTriangle} text={readiness.expiringSoon > 0 ? `${readiness.expiringSoon} item(s) expire within 30 days. Consider replacing during the next stock cycle.` : "No near-expiry items detected from this checklist."} />
            </div>
          </div>
        </aside>
      </section>

      <ChecklistManagerDialog
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        parentCollection={collectionName}
        existingIds={existingIds}
        initialDoc={manageDoc}
        onSaved={async (savedId) => {
          const list = await reloadEntities(false);
          setSelectedId(savedId || list[0]?.id || "");
        }}
      />
    </div>
  );
}

function InsightLine({ icon: Icon, text }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:color-mix(in_srgb,var(--medtrak-bg)_88%,var(--medtrak-panel))] p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span className="leading-5">{text}</span>
    </div>
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function capitalise(value) {
  const str = String(value || "asset");
  return `${str.slice(0, 1).toUpperCase()}${str.slice(1)}`;
}

function expiryLabel(status, expiryDays) {
  if (status === "Missing") return "Missing";
  if (status === "Expired" || (expiryDays !== null && expiryDays < 0)) return "Expired";
  if (expiryDays !== null && expiryDays <= 30) return `Expires in ${expiryDays}d`;
  if (status === "N/A") return "N/A";
  return "OK";
}
