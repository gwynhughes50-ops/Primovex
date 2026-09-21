import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bluetooth, CheckCircle2, Home, Sparkles, Thermometer, X } from 'lucide-react';
import { collection, limit, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { addDocResendSafe } from '@/lib/resendSafeWrites';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import useStock from '@/hooks/useStock';
import { buildNfcUrl, nativeNfcAvailable, writeNfcUrl } from '@/modules/sense/services/nfcService';
import { loadSenseState, saveSenseState, upsertNfcTag } from '@/modules/sense/services/senseStore';
import { loadSpaceRegistry } from '@/modules/sense/services/sharedSpaceRegistry';
import { nativeBleAvailable, onBleEvent, parseIBeaconValue, startBleScan } from '@/modules/sense/services/bleService';
import { upsertEquipment } from '@/modules/equipment/services/equipmentRegistry';

function toDate(value) {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timeAgo(value) {
  const date = toDate(value);
  if (!date) return 'Not yet recorded';
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Scanning a fridge's NFC tag activates it as a Sense "asset" session (see
// MobileSenseSpaces.jsx) — that activation already logs who/when via
// sense_sessions/sense_events, so simply opening this sheet is the access
// log. min/max/fridgeId come from the equipment record's monitoring block
// (set up via DeviceAssignmentSheet.jsx on the desktop Connect page, or
// manually) — a fridge with no fridgeId yet just skips the live-reading
// section and still supports stock/incident logging.
export default function MobileFridgeSheet({ asset, onClose }) {
  const { displayName, user, isAdmin } = useAuth();
  const actorName = displayName || user?.email || 'Signed-in user';
  const unitId = asset?.monitoring?.fridgeId || '';
  const min = asset?.monitoring?.min;
  const max = asset?.monitoring?.max;

  const [latestReading, setLatestReading] = useState(null);
  const [readingError, setReadingError] = useState('');
  const [incidents, setIncidents] = useState([]);
  const { allItems = [] } = useStock({ includeArchived: false });

  const [writeStatus, setWriteStatus] = useState('idle');
  const [writeMessage, setWriteMessage] = useState('');

  // Cheap BLE tags (DX-CP35 etc) can't be reconfigured to broadcast a
  // Primovex URL — Eddystone-URL's payload is too short — so instead we bind
  // whichever iBeacon identity (UUID+Major+Minor) is currently nearby
  // straight onto this equipment record. See equipmentRegistry.js.
  const [linkedBleTag, setLinkedBleTag] = useState(asset?.bleTag || null);
  const [linking, setLinking] = useState(false);
  const [bleCandidates, setBleCandidates] = useState([]);
  const bleCandidatesRef = useRef([]);

  useEffect(() => { setLinkedBleTag(asset?.bleTag || null); }, [asset?.id, asset?.bleTag]);

  useEffect(() => {
    if (!linking) return undefined;
    bleCandidatesRef.current = [];
    setBleCandidates([]);
    if (nativeBleAvailable()) startBleScan();
    const unsubscribe = onBleEvent((detail) => {
      if (detail?.type !== 'ibeacon' || !detail?.value) return;
      const beacon = parseIBeaconValue(detail.value);
      if (!beacon) return;
      const key = `${beacon.uuid}:${beacon.major}:${beacon.minor}`;
      const next = [{ ...beacon, key }, ...bleCandidatesRef.current.filter((row) => row.key !== key)].slice(0, 5);
      bleCandidatesRef.current = next;
      setBleCandidates(next);
    });
    return () => unsubscribe();
  }, [linking]);

  async function linkBleTag(beacon) {
    await upsertEquipment({ id: asset.id, bleTag: { uuid: beacon.uuid, major: beacon.major, minor: beacon.minor } }, 'ble-tag-link');
    setLinkedBleTag({ uuid: beacon.uuid, major: beacon.major, minor: beacon.minor });
    setLinking(false);
  }

  // homeSpaceId is deliberately separate from the live BLE-sighting location
  // tracking above — this is a static "where it belongs when not in use"
  // record, not "where it currently is". There was previously no mobile UI
  // for this at all (only the desktop Equipment Registration wizard).
  const spaces = useMemo(() => (loadSpaceRegistry().spaces || []).filter((space) => space.status !== 'archived'), []);
  const [homeSpaceId, setHomeSpaceId] = useState(asset?.homeSpaceId || '');
  const [settingHome, setSettingHome] = useState(false);
  const [homeSpaceSelection, setHomeSpaceSelection] = useState('');

  useEffect(() => { setHomeSpaceId(asset?.homeSpaceId || ''); }, [asset?.id, asset?.homeSpaceId]);

  async function saveHomeRoom() {
    if (!homeSpaceSelection) return;
    await upsertEquipment({ id: asset.id, homeSpaceId: homeSpaceSelection }, 'set-home-room');
    setHomeSpaceId(homeSpaceSelection);
    setSettingHome(false);
  }

  const homeSpaceName = spaces.find((space) => space.id === homeSpaceId)?.name || '';

  async function unlinkBleTag() {
    await upsertEquipment({ id: asset.id, bleTag: null }, 'ble-tag-link');
    setLinkedBleTag(null);
  }

  async function writeAssetTag() {
    if (!nativeNfcAvailable()) {
      setWriteStatus('error');
      setWriteMessage('Tag writing needs the installed Android app.');
      return;
    }
    setWriteStatus('writing');
    setWriteMessage('Hold a blank NFC tag to the back of the phone…');
    try {
      const url = buildNfcUrl('asset', asset.id);
      await writeNfcUrl(url);
      const nextSense = loadSenseState();
      const next = upsertNfcTag(nextSense, { id: crypto.randomUUID(), label: asset.name, entityType: 'asset', entityId: asset.id, url, status: 'active' }, actorName);
      saveSenseState(next);
      setWriteStatus('success');
      setWriteMessage(`Tag programmed for ${asset.name}.`);
    } catch (error) {
      setWriteStatus('error');
      setWriteMessage(error?.message || 'Could not write the tag.');
    }
  }

  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueSummary, setIssueSummary] = useState('');
  const [issueDetails, setIssueDetails] = useState('');
  const [issueBusy, setIssueBusy] = useState(false);
  const [issueError, setIssueError] = useState('');
  const [issueSuccess, setIssueSuccess] = useState('');

  useEffect(() => {
    if (!unitId) { setLatestReading(null); setReadingError(''); return undefined; }
    setReadingError('');
    const qy = query(collection(db, 'temperature_logs'), where('unitId', '==', unitId), orderBy('created_at', 'desc'), limit(1));
    return onSnapshot(
      qy,
      (snap) => setLatestReading(snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null),
      (error) => {
        console.error('Fridge reading subscription failed', error);
        setLatestReading(null);
        setReadingError(error?.message || 'Could not load the latest reading.');
      }
    );
  }, [unitId]);

  // No orderBy here: an incident missing openedAt would be silently dropped
  // by Firestore rather than just sorted last — sort client-side instead.
  useEffect(() => {
    if (!unitId) { setIncidents([]); return undefined; }
    const qy = query(collection(db, 'temperature_incidents'), where('unitId', '==', unitId));
    return onSnapshot(qy, (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((row) => String(row.status || 'open') === 'open');
      rows.sort((a, b) => (toDate(b.openedAt)?.getTime() || 0) - (toDate(a.openedAt)?.getTime() || 0));
      setIncidents(rows);
    }, () => setIncidents([]));
  }, [unitId]);

  const stockHere = useMemo(() => {
    if (!asset?.id) return [];
    return allItems
      .map((item) => {
        const loc = (item.locations || []).find((entry) => entry.locationId === asset.id);
        return loc ? { ...item, quantityHere: loc.quantity } : null;
      })
      .filter(Boolean);
  }, [allItems, asset?.id]);

  const temp = latestReading ? Number(latestReading.temp ?? latestReading.temperature) : null;
  const outOfRange = Number.isFinite(temp) && Number.isFinite(min) && Number.isFinite(max) && (temp < min || temp > max);

  async function submitIssue(event) {
    event.preventDefault();
    if (!issueSummary.trim()) { setIssueError('Add a short summary.'); return; }
    setIssueBusy(true);
    setIssueError('');
    try {
      await addDocResendSafe(collection(db, 'temperature_incidents'), {
        unitId: unitId || asset.id,
        unitName: asset.name,
        unitType: 'fridge',
        siteId: asset.currentSpaceId || '',
        expectedRange: Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null,
        observedTemp: Number.isFinite(temp) ? temp : null,
        summary: issueSummary.trim(),
        details: issueDetails.trim(),
        actionsTaken: '',
        affectedStock: { quarantined: false, discarded: false, movedToBackupUnit: false, stockNotes: '' },
        status: 'open',
        openedAt: serverTimestamp(),
        openedBy: actorName,
        resolvedAt: null,
        resolvedBy: null,
        resolutionNotes: '',
      });
      setIssueSuccess('Issue logged.');
      setIssueSummary('');
      setIssueDetails('');
      setShowIssueForm(false);
    } catch (err) {
      setIssueError(err?.message || 'Could not log this issue.');
    } finally {
      setIssueBusy(false);
    }
  }

  if (!asset) return null;

  return (
    <div className="pvx-mobile-sheet-backdrop">
      <section className="pvx-mobile-sheet">
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--medtrak-border)]" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Fridge / Cold chain</p>
            <h2 className="mt-1 text-2xl font-bold">{asset.name}</h2>
            {Number.isFinite(min) && Number.isFinite(max) && <p className="text-sm text-[var(--medtrak-muted)]">Safe range {min}°C to {max}°C</p>}
          </div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-[var(--medtrak-border)]" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className={`mt-4 rounded-2xl border p-4 ${outOfRange ? 'border-rose-500/40 bg-rose-500/10' : 'border-[var(--medtrak-border)] bg-[var(--medtrak-bg)]'}`}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]"><Thermometer className="h-3.5 w-3.5" />Latest reading</div>
          {unitId ? (
            Number.isFinite(temp) ? (
              <>
                <p className={`mt-1 text-3xl font-bold ${outOfRange ? 'text-rose-600' : ''}`}>{temp}°C</p>
                <p className="text-xs text-[var(--medtrak-muted)]">{timeAgo(latestReading?.measured_at || latestReading?.created_at)}{outOfRange ? ' • Out of range' : ''}</p>
              </>
            ) : <p className="mt-1 text-sm text-[var(--medtrak-muted)]">No readings recorded yet.</p>
          ) : <p className="mt-1 text-sm text-[var(--medtrak-muted)]">This fridge isn't linked to a temperature unit yet.</p>}
          {isAdmin && readingError && <p className="mt-1 text-xs text-rose-500">Reading lookup error: {readingError}</p>}
        </div>

        {incidents.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-[.12em] text-[var(--medtrak-muted)]">Open issues</p>
            {incidents.map((incident) => (
              <div key={incident.id} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" />{incident.summary}</div>
                <p className="mt-1 text-xs text-[var(--medtrak-muted)]">Opened {timeAgo(incident.openedAt)}{incident.openedBy ? ` by ${incident.openedBy}` : ''}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-[.12em] text-[var(--medtrak-muted)]">Stock in this fridge</p>
          {stockHere.length ? (
            <div className="mt-2 space-y-1.5">
              {stockHere.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-2 text-sm">
                  <span className="truncate">{item.name}</span>
                  <span className="shrink-0 font-semibold">{item.quantityHere}</span>
                </div>
              ))}
            </div>
          ) : <p className="mt-2 text-sm text-[var(--medtrak-muted)]">No stock assigned to this fridge yet — assign it from Inventory.</p>}
        </div>

        {issueSuccess && <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700"><CheckCircle2 className="mr-2 inline h-4 w-4" />{issueSuccess}</p>}

        {showIssueForm ? (
          <form onSubmit={submitIssue} className="mt-4 space-y-2 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3">
            <label className="block text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">What's wrong?
              <input autoFocus value={issueSummary} onChange={(e) => setIssueSummary(e.target.value)} placeholder="e.g. Door left open" className="mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2 text-sm text-[var(--medtrak-text)]" />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Details (optional)
              <textarea rows={2} value={issueDetails} onChange={(e) => setIssueDetails(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2 text-sm text-[var(--medtrak-text)]" />
            </label>
            {issueError && <p className="text-xs text-rose-600">{issueError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowIssueForm(false)} className="flex-1 rounded-xl border border-[var(--medtrak-border)] px-3 py-2 text-sm font-semibold">Cancel</button>
              <button type="submit" disabled={issueBusy} className="flex-1 rounded-xl bg-rose-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">{issueBusy ? 'Logging…' : 'Log issue'}</button>
            </div>
          </form>
        ) : (
          <button onClick={() => { setShowIssueForm(true); setIssueSuccess(''); }} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 font-bold text-amber-700">
            <AlertTriangle className="h-5 w-5" />Log an issue with this fridge
          </button>
        )}

        {writeMessage && <p className={`mt-4 rounded-xl border p-3 text-sm ${writeStatus === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-700' : writeStatus === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700' : 'border-[var(--medtrak-border)] bg-[var(--medtrak-bg)]'}`}>{writeStatus === 'success' && <CheckCircle2 className="mr-2 inline h-4 w-4" />}{writeMessage}</p>}
        {isAdmin && nativeNfcAvailable() && <button onClick={writeAssetTag} disabled={writeStatus === 'writing'} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] px-4 py-3 font-bold disabled:opacity-60"><Sparkles className="h-5 w-5" />{writeStatus === 'writing' ? 'Hold a blank tag…' : 'Write this fridge to a tag'}</button>}

        {isAdmin && (
          <div className="mt-4">
            {linkedBleTag ? (
              <div className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]"><Bluetooth className="h-3.5 w-3.5" />BLE tag linked</div>
                <p className="mt-1 break-all text-xs text-[var(--medtrak-muted)]">UUID {linkedBleTag.uuid} · Major {linkedBleTag.major} · Minor {linkedBleTag.minor}</p>
                <button onClick={unlinkBleTag} className="mt-2 text-xs font-bold text-rose-600">Unlink tag</button>
              </div>
            ) : linking ? (
              <div className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Hold the tag near the phone…</p>
                {bleCandidates.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--medtrak-muted)]">Scanning for nearby iBeacon tags…</p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {bleCandidates.map((beacon) => (
                      <button key={beacon.key} onClick={() => linkBleTag(beacon)} className="w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2 text-left text-xs">
                        <span className="font-bold">Major {beacon.major} · Minor {beacon.minor}</span>
                        <span className="ml-2 text-[var(--medtrak-muted)]">rssi {beacon.rssi}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={() => setLinking(false)} className="mt-2 text-xs font-bold text-[var(--medtrak-muted)]">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setLinking(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] px-4 py-3 font-bold">
                <Bluetooth className="h-5 w-5" />Link a BLE tag to this fridge
              </button>
            )}
          </div>
        )}

        {isAdmin && (
          <div className="mt-3">
            {settingHome ? (
              <div className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Home room</p>
                <select value={homeSpaceSelection} onChange={(e) => setHomeSpaceSelection(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2 text-sm">
                  <option value="">Select a room…</option>
                  {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
                </select>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setSettingHome(false)} className="flex-1 rounded-xl border border-[var(--medtrak-border)] px-3 py-2 text-sm font-semibold">Cancel</button>
                  <button onClick={saveHomeRoom} disabled={!homeSpaceSelection} className="flex-1 rounded-xl bg-[var(--medtrak-accent)] px-3 py-2 text-sm font-bold text-white disabled:opacity-60">Save</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setHomeSpaceSelection(homeSpaceId); setSettingHome(true); }} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] px-4 py-3 font-bold">
                <Home className="h-5 w-5" />{homeSpaceName ? `Home room: ${homeSpaceName}` : 'Set home room'}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
