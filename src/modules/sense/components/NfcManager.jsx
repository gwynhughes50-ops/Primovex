import { useMemo, useState } from 'react';
import { CheckCircle2, Clipboard, Nfc, Power, RadioTower, RefreshCcw, ShieldCheck, Smartphone } from 'lucide-react';
import { buildNfcUrl, nfcSupported, scanNfcOnce, writeNfcUrl } from '../services/nfcService';
import { markNfcTagTested, updateNfcTagStatus, upsertNfcTag } from '../services/senseStore';

const panel = 'rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)]';
const muted = 'text-[color:var(--medtrak-muted)]';
const button = 'rounded-xl border border-[color:var(--medtrak-border)] px-3 py-2 text-sm font-semibold transition hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_8%,var(--medtrak-panel))] disabled:cursor-not-allowed disabled:opacity-50';

function fmt(value) {
  if (!value) return 'Not yet';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function NfcManager({ state, commit, actor }) {
  const [entityType, setEntityType] = useState('space');
  const [entityId, setEntityId] = useState(state.spaces[0]?.id || '');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const entities = entityType === 'asset' ? state.assets : state.spaces;
  const selected = entities.find((item) => item.id === entityId);
  const url = selected ? buildNfcUrl(entityType, selected.id) : '';
  const tags = useMemo(() => state.nfcTags || [], [state.nfcTags]);

  function switchType(next) {
    setEntityType(next);
    const list = next === 'asset' ? state.assets : state.spaces;
    setEntityId(list[0]?.id || '');
    setMessage(''); setError('');
  }

  async function programTag() {
    if (!selected) return;
    setBusy('write'); setError(''); setMessage('Hold the phone over the NFC tag…');
    try {
      await writeNfcUrl(url);
      const next = upsertNfcTag(state, { id: crypto.randomUUID(), label: selected.name, entityType, entityId: selected.id, url, status: 'active' }, actor);
      commit(next);
      setMessage(`Tag programmed for ${selected.name}. Keep it rewritable during the pilot.`);
    } catch (e) { setError(e.message || 'Unable to write the NFC tag.'); setMessage(''); }
    finally { setBusy(''); }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(url); setMessage('Primovex NFC link copied. Use any NDEF writer app to write it as a URL record.'); setError(''); }
    catch { setError('Could not copy the link.'); }
  }

  async function testTag(tag) {
    setBusy(tag.id); setMessage('Hold the phone over the assigned tag…'); setError('');
    const controller = new AbortController();
    try {
      const result = await scanNfcOnce({ signal: controller.signal });
      if (result.url && result.url !== tag.url) throw new Error('This tag opens a different Primovex item.');
      commit(markNfcTagTested(state, tag.id, result.serialNumber, actor));
      setMessage(`${tag.label} tag verified successfully.`);
    } catch (e) { setError(e.message || 'Unable to test the tag.'); setMessage(''); }
    finally { controller.abort(); setBusy(''); }
  }

  return (
    <section className={`${panel} p-4 sm:p-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[color:var(--medtrak-accent)]"><Nfc className="h-4 w-4" /> NFC Manager</div>
          <h2 className="mt-1 text-xl font-semibold">Programme and manage Sense tags</h2>
          <p className={`mt-1 max-w-3xl text-sm ${muted}`}>Writes a short NDEF URL to NTAG215 tags. Operational data stays in Primovex. Do not lock tags during the pilot.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${nfcSupported() ? 'bg-emerald-500/12 text-emerald-700' : 'bg-amber-500/12 text-amber-700'}`}>{nfcSupported() ? 'Web NFC available' : 'Use link fallback'}</span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">Tag type<select value={entityType} onChange={(e) => switchType(e.target.value)} className="mt-1 w-full rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-3 py-3"><option value="space">Space / room</option><option value="asset">Equipment / asset</option></select></label>
        <label className="text-sm font-semibold">Assign to<select value={entityId} onChange={(e) => setEntityId(e.target.value)} className="mt-1 w-full rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-3 py-3">{entities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>

      <div className="mt-3 rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] p-3">
        <p className={`text-xs font-bold uppercase tracking-[.12em] ${muted}`}>NDEF URL record</p><code className="mt-1 block break-all text-sm">{url || 'Select an item'}</code>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={programTag} disabled={!selected || busy} className={`${button} bg-[color:var(--medtrak-accent)] text-white`}><Smartphone className="mr-2 inline h-4 w-4" />{busy === 'write' ? 'Writing…' : 'Programme tag'}</button>
        <button onClick={copyLink} disabled={!url} className={button}><Clipboard className="mr-2 inline h-4 w-4" />Copy link for NFC writer</button>
      </div>

      {message && <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 className="mr-2 inline h-4 w-4" />{message}</div>}
      {error && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-6 flex items-center justify-between"><div><h3 className="font-semibold">Registered tags</h3><p className={`text-sm ${muted}`}>{tags.length} tag{tags.length === 1 ? '' : 's'} in this device registry</p></div><RadioTower className="h-5 w-5 text-[color:var(--medtrak-accent)]" /></div>
      <div className="mt-3 space-y-2">
        {tags.length ? tags.map((tag) => <div key={tag.id} className="rounded-2xl border border-[color:var(--medtrak-border)] p-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><b>{tag.label}</b><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tag.status === 'active' ? 'bg-emerald-500/12 text-emerald-700' : 'bg-slate-500/12 text-slate-600'}`}>{tag.status}</span></div><p className={`mt-1 text-xs ${muted}`}>{tag.entityType} · {tag.entityId} · Last tested {fmt(tag.lastTestedAt)}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => testTag(tag)} disabled={busy} className={button}><ShieldCheck className="mr-1 inline h-4 w-4" />Test</button><button onClick={() => commit(updateNfcTagStatus(state, tag.id, tag.status === 'active' ? 'disabled' : 'active', actor))} className={button}><Power className="mr-1 inline h-4 w-4" />{tag.status === 'active' ? 'Disable' : 'Enable'}</button><button onClick={() => { setEntityType(tag.entityType); setEntityId(tag.entityId); setMessage('Ready to programme a replacement tag. The old tag can be disabled after testing.'); }} className={button}><RefreshCcw className="mr-1 inline h-4 w-4" />Replace</button></div></div></div>) : <div className={`rounded-2xl border border-dashed border-[color:var(--medtrak-border)] p-5 text-sm ${muted}`}>No tags registered yet. Programme one room tag and one asset tag tomorrow for the pilot.</div>}
      </div>
    </section>
  );
}
