import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BadgeCheck, ClipboardCheck, RotateCcw, Sparkles, UserPlus } from "lucide-react";
import {
  buildSmartVerificationPlan,
  calculateInventoryConfidence,
  recordStockVerification,
} from "@/services/stockVerificationService";

function toneForScore(score) {
  if (score >= 90) return "text-emerald-200 border-emerald-400/30 bg-emerald-500/10";
  if (score >= 75) return "text-teal-100 border-teal-300/25 bg-teal-500/10";
  if (score >= 60) return "text-amber-100 border-amber-400/30 bg-amber-500/10";
  return "text-rose-100 border-rose-400/30 bg-rose-500/10";
}

export default function StockVerificationWidget({ items = [], actor = null, compact = false }) {
  const [actuals, setActuals] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState("");

  const confidence = useMemo(() => calculateInventoryConfidence(items), [items]);
  const plan = useMemo(() => buildSmartVerificationPlan(items, { maxItems: compact ? 3 : 5 }), [items, compact]);

  const verify = async (row) => {
    setMessage("");
    const actualQty = actuals[row.itemId] ?? row.expectedQty;
    setSavingId(row.itemId);
    try {
      const result = await recordStockVerification({
        item: row.item,
        actualQty,
        actor,
        reason: "smart_stock_check",
        notes: "Verified from Operations Centre Smart Stock Check.",
      });
      const difference = Number(result.discrepancy || 0);
      setMessage(
        difference === 0
          ? `${row.name} verified. Stock confidence restored.`
          : `${row.name} verified and adjusted by ${difference > 0 ? "+" : ""}${difference}.`
      );
    } catch (error) {
      setMessage(`Could not save verification: ${String(error?.message || error)}`);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card className="border-white/10 bg-slate-950/50 p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-300/10 text-teal-200">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-50">Smart Stock Verification</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              MedAI spreads tiny physical checks across the year so stock drift is caught without a disruptive annual stock take.
            </p>
          </div>
        </div>

        <div className={`rounded-2xl border px-4 py-3 text-right ${toneForScore(confidence.score)}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">Inventory Confidence</p>
          <p className="text-2xl font-black">{confidence.score}%</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Verified</p>
          <p className="mt-1 text-xl font-semibold text-slate-50">{confidence.verified}/{confidence.total}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Overdue</p>
          <p className="mt-1 text-xl font-semibold text-slate-50">{confidence.overdue}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Never checked</p>
          <p className="mt-1 text-xl font-semibold text-slate-50">{confidence.neverVerified}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Today</p>
          <p className="mt-1 text-xl font-semibold text-slate-50">{plan.selected.length} items</p>
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-teal-300/15 bg-teal-300/10 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-teal-50">
            <Sparkles className="h-4 w-4" />
            Today's suggested micro-check
          </div>
          <p className="text-xs text-teal-100/70">Estimated time: {plan.estimatedMinutes} min</p>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-teal-50/80">
          Assigned to the nursing/HCA team by default. Any suitable user can accept, reassign or snooze later when task workflows are connected.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {plan.selected.length === 0 ? (
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-50">
            No stock items available for verification.
          </div>
        ) : (
          plan.selected.map((row) => (
            <div key={row.itemId} className="rounded-2xl border border-white/10 bg-slate-900/40 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-50">{row.name}</p>
                    <span className="rounded-full border border-white/10 bg-slate-950/50 px-2 py-0.5 text-[11px] text-slate-300">
                      Priority {row.verificationPriority}/100
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {row.site} {row.location ? `• ${row.location}` : ""} • Expected {row.expectedQty}
                    {row.daysSince === null ? " • Never physically verified" : ` • Last checked ${row.daysSince} days ago`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="h-9 w-24 bg-slate-950/60 text-slate-50"
                    type="number"
                    min="0"
                    value={actuals[row.itemId] ?? row.expectedQty}
                    onChange={(event) => setActuals((prev) => ({ ...prev, [row.itemId]: event.target.value }))}
                    aria-label={`Actual quantity for ${row.name}`}
                  />
                  <Button
                    type="button"
                    className="rounded-full"
                    onClick={() => verify(row)}
                    disabled={savingId === row.itemId}
                  >
                    <BadgeCheck className="mr-2 h-4 w-4" />
                    {savingId === row.itemId ? "Saving…" : "Verify"}
                  </Button>
                  <Button type="button" variant="outline" className="rounded-full border-white/10 bg-slate-950/40 text-xs text-slate-200" disabled>
                    <UserPlus className="mr-2 h-4 w-4" /> Reassign
                  </Button>
                  <Button type="button" variant="outline" className="rounded-full border-white/10 bg-slate-950/40 text-xs text-slate-200" disabled>
                    <RotateCcw className="mr-2 h-4 w-4" /> Snooze
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {message ? <p className="mt-3 rounded-2xl border border-white/10 bg-slate-900/50 p-3 text-xs text-slate-200">{message}</p> : null}
    </Card>
  );
}
