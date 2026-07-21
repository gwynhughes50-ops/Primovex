import { useMemo, useState } from 'react';
import { Archive, Building2, ChevronDown, Layers3, MapPinned, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { SPACE_TYPES, getSpaceTemplate } from '../data/spaceTemplates';
import { addHierarchyItem, addSpace, archiveSpace, deleteHierarchyItem, updateSpace } from '../services/spaceRegistryService';

const field = 'mt-1 w-full rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-3 py-2.5 text-sm text-[color:var(--medtrak-text)]';
const button = 'rounded-xl border border-[color:var(--medtrak-border)] px-3 py-2 text-sm font-semibold transition hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_8%,var(--medtrak-panel))]';

const emptyForm = { name: '', typeId: 'consulting-room', siteId: 'SITE-MAIN', floorId: 'FLOOR-GROUND', zoneId: 'ZONE-CLINICAL', parentSpaceId: '', linkedFloorIds: [], cleaningFrequencyHours: 24, notes: '' };

export default function SpaceBuilder({ state, commit, actor, onSelect }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [hierarchyMode, setHierarchyMode] = useState('site');
  const [hierarchyName, setHierarchyName] = useState('');

  const activeSpaces = useMemo(() => state.spaces.filter((space) => space.status !== 'archived'), [state.spaces]);
  const parentOptions = activeSpaces.filter((space) => space.id !== editingId);
  const selectedType = getSpaceTemplate(form.typeId);
  const floorsForSite = state.floors.filter((floor) => floor.siteId === form.siteId);
  const zonesForSite = state.zones.filter((zone) => zone.siteId === form.siteId);

  function startCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, siteId: state.sites[0]?.id || '', floorId: state.floors[0]?.id || '', zoneId: state.zones[0]?.id || '' });
    setOpen(true);
  }

  function startEdit(space) {
    setEditingId(space.id);
    setForm({
      name: space.name,
      typeId: space.typeId || 'other',
      siteId: space.siteId || state.sites[0]?.id || '',
      floorId: space.floorId || '',
      zoneId: space.zoneId || '',
      parentSpaceId: space.parentSpaceId || '',
      linkedFloorIds: space.linkedFloorIds || [],
      cleaningFrequencyHours: space.cleaningFrequencyHours || 24,
      notes: space.notes || '',
      capabilities: space.capabilities || [],
    });
    setOpen(true);
  }

  function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    const site = state.sites.find((item) => item.id === form.siteId);
    const floor = state.floors.find((item) => item.id === form.floorId);
    const zone = state.zones.find((item) => item.id === form.zoneId);
    const payload = {
      ...form,
      site: site?.name || '', siteName: site?.name || '',
      floor: floor?.name || '', floorName: floor?.name || '',
      zone: zone?.name || '', zoneName: zone?.name || '',
      capabilities: form.capabilities?.length ? form.capabilities : selectedType.capabilities,
      actor,
    };
    const next = editingId ? updateSpace(state, editingId, payload, actor) : addSpace(state, payload);
    commit(next);
    const created = editingId || next.spaces[0]?.id;
    onSelect?.(created);
    setOpen(false);
  }

  function addHierarchy(event) {
    event.preventDefault();
    const name = hierarchyName.trim();
    if (!name) return;
    const collection = hierarchyMode === 'site' ? 'sites' : hierarchyMode === 'floor' ? 'floors' : 'zones';
    const input = hierarchyMode === 'site' ? { name, status: 'active' } : hierarchyMode === 'floor' ? { name, siteId: form.siteId || state.sites[0]?.id, order: state.floors.length } : { name, siteId: form.siteId || state.sites[0]?.id };
    commit(addHierarchyItem(state, collection, input));
    setHierarchyName('');
  }

  function removeHierarchy(collection, item) {
    const activeAffected = collection === 'floors'
      ? activeSpaces.filter((space) => space.floorId === item.id || space.linkedFloorIds?.includes(item.id))
      : collection === 'zones'
        ? activeSpaces.filter((space) => space.zoneId === item.id)
        : activeSpaces.filter((space) => space.siteId === item.id);

    if (collection === 'sites') {
      const childFloors = state.floors.filter((floor) => floor.siteId === item.id).length;
      const childZones = state.zones.filter((zone) => zone.siteId === item.id).length;
      if (childFloors || childZones || activeAffected.length) {
        window.alert(`${item.name} cannot be deleted while it contains floors, zones or active spaces. Move or remove those items first.`);
        return;
      }
    }

    const consequence = collection === 'floors' && activeAffected.length
      ? `\n\n${activeAffected.length} active space${activeAffected.length === 1 ? '' : 's'} will become unassigned from this floor. Their Smart Tags, history and permanent Space IDs will be preserved.`
      : collection === 'zones' && activeAffected.length
        ? `\n\n${activeAffected.length} active space${activeAffected.length === 1 ? '' : 's'} will become unassigned from this zone. Their history and Space IDs will be preserved.`
        : '';

    if (!window.confirm(`Delete ${item.name}?${consequence}`)) return;
    commit(deleteHierarchyItem(state, collection, item.id));
  }

  return (
    <section className="rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] p-4 shadow-xl shadow-black/10 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[color:var(--medtrak-accent)]"><Layers3 className="h-4 w-4" /> Sense Spaces Builder</div>
          <h2 className="mt-1 text-xl font-semibold">Model the practice your way</h2>
          <p className="mt-1 max-w-3xl text-sm text-[color:var(--medtrak-muted)]">Create sites, floors, zones and spaces. Each practice chooses exactly where every room, kitchen, stairwell and store belongs.</p>
        </div>
        <button onClick={startCreate} className={`${button} bg-[color:var(--medtrak-accent)] text-white`}><Plus className="mr-2 inline h-4 w-4" />Add space</button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <form onSubmit={addHierarchy} className="rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] p-4">
          <h3 className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4 text-[color:var(--medtrak-accent)]" />Building structure</h3>
          <p className="mt-1 text-xs text-[color:var(--medtrak-muted)]">Add another site, floor or zone without changing existing Sense IDs.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[9rem_1fr_auto]">
            <select value={hierarchyMode} onChange={(e) => setHierarchyMode(e.target.value)} className={field.replace('mt-1 ', '')}><option value="site">Site</option><option value="floor">Floor</option><option value="zone">Zone</option></select>
            <input value={hierarchyName} onChange={(e) => setHierarchyName(e.target.value)} placeholder={`New ${hierarchyMode} name`} className={field.replace('mt-1 ', '')} />
            <button className={button}>Add</button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <HierarchyCount label="Sites" value={state.sites.length} />
            <HierarchyCount label="Floors" value={state.floors.length} />
            <HierarchyCount label="Zones" value={state.zones.length} />
          </div>
        </form>

        <div className="rounded-2xl border border-[color:var(--medtrak-border)] p-4">
          <h3 className="flex items-center gap-2 font-semibold"><MapPinned className="h-4 w-4 text-[color:var(--medtrak-accent)]" />Current hierarchy</h3>
          <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
            {state.sites.map((site) => (
              <div key={site.id}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold">{site.name}</div>
                  <button type="button" onClick={() => removeHierarchy('sites', site)} className="rounded-lg p-1.5 text-[color:var(--medtrak-muted)] transition hover:bg-red-500/10 hover:text-red-600" title={`Delete ${site.name}`} aria-label={`Delete ${site.name}`}><Trash2 className="h-4 w-4" /></button>
                </div>
                {state.floors.filter((floor) => floor.siteId === site.id).sort((a,b)=>(a.order||0)-(b.order||0)).map((floor) => (
                  <div key={floor.id} className="ml-3 mt-2 border-l border-[color:var(--medtrak-border)] pl-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{floor.name}</div>
                      <button type="button" onClick={() => removeHierarchy('floors', floor)} className="rounded-lg p-1.5 text-[color:var(--medtrak-muted)] transition hover:bg-red-500/10 hover:text-red-600" title={`Delete ${floor.name}`} aria-label={`Delete ${floor.name}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">{activeSpaces.filter((space) => space.siteId === site.id && (space.floorId === floor.id || space.linkedFloorIds?.includes(floor.id))).map((space) => <button key={space.id} onClick={() => onSelect?.(space.id)} className="rounded-full border border-[color:var(--medtrak-border)] px-2 py-1 text-xs hover:border-[color:var(--medtrak-accent)]">{space.name}</button>)}</div>
                  </div>
                ))}
                {state.zones.filter((zone) => zone.siteId === site.id).length > 0 && (
                  <div className="ml-3 mt-3 border-l border-[color:var(--medtrak-border)] pl-3">
                    <div className="mb-1 text-[11px] font-bold uppercase tracking-[.12em] text-[color:var(--medtrak-muted)]">Zones</div>
                    <div className="flex flex-wrap gap-1.5">
                      {state.zones.filter((zone) => zone.siteId === site.id).map((zone) => (
                        <span key={zone.id} className="inline-flex items-center gap-1 rounded-full border border-[color:var(--medtrak-border)] px-2 py-1 text-xs">
                          {zone.name}
                          <button type="button" onClick={() => removeHierarchy('zones', zone)} className="rounded-full p-0.5 text-[color:var(--medtrak-muted)] hover:bg-red-500/10 hover:text-red-600" title={`Delete ${zone.name}`} aria-label={`Delete ${zone.name}`}><Trash2 className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/45 p-4">
          <form onSubmit={submit} className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[color:var(--medtrak-accent)]">Sense Space</p><h2 className="text-2xl font-semibold">{editingId ? 'Edit space' : 'Add a new space'}</h2></div><button type="button" onClick={() => setOpen(false)} className={button}><X className="h-4 w-4" /></button></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold sm:col-span-2">Space name<input autoFocus value={form.name} onChange={(e) => setForm({...form,name:e.target.value})} placeholder="e.g. Treatment Room 3 or Stairwell A" className={field} /></label>
              <label className="text-sm font-semibold">Space type<select value={form.typeId} onChange={(e) => { const type = getSpaceTemplate(e.target.value); setForm({...form,typeId:e.target.value,capabilities:type.capabilities}); }} className={field}>{SPACE_TYPES.map((type)=><option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
              <label className="text-sm font-semibold">Site<select value={form.siteId} onChange={(e)=>setForm({...form,siteId:e.target.value,floorId:state.floors.find(f=>f.siteId===e.target.value)?.id||'',zoneId:state.zones.find(z=>z.siteId===e.target.value)?.id||''})} className={field}>{state.sites.map((site)=><option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
              <label className="text-sm font-semibold">Primary floor<select value={form.floorId} onChange={(e)=>setForm({...form,floorId:e.target.value})} className={field}><option value="">No single floor</option>{floorsForSite.map((floor)=><option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label>
              <label className="text-sm font-semibold">Zone<select value={form.zoneId} onChange={(e)=>setForm({...form,zoneId:e.target.value})} className={field}><option value="">No zone</option>{zonesForSite.map((zone)=><option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
              <label className="text-sm font-semibold">Parent space<select value={form.parentSpaceId} onChange={(e)=>setForm({...form,parentSpaceId:e.target.value})} className={field}><option value="">None</option>{parentOptions.map((space)=><option key={space.id} value={space.id}>{space.name}</option>)}</select></label>
              <label className="text-sm font-semibold">Cleaning frequency<select value={form.cleaningFrequencyHours} onChange={(e)=>setForm({...form,cleaningFrequencyHours:Number(e.target.value)})} className={field}><option value="8">Every 8 hours</option><option value="12">Every 12 hours</option><option value="24">Daily</option><option value="168">Weekly</option></select></label>
            </div>

            {form.typeId === 'stairwell' && <div className="mt-4 rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] p-4"><p className="font-semibold">Floors linked by this stairwell</p><div className="mt-2 flex flex-wrap gap-2">{floorsForSite.map((floor)=><label key={floor.id} className="flex items-center gap-2 rounded-xl border border-[color:var(--medtrak-border)] px-3 py-2 text-sm"><input type="checkbox" checked={form.linkedFloorIds.includes(floor.id)} onChange={(e)=>setForm({...form,linkedFloorIds:e.target.checked?[...form.linkedFloorIds,floor.id]:form.linkedFloorIds.filter(id=>id!==floor.id)})}/>{floor.name}</label>)}</div></div>}

            <div className="mt-4"><p className="text-sm font-semibold">Enabled capabilities</p><div className="mt-2 flex flex-wrap gap-2">{selectedType.capabilities.map((capability)=><span key={capability} className="rounded-full bg-[color:color-mix(in_srgb,var(--medtrak-accent)_10%,var(--medtrak-panel))] px-3 py-1 text-xs font-semibold capitalize text-[color:var(--medtrak-accent)]">{capability}</span>)}</div></div>
            <label className="mt-4 block text-sm font-semibold">Notes<textarea value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} rows="3" className={field} /></label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">{editingId && <button type="button" onClick={() => { commit(archiveSpace(state, editingId, actor)); setOpen(false); }} className={`${button} text-red-700`}><Archive className="mr-2 inline h-4 w-4" />Archive</button>}<button type="button" onClick={() => setOpen(false)} className={button}>Cancel</button><button className={`${button} bg-[color:var(--medtrak-accent)] text-white`}><Save className="mr-2 inline h-4 w-4" />Save space</button></div>
          </form>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between"><div><h3 className="font-semibold">Spaces</h3><p className="text-sm text-[color:var(--medtrak-muted)]">{activeSpaces.length} active space{activeSpaces.length === 1 ? '' : 's'}</p></div><ChevronDown className="h-5 w-5 text-[color:var(--medtrak-muted)]" /></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{activeSpaces.map((space)=><div key={space.id} className="rounded-2xl border border-[color:var(--medtrak-border)] p-3"><button onClick={() => onSelect?.(space.id)} className="w-full text-left"><b>{space.name}</b><p className="text-xs text-[color:var(--medtrak-muted)]">{space.type} · {state.floors.find(f=>f.id===space.floorId)?.name || 'Multi-floor'} · {state.zones.find(z=>z.id===space.zoneId)?.name || 'No zone'}</p></button><div className="mt-2 flex justify-end"><button onClick={() => startEdit(space)} className={button}><Pencil className="mr-1 inline h-3.5 w-3.5" />Edit</button></div></div>)}</div>
    </section>
  );
}

function HierarchyCount({ label, value }) { return <div className="rounded-xl border border-[color:var(--medtrak-border)] p-2"><div className="text-xl font-bold">{value}</div><div className="text-xs text-[color:var(--medtrak-muted)]">{label}</div></div>; }
