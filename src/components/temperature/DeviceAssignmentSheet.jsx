import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, Thermometer, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { loadSpaceRegistry } from "@/modules/sense/services/sharedSpaceRegistry";
import { listEquipment, upsertEquipment } from "@/modules/equipment/services/equipmentRegistry";
import { saveDeviceAssignment } from "@/services/connect/DeviceRegistry";

const field = "mt-1 w-full rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-3 py-3 text-sm text-[color:var(--medtrak-text)] outline-none focus:ring-2 focus:ring-[color:var(--medtrak-accent)]";

function equipmentIdFromName(name) {
  const slug = String(name || "temperature-unit").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `EQ-${slug}-${Date.now().toString(36).toUpperCase()}`;
}

export default function DeviceAssignmentSheet({ device, onClose, compact = false }) {
  const { user, displayName, can, isAdmin } = useAuth();
  const canManage = isAdmin || can("connect.manageDevices");
  const spaces = useMemo(() => loadSpaceRegistry().spaces.filter((space) => space.status !== "archived"), []);
  const equipment = useMemo(() => listEquipment(), []);
  const existingEquipment = equipment.find((item) => item.equipmentId === device?.equipmentId);
  const [form, setForm] = useState({
    deviceName: device?.name || "Tuya T13 Temperature Sensor",
    spaceId: device?.spaceId || existingEquipment?.currentSpaceId || "",
    equipmentChoice: device?.equipmentId || "",
    newEquipmentName: device?.equipment && device.equipment !== "External temperature probe" ? device.equipment : "",
    equipmentType: device?.type === "freezer" ? "freezer" : device?.type === "room_sensor" ? "room_sensor" : "fridge",
    sensorPurpose: device?.sensorPurpose || "external-probe",
    min: device?.min ?? 2,
    max: device?.max ?? 8,
    alertDelayMinutes: device?.alertDelayMinutes ?? 15,
    alertsEnabled: device?.alertsEnabled !== false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (form.equipmentType === "freezer" && Number(form.min) === 2 && Number(form.max) === 8) {
      setForm((current) => ({ ...current, min: -25, max: -15 }));
    }
  }, [form.equipmentType]);

  const selectedSpace = spaces.find((space) => (space.spaceId || space.id) === form.spaceId);
  const selectedEquipment = equipment.find((item) => item.equipmentId === form.equipmentChoice);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function save() {
    if (!canManage) return setError("Your role cannot assign connected devices.");
    setError("");
    setSaving(true);
    try {
      const equipmentId = selectedEquipment?.equipmentId || equipmentIdFromName(form.newEquipmentName);
      const equipmentName = selectedEquipment?.name || form.newEquipmentName.trim();
      if (!equipmentName) throw new Error("Select equipment or enter a new equipment name.");
      const spaceId = selectedSpace?.spaceId || selectedSpace?.id || form.spaceId;
      const fridgeId = selectedEquipment?.monitoring?.fridgeId || equipmentId;

      upsertEquipment({
        ...(selectedEquipment || {}),
        id: equipmentId,
        equipmentId,
        name: equipmentName,
        equipmentType: form.equipmentType,
        category: form.equipmentType === "room_sensor" ? "Environmental monitoring" : "Cold chain",
        currentSpaceId: spaceId,
        homeSpaceId: selectedEquipment?.homeSpaceId || spaceId,
        provider: device.provider || "tuya",
        deviceId: device.id,
        connected: {
          provider: device.provider || "tuya",
          deviceId: device.id,
          enabled: true,
          probe: form.sensorPurpose,
        },
        monitoring: {
          enabled: true,
          min: Number(form.min),
          max: Number(form.max),
          unit: "°C",
          fridgeId,
        },
      }, "temperature-device-assignment");

      await saveDeviceAssignment(device, {
        ...form,
        spaceId,
        spaceName: selectedSpace?.name || "Assigned Space",
        siteId: selectedSpace?.siteId || "",
        siteName: selectedSpace?.siteName || selectedSpace?.site || "Practice",
        equipmentId,
        equipmentName,
        fridgeId,
      }, { uid: user?.uid, displayName, email: user?.email });
      setSaved(true);
    } catch (err) {
      setError(err?.message || "The device assignment could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/75 sm:items-center sm:p-5" onClick={onClose}>
      <section
        className={`w-full overflow-hidden rounded-t-3xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] shadow-2xl sm:rounded-3xl ${compact ? "max-w-lg" : "max-w-2xl"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[color:var(--medtrak-border)] p-4 sm:p-5">
          <div className="flex gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[color:var(--medtrak-accent)] text-white"><Link2 className="h-5 w-5" /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--medtrak-accent)]">Device Registry</p>
              <h2 className="text-xl font-bold text-[color:var(--medtrak-text)]">Assign temperature device</h2>
              <p className="mt-1 text-xs text-[color:var(--medtrak-muted)]">{device?.model || device?.providerLabel} · {device?.id}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-[color:var(--medtrak-muted)] hover:bg-black/5" aria-label="Close"><X className="h-5 w-5" /></button>
        </header>

        <div className="max-h-[calc(100dvh-var(--pvx-mobile-nav-height,72px)-var(--pvx-mobile-safe-bottom,0px)-5rem)] overflow-y-auto p-4 pb-7 sm:max-h-[78vh] sm:p-5">
          {!canManage && <div className="mb-4 flex gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-700"><AlertTriangle className="h-5 w-5 shrink-0" />You can view this device, but only an authorised device manager can change its assignment.</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-[color:var(--medtrak-text)] sm:col-span-2">Device display name<input disabled={!canManage} className={field} value={form.deviceName} onChange={(e) => update("deviceName", e.target.value)} /></label>
            <label className="text-sm font-semibold text-[color:var(--medtrak-text)] sm:col-span-2">Space<select disabled={!canManage} className={field} value={form.spaceId} onChange={(e) => update("spaceId", e.target.value)}><option value="">Select a Space</option>{spaces.map((space) => <option key={space.id} value={space.spaceId || space.id}>{space.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-[color:var(--medtrak-text)] sm:col-span-2">Existing equipment<select disabled={!canManage} className={field} value={form.equipmentChoice} onChange={(e) => update("equipmentChoice", e.target.value)}><option value="">Create new equipment record</option>{equipment.map((item) => <option key={item.equipmentId} value={item.equipmentId}>{item.name}</option>)}</select></label>
            {!form.equipmentChoice && <label className="text-sm font-semibold text-[color:var(--medtrak-text)] sm:col-span-2">New equipment name<input disabled={!canManage} className={field} value={form.newEquipmentName} onChange={(e) => update("newEquipmentName", e.target.value)} placeholder="e.g. Vaccine Fridge 1" /></label>}
            <label className="text-sm font-semibold text-[color:var(--medtrak-text)]">Equipment type<select disabled={!canManage} className={field} value={form.equipmentType} onChange={(e) => update("equipmentType", e.target.value)}><option value="fridge">Fridge</option><option value="freezer">Freezer</option><option value="room_sensor">Room sensor</option></select></label>
            <label className="text-sm font-semibold text-[color:var(--medtrak-text)]">Primary reading<select disabled={!canManage} className={field} value={form.sensorPurpose} onChange={(e) => update("sensorPurpose", e.target.value)}><option value="external-probe">External probe</option><option value="ambient">Ambient sensor</option></select></label>
            <label className="text-sm font-semibold text-[color:var(--medtrak-text)]">Minimum °C<input disabled={!canManage} type="number" step="0.1" className={field} value={form.min} onChange={(e) => update("min", e.target.value)} /></label>
            <label className="text-sm font-semibold text-[color:var(--medtrak-text)]">Maximum °C<input disabled={!canManage} type="number" step="0.1" className={field} value={form.max} onChange={(e) => update("max", e.target.value)} /></label>
            <label className="text-sm font-semibold text-[color:var(--medtrak-text)] sm:col-span-2">Excursion delay<select disabled={!canManage} className={field} value={form.alertDelayMinutes} onChange={(e) => update("alertDelayMinutes", e.target.value)}><option value="0">Immediate</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option></select></label>
          </div>
          <label className="mt-4 flex items-start gap-3 rounded-2xl border border-[color:var(--medtrak-border)] p-3 text-sm text-[color:var(--medtrak-text)]"><input disabled={!canManage} type="checkbox" checked={form.alertsEnabled} onChange={(e) => update("alertsEnabled", e.target.checked)} className="mt-1 h-4 w-4" /><span><b className="block">Create excursion alerts</b><small className="text-[color:var(--medtrak-muted)]">The probe must remain outside the configured range for the selected delay.</small></span></label>
          <div className="mt-4 rounded-2xl border border-sky-400/25 bg-sky-500/10 p-3 text-xs text-[color:var(--medtrak-text)]"><Thermometer className="mr-2 inline h-4 w-4 text-[color:var(--medtrak-accent)]" />For the T13, the external probe is used for the fridge reading. Ambient temperature and humidity remain available as supporting evidence.</div>
          {error && <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-700">{error}</p>}
          {saved && <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-700"><CheckCircle2 className="h-5 w-5" />Assignment saved. Future Tuya syncs will preserve it.</p>}
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={onClose} className="min-h-12 flex-1 rounded-xl border border-[color:var(--medtrak-border)] px-4 font-semibold text-[color:var(--medtrak-text)]">Close</button>
            <button type="button" disabled={!canManage || saving} onClick={save} className="min-h-12 flex-[1.4] rounded-xl bg-[color:var(--medtrak-accent)] px-4 font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save assignment"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
