import { useMemo, useState } from 'react';
import { Bluetooth, CheckCircle2, Link2, Plus, QrCode, RadioTower, SmartphoneNfc, X } from 'lucide-react';
import { upsertEquipment } from '@/modules/equipment/services/equipmentRegistry';

const field = 'mt-1 w-full rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] px-3 py-2.5 text-sm text-[color:var(--medtrak-text)] outline-none focus:ring-2 focus:ring-[color:var(--medtrak-accent)]';
const initial = {
  name: '', category: 'Clinical equipment', equipmentType: 'equipment', make: '', model: '', serialNumber: '',
  assetTag: '', spaceId: '', mobilityProfile: 'fixed', barcode: '', nfcTagId: '', trackerProvider: 'none', trackerId: '',
  assignmentType: 'unassigned', assignedToName: '', assignedAt: '', loanDueDate: '', assignmentNotes: '',
  patRequired: false, patDue: '', serviceDue: '', connectedProvider: 'none', deviceId: '', probe: 'none',
  monitoringEnabled: false, fridgeId: '', min: '2', max: '8', notes: '',
};

function makeEquipmentId(name) {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12) || 'ASSET';
  return `EQ-${slug}-${Date.now().toString().slice(-5)}`;
}

export default function EquipmentRegistrationWizard({ spaces = [], actor = 'Signed-in user', connectedDevices = [], onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const selectedDevice = useMemo(() => connectedDevices.find((item) => item.id === form.deviceId), [connectedDevices, form.deviceId]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  function save() {
    if (!form.name.trim()) return setError('Equipment name is required.');
    if (!form.spaceId) return setError('Select the equipment’s current Space.');
    if (form.assignmentType !== 'unassigned' && !form.assignedToName.trim()) {
      return setError('Enter the staff member this equipment is assigned to.');
    }
    const equipmentId = makeEquipmentId(form.name);
    upsertEquipment({
      equipmentId,
      name: form.name.trim(),
      category: form.category,
      equipmentType: form.equipmentType,
      make: form.make.trim(),
      model: form.model.trim(),
      serialNumber: form.serialNumber.trim(),
      assetTag: form.assetTag.trim() || equipmentId,
      homeSpaceId: form.spaceId,
      currentSpaceId: form.spaceId,
      mobilityProfile: form.mobilityProfile,
      assignment: {
        type: form.assignmentType,
        assignedToName: form.assignmentType === 'unassigned' ? '' : form.assignedToName.trim(),
        assignedAt: form.assignmentType === 'unassigned' ? null : (form.assignedAt || new Date().toISOString().slice(0, 10)),
        loanDueDate: form.assignmentType === 'loan' ? (form.loanDueDate || null) : null,
        notes: form.assignmentNotes.trim(),
      },
      identity: { barcode: form.barcode.trim(), nfcTagId: form.nfcTagId.trim(), qrCode: `/sense/open/asset/${equipmentId}` },
      tracking: { provider: form.trackerProvider, trackerId: form.trackerId.trim() },
      connected: { provider: form.connectedProvider, deviceId: form.deviceId.trim(), enabled: Boolean(form.deviceId), probe: form.probe },
      monitoring: {
        enabled: form.monitoringEnabled,
        min: form.monitoringEnabled ? Number(form.min) : null,
        max: form.monitoringEnabled ? Number(form.max) : null,
        unit: '°C',
        fridgeId: form.fridgeId.trim(),
      },
      compliance: {
        patRequired: form.patRequired,
        patDue: form.patDue || null,
        serviceDue: form.serviceDue || null,
      },
      lastConfirmedAt: new Date().toISOString(),
      lastConfirmedBy: actor,
      notes: form.notes.trim(),
    });
    onSaved?.(equipmentId);
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 sm:items-center sm:p-6" onClick={onClose}>
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] p-5 text-[color:var(--medtrak-text)] shadow-2xl sm:rounded-3xl sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--medtrak-accent)]">Unified Equipment Registry</p><h2 className="mt-1 text-2xl font-bold">Register equipment</h2><p className="mt-1 text-sm text-[color:var(--medtrak-muted)]">One equipment passport shared by Facilities, Sense, PAT, Connected Practice, Temperature and Orb.</p></div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-white/5"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2">
          {['Identity', 'Space', 'Compliance', 'Connect'].map((label, index) => <div key={label} className={`rounded-xl px-2 py-2 text-center text-xs font-bold ${step === index + 1 ? 'bg-[color:var(--medtrak-accent)] text-white' : 'border border-[color:var(--medtrak-border)] text-[color:var(--medtrak-muted)]'}`}>{index + 1}. {label}</div>)}
        </div>

        {step === 1 && <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold sm:col-span-2">Equipment name<input className={field} value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Vaccine Fridge 1" /></label>
          <label className="text-sm font-semibold">Category<select className={field} value={form.category} onChange={(e) => update('category', e.target.value)}><option>Clinical equipment</option><option>Cold chain</option><option>Diagnostic</option><option>IT equipment</option><option>Facilities</option><option>Emergency equipment</option><option>General</option></select></label>
          <label className="text-sm font-semibold">Equipment type<select className={field} value={form.equipmentType} onChange={(e) => update('equipmentType', e.target.value)}><option value="equipment">Equipment</option><option value="fridge">Fridge</option><option value="freezer">Freezer</option><option value="room_sensor">Room sensor</option><option value="emergency_trolley">Emergency trolley</option></select></label>
          <label className="text-sm font-semibold">Make<input className={field} value={form.make} onChange={(e) => update('make', e.target.value)} /></label>
          <label className="text-sm font-semibold">Model<input className={field} value={form.model} onChange={(e) => update('model', e.target.value)} /></label>
          <label className="text-sm font-semibold">Serial number<input className={field} value={form.serialNumber} onChange={(e) => update('serialNumber', e.target.value)} /></label>
          <label className="text-sm font-semibold">Asset tag<input className={field} value={form.assetTag} onChange={(e) => update('assetTag', e.target.value)} placeholder="Generated if blank" /></label>
        </div>}

        {step === 2 && <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold sm:col-span-2">Current Space<select className={field} value={form.spaceId} onChange={(e) => update('spaceId', e.target.value)}><option value="">Select a Space</option>{spaces.filter((space) => space.status !== 'archived').map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}</select></label>
          <label className="text-sm font-semibold">Mobility<select className={field} value={form.mobilityProfile} onChange={(e) => update('mobilityProfile', e.target.value)}><option value="fixed">Fixed in this Space</option><option value="shared">Shared / movable</option><option value="portable">Portable</option></select></label>
          <label className="text-sm font-semibold">Assigned to<select className={field} value={form.assignmentType} onChange={(e) => update('assignmentType', e.target.value)}><option value="unassigned">Not assigned to a person</option><option value="permanent">Permanently assigned</option><option value="loan">On loan</option></select></label>
          {form.assignmentType !== 'unassigned' && <label className="text-sm font-semibold sm:col-span-2">Staff member<input className={field} value={form.assignedToName} onChange={(e) => update('assignedToName', e.target.value)} placeholder="Enter the staff member’s name" /></label>}
          {form.assignmentType !== 'unassigned' && <label className="text-sm font-semibold">Assigned from<input type="date" className={field} value={form.assignedAt} onChange={(e) => update('assignedAt', e.target.value)} /></label>}
          {form.assignmentType === 'loan' && <label className="text-sm font-semibold">Expected return<input type="date" className={field} value={form.loanDueDate} onChange={(e) => update('loanDueDate', e.target.value)} /></label>}
          {form.assignmentType !== 'unassigned' && <label className="text-sm font-semibold sm:col-span-2">Assignment notes<input className={field} value={form.assignmentNotes} onChange={(e) => update('assignmentNotes', e.target.value)} placeholder="Optional, e.g. home-working laptop and charger" /></label>}
          <label className="text-sm font-semibold"><QrCode className="mr-1 inline h-4 w-4" /> Barcode value<input className={field} value={form.barcode} onChange={(e) => update('barcode', e.target.value)} placeholder="Optional now; add later" /></label>
          <label className="text-sm font-semibold"><SmartphoneNfc className="mr-1 inline h-4 w-4" /> NFC tag ID<input className={field} value={form.nfcTagId} onChange={(e) => update('nfcTagId', e.target.value)} placeholder="Optional now; encode later" /></label>
          <label className="text-sm font-semibold"><Bluetooth className="mr-1 inline h-4 w-4" /> BLE tracking<select className={field} value={form.trackerProvider} onChange={(e) => update('trackerProvider', e.target.value)}><option value="none">No BLE tracker</option><option value="ble">BLE beacon</option><option value="mock-ble">Demo BLE beacon</option></select></label>
          {form.trackerProvider !== 'none' && <label className="text-sm font-semibold">BLE beacon ID<input className={field} value={form.trackerId} onChange={(e) => update('trackerId', e.target.value)} /></label>}
        </div>}

        {step === 3 && <div className="mt-5 space-y-4">
          <label className="flex items-start gap-3 rounded-2xl border border-[color:var(--medtrak-border)] p-4"><input type="checkbox" checked={form.patRequired} onChange={(e) => update('patRequired', e.target.checked)} className="mt-1 h-4 w-4" /><span><b className="block">Include in PAT testing</b><small className="text-[color:var(--medtrak-muted)]">The same equipment identity will be available to the PAT register.</small></span></label>
          <div className="grid gap-4 sm:grid-cols-2">
            {form.patRequired && <label className="text-sm font-semibold">Next PAT due<input type="date" className={field} value={form.patDue} onChange={(e) => update('patDue', e.target.value)} /></label>}
            <label className="text-sm font-semibold">Next service due<input type="date" className={field} value={form.serviceDue} onChange={(e) => update('serviceDue', e.target.value)} /></label>
          </div>
          <label className="text-sm font-semibold">Notes<textarea className={`${field} min-h-24`} value={form.notes} onChange={(e) => update('notes', e.target.value)} /></label>
        </div>}

        {step === 4 && <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-sky-400/25 bg-sky-500/10 p-4"><div className="flex gap-3"><RadioTower className="h-5 w-5 text-sky-300" /><div><b>Optional connected device</b><p className="text-sm text-[color:var(--medtrak-muted)]">Attach a Tuya sensor or another provider device. Secrets remain in the secure backend.</p></div></div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Provider<select className={field} value={form.connectedProvider} onChange={(e) => update('connectedProvider', e.target.value)}><option value="none">No connected device</option><option value="tuya">Tuya / Smart Life</option><option value="simulator">Simulator</option><option value="mqtt">MQTT</option></select></label>
            {form.connectedProvider !== 'none' && <label className="text-sm font-semibold">Detected device<select className={field} value={form.deviceId} onChange={(e) => update('deviceId', e.target.value)}><option value="">Choose or enter below</option>{connectedDevices.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.id}</option>)}</select></label>}
            {form.connectedProvider !== 'none' && !selectedDevice && <label className="text-sm font-semibold sm:col-span-2">Device ID<input className={field} value={form.deviceId} onChange={(e) => update('deviceId', e.target.value)} placeholder="Tuya device ID" /></label>}
            {form.connectedProvider !== 'none' && <label className="text-sm font-semibold">Probe<select className={field} value={form.probe} onChange={(e) => update('probe', e.target.value)}><option value="none">No external probe</option><option value="external">External probe</option><option value="ambient">Ambient sensor</option></select></label>}
          </div>
          <label className="flex items-start gap-3 rounded-2xl border border-[color:var(--medtrak-border)] p-4"><input type="checkbox" checked={form.monitoringEnabled} onChange={(e) => update('monitoringEnabled', e.target.checked)} className="mt-1 h-4 w-4" /><span><b className="block">Enable Temperature monitoring</b><small className="text-[color:var(--medtrak-muted)]">Creates the equipment-to-fridge relationship and safe range.</small></span></label>
          {form.monitoringEnabled && <div className="grid gap-4 sm:grid-cols-3"><label className="text-sm font-semibold">Temperature unit ID<input className={field} value={form.fridgeId} onChange={(e) => update('fridgeId', e.target.value)} placeholder="vaccine-fridge-1" /></label><label className="text-sm font-semibold">Minimum °C<input type="number" step="0.1" className={field} value={form.min} onChange={(e) => update('min', e.target.value)} /></label><label className="text-sm font-semibold">Maximum °C<input type="number" step="0.1" className={field} value={form.max} onChange={(e) => update('max', e.target.value)} /></label></div>}
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm"><CheckCircle2 className="mr-2 inline h-5 w-5 text-emerald-300" /><b>Ready to register.</b> No PAT, Sense or connected-device record will be duplicated.</div>
        </div>}

        {error && <p className="mt-4 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
        <div className="mt-6 flex justify-between gap-3">
          <button disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1))} className="rounded-xl border border-[color:var(--medtrak-border)] px-4 py-2 text-sm disabled:opacity-40">Back</button>
          {step < 4
            ? <button onClick={() => setStep((current) => current + 1)} className="rounded-xl bg-[color:var(--medtrak-accent)] px-5 py-2 text-sm font-bold text-white">Continue</button>
            : <button onClick={save} className="flex items-center gap-2 rounded-xl bg-[color:var(--medtrak-accent)] px-5 py-2 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Register equipment</button>}
        </div>
      </div>
    </div>
  );
}
