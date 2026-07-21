import { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronRight, Layers3, MapPin, Nfc, Search, X } from 'lucide-react';
import { loadSpaceRegistry } from '@/modules/sense/services/sharedSpaceRegistry';
import { useSenseSession } from '@/contexts/SenseSessionContext';

export default function MobileSenseSpaces({ onScan }) {
  const [state, setState] = useState(() => loadSpaceRegistry());
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const { activeSenseSession } = useSenseSession();

  useEffect(() => {
    const refresh = () => setState(loadSpaceRegistry());
    window.addEventListener('primovex:sense-changed', refresh);
    return () => window.removeEventListener('primovex:sense-changed', refresh);
  }, []);

  const spaces = useMemo(() => state.spaces.filter((space) => space.status !== 'archived' && (!query.trim() || `${space.name} ${space.type}`.toLowerCase().includes(query.toLowerCase()))), [state, query]);

  return (
    <main className="pvx-mobile-page pvx-mobile-stack">
      <section className="pvx-mobile-card">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--medtrak-accent)]">Primovex Sense</p><h1 className="mt-1 pvx-mobile-title">Practice spaces</h1><p className="mt-1 text-sm text-[var(--medtrak-muted)]">Tap a Smart Tag to activate your location, or browse the practice structure below.</p></div><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--medtrak-accent)_12%,var(--medtrak-panel))] text-[var(--medtrak-accent)]"><Layers3 /></span></div>
        <button onClick={onScan} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--medtrak-accent)] px-4 py-2.5 font-bold text-white"><Nfc className="h-5 w-5" />Scan a space tag</button>
      </section>

      {activeSenseSession && <section className="rounded-3xl border border-[color-mix(in_srgb,var(--medtrak-accent)_35%,var(--medtrak-border))] bg-[color-mix(in_srgb,var(--medtrak-accent)_8%,var(--medtrak-panel))] p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Active now</p><div className="mt-2 flex items-center gap-3"><MapPin className="h-5 w-5 text-[var(--medtrak-accent)]"/><div><b>{activeSenseSession.senseObjectName}</b><p className="text-xs text-[var(--medtrak-muted)]">Your actions can use this space as context</p></div></div></section>}

      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--medtrak-muted)]"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Find a room, kitchen or stairwell" className="w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] py-3 pl-10 pr-3"/></div>

      {state.sites.map((site) => <section key={site.id} className="pvx-mobile-card"><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-[var(--medtrak-accent)]"/><h2 className="font-bold">{site.name}</h2></div><div className="mt-2 space-y-3">{state.floors.filter((floor)=>floor.siteId===site.id).sort((a,b)=>(a.order||0)-(b.order||0)).map((floor)=>{const floorSpaces=spaces.filter((space)=>space.siteId===site.id&&(space.floorId===floor.id||space.linkedFloorIds?.includes(floor.id)));if(!floorSpaces.length)return null;return <div key={floor.id}><p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-[var(--medtrak-muted)]">{floor.name}</p><div className="space-y-2">{floorSpaces.map((space)=><button key={space.id} onClick={()=>setSelected(space)} className="flex w-full items-center justify-between rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-2.5 text-left"><span><b className="block">{space.name}</b><small className="text-[var(--medtrak-muted)]">{space.type} · {state.zones.find(z=>z.id===space.zoneId)?.name || 'No zone'}</small></span><ChevronRight className="h-4 w-4 text-[var(--medtrak-muted)]"/></button>)}</div></div>})}</div></section>)}

      {selected && <div className="pvx-mobile-sheet-backdrop"><section className="pvx-mobile-sheet"><div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--medtrak-border)]"/><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Sense space</p><h2 className="mt-1 text-2xl font-bold">{selected.name}</h2><p className="text-sm text-[var(--medtrak-muted)]">{selected.type} · {state.floors.find(f=>f.id===selected.floorId)?.name || 'Multi-floor'} · {state.zones.find(z=>z.id===selected.zoneId)?.name || 'No zone'}</p></div><button onClick={()=>setSelected(null)} className="grid h-10 w-10 place-items-center rounded-full border border-[var(--medtrak-border)]"><X className="h-5 w-5"/></button></div><div className="mt-4 flex flex-wrap gap-2">{(selected.capabilities||[]).map(cap=><span key={cap} className="rounded-full bg-[color-mix(in_srgb,var(--medtrak-accent)_10%,var(--medtrak-panel))] px-3 py-1 text-xs font-semibold capitalize text-[var(--medtrak-accent)]">{cap}</span>)}</div>{selected.notes && <p className="mt-4 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3 text-sm">{selected.notes}</p>}<button onClick={()=>{setSelected(null);onScan?.();}} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--medtrak-accent)] px-4 py-3 font-bold text-white"><Nfc className="h-5 w-5"/>Activate with Smart Tag</button></section></div>}
    </main>
  );
}
