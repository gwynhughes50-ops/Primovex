import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Battery,
  Bell,
  CheckCircle2,
  Clock3,
  Fingerprint,
  Package,
  RadioTower,
  Search,
  ShieldCheck,
  Sparkles,
  Thermometer,
  UserRound,
  Zap,
} from "lucide-react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";

import useStock from "@/hooks/useStock";
import useNotifications from "@/hooks/useNotifications";
import useConnectedDevices from "@/hooks/useConnectedDevices";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";

function safeDateLabel(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function firstName(displayName) {
  return String(displayName || "").split(" ").filter(Boolean)[0] || "there";
}

function MetricCard({ label, value, icon: Icon, tone = "teal", sub }) {
  const tones = {
    teal: "border-teal-400/20 bg-teal-500/10 text-teal-100",
    emerald: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
    amber: "border-amber-400/20 bg-amber-500/10 text-amber-100",
    rose: "border-rose-400/20 bg-rose-500/10 text-rose-100",
    sky: "border-sky-400/20 bg-sky-500/10 text-sky-100",
    slate: "border-white/10 bg-white/[0.04] text-slate-100",
  };

  return (
    <div className={`rounded-[1.35rem] border p-4 ${tones[tone] || tones.teal}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-80">{label}</span>
        {Icon && <Icon className="h-4 w-4 opacity-90" />}
      </div>
      <p className="mt-2 text-2xl font-black tracking-tight text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function ActionButton({ icon: Icon, label, sub, onClick, primary = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[82px] items-center gap-3 rounded-[1.35rem] border p-4 text-left shadow-xl shadow-black/10 transition active:scale-[0.98] ${
        primary
          ? "border-teal-300/30 bg-teal-400 text-slate-950"
          : "border-white/10 bg-slate-900/80 text-white hover:bg-slate-900"
      }`}
    >
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${primary ? "bg-slate-950/10" : "bg-white/[0.06]"}`}>
        {Icon && <Icon className="h-5 w-5" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black">{label}</span>
        {sub && <span className={`mt-0.5 block text-xs ${primary ? "text-slate-800" : "text-slate-400"}`}>{sub}</span>}
      </span>
    </button>
  );
}

function Section({ title, action, children }) {
  return (
    <section className="mt-5">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function LowStockList({ items, loading, onSelectItem }) {
  if (loading) {
    return <div className="rounded-3xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-400">Loading stock intelligence…</div>;
  }

  if (!items.length) {
    return (
      <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-200" />
          <div>
            <p className="font-bold text-white">Stock looks healthy</p>
            <p className="text-sm text-slate-400">No low stock items detected.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.slice(0, 6).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelectItem?.(item)}
          className="flex w-full items-center justify-between gap-3 rounded-3xl border border-white/10 bg-slate-900 p-4 text-left transition hover:bg-slate-800/80 active:scale-[0.99]"
        >
          <span className="min-w-0">
            <span className="block truncate font-bold text-white">{item.name || "Unnamed item"}</span>
            {(item.strength || item.form || item.location) && (
              <span className="mt-0.5 block truncate text-xs text-slate-400">
                {[item.strength, item.form, item.location].filter(Boolean).join(" • ")}
              </span>
            )}
          </span>
          <span className="shrink-0 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm font-black text-rose-100">
            {item.current_stock ?? 0}/{item.min_stock ?? 0}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function MobileHome({ mode = "home", onSelectItem, onNavigate, onScan, onSearch }) {
  const { user, profile, role, capabilities = [], displayName } = useAuth();
  const { allItems = [], loading } = useStock({ includeArchived: false });
  const { summary: notificationSummary, rows: notifications = [] } = useNotifications(user?.uid);
  const { intelligence: connectIntelligence } = useConnectedDevices();

  const [latestTemp, setLatestTemp] = useState(null);
  const [tempLoading, setTempLoading] = useState(true);
  const [recentMoves, setRecentMoves] = useState([]);
  const [governanceSummary, setGovernanceSummary] = useState({ open: 0, high: 0, dueSoon: 0, learning: 0 });

  const notificationCounts = notificationSummary?.counts || { critical: 0, high: 0, routine: 0, total: 0 };

  const lowStockList = useMemo(() => {
    return allItems
      .filter((item) => Number(item.current_stock || 0) <= Number(item.min_stock || 0))
      .sort((a, b) => {
        const aGap = Number(a.current_stock || 0) - Number(a.min_stock || 0);
        const bGap = Number(b.current_stock || 0) - Number(b.min_stock || 0);
        return aGap - bGap;
      });
  }, [allItems]);

  const lowStockCount = lowStockList.length;

  useEffect(() => {
    const qTemp = query(collection(db, "temperature_logs"), orderBy("measured_at", "desc"), limit(1));
    const unsub = onSnapshot(
      qTemp,
      (snap) => {
        const row = snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null;
        setLatestTemp(row);
        setTempLoading(false);
      },
      () => setTempLoading(false)
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const qMoves = query(collection(db, "stock_movements"), orderBy("created_at", "desc"), limit(4));
    const unsub = onSnapshot(
      qMoves,
      (snap) => {
        setRecentMoves(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
      () => setRecentMoves([])
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const qCases = query(collection(db, "governance_cases"), orderBy("createdAt", "desc"), limit(80));
    const unsub = onSnapshot(
      qCases,
      (snap) => {
        const rows = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const open = rows.filter((row) => !["closed", "resolved"].includes(String(row.status || "").toLowerCase())).length;
        const high = rows.filter((row) => ["high", "red"].includes(String(row.priority || "").toLowerCase())).length;
        const learning = rows.filter((row) => row.learningActionsOutstanding || row.learningOutstanding).length;
        const now = Date.now();
        const inSevenDays = now + 7 * 24 * 60 * 60 * 1000;
        const dueSoon = rows.filter((row) => {
          const raw = row.responseDueAt || row.finalResponseDue || row.dueDate;
          const date = raw?.toDate?.() || (raw ? new Date(raw) : null);
          return date && !Number.isNaN(date.getTime()) && date.getTime() >= now && date.getTime() <= inSevenDays;
        }).length;
        setGovernanceSummary({ open, high, dueSoon, learning });
      },
      () => setGovernanceSummary({ open: 0, high: 0, dueSoon: 0, learning: 0 })
    );

    return () => unsub();
  }, []);

  const tempValue = latestTemp?.temp;
  const temperatureLabel = tempLoading
    ? "—"
    : tempValue !== undefined && tempValue !== null
      ? `${Number(tempValue).toFixed(1)}°`
      : connectIntelligence?.coldChainOk
        ? "OK"
        : "Review";

  const practiceStatus = notificationCounts.critical > 0 || connectIntelligence?.critical?.length > 0
    ? "Action required"
    : lowStockCount > 0 || governanceSummary.dueSoon > 0
      ? "Stable, with work due"
      : "Operating normally";

  const dailyBrief = [
    notificationCounts.total > 0
      ? `${notificationCounts.total} assigned item${notificationCounts.total === 1 ? "" : "s"} need attention.`
      : "No assigned notification queue items currently need action.",
    lowStockCount > 0
      ? `${lowStockCount} stock item${lowStockCount === 1 ? " is" : "s are"} at or below minimum level.`
      : "Stock alerts are quiet.",
    connectIntelligence?.headline || "Connected devices are ready for review.",
    governanceSummary.open > 0
      ? `${governanceSummary.open} governance case${governanceSummary.open === 1 ? " is" : "s are"} open.`
      : "No open governance cases detected in the mobile summary.",
  ];

  const estimatedWorkMins = Math.max(
    2,
    notificationCounts.total * 4 + lowStockCount * 2 + governanceSummary.dueSoon * 8 + (connectIntelligence?.critical?.length || 0) * 5
  );

  if (mode === "stock") {
    return (
      <div className="min-h-screen bg-slate-950 px-4 pb-28 pt-4 text-white">
        <div className="rounded-[1.8rem] border border-emerald-400/20 bg-gradient-to-br from-emerald-500/15 via-slate-900 to-slate-950 p-5 shadow-2xl shadow-black/20">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-200">MedTrak Mobile</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Stock workspace</h1>
          <p className="mt-1 text-sm text-slate-300">Scan, use, receive and verify stock without returning to a desk.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <ActionButton icon={Zap} label="Scan item" sub="Use or receive" primary onClick={onScan} />
            <ActionButton icon={Search} label="Search stock" sub="Manual lookup" onClick={onSearch} />
          </div>
        </div>

        <Section title="Stock health">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Items" value={loading ? "—" : allItems.length} icon={Package} tone="emerald" sub="Active inventory" />
            <MetricCard label="Low" value={loading ? "—" : lowStockCount} icon={AlertTriangle} tone={lowStockCount ? "rose" : "emerald"} sub="Needs review" />
          </div>
        </Section>

        <Section title="Low stock">
          <LowStockList items={lowStockList} loading={loading} onSelectItem={onSelectItem} />
        </Section>
      </div>
    );
  }

  if (mode === "me") {
    return (
      <div className="min-h-screen bg-slate-950 px-4 pb-28 pt-4 text-white">
        <div className="rounded-[1.8rem] border border-sky-400/20 bg-gradient-to-br from-sky-500/15 via-slate-900 to-slate-950 p-5 shadow-2xl shadow-black/20">
          <div className="flex items-start gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-3xl border border-white/10 bg-white/[0.06]">
              <UserRound className="h-8 w-8 text-sky-100" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sky-200">MedTrak Mobile</p>
              <h1 className="mt-1 truncate text-2xl font-black tracking-tight">{displayName || user?.email || "Mobile user"}</h1>
              <p className="mt-1 text-sm text-slate-300">{role || "User"}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <MetricCard label="Capabilities" value={capabilities.length || "—"} icon={ShieldCheck} tone="sky" sub="Access profile" />
            <MetricCard label="Queue" value={notificationCounts.total || 0} icon={Bell} tone={notificationCounts.total ? "amber" : "emerald"} sub="Assigned work" />
          </div>
        </div>

        <Section title="My work today">
          <div className="space-y-2">
            {notifications.slice(0, 5).length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-400">No assigned mobile tasks currently showing.</div>
            ) : (
              notifications.slice(0, 5).map((item) => (
                <div key={item.id} className="rounded-3xl border border-white/10 bg-slate-900 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-white">{item.title || item.summary || "Assigned task"}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.module || item.category || "MedTrak"}</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] font-bold uppercase text-slate-300">
                      {item.priority || item.severity || "Routine"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 pb-28 pt-4 text-white">
      <div className="overflow-hidden rounded-[2rem] border border-teal-400/20 bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/70 p-5 shadow-2xl shadow-black/25">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-teal-200">MedTrak Mobile</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Good morning, {firstName(displayName)}</h1>
            <p className="mt-1 text-sm text-slate-300">{practiceStatus}</p>
          </div>
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-3xl border border-teal-400/20 bg-teal-500/10 text-teal-100">
            <Fingerprint className="h-7 w-7" />
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-white/10 bg-slate-950/60 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-teal-100" />
            <div>
              <p className="font-black text-white">MedAI mobile brief</p>
              <p className="mt-1 text-sm leading-6 text-slate-300">{dailyBrief[0]} {dailyBrief[1]} {dailyBrief[2]}</p>
              <p className="mt-2 text-xs font-semibold text-teal-100">Estimated admin time: {estimatedWorkMins} mins</p>
            </div>
          </div>
        </div>
      </div>

      <Section title="Quick actions">
        <div className="grid grid-cols-2 gap-3">
          <ActionButton icon={Zap} label="Scan" sub="Use stock fast" primary onClick={onScan} />
          <ActionButton icon={Package} label="Stock" sub={`${lowStockCount} low`} onClick={() => onNavigate?.("stock")} />
          <ActionButton icon={RadioTower} label="Connect" sub={connectIntelligence?.coldChainOk ? "Cold chain OK" : "Review devices"} onClick={() => onNavigate?.("connect")} />
          <ActionButton icon={Search} label="Find item" sub="Manual search" onClick={onSearch} />
        </div>
      </Section>

      <Section title="Today">
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="My Queue" value={notificationCounts.total || 0} icon={Bell} tone={notificationCounts.total ? "amber" : "emerald"} sub="Assigned items" />
          <MetricCard label="Cold Chain" value={connectIntelligence?.coldChainOk ? "OK" : "Review"} icon={Thermometer} tone={connectIntelligence?.coldChainOk ? "emerald" : "rose"} sub={connectIntelligence?.headline} />
          <MetricCard label="Stock" value={lowStockCount} icon={Package} tone={lowStockCount ? "rose" : "emerald"} sub="Low stock" />
          <MetricCard label="Governance" value={governanceSummary.open} icon={ShieldCheck} tone={governanceSummary.high ? "rose" : governanceSummary.open ? "amber" : "emerald"} sub={`${governanceSummary.dueSoon} due soon`} />
        </div>
      </Section>

      <Section title="Live status">
        <div className="rounded-3xl border border-white/10 bg-slate-900 p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-white/[0.04] p-3">
              <Thermometer className="mx-auto h-4 w-4 text-sky-200" />
              <p className="mt-1 text-lg font-black text-white">{temperatureLabel}</p>
              <p className="text-[10px] text-slate-500">latest temp</p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] p-3">
              <Battery className="mx-auto h-4 w-4 text-amber-200" />
              <p className="mt-1 text-lg font-black text-white">{connectIntelligence?.avgBattery || "—"}%</p>
              <p className="text-[10px] text-slate-500">battery</p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] p-3">
              <Clock3 className="mx-auto h-4 w-4 text-teal-200" />
              <p className="mt-1 text-lg font-black text-white">{recentMoves.length}</p>
              <p className="text-[10px] text-slate-500">updates</p>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Priority stock"
        action={
          <button type="button" onClick={() => onNavigate?.("stock")} className="inline-flex items-center gap-1 text-xs font-bold text-teal-200">
            Open <ArrowRight className="h-3 w-3" />
          </button>
        }
      >
        <LowStockList items={lowStockList.slice(0, 3)} loading={loading} onSelectItem={onSelectItem} />
      </Section>

      <Section title="Recent activity">
        <div className="rounded-3xl border border-white/10 bg-slate-900 p-4">
          {recentMoves.length === 0 ? (
            <p className="text-sm text-slate-400">No recent stock movement recorded.</p>
          ) : (
            <div className="space-y-3">
              {recentMoves.map((move) => (
                <div key={move.id} className="flex items-start justify-between gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm font-bold text-white">{move.type === "use" ? "Stock used" : "Stock received"}</p>
                    <p className="text-xs text-slate-400">{move.item_name || move.stockItemName || move.stock_item_name || "Inventory movement"}</p>
                  </div>
                  <span className="text-xs text-slate-500">{safeDateLabel(move.created_at || move.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
