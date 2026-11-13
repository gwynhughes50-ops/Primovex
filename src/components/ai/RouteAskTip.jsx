import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import usePrimovexAI from "@/ai/hooks/usePrimovexAI";
import { tipFor } from "@/ai/starters";

// A small, once-only hint at the top of a page that shows people they can just ask Ask Primovex instead of looking: "You can also just ask: ...".
// Shown once for each page and person (what they have dismissed or tried is remembered on this device), and never to someone whose role
// can't use the example.
const keyOf = (uid, id) => `primovex-asktip:${uid || "anon"}:${id}`;
const seen = (uid, id) => { try { return window.localStorage.getItem(keyOf(uid, id)) === "1"; } catch { return false; } };
const remember = (uid, id) => { try { window.localStorage.setItem(keyOf(uid, id), "1"); } catch { /* optional */ } };

export default function RouteAskTip() {
  const { pathname } = useLocation();
  const { user, can } = useAuth();
  const assistant = usePrimovexAI();
  const tip = tipFor(pathname, can);
  const [gone, setGone] = useState(false);
  useEffect(() => setGone(false), [tip?.id]);
  if (!tip || gone || seen(user?.uid, tip.id)) return null;

  const close = () => { remember(user?.uid, tip.id); setGone(true); };
  return (
    <aside role="note" className="mb-4 flex items-center gap-3 rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-accent)]/8 px-4 py-2.5 text-sm text-[color:var(--medtrak-text)]">
      <Sparkles className="h-4 w-4 shrink-0 text-[color:var(--medtrak-accent)]" aria-hidden="true" />
      <p className="min-w-0 flex-1">You can also just ask: <strong>“{tip.example}”</strong></p>
      <button type="button" onClick={() => { close(); assistant.open(); assistant.ask(tip.example); }} className="shrink-0 rounded-full bg-[color:var(--medtrak-accent)] px-3 py-1 text-xs font-bold text-white">Ask it</button>
      <button type="button" onClick={close} aria-label="Dismiss this tip" className="shrink-0 rounded-full p-1 text-[color:var(--medtrak-muted)] hover:bg-[color:var(--medtrak-accent)]/10"><X className="h-4 w-4" /></button>
    </aside>
  );
}
