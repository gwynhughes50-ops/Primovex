import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ClipboardCheck, RefreshCw, Settings2, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

// The daily stock review on the Alerts page (written by the scheduled function, see
// functions/services/stockReviewService.js): stock nobody has touched for a long time, stock that
// looks like too much for how fast it is used, and stock that may run short. Emergency drugs,
// emergency equipment and anything held only in kits are left out on purpose.

const toDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);
const months = (days) => Math.max(1, Math.round(days / 30));

function Group({ icon: Icon, tone, title, hint, rows, render }) {
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, 5);
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone}`} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-100">{title} <span className="text-slate-400">({rows.length})</span></p>
          <p className="text-xs text-slate-400">{hint}</p>
        </div>
      </div>
      {rows.length === 0 ? <p className="mt-3 text-sm text-slate-400">Nothing to flag.</p> : (
        <ul className="mt-3 space-y-2">
          {shown.map((row) => (
            <li key={row.itemId} className="flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2 text-sm">
              <div className="min-w-0"><p className="font-medium text-slate-100">{row.name}</p><p className="text-xs text-slate-400">{render(row)}</p></div>
              <Link to={`/inventory?find=${encodeURIComponent(row.name)}`} className="shrink-0 text-xs font-semibold text-sky-300 hover:text-sky-200">Open</Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 5 && <button type="button" onClick={() => setOpen(!open)} className="mt-2 text-xs font-semibold text-slate-300 hover:text-white">{open ? "Show fewer" : `Show all ${rows.length}`}</button>}
    </div>
  );
}

export default function StockReviewPanel() {
  const { can } = useAuth();
  const canEditSettings = can("inventory.verify");
  const [review, setReview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ dormant: 6, over: 12, short: 21 });

  useEffect(() => onSnapshot(doc(db, "stock_reviews", "latest"), (snap) => setReview(snap.exists() ? snap.data() : false), () => setReview(false)), []);
  useEffect(() => {
    if (review?.settings) setForm({ dormant: months(review.settings.dormantDays), over: months(review.settings.overstockDays), short: review.settings.understockDays });
  }, [review?.settings]);

  const generated = useMemo(() => toDate(review?.generatedAt), [review]);
  const canRefresh = can("inventory.write") || can("inventory.verify");

  const refresh = async () => {
    try { setBusy(true); setError(""); await httpsCallable(functions, "runStockReviewNow")(); } catch (err) { setError(err?.message || "Could not refresh."); } finally { setBusy(false); }
  };
  const save = async () => {
    try {
      setBusy(true); setError("");
      await setDoc(doc(db, "settings", "stockReview"), {
        dormantDays: Math.max(30, Math.round(Number(form.dormant) * 30)), overstockDays: Math.max(60, Math.round(Number(form.over) * 30)), understockDays: Math.max(3, Math.round(Number(form.short))), updatedAt: serverTimestamp(),
      }, { merge: true });
      setEditing(false);
    } catch (err) { setError(err?.message || "Could not save."); } finally { setBusy(false); }
  };

  if (review === null) return null;
  return (
    <Card className="border-white/10 bg-slate-950/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Stock review</h2>
          <p className="text-sm text-slate-400">
            {review ? <>Checked {generated ? generated.toLocaleString("en-GB") : "recently"} against how fast each item is really used. Emergency drugs, emergency equipment and kit stock are left out.</> : "The first review runs overnight. Nothing has been worked out yet."}
          </p>
        </div>
        <div className="flex gap-2">
          {canEditSettings && <Button variant="outline" className="rounded-full border-white/15 bg-transparent text-slate-200" onClick={() => setEditing(!editing)}><Settings2 className="mr-2 h-4 w-4" />Settings</Button>}
          {canRefresh && <Button variant="outline" className="rounded-full border-white/15 bg-transparent text-slate-200" disabled={busy} onClick={refresh}><RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />Refresh</Button>}
        </div>
      </div>
      {error && <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      {editing && (
        <div className="mt-3 grid gap-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4 sm:grid-cols-3">
          <label className="text-xs font-semibold text-slate-300">Ask for a stock take after (months unused)
            <input type="number" min="1" max="36" value={form.dormant} onChange={(e) => setForm({ ...form, dormant: e.target.value })} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-slate-100" />
          </label>
          <label className="text-xs font-semibold text-slate-300">Too much if it would last more than (months)
            <input type="number" min="2" max="60" value={form.over} onChange={(e) => setForm({ ...form, over: e.target.value })} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-slate-100" />
          </label>
          <label className="text-xs font-semibold text-slate-300">May run short if it would last under (days)
            <input type="number" min="3" max="120" value={form.short} onChange={(e) => setForm({ ...form, short: e.target.value })} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-slate-100" />
          </label>
          <div className="sm:col-span-3"><Button className="rounded-full" disabled={busy} onClick={save}>Save (used from the next review)</Button></div>
        </div>
      )}
      {review && (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <Group icon={ClipboardCheck} tone="text-amber-300" title="Needs a stock take" hint={`Nothing recorded for ${months(review.settings?.dormantDays || 180)}+ months. The person who last handled each one has been asked to count it.`} rows={review.dormant || []}
            render={(r) => `${r.stock} recorded · untouched ${Math.round(r.daysSince / 30)} months${r.lastActorName ? ` · last handled by ${r.lastActorName}` : ""}`} />
          <Group icon={TrendingUp} tone="text-sky-300" title="Looks like too much" hint="Would last longer than the usual rate of use suggests you need." rows={review.overstocked || []}
            render={(r) => `${r.stock} in stock · about ${r.perMonth} used a month · ${r.coverMonths} months' supply · around ${r.suggestedMax} would do`} />
          <Group icon={TrendingDown} tone="text-rose-300" title="May run short" hint="At the usual rate of use it won't last long, or the minimum is too low for it." rows={review.understocked || []}
            render={(r) => `${r.stock} in stock · about ${r.perWeek} used a week · ${r.coverDays} days left · minimum ${r.minStock || "not set"}, suggest ${r.suggestedMin}`} />
        </div>
      )}
    </Card>
  );
}
