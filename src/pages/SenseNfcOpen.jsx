import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, MapPin, Nfc, PackageSearch } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { loadFacilitiesState } from '@/modules/facilities/services/facilitiesStore';
import { calculateSpaceReadiness, confirmSpaceContext, loadSenseState, saveSenseState } from '@/modules/sense/services/senseStore';
import { loadSpaceRegistry } from '@/modules/sense/services/sharedSpaceRegistry';
import { useSenseSession } from '@/contexts/SenseSessionContext';

export default function SenseNfcOpen() {
  const { entityType, entityId } = useParams();
  const { displayName, user } = useAuth();
  const { activate } = useSenseSession();
  const state = useMemo(() => loadSenseState(), []);
  const registry = useMemo(() => loadSpaceRegistry(), []);
  const entity = entityType === 'asset' ? state.assets.find((x) => x.id === entityId) : registry.spaces.find((x) => x.id === entityId || x.spaceId === entityId);
  const facilities = useMemo(() => loadFacilitiesState(), []);
  const readiness = entityType === 'space' && entity ? calculateSpaceReadiness(entity, { ...state, spaces: registry.spaces }, facilities) : null;

  useEffect(() => {
    if (entityType !== 'space' || !entity) return;
    saveSenseState(confirmSpaceContext(state, entity.id, displayName || user?.email || 'Signed-in user', 'nfc', 1));
    activate({ id: entity.id, name: entity.name, type: 'space', source: 'nfc' })
      .catch((error) => console.error('Unable to activate shared Sense room session', error));
  }, [entityType, entity?.id, entity?.name, displayName, user?.email, activate]);

  if (!entity) return <div className="min-h-screen bg-[var(--medtrak-bg)] p-6 text-[var(--medtrak-text)]"><div className="mx-auto max-w-lg rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-6"><h1 className="text-xl font-bold">NFC tag not recognised</h1><p className="mt-2 text-[var(--medtrak-muted)]">This tag points to an item that is not registered on this device.</p><Link to="/spaces" className="mt-5 inline-block rounded-xl bg-[var(--medtrak-accent)] px-4 py-3 font-semibold text-white">Open Sense</Link></div></div>;

  return <div className="min-h-screen bg-[var(--medtrak-bg)] p-4 text-[var(--medtrak-text)]"><main className="mx-auto max-w-lg space-y-4 pt-[max(1rem,env(safe-area-inset-top))]"><section className="rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 shadow-xl"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[var(--medtrak-accent)]"><Nfc className="h-4 w-4" /> Primovex Sense</div><div className="mt-4 flex items-start gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[color:color-mix(in_srgb,var(--medtrak-accent)_14%,var(--medtrak-panel))] text-[var(--medtrak-accent)]">{entityType === 'asset' ? <PackageSearch /> : <MapPin />}</span><div><h1 className="text-2xl font-bold">{entity.name}</h1><p className="text-sm text-[var(--medtrak-muted)]">{entityType === 'asset' ? 'Asset passport' : `${entity.type} · ${entity.floor}`}</p></div></div>{readiness && <div className="mt-5 rounded-2xl border border-[var(--medtrak-border)] p-4"><p className="text-sm text-[var(--medtrak-muted)]">Room readiness</p><p className="mt-1 text-4xl font-bold">{readiness.overall}%</p><div className="mt-3 space-y-1 text-sm">{readiness.explanation.map((line) => <p key={line}><CheckCircle2 className="mr-2 inline h-4 w-4 text-[var(--medtrak-accent)]" />{line}</p>)}</div></div>}{entityType === 'asset' && <div className="mt-5 rounded-2xl border border-[var(--medtrak-border)] p-4 text-sm"><p><b>Home:</b> {registry.spaces.find((x) => x.id === entity.homeSpaceId)?.name || entity.homeSpaceId}</p><p className="mt-1"><b>Current:</b> {registry.spaces.find((x) => x.id === entity.currentSpaceId)?.name || entity.currentSpaceId}</p><p className="mt-1 text-[var(--medtrak-muted)]">Last confirmed by {entity.lastConfirmedBy}</p></div>}<div className="mt-5 grid gap-2"><Link to="/spaces" className="rounded-xl bg-[var(--medtrak-accent)] px-4 py-3 text-center font-semibold text-white">Open full Sense record</Link><Link to="/dashboard" className="rounded-xl border border-[var(--medtrak-border)] px-4 py-3 text-center font-semibold">Return home</Link></div></section></main></div>;
}
