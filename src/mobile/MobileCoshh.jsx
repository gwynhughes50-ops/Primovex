import { useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, FlaskConical, HandHelping, HardHat, Search, ShieldAlert, TriangleAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { openDocument } from "@/lib/openDocument";
import {
  REVIEW_STATUS_LABEL, firstAidLabel, hazardLabel, parseLocationKey, ppeLabel, reviewStatus, reviewText, searchSubstances, shortLabel,
  sortSubstances, substancesAt,
} from "@/modules/coshh/coshh";
import { useCoshhSubstances } from "@/modules/coshh/coshhService";

// COSHH on the phone: look up what a product is, what to wear and what to do if it splashes. Read-only, for
// anyone allowed to see the register (cleaners, the caretaker, the practice manager, partners). Opened from the
// home screen, or by scanning the QR code on a storage cupboard, which lists just what is kept there.

const TONE = {
  overdue: "border-rose-400/40 bg-rose-500/10 text-rose-700",
  missing: "border-rose-400/40 bg-rose-500/10 text-rose-700",
  "due-soon": "border-amber-400/40 bg-amber-500/10 text-amber-700",
  ok: "border-emerald-400/40 bg-emerald-500/10 text-emerald-700",
};

function Section({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]"><Icon className="h-4 w-4" aria-hidden="true" /> {title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Detail({ substance, onBack }) {
  const [problem, setProblem] = useState("");
  const status = reviewStatus(substance);
  const open = async () => setProblem(await openDocument({ url: substance.sdsUrl, path: substance.sdsPath, fileName: substance.sdsFileName || "safety-data-sheet.pdf" }));
  const hazardous = substance.hazards.some((k) => k !== "none");
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-[var(--medtrak-accent)]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> All products</button>
      <div>
        <h2 className="text-2xl font-bold leading-tight">{substance.name}</h2>
        <p className="text-sm text-[var(--medtrak-muted)]">{substance.supplier}</p>
      </div>

      <Section icon={TriangleAlert} title="Hazards">
        <ul className="space-y-1">{substance.hazards.map((k) => <li key={k} className={`text-base ${k === "none" ? "" : "font-semibold"}`}>{hazardLabel(k)}</li>)}</ul>
      </Section>
      <Section icon={HardHat} title="Wear">
        <ul className="space-y-1">{substance.ppe.map((k) => <li key={k} className="text-base font-semibold">{ppeLabel(k)}</li>)}</ul>
      </Section>
      {(hazardous || substance.firstAid.length > 0) && (
        <Section icon={HandHelping} title="If something goes wrong">
          <ul className="space-y-1.5">{substance.firstAid.map((k) => <li key={k} className="text-base">{firstAidLabel(k)}</li>)}</ul>
          <p className="mt-2 text-sm text-[var(--medtrak-muted)]">Tell the practice manager about any splash, spill or exposure afterwards.</p>
        </Section>
      )}
      <Section icon={FlaskConical} title="Kept in">
        <p className="text-base font-semibold">{substance.location || "Not set"}</p>
        {substance.site && <p className="text-sm text-[var(--medtrak-muted)]">{substance.site}</p>}
      </Section>

      <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${TONE[status]}`}>{REVIEW_STATUS_LABEL[status]}: {reviewText(substance)}</div>

      {substance.sdsUrl ? (
        <button type="button" onClick={open} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--medtrak-accent)] px-4 text-base font-bold text-white"><ExternalLink className="h-5 w-5" aria-hidden="true" /> Open the safety data sheet</button>
      ) : <p className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm font-semibold text-rose-700">No safety data sheet is attached. Tell the practice manager.</p>}
      {problem && <p className="text-sm font-semibold text-rose-700" role="alert">{problem}</p>}
    </div>
  );
}

export default function MobileCoshh({ placeKey = "", onClose }) {
  const { can } = useAuth();
  const allowed = can("coshh.read");
  const { list, error } = useCoshhSubstances(allowed);
  const [search, setSearch] = useState("");
  const [everything, setEverything] = useState(false);
  const [selectedId, setSelectedId] = useState("");

  const place = placeKey ? parseLocationKey(placeKey) : null;
  const active = useMemo(() => (list || []).filter((s) => s.active !== false), [list]);
  const here = useMemo(() => (place ? substancesAt(list || [], placeKey) : []), [list, place, placeKey]);
  const scoped = place && !everything;
  const shown = useMemo(() => sortSubstances(searchSubstances(scoped ? here : active, search)), [scoped, here, active, search]);
  const selected = active.find((s) => s.id === selectedId) || null;

  return (
    <div className="fixed inset-0 z-[160] overflow-y-auto bg-[var(--medtrak-bg)] text-[var(--medtrak-text)]">
      <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="mb-3 flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[var(--medtrak-accent)]"><ShieldAlert className="h-4 w-4" aria-hidden="true" /> Chemicals and safety (COSHH)</p>
          <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 text-sm font-bold">Close</button>
        </header>

        {!allowed ? (
          <p className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 text-sm">Your role isn't set up to look at the COSHH register. Ask the Practice Manager.</p>
        ) : list === null ? (
          <p className="text-center text-sm text-[var(--medtrak-muted)]">Opening the list…</p>
        ) : error ? (
          <p className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm font-semibold text-rose-700" role="alert">{error}</p>
        ) : selected ? (
          <Detail substance={selected} onBack={() => setSelectedId("")} />
        ) : (
          <div className="space-y-3">
            {place && (
              <div className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3">
                <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-muted)]">{scoped ? "Kept in" : "Everything"}</p>
                {scoped && <p className="text-lg font-bold">{place.location}{place.site ? `, ${place.site}` : ""}</p>}
                <button type="button" onClick={() => setEverything((v) => !v)} className="mt-1 min-h-10 text-sm font-bold text-[var(--medtrak-accent)]">{scoped ? "Show every product" : "Only this cupboard"}</button>
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--medtrak-muted)]" aria-hidden="true" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by product name" aria-label="Search products" className="min-h-12 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] pl-10 pr-3 text-base" />
            </div>
            {shown.length === 0 ? (
              <p className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 text-center text-sm text-[var(--medtrak-muted)]">
                {active.length === 0 ? "Nothing has been added to the register yet." : scoped && here.length === 0 && !search ? "Nothing is listed as kept here. Show every product, or tell the caretaker." : "No product matches that."}
              </p>
            ) : (
              <ul className="space-y-2">
                {shown.map((s) => {
                  const status = reviewStatus(s);
                  return (
                    <li key={s.id}>
                      <button type="button" onClick={() => setSelectedId(s.id)} className="w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 text-left active:opacity-80">
                        <span className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block text-lg font-bold leading-tight">{s.name}</span>
                            <span className="block truncate text-sm text-[var(--medtrak-muted)]">{[s.location, s.supplier].filter(Boolean).join(" · ")}</span>
                          </span>
                          {status !== "ok" && <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${TONE[status]}`}>{status === "due-soon" ? "Review soon" : "Review due"}</span>}
                        </span>
                        <span className="mt-2 flex flex-wrap gap-1">
                          {s.hazards.map((k) => <span key={k} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-800">{shortLabel(hazardLabel(k))}</span>)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
