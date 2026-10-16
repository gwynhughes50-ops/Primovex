import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import ClaimForm from "@/modules/mileage/ClaimForm";
import { STATUS, STATUS_LABEL, dateKey, money, priceClaims, taxYearOf, totalMiles, vehicleLabel } from "@/modules/mileage/mileage";
import { decideClaim, submitClaim, updateClaim, useClaims, useMyStaffRecord, usePlaces, withdrawClaim } from "@/modules/mileage/mileageService";

// Mileage on the phone (Me tab): add a journey, see what has been approved, and, for a line manager, approve their team's journeys.

const CHIP = { submitted: "bg-amber-400/25 text-amber-800", approved: "bg-emerald-500/15 text-emerald-700", rejected: "bg-rose-500/15 text-rose-700" };
const uk = (key) => (key ? key.split("-").reverse().join("/") : "");
const journey = (c) => `${c.fromName} to ${c.toName}${c.returnTrip ? " and back" : ""}`;

export default function MobileMileage() {
  const { user, displayName } = useAuth();
  const actor = { displayName: displayName || user?.email || "", email: user?.email || "" };
  const me = useMyStaffRecord();
  const places = usePlaces(true);
  const mine = useClaims({ scope: "mine" });
  const team = useClaims({ scope: "approve" });
  const [sheet, setSheet] = useState(null); // null | "new" | claim being changed
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const [busyId, setBusyId] = useState("");
  const list = mine.list || [];
  const priced = useMemo(() => priceClaims(list, places.rates), [list, places.rates]);
  const year = taxYearOf(dateKey(new Date()));
  const thisYear = list.filter((c) => c.status === STATUS.approved && c.date >= year.from && c.date <= year.to);
  const miles = Math.round(thisYear.reduce((n, c) => n + totalMiles(c), 0) * 10) / 10;
  const pence = thisYear.reduce((n, c) => n + (priced.get(c.id)?.pence || 0), 0);
  const waitingOnMe = (team.list || []).filter((c) => c.status === STATUS.submitted && c.uid !== user?.uid);
  const milesBefore = (vehicle, date) => { const y = taxYearOf(date); return y ? list.filter((c) => c.status === STATUS.approved && c.vehicle === vehicle && c.date >= y.from && c.date <= y.to).reduce((n, c) => n + totalMiles(c), 0) : 0; };

  async function send(form) { await submitClaim(form, { me: me.record, uid: user?.uid, options: places.options, actor }); setSheet(null); setMessage("Sent to your line manager for approval."); }
  async function change(form) { await updateClaim(sheet, form, { options: places.options }); setSheet(null); setMessage("Changes saved."); }
  async function withdraw(claim) { setProblem(""); try { await withdrawClaim(claim); setMessage("That journey was withdrawn."); } catch (failure) { setProblem(failure?.message || "That didn't work."); } }
  async function decide(claim, status) { setBusyId(claim.id); setProblem(""); try { await decideClaim(claim, status, "", actor); } catch (failure) { setProblem(failure?.message || "That didn't save."); } finally { setBusyId(""); } }

  if (!me.ready || mine.list === null) return <p className="py-1 text-sm text-[var(--medtrak-muted)]">Opening…</p>;
  if (!me.record) return <p className="py-1 text-sm text-[var(--medtrak-muted)]">Your sign-in isn't linked to a staff record yet, so mileage can't be claimed. Ask the Practice Manager to link it.</p>;
  return (
    <div className="space-y-3 py-1">
      <p className="text-sm font-semibold">{miles} miles approved this tax year ({money(pence)})</p>
      {message && <p className="rounded-xl bg-emerald-500/10 p-2 text-sm font-semibold text-emerald-800" role="status">{message}</p>}
      {problem && <p className="text-sm font-semibold text-rose-700" role="alert">{problem}</p>}
      <button type="button" onClick={() => { setSheet("new"); setMessage(""); }} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--medtrak-accent)] font-bold text-white"><Plus className="h-5 w-5" /> Add a journey</button>

      {waitingOnMe.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-[var(--medtrak-border)] p-3">
          <p className="font-bold">To approve ({waitingOnMe.length})</p>
          {waitingOnMe.map((c) => (
            <div key={c.id} className="border-t border-[var(--medtrak-border)] pt-2">
              <p className="text-sm font-semibold">{c.staffName} · {uk(c.date)}</p>
              <p className="text-sm">{journey(c)}: {totalMiles(c)} miles</p>
              <p className="text-xs text-[var(--medtrak-muted)]">{c.purpose} · {vehicleLabel(c.vehicle)}</p>
              <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" disabled={busyId === c.id} onClick={() => decide(c, STATUS.approved)} className="min-h-12 rounded-2xl bg-[var(--medtrak-accent)] font-bold text-white disabled:opacity-40">Approve</button><button type="button" disabled={busyId === c.id} onClick={() => decide(c, STATUS.rejected)} className="min-h-12 rounded-2xl border border-[var(--medtrak-border)] font-bold disabled:opacity-40">Don't approve</button></div>
            </div>
          ))}
        </div>
      )}

      {list.length > 0 && (
        <ul className="divide-y divide-[var(--medtrak-border)]">
          {list.slice(0, 15).map((c) => (
            <li key={c.id} className="py-2">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0"><span className="block text-sm font-semibold">{uk(c.date)} · {totalMiles(c)} miles</span><span className="block truncate text-xs text-[var(--medtrak-muted)]">{journey(c)}</span></span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${CHIP[c.status]}`}>{STATUS_LABEL[c.status]}</span>
              </div>
              {c.status === STATUS.submitted && <div className="mt-1 flex gap-4 text-sm"><button type="button" className="font-semibold text-[var(--medtrak-accent)]" onClick={() => { setSheet(c); setMessage(""); }}>Change</button><button type="button" className="font-semibold text-rose-700" onClick={() => withdraw(c)}>Withdraw</button></div>}
            </li>
          ))}
        </ul>
      )}

      {sheet && (
        <div className="fixed inset-0 z-[145] flex items-end bg-black/55">
          <div className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[2rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[var(--medtrak-text)]">
            <div className="mb-3 flex items-start justify-between gap-3"><h2 className="text-xl font-bold">{sheet === "new" ? "Add a journey" : "Change this journey"}</h2><button type="button" onClick={() => setSheet(null)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--medtrak-border)]" aria-label="Close"><X className="h-5 w-5" /></button></div>
            <ClaimForm skin="phone" options={places.options} routes={places.routes} rates={places.rates} initial={sheet === "new" ? null : sheet} milesBefore={milesBefore} onSubmit={sheet === "new" ? send : change} onCancel={() => setSheet(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
