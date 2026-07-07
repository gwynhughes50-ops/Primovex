import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Battery, Fingerprint, Package, ShieldCheck, Thermometer } from "lucide-react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";

import useStock from "@/hooks/useStock";
import useNotifications from "@/hooks/useNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";

export default function MobileHome({ onSelectItem }) {
  const { user, displayName } = useAuth();
  const { allItems = [], loading } = useStock({ includeArchived: false });
  const { summary: notificationSummary } = useNotifications(user?.uid);

  const [latestTemp, setLatestTemp] = useState(null);
  const [tempLoading, setTempLoading] = useState(true);
  const [recentMoves, setRecentMoves] = useState([]);

  const totalItems = allItems.length;
  const notificationCounts = notificationSummary?.counts || { critical: 0, high: 0, routine: 0, total: 0 };

  const lowStockList = useMemo(() => {
    return allItems
      .filter((item) => {
        const current = Number(item.current_stock || 0);
        const min = Number(item.min_stock || 0);

        return current <= min;
      })
      .sort((a, b) => {
        const aGap = Number(a.current_stock || 0) - Number(a.min_stock || 0);
        const bGap = Number(b.current_stock || 0) - Number(b.min_stock || 0);

        return aGap - bGap;
      });
  }, [allItems]);

  const lowStockCount = lowStockList.length;

  useEffect(() => {
    const qTemp = query(
      collection(db, "temperature_logs"),
      orderBy("measured_at", "desc"),
      limit(1)
    );

    const unsub = onSnapshot(qTemp, (snap) => {
      const row = snap.docs[0]
        ? { id: snap.docs[0].id, ...snap.docs[0].data() }
        : null;

      setLatestTemp(row);
      setTempLoading(false);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const qMoves = query(
      collection(db, "stock_movements"),
      orderBy("created_at", "desc"),
      limit(3)
    );

    const unsub = onSnapshot(qMoves, (snap) => {
      const rows = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setRecentMoves(rows);
    });

    return () => unsub();
  }, []);

  const tempValue = latestTemp?.temp;

  return (
    <div className="min-h-screen bg-slate-950 p-4 pb-24 text-white">
      <div className="mb-5 overflow-hidden rounded-[1.75rem] border border-teal-400/20 bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/60 p-5 shadow-2xl shadow-black/20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-teal-200">MedTrak Mobile</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Good morning{displayName ? `, ${displayName.split(" ")[0]}` : ""}</h1>
            <p className="mt-1 text-sm text-slate-300">Fast clinical operations for phones and tablets.</p>
          </div>
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-teal-400/20 bg-teal-500/10 text-teal-100">
            <Fingerprint className="h-6 w-6" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
            <div className="flex items-center gap-2 font-bold text-emerald-100"><ShieldCheck className="h-3.5 w-3.5" /> Secure</div>
            <p className="mt-1 text-slate-400">Quick unlock ready</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
            <div className="flex items-center gap-2 font-bold text-amber-100"><Battery className="h-3.5 w-3.5" /> Battery saver</div>
            <p className="mt-1 text-slate-400">Auto-lock on idle</p>
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-teal-400/20 bg-teal-500/10 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-200">Today's priorities</p>
            <p className="mt-1 text-sm text-slate-300">
              {notificationCounts.total === 0
                ? "No active priorities assigned to you."
                : `${notificationCounts.total} active item${notificationCounts.total === 1 ? "" : "s"}`}
            </p>
          </div>
          <div className="grid h-16 w-16 place-items-center rounded-full border border-teal-400/30 bg-slate-950/70">
            <span className="text-2xl font-black text-teal-200">{notificationCounts.total || 0}</span>
          </div>
        </div>

        {notificationCounts.total > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-2 py-2 text-rose-100">
              {notificationCounts.critical || 0} critical
            </div>
            <div className="rounded-xl border border-orange-400/30 bg-orange-500/10 px-2 py-2 text-orange-100">
              {notificationCounts.high || 0} high
            </div>
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-2 py-2 text-amber-100">
              {notificationCounts.routine || 0} routine
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-300">Stock Items</span>
            <Package className="h-4 w-4 text-emerald-300" />
          </div>
          <p className="mt-2 text-3xl font-bold">
            {loading ? "—" : totalItems}
          </p>
        </div>

        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-rose-300">Alerts</span>
            <AlertTriangle className="h-4 w-4 text-rose-300" />
          </div>
          <p className="mt-2 text-3xl font-bold">
            {loading || tempLoading ? "—" : lowStockCount}
          </p>
        </div>

        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-sky-300">Temperature</span>
            <Thermometer className="h-4 w-4 text-sky-300" />
          </div>
          <p className="mt-2 text-3xl font-bold">
            {tempLoading
              ? "—"
              : tempValue !== undefined && tempValue !== null
              ? `${Number(tempValue).toFixed(1)}°`
              : "0"}
          </p>
        </div>

        <div className="relative z-[60] rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white">Low Stock</h3>

            <span className="rounded-full bg-rose-500 px-2 py-1 text-xs font-bold text-white">
              {loading ? "—" : lowStockCount}
            </span>
          </div>

          {loading ? (
            <p className="mt-2 text-sm text-slate-300">Loading...</p>
          ) : lowStockList.length === 0 ? (
            <p className="mt-2 text-sm text-slate-300">
              No low stock items 🎉
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {lowStockList.slice(0, 5).map((item) => (
                <button
  key={item.id}
  type="button"
  onClick={() => {
    console.log("LOW STOCK ITEM CLICKED:", item);
    onSelectItem?.(item);
  }}
  className="flex w-full justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-800"
>
                
                  <span className="min-w-0">
                    <span className="block truncate text-white">{item.name}</span>
                    {(item.strength || item.form) && (
                      <span className="block truncate text-xs text-teal-200">
                        {[item.strength, item.form].filter(Boolean).join(" • ")}
                      </span>
                    )}
                  </span>

                  <span className="shrink-0 text-rose-200">
                    {item.current_stock ?? 0} / {item.min_stock ?? 0}
                  </span>
                </button>
              ))}

              {lowStockList.length > 5 && (
                <div className="text-xs text-slate-400">
                  + {lowStockList.length - 5} more
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Recent Activity
        </h2>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          {recentMoves.length === 0 ? (
            <p className="text-sm text-slate-400">No recent activity</p>
          ) : (
            <div className="space-y-2">
              {recentMoves.map((move) => (
                <div
                  key={move.id}
                  className="border-b border-slate-800 pb-2 last:border-0"
                >
                  <div className="text-sm font-medium text-white">
                    {move.type === "use" ? "Used" : "Received"}{" "}
                    {move.qty || move.quantity || 0}
                  </div>

                  <div className="text-xs text-slate-400">
                    {move.item_name || move.name || move.barcode || "Stock Item"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}