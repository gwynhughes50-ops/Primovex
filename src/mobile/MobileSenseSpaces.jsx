import { useEffect, useMemo, useState } from 'react';
import { Bluetooth, Boxes, Building2, CheckCircle2, ChevronDown, ChevronRight, Layers3, MapPin, Nfc, PackageCheck, Search, Sparkles, SprayCan, X } from 'lucide-react';
import { loadSpaceRegistry } from '@/modules/sense/services/sharedSpaceRegistry';
import { useSenseSession } from '@/contexts/SenseSessionContext';
import { useAuth } from '@/contexts/AuthContext';
import useSenseContext from '@/modules/sense/hooks/useSenseContext';
import { buildNfcUrl, nativeNfcAvailable, writeNfcUrl } from '@/modules/sense/services/nfcService';
import { loadSenseState, saveSenseState, upsertNfcTag } from '@/modules/sense/services/senseStore';
import { getActiveCleaningSession, markRoomStocked, subscribeRoomOperational } from '@/modules/facilities/services/cleaningRecordService';
import MobileFridgeSheet from './MobileFridgeSheet';
import { subscribeToEquipmentSightings } from '@/modules/equipment/services/equipmentSightingService';

function sessionStartedAtMs(session) {
  const value = session?.startedAt;
  if (!value) return 0;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function timeAgo(value) {
  if (!value) return 'Not yet recorded';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not yet recorded';
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function MobileSenseSpaces({ onScan, onBleScan }) {
  const [state, setState] = useState(() => loadSpaceRegistry());
  const [roomOperational, setRoomOperational] = useState({});
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [writeStatus, setWriteStatus] = useState('idle');
  const [writeMessage, setWriteMessage] = useState('');
  const [stockMessage, setStockMessage] = useState('');
  const [expandedFloors, setExpandedFloors] = useState(() => new Set());
  function toggleFloor(floorId) {
    setExpandedFloors((prev) => {
      const next = new Set(prev);
      if (next.has(floorId)) next.delete(floorId); else next.add(floorId);
      return next;
    });
  }
  const { activeSenseSession } = useSenseSession();
  const { displayName, user, role, isAdmin } = useAuth();
  const { state: senseState } = useSenseContext();

  async function writeSpaceTag(space) {
    if (!nativeNfcAvailable()) {
      setWriteStatus('error');
      setWriteMessage('Tag writing needs the installed Android app.');
      return;
    }
    setWriteStatus('writing');
    setWriteMessage('Hold a blank NFC tag to the back of the phone…');
    try {
      const url = buildNfcUrl('space', space.id);
      await writeNfcUrl(url);
      const nextSense = loadSenseState();
      const next = upsertNfcTag(nextSense, { id: crypto.randomUUID(), label: space.name, entityType: 'space', entityId: space.id, url, status: 'active' }, displayName || user?.email || 'Signed-in user');
      saveSenseState(next);
      setWriteStatus('success');
      setWriteMessage(`Tag programmed for ${space.name}.`);
    } catch (error) {
      setWriteStatus('error');
      setWriteMessage(error?.message || 'Could not write the tag.');
    }
  }

  async function markStocked(space) {
    const actorName = displayName || user?.email || 'Signed-in user';
    await markRoomStocked(space.id, actorName);
    setStockMessage(`Marked stocked just now by ${actorName}.`);
  }

  useEffect(() => {
    const refresh = () => setState(loadSpaceRegistry());
    window.addEventListener('primovex:sense-changed', refresh);
    return () => window.removeEventListener('primovex:sense-changed', refresh);
  }, []);

  useEffect(() => subscribeRoomOperational(setRoomOperational), []);

  // Scanning a room's tag (NFC or QR) activates it in SenseSessionContext;
  // surface that room's detail sheet automatically instead of leaving the
  // user to find and tap it in the list below. Two things this must NOT do:
  // 1) Only senseObjectId belongs in the deps: state.spaces gets a new array
  //    reference on every registry refresh (primovex:sense-changed fires for
  //    any edit, anywhere), and including it here was re-opening the card on
  //    unrelated background updates even after the user had closed it.
  // 2) The Sense session is long-lived (it stays "active" until a different
  //    tag is scanned or it's explicitly cleared — see
  //    SenseSessionContext.jsx), so it's often still set from an earlier
  //    visit. Only auto-open for a session that just started; otherwise
  //    simply returning to this screen re-pops the card for a room you
  //    scanned ages ago.
  useEffect(() => {
    if (!activeSenseSession?.senseObjectId || activeSenseSession.senseObjectType !== 'space') return;
    if (Date.now() - sessionStartedAtMs(activeSenseSession) > 15000) return;
    const match = state.spaces.find((space) => space.id === activeSenseSession.senseObjectId);
    if (match) {
      setWriteStatus('idle'); setWriteMessage(''); setStockMessage('');
      setSelected(match);
    }
  }, [activeSenseSession?.senseObjectId]);

  // Same auto-open pattern as the room sheet above, but for a fridge/asset
  // scan — see the two "must NOT" notes above, they apply here identically.
  useEffect(() => {
    if (!activeSenseSession?.senseObjectId || activeSenseSession.senseObjectType !== 'asset') return;
    if (Date.now() - sessionStartedAtMs(activeSenseSession) > 15000) return;
    const match = senseState.assets.find((asset) => asset.id === activeSenseSession.senseObjectId);
    if (match) setSelectedAsset(match);
  }, [activeSenseSession?.senseObjectId]);

  const [sightings, setSightings] = useState(new Map());
  useEffect(() => subscribeToEquipmentSightings(setSightings), []);

  const spaces = useMemo(() => state.spaces.filter((space) => space.status !== 'archived' && (!query.trim() || `${space.name} ${space.type}`.toLowerCase().includes(query.toLowerCase()))), [state, query]);
  // Equipment (fridges/freezers etc.) needs to be browsable, not just
  // reachable by scanning a tag it doesn't have yet — otherwise there's no
  // way to get to a fridge's sheet at all in order to write its first tag.
  const assets = useMemo(() => (senseState.assets || []).filter((asset) => !query.trim() || asset.name.toLowerCase().includes(query.toLowerCase())), [senseState.assets, query]);

  const selectedRoom = selected ? roomOperational[selected.id] : null;
  const expectedAssets = useMemo(() => {
    if (!selected?.expectedAssetIds?.length) return [];
    return selected.expectedAssetIds.map((assetId) => {
      const asset = senseState.assets.find((item) => item.id === assetId);
      return { id: assetId, name: asset?.name || assetId, present: asset ? asset.currentSpaceId === selected.id : false };
    });
  }, [selected, senseState.assets]);
  const cleaningSession = selected ? getActiveCleaningSession(roomOperational, selected.id) : null;

  return (
    <main className="pvx-mobile-page pvx-mobile-stack">
      <section className="pvx-mobile-card">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--medtrak-accent)]">Primovex Sense</p><h1 className="mt-1 pvx-mobile-title">Practice spaces</h1><p className="mt-1 text-sm text-[var(--medtrak-muted)]">Tap a Smart Tag to activate your location, or browse the practice structure below.</p></div><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--medtrak-accent)_12%,var(--medtrak-panel))] text-[var(--medtrak-accent)]"><Layers3 /></span></div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={onScan} className="flex items-center justify-center gap-2 rounded-xl bg-[var(--medtrak-accent)] px-4 py-2.5 font-bold text-white"><Nfc className="h-5 w-5" />NFC scan</button>
          {onBleScan && <button onClick={onBleScan} className="flex items-center justify-center gap-2 rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 py-2.5 font-bold"><Bluetooth className="h-5 w-5" />BLE scan</button>}
        </div>
      </section>

      {activeSenseSession && <section className="rounded-3xl border border-[color-mix(in_srgb,var(--medtrak-accent)_35%,var(--medtrak-border))] bg-[color-mix(in_srgb,var(--medtrak-accent)_8%,var(--medtrak-panel))] p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Active now</p><div className="mt-2 flex items-center gap-3"><MapPin className="h-5 w-5 text-[var(--medtrak-accent)]"/><div><b>{activeSenseSession.senseObjectName}</b><p className="text-xs text-[var(--medtrak-muted)]">Your actions can use this space as context</p></div></div></section>}

      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--medtrak-muted)]"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Find a room, kitchen or stairwell" className="w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] py-3 pl-10 pr-3"/></div>

      {state.sites.map((site) => <section key={site.id} className="pvx-mobile-card"><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-[var(--medtrak-accent)]"/><h2 className="font-bold">{site.name}</h2></div><div className="mt-2 space-y-2">{state.floors.filter((floor)=>floor.siteId===site.id).sort((a,b)=>(a.order||0)-(b.order||0)).map((floor)=>{const floorSpaces=spaces.filter((space)=>space.siteId===site.id&&(space.floorId===floor.id||space.linkedFloorIds?.includes(floor.id)));if(!floorSpaces.length)return null;const isExpanded=Boolean(query.trim())||expandedFloors.has(floor.id);return <div key={floor.id} className="overflow-hidden rounded-xl border border-[var(--medtrak-border)]"><button onClick={()=>toggleFloor(floor.id)} className="flex w-full items-center justify-between px-3 py-2.5 text-left"><span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-[var(--medtrak-muted)]">{isExpanded ? <ChevronDown className="h-3.5 w-3.5"/> : <ChevronRight className="h-3.5 w-3.5"/>}{floor.name}</span><span className="text-xs text-[var(--medtrak-muted)]">{floorSpaces.length} room{floorSpaces.length===1?'':'s'}</span></button>{isExpanded && <div className="space-y-2 border-t border-[var(--medtrak-border)] p-2.5">{floorSpaces.map((space)=><button key={space.id} onClick={()=>{setWriteStatus('idle');setWriteMessage('');setStockMessage('');setSelected(space);}} className="flex w-full items-center justify-between rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-2.5 text-left"><span><b className="block">{space.name}</b><small className="text-[var(--medtrak-muted)]">{space.type} · {state.zones.find(z=>z.id===space.zoneId)?.name || 'No zone'}</small></span><ChevronRight className="h-4 w-4 text-[var(--medtrak-muted)]"/></button>)}</div>}</div>})}</div></section>)}

      {assets.length > 0 && <section className="pvx-mobile-card"><div className="flex items-center gap-2"><Boxes className="h-5 w-5 text-[var(--medtrak-accent)]"/><h2 className="font-bold">Equipment</h2></div><div className="mt-2 space-y-2">{assets.map((asset) => { const sighting = sightings.get(asset.id); return <button key={asset.id} onClick={() => setSelectedAsset(asset)} className="flex w-full items-center justify-between rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-2.5 text-left"><span><b className="block">{asset.name}</b><small className="text-[var(--medtrak-muted)]">{asset.category || 'Equipment'}{asset.monitoring?.fridgeId ? ' · Live temperature' : ''}{sighting?.lastSeenAt ? ` · Seen ${timeAgo(sighting.lastSeenAt)}${sighting.lastSeenSpaceName ? ` near ${sighting.lastSeenSpaceName}` : ''}` : ''}</small></span><ChevronRight className="h-4 w-4 text-[var(--medtrak-muted)]"/></button>; })}</div></section>}

      {selected && <div className="pvx-mobile-sheet-backdrop"><section className="pvx-mobile-sheet">
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--medtrak-border)]"/>
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Sense space</p><h2 className="mt-1 text-2xl font-bold">{selected.name}</h2><p className="text-sm text-[var(--medtrak-muted)]">{selected.type} · {state.floors.find(f=>f.id===selected.floorId)?.name || 'Multi-floor'} · {state.zones.find(z=>z.id===selected.zoneId)?.name || 'No zone'}</p></div><button onClick={()=>setSelected(null)} className="grid h-10 w-10 place-items-center rounded-full border border-[var(--medtrak-border)]"><X className="h-5 w-5"/></button></div>
        <div className="mt-4 flex flex-wrap gap-2">{(selected.capabilities||[]).map(cap=><span key={cap} className="rounded-full bg-[color-mix(in_srgb,var(--medtrak-accent)_10%,var(--medtrak-panel))] px-3 py-1 text-xs font-semibold capitalize text-[var(--medtrak-accent)]">{cap}</span>)}</div>
        {selected.notes && <p className="mt-4 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3 text-sm">{selected.notes}</p>}

        {cleaningSession && <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3"><SprayCan className="h-5 w-5 text-amber-600" /><div><b className="text-sm">Cleaning in progress</b><p className="text-xs text-[var(--medtrak-muted)]">Started by {cleaningSession.startedBy} · {timeAgo(cleaningSession.startedAt)}. Scan this room's tag again to finish.</p></div></div>}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]"><SprayCan className="h-3.5 w-3.5" />Last cleaned</div><p className="mt-1 text-sm font-semibold">{timeAgo(selectedRoom?.lastCleanedAt)}</p>{selectedRoom?.lastCleanedBy && <p className="text-xs text-[var(--medtrak-muted)]">by {selectedRoom.lastCleanedBy}</p>}</div>
          <div className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]"><Boxes className="h-3.5 w-3.5" />Last stocked</div><p className="mt-1 text-sm font-semibold">{timeAgo(selectedRoom?.lastStockedAt)}</p>{selectedRoom?.lastStockedBy && <p className="text-xs text-[var(--medtrak-muted)]">by {selectedRoom.lastStockedBy}</p>}</div>
        </div>

        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-[.12em] text-[var(--medtrak-muted)]">Equipment that should be here</p>
          {expectedAssets.length ? (
            <div className="mt-2 space-y-1.5">
              {expectedAssets.map((asset) => <div key={asset.id} className="flex items-center justify-between rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-2 text-sm"><span>{asset.name}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${asset.present ? 'bg-emerald-500/12 text-emerald-700' : 'bg-red-500/12 text-red-700'}`}>{asset.present ? 'Present' : 'Missing'}</span></div>)}
            </div>
          ) : <p className="mt-2 text-sm text-[var(--medtrak-muted)]">No equipment roster set for this room yet.</p>}
        </div>

        {stockMessage && <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700"><CheckCircle2 className="mr-2 inline h-4 w-4" />{stockMessage}</p>}
        {writeMessage && <p className={`mt-4 rounded-xl border p-3 text-sm ${writeStatus === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-700' : writeStatus === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700' : 'border-[var(--medtrak-border)] bg-[var(--medtrak-bg)]'}`}>{writeStatus === 'success' && <CheckCircle2 className="mr-2 inline h-4 w-4" />}{writeMessage}</p>}

        <button onClick={()=>markStocked(selected)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] px-4 py-3 font-bold"><PackageCheck className="h-5 w-5"/>Mark as stocked</button>
        <button onClick={()=>{setSelected(null);onScan?.();}} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--medtrak-accent)] px-4 py-3 font-bold text-white"><Nfc className="h-5 w-5"/>Activate with Smart Tag</button>
        {isAdmin && nativeNfcAvailable() && <button onClick={()=>writeSpaceTag(selected)} disabled={writeStatus === 'writing'} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] px-4 py-3 font-bold disabled:opacity-60"><Sparkles className="h-5 w-5"/>{writeStatus === 'writing' ? 'Hold a blank tag…' : 'Write this space to a tag'}</button>}
        {role === 'Cleaner' && !cleaningSession && <p className="mt-3 text-center text-xs text-[var(--medtrak-muted)]">Scan this room's tag to start a tracked cleaning session.</p>}
        </section></div>}

      {selectedAsset && <MobileFridgeSheet asset={selectedAsset} onClose={() => setSelectedAsset(null)} />}
    </main>
  );
}
