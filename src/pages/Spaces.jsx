import { useMemo, useState } from 'react';
import { Activity, BatteryMedium, Bluetooth, Building2, CheckCircle2, LocateFixed, MapPin, PackageSearch, Radio, RotateCcw, ScanLine, ShieldCheck, Wrench } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { loadFacilitiesState } from '@/modules/facilities/services/facilitiesStore';
import useSenseContext from '@/modules/sense/hooks/useSenseContext';
import NfcManager from '@/modules/sense/components/NfcManager';
import { calculateSpaceReadiness, confirmSpaceContext, moveAsset, resetSenseState, saveSenseState } from '@/modules/sense/services/senseStore';

const panel = 'rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] shadow-xl shadow-black/10';
const muted = 'text-[color:var(--medtrak-muted)]';
const button = 'rounded-xl border border-[color:var(--medtrak-border)] px-3 py-2 text-sm font-semibold transition hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_8%,var(--medtrak-panel))] focus:outline-none focus:ring-2 focus:ring-[color:var(--medtrak-accent)]';

function formatDate(value) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function StatusPill({ children, tone = 'info' }) {
  const styles = {
    good: 'bg-emerald-500/12 text-emerald-700',
    warning: 'bg-amber-500/12 text-amber-700',
    danger: 'bg-red-500/12 text-red-700',
    info: 'bg-[color:color-mix(in_srgb,var(--medtrak-accent)_12%,var(--medtrak-panel))] text-[color:var(--medtrak-accent)]',
  };
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${styles[tone]}`}>{children}</span>;
}

export default function Spaces() {
  const { displayName, user } = useAuth();
  const { state, activeSpace, scanning, scan } = useSenseContext();
  const [senseState, setSenseState] = useState(state);
  const [selectedSpaceId, setSelectedSpaceId] = useState(state.activeContext?.spaceId || state.spaces[0]?.id || null);
  const facilities = useMemo(() => loadFacilitiesState(), []);
  const actor = displayName || user?.email || 'Signed-in user';

  const selectedSpace = senseState.spaces.find((space) => space.id === selectedSpaceId);
  const readiness = selectedSpace ? calculateSpaceReadiness(selectedSpace, senseState, facilities) : null;
  const assetsHere = senseState.assets.filter((asset) => asset.currentSpaceId === selectedSpaceId);
  const expectedAssets = senseState.assets.filter((asset) => selectedSpace?.expectedAssetIds?.includes(asset.id));
  const timeline = senseState.timeline.filter((event) => !selectedSpaceId || event.spaceId === selectedSpaceId).slice(0, 8);
  const trackedAssets = senseState.assets.filter((asset) => asset.tracker?.provider && asset.tracker.provider !== 'none');
  const awayFromHome = senseState.assets.filter((asset) => asset.mobilityProfile !== 'fixed' && asset.currentSpaceId !== asset.homeSpaceId);

  function commit(next) {
    setSenseState(next);
    saveSenseState(next);
  }

  function confirmSelected() {
    if (!selectedSpaceId) return;
    commit(confirmSpaceContext(senseState, selectedSpaceId, actor));
  }

  async function runMockScan() {
    const result = await scan();
    if (result?.spaceId) {
      const latest = JSON.parse(localStorage.getItem('primovex.sense.v1'));
      setSenseState(latest);
      setSelectedSpaceId(result.spaceId);
    }
  }

  function resetDemo() {
    const next = resetSenseState();
    setSenseState(next);
    setSelectedSpaceId(next.spaces[0]?.id || null);
  }

  return (
    <div className="space-y-5 text-[color:var(--medtrak-text)]">
      <section className={`${panel} overflow-hidden p-5 sm:p-7`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--medtrak-accent)]"><Radio className="h-4 w-4" /> Primovex Sense</div>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Spaces, presence and asset awareness</h1>
            <p className={`mt-2 max-w-3xl text-sm ${muted}`}>A hardware-independent digital twin foundation. This sprint uses manual selection and a mock BLE provider; real beacon scanning plugs into the same provider interface later.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={runMockScan} disabled={scanning} className={button}><ScanLine className="mr-2 inline h-4 w-4" />{scanning ? 'Scanning…' : 'Simulate BLE scan'}</button>
            <button onClick={resetDemo} className={button}><RotateCcw className="mr-2 inline h-4 w-4" />Reset demo</button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Managed spaces" value={senseState.spaces.length} icon={Building2} />
        <Metric label="Sense nodes enabled" value={senseState.spaces.filter((space) => space.senseNode?.enabled).length} icon={Bluetooth} />
        <Metric label="Tracked assets" value={trackedAssets.length} icon={PackageSearch} />
        <Metric label="Away from home" value={awayFromHome.length} icon={MapPin} warning={awayFromHome.length > 0} />
      </div>

      {activeSpace && (
        <section className={`${panel} border-[color:var(--medtrak-accent)] p-4 sm:p-5`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[color:color-mix(in_srgb,var(--medtrak-accent)_14%,var(--medtrak-panel))] text-[color:var(--medtrak-accent)]"><LocateFixed className="h-5 w-5" /></span><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[color:var(--medtrak-accent)]">Current context</p><h2 className="font-semibold">{activeSpace.name}</h2><p className={`text-sm ${muted}`}>{Math.round((senseState.activeContext.confidence || 1) * 100)}% confidence · {senseState.activeContext.provider}</p></div></div>
            <button onClick={() => setSelectedSpaceId(activeSpace.id)} className={button}>Open space</button>
          </div>
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.5fr]">
        <section className={`${panel} p-4 sm:p-5`}>
          <div className="mb-4"><h2 className="text-lg font-semibold">Spaces registry</h2><p className={`text-sm ${muted}`}>Select a space to review readiness, expected assets and its operational timeline.</p></div>
          <div className="space-y-2">
            {senseState.spaces.map((space) => {
              const score = calculateSpaceReadiness(space, senseState, facilities).overall;
              return <button key={space.id} onClick={() => setSelectedSpaceId(space.id)} className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition ${selectedSpaceId === space.id ? 'border-[color:var(--medtrak-accent)] bg-[color:color-mix(in_srgb,var(--medtrak-accent)_9%,var(--medtrak-panel))]' : 'border-[color:var(--medtrak-border)] hover:bg-white/5'}`}><span><b className="block">{space.name}</b><small className={muted}>{space.floor} · {space.zone} · {space.id}</small></span><span className="text-right"><b className="block text-lg">{score}%</b><small className={muted}>{space.senseNode?.enabled ? 'Sense enabled' : 'No node'}</small></span></button>;
            })}
          </div>
        </section>

        {selectedSpace && readiness && (
          <section className={`${panel} p-4 sm:p-5`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div><div className="flex items-center gap-2"><h2 className="text-xl font-semibold">{selectedSpace.name}</h2><StatusPill tone={readiness.overall >= 90 ? 'good' : readiness.overall >= 70 ? 'warning' : 'danger'}>{readiness.overall}% ready</StatusPill></div><p className={`mt-1 text-sm ${muted}`}>{selectedSpace.type} · {selectedSpace.site} · {selectedSpace.floor}</p></div>
              <button onClick={confirmSelected} className={button}><CheckCircle2 className="mr-2 inline h-4 w-4" />Confirm this space</button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {Object.entries(readiness.modules).map(([label, value]) => <div key={label} className="rounded-2xl border border-[color:var(--medtrak-border)] p-3"><p className={`text-xs capitalize ${muted}`}>{label}</p><p className="mt-1 text-2xl font-bold">{value}%</p></div>)}
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div><h3 className="font-semibold">Sense node</h3><div className="mt-2 rounded-2xl border border-[color:var(--medtrak-border)] p-4"><div className="flex items-center justify-between"><span className="flex items-center gap-2"><Bluetooth className="h-4 w-4 text-[color:var(--medtrak-accent)]" />{selectedSpace.senseNode?.beaconId}</span><StatusPill tone={selectedSpace.senseNode?.enabled ? 'good' : 'warning'}>{selectedSpace.senseNode?.enabled ? 'Enabled' : 'Not paired'}</StatusPill></div><div className={`mt-3 space-y-1 text-sm ${muted}`}><p>Provider: {selectedSpace.senseNode?.provider || 'None'}</p><p>Battery: {selectedSpace.senseNode?.batteryPercent ?? '—'}%</p><p>Last seen: {formatDate(selectedSpace.senseNode?.lastSeenAt)}</p></div></div></div>

              <div><h3 className="font-semibold">Expected equipment</h3><div className="mt-2 space-y-2">{expectedAssets.length ? expectedAssets.map((asset) => { const present = asset.currentSpaceId === selectedSpace.id; return <div key={asset.id} className="flex items-center justify-between rounded-2xl border border-[color:var(--medtrak-border)] p-3"><span><b className="block">{asset.name}</b><small className={muted}>{asset.mobilityProfile} asset</small></span><StatusPill tone={present ? 'good' : 'warning'}>{present ? 'Present' : 'Away'}</StatusPill></div>; }) : <p className={`text-sm ${muted}`}>No expected equipment is registered for this space.</p>}</div></div>
            </div>

            <div className="mt-5"><h3 className="font-semibold">Assets currently here</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{assetsHere.map((asset) => <div key={asset.id} className="rounded-2xl border border-[color:var(--medtrak-border)] p-3"><div className="flex items-start justify-between gap-3"><span><b className="block">{asset.name}</b><small className={muted}>Home: {senseState.spaces.find((space) => space.id === asset.homeSpaceId)?.name || asset.homeSpaceId}</small></span>{asset.currentSpaceId !== asset.homeSpaceId && <StatusPill tone="warning">Away from home</StatusPill>}</div><select value={asset.currentSpaceId} onChange={(event) => commit(moveAsset(senseState, asset.id, event.target.value, actor))} className="mt-3 w-full rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-3 py-2 text-sm">{senseState.spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}</select></div>)}</div></div>

            <div className="mt-5"><h3 className="font-semibold">Space timeline</h3><div className="mt-2 divide-y divide-[color:var(--medtrak-border)] rounded-2xl border border-[color:var(--medtrak-border)] px-4">{timeline.length ? timeline.map((event) => <div key={event.id} className="flex gap-3 py-3"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--medtrak-accent)]" /><div><b className="block text-sm">{event.message}</b><small className={muted}>{formatDate(event.occurredAt)} · {event.actor}</small></div></div>) : <p className={`py-4 text-sm ${muted}`}>No events recorded for this space.</p>}</div></div>
          </section>
        )}
      </div>

      <NfcManager state={senseState} commit={commit} actor={actor} />

      <section className={`${panel} p-4 sm:p-5`}>
        <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-[color:var(--medtrak-accent)]" /><div><h2 className="font-semibold">Sense Foundation boundary</h2><p className={`text-sm ${muted}`}>This release stores Sense data locally and uses a mock BLE provider. No continuous location tracking, background scanning, Firebase writes or real beacon integration has been enabled.</p></div></div>
      </section>
    </div>
  );
}

function Metric({ label, value, icon: Icon, warning }) {
  return <div className={`${panel} p-4`}><div className="flex items-center justify-between"><span className={`text-sm ${muted}`}>{label}</span><Icon className={`h-5 w-5 ${warning ? 'text-amber-500' : 'text-[color:var(--medtrak-accent)]'}`} /></div><div className="mt-3 text-2xl font-semibold">{value}</div></div>;
}
