import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { holderText } from "@/modules/laptops/laptops";
import { subscribeMyLaptops } from "@/modules/laptops/laptopService";
import { Chips } from "./LaptopActions";

// The laptops a person has: assigned to them or lent to them. They can see when each is due an update or back, and cannot change it: the IT team do that. This is where the reminders point.
export default function MyLaptopPanel() {
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => subscribeMyLaptops(user?.uid, setList, (e) => { setError(e?.code || e?.message || "unknown"); setList([]); }), [user?.uid]);
  return (
    <div className="space-y-3 text-[var(--medtrak-text)]">
      {error && <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm font-semibold text-rose-700">Your laptop could not be read ({error}). Tell the IT team, with that word.</p>}
      {list === null && <p className="text-sm text-[var(--medtrak-muted)]">Loading…</p>}
      {list && !error && list.length === 0 && <p className="text-sm text-[var(--medtrak-muted)]">There is no laptop assigned to you or lent to you.</p>}
      {(list || []).map((l) => (
        <section key={l.id} className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3">
          <p className="font-bold">{l.assetCode}</p>
          <p className="text-sm text-[var(--medtrak-muted)]">{holderText(l)}</p>
          <Chips laptop={l} />
        </section>
      ))}
      <p className="text-xs text-[var(--medtrak-muted)]">The IT team record updates, loans and returns. If a date here is wrong, or the laptop needs attention, tell them.</p>
    </div>
  );
}
