import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock, ScanLine, Thermometer } from "lucide-react";
import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { normaliseUnit } from "./fridgeCheck";
import { HISTORY_DAYS, LIST_FIRST, LIST_MAX, LIST_MORE, dayStrip, describeReading, fridgeStatuses, historyStartKey, summarise } from "./fridgeReadings";

// Reading back the fridge checks: for each fridge, today's reading and who took it, and the last two weeks. The checks
// themselves are made by scanning the fridge's tag (that is how Primovex knows the person was at the fridge), so nothing
// here records one; this is only for looking. Anyone signed in can read the readings.

const timeText = (date) => (date ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
const dayText = (date) => (date ? date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "");
const degrees = (value) => (value === null ? "—" : `${value}°C`);

const STATE = {
  out: { label: "Out of range", tone: "border-rose-500/40 bg-rose-500/10 text-rose-700", Icon: AlertTriangle },
  ok: { label: "In range", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700", Icon: CheckCircle2 },
  missing: { label: "Not checked today", tone: "border-amber-500/40 bg-amber-500/10 text-amber-800", Icon: Clock },
  waiting: { label: "Not checked yet", tone: "border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] text-[var(--medtrak-muted)]", Icon: Clock },
};

// the last days at a glance: green every reading in range, red one was out, grey nothing read (a weekend is not a miss)
const CELL = { ok: "bg-emerald-500 text-white", out: "bg-rose-600 text-white", none: "border border-amber-500/60 bg-amber-500/10 text-amber-800", weekend: "bg-[var(--medtrak-bg)] text-[var(--medtrak-muted)]" };
const CELL_WORDS = { ok: "all in range", out: "out of range", none: "no reading", weekend: "weekend, no reading" };
function DayStrip({ history, now }) {
  const cells = dayStrip(history, now);
  return (
    <div className="mt-2" role="img" aria-label={`The last ${HISTORY_DAYS} days: ${cells.filter((c) => c.state === "ok").length} days all in range, ${cells.filter((c) => c.state === "out").length} out of range, ${cells.filter((c) => c.state === "none").length} with no reading`}>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
        {cells.map((c) => <span key={c.key} title={`${c.key}: ${CELL_WORDS[c.state]}${c.count ? `, ${c.count} reading${c.count === 1 ? "" : "s"}` : ""}`} className={`grid h-7 place-items-center rounded-md text-[10px] font-bold ${CELL[c.state]}`}>{c.day}</span>)}
      </div>
      <p className="mt-1 text-[11px] text-[var(--medtrak-muted)]">Green: all in range · Red: out of range · Amber: no reading · Grey: weekend</p>
    </div>
  );
}

function HistoryRows({ logs }) {
  const [shown, setShown] = useState(LIST_FIRST);
  if (!logs.length) return <p className="mt-2 text-sm text-[var(--medtrak-muted)]">No readings in the last {HISTORY_DAYS} days.</p>;
  const capped = logs.slice(0, LIST_MAX);
  return (
    <>
    <ul className="mt-2 divide-y divide-[var(--medtrak-border)] rounded-xl border border-[var(--medtrak-border)]">
      {capped.slice(0, shown).map((log, index) => {
        const r = describeReading(log);
        return (
          <li key={log.id || index} className="px-3 py-2 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{dayText(r.when)} · {timeText(r.when)}</span>
              <span className={`font-black ${r.out ? "text-rose-700" : ""}`}>{degrees(r.temp)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2 text-xs text-[var(--medtrak-muted)]">
              <span>{r.by || "Someone"}{r.min !== null ? ` · min ${degrees(r.min)}, max ${degrees(r.max)}` : ""}</span>
              {r.out && <span className="font-bold text-rose-700">Out of range</span>}
            </div>
          </li>
        );
      })}
    </ul>
    {shown < capped.length && <button type="button" onClick={() => setShown((n) => n + LIST_MORE)} className="mt-2 w-full rounded-xl border border-[var(--medtrak-border)] px-3 py-2 text-sm font-semibold">Show {Math.min(LIST_MORE, capped.length - shown)} more ({capped.length - shown} not shown)</button>}
    <p className="mt-2 text-xs text-[var(--medtrak-muted)]">{logs.length > LIST_MAX ? `The newest ${LIST_MAX} of ${logs.length} readings. ` : ""}Older readings are on the desktop, in the Temperature log: choose a date range.</p>
    </>
  );
}

function FridgeCard({ status, now }) {
  const [open, setOpen] = useState(false);
  const { unit, newest, last, state, incidentOpen, history, today } = status;
  const { label, tone, Icon } = STATE[state];
  const reading = newest ? describeReading(newest) : null;
  const previous = !newest && last ? describeReading(last) : null;
  return (
    <section className="rounded-[1.5rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4" aria-label={unit.name}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-bold"><Thermometer className="h-4 w-4 shrink-0 text-[var(--medtrak-accent)]" aria-hidden="true" /> <span className="truncate">{unit.name}</span></h3>
          <p className="text-xs text-[var(--medtrak-muted)]">{unit.siteName ? `${unit.siteName} · ` : ""}Safe range {unit.range.min}°C to {unit.range.max}°C</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${tone}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}</span>
      </div>

      {reading ? (
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className={`text-4xl font-black tracking-tight ${reading.out ? "text-rose-700" : ""}`}>{degrees(reading.temp)}</p>
            {reading.min !== null && <p className="text-xs text-[var(--medtrak-muted)]">Min {degrees(reading.min)} · Max {degrees(reading.max)}</p>}
          </div>
          <div className="text-right text-xs text-[var(--medtrak-muted)]">
            <p className="font-semibold text-[var(--medtrak-text)]">{reading.by || "Someone"}</p>
            <p>{timeText(reading.when)} today{today.length > 1 ? ` · ${today.length} checks` : ""}</p>
          </div>
        </div>
      ) : previous ? (
        <p className="mt-3 text-sm text-[var(--medtrak-muted)]">Last reading {degrees(previous.temp)} on {dayText(previous.when)}, by {previous.by || "someone"}.</p>
      ) : (
        <p className="mt-3 text-sm text-[var(--medtrak-muted)]">No readings in the last {HISTORY_DAYS} days.</p>
      )}

      {incidentOpen && <p className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-700"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> An incident is open for this fridge.</p>}

      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-3 flex w-full items-center justify-between rounded-xl border border-[var(--medtrak-border)] px-3 py-2 text-sm font-semibold">
        <span>Last {HISTORY_DAYS} days ({history.length})</span>
        {open ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
      </button>
      <DayStrip history={history} now={now} />
      {open && <HistoryRows logs={history} />}
    </section>
  );
}

export default function MobileFridgeReadings() {
  const [units, setUnits] = useState(null);
  const [logs, setLogs] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [error, setError] = useState("");
  const [now] = useState(() => new Date());
  const synthetic = isSafeSyntheticMode();

  useEffect(() => {
    if (synthetic) { setUnits([]); setLogs([]); return undefined; }
    const fail = () => setError("Could not load the fridge readings. Check your connection and try again.");
    const stops = [
      onSnapshot(collection(db, "temperature_units"), (snap) => setUnits(snap.docs.map((d) => normaliseUnit(d.id, d.data()))), fail),
      onSnapshot(query(collection(db, "temperature_logs"), where("dateKey", ">=", historyStartKey(now)), orderBy("dateKey", "desc"), limit(1000)), (snap) => setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), fail),
      onSnapshot(query(collection(db, "temperature_incidents"), where("status", "==", "open"), limit(50)), (snap) => setIncidents(snap.docs.map((d) => d.data())), () => setIncidents([])),
    ];
    return () => stops.forEach((stop) => stop());
  }, [synthetic, now]);

  const statuses = useMemo(() => (units && logs ? fridgeStatuses({ units, logs, incidents, now }) : []), [units, logs, incidents, now]);
  const summary = useMemo(() => summarise(statuses), [statuses]);
  const loading = !error && (units === null || logs === null);

  return (
    <div className="space-y-3 px-4 pb-28 pt-3 text-[var(--medtrak-text)]">
      <div>
        <h2 className="text-xl font-black">Fridge checks</h2>
        <p className="text-sm text-[var(--medtrak-muted)]">The readings taken by hand with the thermometer.</p>
      </div>

      {error && <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700" role="alert">{error}</p>}
      {synthetic && <p className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3 text-sm text-[var(--medtrak-muted)]">Demo mode does not show live fridge readings.</p>}
      {loading && <p className="text-center text-sm text-[var(--medtrak-muted)]">Loading the readings…</p>}

      {!loading && !error && statuses.length > 0 && (
        <p className={`rounded-2xl border p-3 text-sm font-semibold ${summary.out || summary.missing ? "border-amber-500/40 bg-amber-500/10 text-amber-900" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"}`} role="status">
          {summary.checked} of {summary.total} {summary.total === 1 ? "fridge" : "fridges"} checked today
          {summary.out ? ` · ${summary.out} out of range` : ""}
          {summary.missing ? ` · ${summary.missing} still to check` : ""}
        </p>
      )}

      {!loading && !error && !synthetic && statuses.length === 0 && <p className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 text-sm text-[var(--medtrak-muted)]">No fridges or freezers are set up yet. The Practice Manager adds them on the Temperature page.</p>}

      {logs && logs.length >= 1000 && <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-semibold text-amber-900">There are a lot of readings, so only the newest 1000 are shown here. The Temperature log on the desktop has them all, by date range.</p>}

      {statuses.map((status) => <FridgeCard key={status.unit.id} status={status} now={now} />)}

      <p className="flex items-start gap-2 text-xs text-[var(--medtrak-muted)]"><ScanLine className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> To record a check, scan the fridge's tag (NFC or QR). That is how Primovex knows you are at the fridge.</p>
    </div>
  );
}
