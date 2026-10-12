import { useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, RadioTower, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadSpaceRegistry } from "@/modules/sense/services/sharedSpaceRegistry";
import { ALERT_AFTER, REPORT_EVERY, SENSOR_TYPES, createSensor, removeSensor, rotateSensorKey, subscribeSensors } from "@/services/connect/sensorService";

const FIELD = "mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none [&>option]:bg-slate-900";

const toMs = (value) => (value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : null);
const agoText = (ms, now) => {
  const minutes = Math.max(0, Math.round((now - ms) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} days ago`;
};

// The address the sensor is told to call, shown once with the steps for the Shelly app.
function WebhookSetup({ name, url, onDone }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* the address is shown to copy by hand */ }
  }
  return (
    <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-slate-200" role="region" aria-label="Set up the sensor">
      <p className="font-semibold text-amber-200">Now set up {name}</p>
      <p className="mt-1 text-xs text-slate-300">This address is shown only now. Copy it, then in the Shelly app:</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-300">
        <li>Open the sensor, then <b>Actions</b> (webhooks) and add a new one.</li>
        <li>Choose the event <b>Temperature change</b>, set the condition to <b>any change</b>, and set a minimum interval of a few minutes. Add a second for <b>Humidity change</b> with the same address so it reports even when only that moves.</li>
        <li>Under the action choose <b>Call URL</b> and paste the address below (it must start with https).</li>
        <li>Save. Wake the sensor (press its button) and its first reading should appear here within a minute.</li>
      </ol>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-slate-950/70 px-2 py-1.5 text-[11px] text-slate-100">{url}</code>
        <button type="button" onClick={copy} className="shrink-0 rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5" aria-label="Copy the address"><Copy className="h-4 w-4" /></button>
        {copied && <span className="shrink-0 text-xs text-teal-300">Copied</span>}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Treat it like a password: anyone with it can send readings for this sensor. If it gets out, press New key.</p>
      <Button type="button" onClick={onDone} className="mt-3 rounded-full" size="sm">I have copied it</Button>
    </div>
  );
}

export default function PrimovexSensors({ canManageDevices }) {
  const [sensors, setSensors] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [setup, setSetup] = useState(null); // { name, url } shown once after adding or changing a key
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const spaces = useMemo(() => loadSpaceRegistry().spaces.filter((space) => space.status !== "archived"), []);
  const [form, setForm] = useState({ spaceId: "", type: "fridge", name: "", min: "2", max: "8", every: 60, alertAfter: 10 });

  useEffect(() => subscribeSensors(setSensors), []);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 30000); return () => window.clearInterval(timer); }, []);

  const space = spaces.find((item) => (item.spaceId || item.id) === form.spaceId);
  const typeInfo = SENSOR_TYPES.find((item) => item.value === form.type) || SENSOR_TYPES[0];

  function pickType(value) {
    const info = SENSOR_TYPES.find((item) => item.value === value);
    setForm((f) => ({ ...f, type: value, min: String(info.min), max: String(info.max) }));
  }

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    if (!space) { setMessage("Choose the room it is in."); return; }
    setBusy(true);
    try {
      const name = form.name.trim() || `${space.name} ${typeInfo.label.toLowerCase()}`;
      const result = await createSensor({
        name, type: form.type, room: space.name, site: space.siteName || space.site || "",
        min: Number(form.min), max: Number(form.max), expectedEveryMin: Number(form.every), excursionDelayMin: Number(form.alertAfter),
      });
      setSetup({ name, url: result.webhookUrl });
      setShowAdd(false);
    } catch (error) {
      setMessage(error?.message || "Could not add the sensor.");
    } finally {
      setBusy(false);
    }
  }

  async function newKey(sensor) {
    if (!window.confirm(`Give ${sensor.name} a new key? Its old address stops working straight away, so you will need to paste the new one into the Shelly app.`)) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await rotateSensorKey(sensor.id);
      setSetup({ name: sensor.name, url: result.webhookUrl });
    } catch (error) {
      setMessage(error?.message || "Could not change the key.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(sensor) {
    if (!window.confirm(`Remove ${sensor.name}? Its readings stop and it disappears from Connect.`)) return;
    setBusy(true);
    try { await removeSensor(sensor.id); } catch (error) { setMessage(error?.message || "Could not remove it."); } finally { setBusy(false); }
  }

  return (
    <Card className="border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><RadioTower className="h-5 w-5 text-teal-200" /><h2 className="text-lg font-bold text-white">Primovex Sensors</h2></div>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">Thermometers that report straight to Primovex over the internet each time they wake. No PC has to be on and no other company's cloud is involved. Primovex alerts the Practice Manager when a reading stays out of range, and when a sensor stops reporting.</p>
        </div>
        {canManageDevices && <Button type="button" variant="outline" onClick={() => { setShowAdd((v) => !v); setSetup(null); }} className="rounded-full border-white/10 bg-slate-950/40 text-slate-200">{showAdd ? "Cancel" : "Add sensor"}</Button>}
      </div>

      {message && <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" role="alert">{message}</p>}

      {showAdd && (
        <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4 sm:grid-cols-2">
          <label className="text-xs text-slate-300 sm:col-span-2">Room it is in
            <select className={FIELD} value={form.spaceId} onChange={(e) => setForm((f) => ({ ...f, spaceId: e.target.value }))} required>
              <option value="">Choose a room</option>
              {spaces.map((item) => <option key={item.spaceId || item.id} value={item.spaceId || item.id}>{item.name}{item.siteName || item.site ? ` · ${item.siteName || item.site}` : ""}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-300">What it watches
            <select className={FIELD} value={form.type} onChange={(e) => pickType(e.target.value)}>{SENSOR_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          </label>
          <label className="text-xs text-slate-300">Name <span className="text-slate-500">(optional)</span>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={space ? `${space.name} ${typeInfo.label.toLowerCase()}` : "e.g. Vaccine fridge"} />
          </label>
          <label className="text-xs text-slate-300">Safe from (°C)<Input type="number" step="0.1" value={form.min} onChange={(e) => setForm((f) => ({ ...f, min: e.target.value }))} required /></label>
          <label className="text-xs text-slate-300">Safe up to (°C)<Input type="number" step="0.1" value={form.max} onChange={(e) => setForm((f) => ({ ...f, max: e.target.value }))} required /></label>
          <label className="text-xs text-slate-300">It reports
            <select className={FIELD} value={form.every} onChange={(e) => setForm((f) => ({ ...f, every: e.target.value }))}>{REPORT_EVERY.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          </label>
          <label className="text-xs text-slate-300">Alert when out of range
            <select className={FIELD} value={form.alertAfter} onChange={(e) => setForm((f) => ({ ...f, alertAfter: e.target.value }))}>{ALERT_AFTER.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          </label>
          <div className="sm:col-span-2"><Button type="submit" disabled={busy} className="rounded-full">{busy ? "Adding…" : "Add sensor and get its address"}</Button></div>
        </form>
      )}

      {setup && <WebhookSetup name={setup.name} url={setup.url} onDone={() => setSetup(null)} />}

      <div className="mt-4 space-y-2">
        {sensors.length === 0 && <p className="text-sm text-slate-500">No Primovex sensors yet.</p>}
        {sensors.map((sensor) => {
          const last = toMs(sensor.lastReportAt);
          return (
            <div key={sensor.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
              <div className="min-w-0">
                <p className="font-semibold text-white">{sensor.name}</p>
                <p className="text-xs text-slate-400">{sensor.room} · {sensor.site} · Safe range {sensor.min} to {sensor.max}°C · expected {sensor.expectedEveryMin >= 60 ? `every ${sensor.expectedEveryMin / 60} h` : `every ${sensor.expectedEveryMin} min`}</p>
                <p className={`mt-1 text-xs ${last ? "text-emerald-300" : "text-amber-200"}`}>{last ? `Last reported ${agoText(last, clock)}.` : "Waiting for its first report. Finish the set-up in the Shelly app, then wake the sensor."}</p>
                {sensor.openIncidentId && <p className="mt-1 text-xs text-rose-300">Out of range: a fridge incident is open.</p>}
              </div>
              {canManageDevices && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => newKey(sensor)} className="rounded-full border-white/10 bg-slate-950/40 text-xs text-slate-200"><KeyRound className="mr-1 h-3.5 w-3.5" /> New key</Button>
                  <button type="button" disabled={busy} onClick={() => remove(sensor)} aria-label={`Remove ${sensor.name}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
