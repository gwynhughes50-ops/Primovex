import { BookOpen, ExternalLink } from "lucide-react";
import { ANAPHYLAXIS_GUIDANCE, GUIDANCE_CHECKED_ON, formatGuidanceDate, sortedGuidance } from "@/config/anaphylaxisGuidance";

const checkedOn = new Date(`${GUIDANCE_CHECKED_ON}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// Current anaphylaxis guidance, as links to the issuing bodies with the date each
// was published. Replaces the old verification checklist on this page: the box
// checks are done on the phone.
export default function AnaphylaxisGuidance() {
  const rows = sortedGuidance(ANAPHYLAXIS_GUIDANCE);
  return (
    <section className="rounded-3xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] text-[color:var(--medtrak-text)] shadow-sm" aria-label="Anaphylaxis guidance">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--medtrak-border)] px-5 py-4">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary"><BookOpen className="h-5 w-5" /></span>
          <div>
            <h3 className="text-lg font-semibold">Anaphylaxis guidance</h3>
            <p className="text-sm text-[color:var(--medtrak-muted)]">Current UK guidance used by Welsh practices. Box checks are done in the Primovex mobile app; select a box above to manage it.</p>
          </div>
        </div>
        <span className="rounded-full border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-3 py-1 text-xs text-[color:var(--medtrak-muted)]">Checked against the sources on {checkedOn}</span>
      </div>

      <ul className="divide-y divide-[color:var(--medtrak-border)]">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0 max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--medtrak-muted)]">{row.issuer} · {row.kind}</p>
              <p className="mt-0.5 font-semibold">{row.title}</p>
              <p className="mt-1 text-sm text-[color:var(--medtrak-muted)]">{row.summary}</p>
              <p className="mt-1 text-xs text-[color:var(--medtrak-muted)]">{row.covers}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2 text-right">
              <span className="text-sm"><span className="text-xs text-[color:var(--medtrak-muted)]">{row.published ? "Published " : ""}</span><b>{formatGuidanceDate(row.published)}</b></span>
              <a href={row.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-3 py-1.5 text-sm font-medium text-primary hover:underline">Open <ExternalLink className="h-3.5 w-3.5" /></a>
            </div>
          </li>
        ))}
      </ul>

      <p className="border-t border-[color:var(--medtrak-border)] px-5 py-3 text-xs leading-5 text-[color:var(--medtrak-muted)]">
        There is no separate NHS Wales clinical anaphylaxis guideline; Welsh practices follow the Resuscitation Council UK guidance. NICE is England&apos;s guidance body, so check with your health board whether it has adopted NG258. These are links to the publishers, not copies: always read doses and algorithms from the source, and confirm there that you have the latest version.
      </p>
    </section>
  );
}
