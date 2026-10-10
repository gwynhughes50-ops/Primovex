import { Building2, ClipboardCheck, FileText, Home, MessageSquare, Package, ScanLine, ShieldAlert, UserRound } from "lucide-react";
import PulseOrbFace from "@/components/pulse/PulseOrbFace";
import { AI_STATES } from "@/ai/types/responseContract";
import usePrimovexAI from "@/ai/hooks/usePrimovexAI";
import { NAV_PLACES } from "./roleHomes";

const ICONS = { home: Home, stock: Package, facilities: Building2, checks: ClipboardCheck, rooms: ScanLine, messages: MessageSquare, sars: FileText, concerns: ShieldAlert, me: UserRound };
const DEFAULT_PLACES = ["home", "stock", "facilities", "me"];

// Two places each side of the Orb. Which four is up to the role (see roleHomes.js navFor).
export default function MobileBottomNav({ activeKey = "home", onNavigate, onOpenAI, places = DEFAULT_PLACES }) {
  const { status } = usePrimovexAI();
  const busy = [AI_STATES.SEARCHING, AI_STATES.REASONING, AI_STATES.RESPONDING].includes(status);
  const items = places.map((key) => ({ key, label: NAV_PLACES[key]?.label || key, Icon: ICONS[key] || Home }));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[90] min-h-[calc(var(--pvx-mobile-nav-height)+var(--pvx-mobile-safe-bottom))] border-t border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 pb-[var(--pvx-mobile-safe-bottom)] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,.10)]">
      <div className="mx-auto grid h-[var(--pvx-mobile-nav-height)] max-w-lg grid-cols-5 items-end">
        {items.slice(0, 2).map(({ key, label, Icon }) => <NavButton key={key} {...{ keyName: key, label, Icon, activeKey, onNavigate }} />)}
        <button type="button" onClick={onOpenAI} className="relative mx-auto -mt-9 h-[4.5rem] w-[4.5rem] rounded-full" aria-label="Primovex AI actions">
          <PulseOrbFace size={72} active={busy} />
          <span className="sr-only">Primovex AI</span>
        </button>
        {items.slice(2).map(({ key, label, Icon }) => <NavButton key={key} {...{ keyName: key, label, Icon, activeKey, onNavigate }} />)}
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
