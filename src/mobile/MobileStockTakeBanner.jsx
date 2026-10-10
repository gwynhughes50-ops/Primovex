import { ClipboardList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useStockTakes } from "@/modules/stocktake/stockTakeService";
import { isAskedOf } from "@/modules/stocktake/stockTake";

// On the phone home: a stock take you've been asked to help with. Shows nothing when there isn't one.
export default function MobileStockTakeBanner({ onOpen }) {
  const { user, role, can } = useAuth();
  const allowed = can("stocktake.count") && Boolean(user?.uid);
  const { list } = useStockTakes(allowed);
  const asked = (list || []).filter((take) => isAskedOf(take, user?.uid, role));
  if (!allowed || asked.length === 0) return null;
  const due = asked.map((take) => take.dueDate).filter(Boolean).sort()[0];
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--medtrak-accent)] bg-[var(--medtrak-accent)]/10 p-4 text-left">
      <ClipboardList className="h-6 w-6 shrink-0 text-[var(--medtrak-accent)]" aria-hidden="true" />
      <span className="min-w-0">
        <b className="block text-base">{asked.length === 1 ? "A stock take needs your help" : `${asked.length} stock takes need your help`}</b>
        <small className="block text-[var(--medtrak-muted)]">{asked.length === 1 ? asked[0].title : "Tap to choose one"}{due ? ` · due ${due.split("-").reverse().join("/")}` : ""}</small>
      </span>
    </button>
  );
}
