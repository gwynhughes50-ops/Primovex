import { Building2, Home, Package, Sparkles, UserRound } from "lucide-react";
import usePrimovexAI from "@/ai/hooks/usePrimovexAI";
import { AI_STATES } from "@/ai/types/responseContract";

const ITEMS = [
  { key: "home", label: "Home", Icon: Home },
  { key: "stock", label: "Stock", Icon: Package },
  { key: "facilities", label: "Facilities", Icon: Building2 },
  { key: "me", label: "Me", Icon: UserRound },
];

export default function MobileBottomNav({ activeKey = "home", onNavigate }) {
  const { open, status } = usePrimovexAI();
  const busy = [AI_STATES.SEARCHING, AI_STATES.REASONING, AI_STATES.RESPONDING].includes(status);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[90] border-t border-[var(--medtrak-border)] bg-[color-mix(in_srgb,var(--medtrak-panel)_96%,transparent)] px-3 pb-[max(.65rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
      <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
        {ITEMS.slice(0, 2).map(({ key, label, Icon }) => <NavButton key={key} {...{ keyName:key,label,Icon,activeKey,onNavigate }} />)}
        <button type="button" onClick={open} className="relative mx-auto -mt-8 grid h-16 w-16 place-items-center rounded-full border-4 border-[var(--medtrak-bg)] bg-[var(--medtrak-accent)] text-white shadow-xl" aria-label="Ask Primovex">
          <Sparkles className={`h-7 w-7 ${busy ? "animate-pulse" : ""}`} />
          <span className="absolute -bottom-5 text-[10px] font-bold text-[var(--medtrak-muted)]">AI</span>
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
