import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { Pill, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToStock } from "@/services/stockService";
import { itemLabel } from "@/ai/stock/stockAsk";

// Names this practice uses for its stock that the Orb wouldn't know ("the blue needles", "our
// emergency injector"). What people SAY is typed; what it MEANS is picked from the real stock list.
// Saved in settings/orbAliases; the Orb follows it live (src/ai/stock/medicineNamesLoader.js).

export default function OrbProductNames() {
  const { can } = useAuth();
  const canEdit = can("inventory.verify");
  const [aliases, setAliases] = useState([]);
  const [items, setItems] = useState([]);
  const [say, setSay] = useState("");
  const [means, setMeans] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => onSnapshot(doc(db, "settings", "orbAliases"), (snap) => setAliases(snap.exists() ? snap.data().aliases || [] : []), () => setAliases([])), []);
  useEffect(() => subscribeToStock((rows) => setItems(rows), () => setItems([])), []);
  const options = useMemo(() => [...new Map(items.filter((i) => !i.archived_at).map((i) => [i.id, { id: i.id, label: itemLabel(i), name: i.name }])).values()].sort((a, b) => a.label.localeCompare(b.label)), [items]);

  const save = async (next) => {
    try {
      setBusy(true); setError("");
      await setDoc(doc(db, "settings", "orbAliases"), { aliases: next, updatedAt: serverTimestamp() }, { merge: true });
    } catch (err) { setError(err?.message || "Could not save."); } finally { setBusy(false); }
  };
  const add = async () => {
    const phrase = say.trim().toLowerCase();
    const target = options.find((o) => o.id === means);
    if (!phrase || !target) return;
    if (phrase.length < 3) { setError("Use at least three letters."); return; }
    await save([...aliases.filter((a) => a.say !== phrase), { say: phrase, means: target.name, meansLabel: target.label }]);
    setSay(""); setMeans("");
  };

  return (
    <Card className="border border-slate-800/70 bg-slate-900/70 p-5 text-slate-100">
      <div className="flex gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-sky-400/30 bg-sky-500/10 text-sky-200"><Pill className="h-5 w-5" /></span>
        <div>
          <h2 className="text-lg font-bold">Names for your stock</h2>
          <p className="text-sm text-slate-400">The Orb already knows medicine names (generic, brand, US spellings, small slips). Teach it what <i>your practice</i> calls things: the words people say, and the product they mean.</p>
        </div>
      </div>
      {canEdit && (
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <input value={say} onChange={(e) => setSay(e.target.value)} placeholder="What people say (e.g. emergency injector)" className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100" />
          <select value={means} onChange={(e) => setMeans(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100">
            <option value="">…means this product</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <Button className="rounded-full" disabled={busy || !say.trim() || !means} onClick={add}>Teach it</Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
      <div className="mt-4 space-y-2">
        {aliases.length === 0 && <p className="text-sm text-slate-400">Nothing taught yet.</p>}
        {aliases.map((a) => (
          <div key={a.say} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2 text-sm">
            <span>“{a.say}” → <b>{a.meansLabel || a.means}</b></span>
            {canEdit && <button type="button" disabled={busy} onClick={() => save(aliases.filter((x) => x.say !== a.say))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-300" aria-label={`Remove ${a.say}`}><Trash2 className="h-4 w-4" /></button>}
          </div>
        ))}
      </div>
    </Card>
  );
}
