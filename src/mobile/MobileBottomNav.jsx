import { Building2, Home, Package, Sparkles, UserRound } from "lucide-react";
import { AI_STATES } from "@/ai/types/responseContract";
import usePrimovexAI from "@/ai/hooks/usePrimovexAI";

const ITEMS = [
  { key: "home", label: "Home", Icon: Home },
  { key: "stock", label: "Stock", Icon: Package },
  { key: "facilities", label: "Facilities", Icon: Building2 },
  { key: "me", label: "Me", Icon: UserRound },
];

export default function MobileBottomNav({ activeKey = "home", onNavigate, onOpenAI }) {
  const { status } = usePrimovexAI();
  const busy = [AI_STATES.SEARCHING, AI_STATES.REASONING, AI_STATES.RESPONDING].includes(status);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[90] min-h-[calc(var(--pvx-mobile-nav-height)+var(--pvx-mobile-safe-bottom))] border-t border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 pb-[var(--pvx-mobile-safe-bottom)] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,.10)]">
      <div className="mx-auto grid h-[var(--pvx-mobile-nav-height)] max-w-lg grid-cols-5 items-end">
        {ITEMS.slice(0, 2).map(({ key, label, Icon }) => <NavButton key={key} {...{ keyName:key,label,Icon,activeKey,onNavigate }} />)}
        <button type="button" onClick={onOpenAI} className="relative mx-auto -mt-8 grid h-14 w-14 place-items-center rounded-full border-4 border-[var(--medtrak-bg)] bg-[var(--medtrak-accent)] text-white shadow-xl" aria-label="Primovex AI actions">
          <Sparkles className={`h-6 w-6 ${busy ? "animate-pulse" : ""}`} />
          <span className="sr-only">Primovex AI</span>
        </button>
        {ITEMS.slice(2).map(({ key, label, Icon }) => <NavButton key={key} {...{ keyName:key,label,Icon,activeKey,onNavigate }} />)}
      </div>
    </nav>
  );
}

function NavButton({ keyName, label, Icon, activeKey, onNavigate }) {
  const active = activeKey === keyName;
  return (
    <button type="button" onClick={() => onNavigate?.(keyName)} className={`mx-auto flex min-h-14 min-w-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold ${active ? "text-[var(--medtrak-accent)]" : "text-[var(--medtrak-muted)]"}`}>
      <Icon className="h-5 w-5" />{label}
    </button>
  );
}
