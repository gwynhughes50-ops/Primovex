import { useEffect, useMemo, useState } from "react";
import { QrCode } from "lucide-react";
import { SOFTWARE, STATUS, checkState, isLive, missingSoftware, softwareLabel } from "@/modules/computers/computers";
import { dayKey, ukDay } from "@/modules/laptops/laptops";
import { editComputer, markComputerChecked, subscribeComputerEvents } from "@/modules/computers/computerService";

// What the IT team can do with one PC: record a check (one tap when it is all as listed, or tick what is different), change its details, and read its history. Used on the desktop and on the phone,
// where it is what opens when a PC's QR label is scanned. The person who uses it is picked from the staff list, never typed. Every change is checked in computers.js and says in words what is wrong.

const FIELD = "w-full rounded-lg border border-[var(--medtrak-border)] bg-transparent px-2 py-2 text-sm text-[var(--medtrak-text)] [&>option]:text-slate-900";
const BUTTON = "min-h-10 rounded-xl border border-[var(--medtrak-border)] px-3 text-sm font-semibold hover:bg-[var(--medtrak-bg)] disabled:opacity-40";
const PRIMARY = "min-h-10 rounded-xl bg-[var(--medtrak-accent)] px-4 text-sm font-bold text-white disabled:opacity-40";
const TONE = { overdue: "border-rose-400/50 bg-rose-500/10 text-rose-700", never: "border-amber-400/50 bg-amber-500/10 text-amber-700", soon: "border-amber-400/50 bg-amber-500/10 text-amber-700", ok: "border-[var(--medtrak-border)] text-[var(--medtrak-muted)]", none: "border-[var(--medtrak-border)] text-[var(--medtrak-muted)]" };

export const checkWords = (pc, { state, days, dueOn }) => {
  if (state === "none") return "";
  if (state === "never") return "Never checked";
  const last = `Checked ${ukDay(pc.lastCheckedOn)}`;
  if (state === "overdue") return `${last}, check overdue by ${-days} day${days === -1 ? "" : "s"}`;
  if (state === "soon") return `${last}, next check ${ukDay(dueOn)}${days >= 0 ? ` (in ${days} day${days === 1 ? "" : "s"})` : ""}`;
  return `${last}, next check ${ukDay(dueOn)}`;
};

export function Chips({ computer, usual = [], today = dayKey() }) {
  if (!computer) return null;
  const check = checkState(computer, today);
  const gaps = isLive(computer) ? missingSoftware(computer, usual) : [];
  return (
    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
      <span className="rounded-full border border-[var(--medtrak-border)] px-2 py-0.5 font-semibold">{STATUS[computer.status] || computer.status}</span>
      {isLive(computer) && <span className={`rounded-full border px-2 py-0.5 ${TONE[check.state]}`}>{checkWords(computer, check)}</span>}
      {gaps.length > 0 && <span className="rounded-full border border-amber-400/50 bg-amber-500/10 px-2 py-0.5 text-amber-700">Missing {gaps.map(softwareLabel).join(", ")}</span>}
    </div>
  );
}

function Label({ text, children }) { return <label className="block text-xs font-bold">{text}<div className="mt-1 font-normal">{children}</div></label>; }

function SoftwareBoxes({ value, onChange, usual = [] }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {SOFTWARE.map((s) => (
        <label key={s.key} className="flex min-h-9 items-center gap-2 rounded-lg border border-[var(--medtrak-border)] px-2 text-sm">
          <input type="checkbox" checked={value.includes(s.key)} onChange={(e) => onChange(e.target.checked ? [...value, s.key] : value.filter((k) => k !== s.key))} />
          <span>{s.label}{usual.includes(s.key) ? <span className="text-[10px] text-[var(--medtrak-muted)]"> (usual)</span> : null}</span>
        </label>
      ))}
    </div>
  );
}

export default function ComputerActions({ computer, staff = [], sites = [], departments = [], usual = [], actor, canManage = false, onChanged = () => {} }) {
  const today = dayKey();
  const [mode, setMode] = useState(""); // "" | "check" | "edit" | "history"
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState("");
  const [events, setEvents] = useState([]);
  const [software, setSoftware] = useState(computer.software || []);
  const [note, setNote] = useState("");
  const [form, setForm] = useState({});
  const live = isLive(computer);
  useEffect(() => subscribeComputerEvents(computer.id, setEvents, () => setEvents([])), [computer.id]);
  useEffect(() => { setSoftware(computer.software || []); }, [computer.id, computer.software]);

  const edit = useMemo(() => ({
    siteId: computer.siteId || "", department: computer.department || "", label: computer.label || "", printerSerial: computer.printerSerial || "", status: computer.status, holderUid: computer.currentUserUid || "", notes: computer.notes || "",
    ...form,
  }), [computer, form]);
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setProblem(""); };

  async function run(work, message) {
    setBusy(true); setProblem(""); setDone("");
    try { await work(); setDone(message); setMode(""); setForm({}); setNote(""); onChanged(); } catch (e) { setProblem(e?.message || "That could not be saved. Try again."); } finally { setBusy(false); }
  }
  const allAsListed = () => run(() => markComputerChecked({ computer, actor }), `PC ${computer.assetNumber} checked.`);
  const recordCheck = () => run(() => markComputerChecked({ computer, software, note, actor }), `PC ${computer.assetNumber} checked.`);
  function save() {
    const changes = {};
    const site = sites.find((s) => s.id === edit.siteId);
    if (form.siteId !== undefined && form.siteId !== (computer.siteId || "")) changes.site = site ? { id: site.id, name: site.name } : { id: "", name: "" };
    if (form.department !== undefined && form.department !== (computer.department || "")) changes.department = form.department;
    if (form.label !== undefined && form.label !== (computer.label || "")) changes.label = form.label;
    if (form.printerSerial !== undefined && form.printerSerial !== (computer.printerSerial || "")) changes.printerSerial = form.printerSerial;
    if (form.notes !== undefined && form.notes !== (computer.notes || "")) changes.notes = form.notes;
    if (form.status !== undefined && form.status !== computer.status) changes.status = form.status;
    if (form.holderUid !== undefined && form.holderUid !== (computer.currentUserUid || "")) { const p = staff.find((s) => s.uid === form.holderUid); changes.holder = p ? { uid: p.uid, name: p.displayName } : null; }
    if (form.software !== undefined && form.software.join() !== (computer.software || []).join()) changes.software = form.software;
    return run(() => editComputer({ computer, changes, actor }), "Saved.");
  }

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--medtrak-border)] pt-3 text-sm text-[var(--medtrak-text)]">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-[var(--medtrak-muted)]">Where</dt><dd>{[computer.siteName, computer.department].filter(Boolean).join(" · ") || "Not recorded"}</dd>
        <dt className="text-[var(--medtrak-muted)]">Used by</dt><dd>{computer.currentUserName ? `${computer.currentUserName}${computer.label && computer.label !== computer.currentUserName ? ` (${computer.label})` : ""}` : computer.label || "Not recorded"}</dd>
        <dt className="text-[var(--medtrak-muted)]">Printer</dt><dd className="font-mono text-xs">{computer.printerSerial || "None recorded"}</dd>
        {computer.lastCheckNote ? <><dt className="text-[var(--medtrak-muted)]">Last check</dt><dd>{computer.lastCheckNote}{computer.lastCheckedByName ? ` (${computer.lastCheckedByName})` : ""}</dd></> : null}
        {computer.notes ? <><dt className="text-[var(--medtrak-muted)]">Notes</dt><dd>{computer.notes}</dd></> : null}
      </dl>
      <div>
        <p className="text-xs font-bold">Installed</p>
        <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
          {(computer.software || []).length ? (computer.software || []).map((k) => <span key={k} className="rounded-full border border-[var(--medtrak-border)] px-2 py-0.5">{softwareLabel(k)}</span>) : <span className="text-[var(--medtrak-muted)]">Nothing recorded</span>}
        </div>
      </div>

      {canManage && live && !mode && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={PRIMARY} disabled={busy} onClick={allAsListed}>Checked: all as listed</button>
          <button type="button" className={BUTTON} onClick={() => { setMode("check"); setDone(""); }}>Something is different</button>
          <button type="button" className={BUTTON} onClick={() => { setMode("edit"); setDone(""); }}>Edit details</button>
          <button type="button" className={BUTTON} onClick={() => setMode("history")}>History</button>
        </div>
      )}
      {canManage && !live && !mode && <div className="flex flex-wrap gap-2"><button type="button" className={BUTTON} onClick={() => setMode("edit")}>Edit details</button><button type="button" className={BUTTON} onClick={() => setMode("history")}>History</button></div>}
      {!canManage && !mode && <button type="button" className={BUTTON} onClick={() => setMode("history")}>History</button>}

      {mode === "check" && (
        <section className="space-y-2 rounded-xl border border-[var(--medtrak-border)] p-3" aria-label="Record a check">
          <p className="font-bold">Tick what is installed on it now</p>
          <SoftwareBoxes value={software} onChange={setSoftware} usual={usual} />
          <Label text="Anything to note (optional)"><input className={FIELD} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="For example: screen flickers, needs a new mouse" /></Label>
          <div className="flex gap-2"><button type="button" className={PRIMARY} disabled={busy} onClick={recordCheck}>Record the check</button><button type="button" className={BUTTON} onClick={() => setMode("")}>Cancel</button></div>
        </section>
      )}

      {mode === "edit" && (
        <section className="space-y-2 rounded-xl border border-[var(--medtrak-border)] p-3" aria-label="Edit this PC">
          <Label text="Site"><select className={FIELD} value={edit.siteId} onChange={(e) => set({ siteId: e.target.value })}><option value="">Not recorded</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Label>
          <Label text="Department"><input className={FIELD} list={`pc-dept-${computer.id}`} value={edit.department} maxLength={80} onChange={(e) => set({ department: e.target.value })} /><datalist id={`pc-dept-${computer.id}`}>{departments.map((d) => <option key={d} value={d} />)}</datalist></Label>
          <Label text="Who or what uses it"><input className={FIELD} value={edit.label} maxLength={80} onChange={(e) => set({ label: e.target.value })} placeholder="A room, a desk or a person" /></Label>
          <Label text="Status"><select className={FIELD} value={edit.status} onChange={(e) => set({ status: e.target.value, holderUid: e.target.value === "in_use" ? edit.holderUid : "" })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Label>
          {edit.status === "in_use" && <Label text="Linked to a member of staff (optional)"><select className={FIELD} value={edit.holderUid} onChange={(e) => set({ holderUid: e.target.value })}><option value="">Nobody in particular</option>{staff.map((s) => <option key={s.uid} value={s.uid}>{s.displayName}</option>)}</select></Label>}
          <Label text="Printer serial number"><input className={`${FIELD} font-mono`} value={edit.printerSerial} maxLength={40} onChange={(e) => set({ printerSerial: e.target.value })} /></Label>
          <Label text="Installed"><SoftwareBoxes value={form.software ?? computer.software ?? []} onChange={(v) => set({ software: v })} usual={usual} /></Label>
          <Label text="Notes"><input className={FIELD} value={edit.notes} maxLength={200} onChange={(e) => set({ notes: e.target.value })} /></Label>
          <div className="flex gap-2"><button type="button" className={PRIMARY} disabled={busy} onClick={save}>Save</button><button type="button" className={BUTTON} onClick={() => { setMode(""); setForm({}); }}>Cancel</button></div>
        </section>
      )}

      {mode === "history" && (
        <section className="rounded-xl border border-[var(--medtrak-border)] p-3" aria-label="History">
          <div className="flex items-center justify-between"><p className="font-bold">History</p><button type="button" className="text-xs font-semibold underline" onClick={() => setMode("")}>Close</button></div>
          {events.length === 0 ? <p className="mt-1 text-xs text-[var(--medtrak-muted)]">Nothing recorded yet.</p> : (
            <ul className="mt-2 divide-y divide-[var(--medtrak-border)] text-xs">
              {events.slice(0, 30).map((e) => <li key={e.id} className="py-1.5"><span className="font-semibold">{ukDay(e.onDay)}</span> {e.text}{e.byName ? <span className="text-[var(--medtrak-muted)]"> ({e.byName})</span> : null}</li>)}
            </ul>
          )}
        </section>
      )}
      {done && <p className="font-semibold text-emerald-600" role="status">{done}</p>}
      {problem && <p className="font-semibold text-rose-600" role="alert">{problem}</p>}
      <p className="flex items-center gap-1.5 text-[11px] text-[var(--medtrak-muted)]"><QrCode className="h-3.5 w-3.5" aria-hidden="true" /> Its QR label opens this page.</p>
    </div>
  );
}
