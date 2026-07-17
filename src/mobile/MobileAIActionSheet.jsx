import { Bell, ClipboardList, PackageSearch, Sparkles, X } from "lucide-react";

function Action({ icon: Icon, title, description, onClick, accent = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition active:scale-[.99] ${accent
        ? "border-[color-mix(in_srgb,var(--medtrak-accent)_35%,var(--medtrak-border))] bg-[color-mix(in_srgb,var(--medtrak-accent)_10%,var(--medtrak-panel))]"
        : "border-[var(--medtrak-border)] bg-[var(--medtrak-bg)]"}`}
    >
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${accent ? "bg-[var(--medtrak-accent)] text-white" : "bg-[var(--medtrak-surface)] text-[var(--medtrak-accent)]"}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-[var(--medtrak-text)]">{title}</span>
        <span className="mt-0.5 block text-xs text-[var(--medtrak-muted)]">{description}</span>
      </span>
    </button>
  );
}

export default function MobileAIActionSheet({ open, onClose, onAsk, onQuickNote, onFindStock, onPracticeSummary, reminderCount = 0 }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-end bg-black/45" onClick={onClose}>
      <section
        className="w-full rounded-t-[2rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 text-[var(--medtrak-text)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--medtrak-border)]" />
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--medtrak-accent)]">Primovex AI</p>
            <h2 className="mt-1 text-2xl font-bold">What would you like to do?</h2>
            <p className="mt-1 text-sm text-[var(--medtrak-muted)]">Start a task without hunting through menus.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--medtrak-border)]" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="mt-5 grid gap-3">
          <Action icon={Sparkles} title="Ask Primovex" description="Ask a question or search across the practice." onClick={onAsk} accent />
          <Action icon={Bell} title={`Quick Note${reminderCount ? ` (${reminderCount})` : ""}`} description="Capture work and set a reminder." onClick={onQuickNote} />
          <Action icon={PackageSearch} title="Find Stock" description="Search inventory or scan an item." onClick={onFindStock} />
          <Action icon={ClipboardList} title="Practice Summary" description="Ask Primovex for today’s operational picture." onClick={onPracticeSummary} />
        </div>
      </section>
    </div>
  );
}
