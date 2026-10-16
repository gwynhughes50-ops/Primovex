import { useMemo, useState } from "react";
import { Car, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import ClaimForm from "@/modules/mileage/ClaimForm";
import { STATUS, STATUS_LABEL, claimsCsv, dateKey, money, periodTotals, priceClaims, taxYearOf, totalMiles, vehicleLabel } from "@/modules/mileage/mileage";
import { decideClaim, removeRoute, savePlace, saveRoute, submitClaim, updateClaim, useClaims, useMyStaffRecord, usePlaces, withdrawClaim } from "@/modules/mileage/mileageService";

// Mileage (Operations > Mileage): a member of staff adds the journeys they made in their own vehicle, their line manager approves
// them, and the Practice Manager gets the totals for payroll. Places are picked from a list so no patient address is typed.

const FIELD = "mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/60";
const SMALL = "rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-sm text-slate-100 outline-none focus:border-teal-300/60";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-400";
const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-white/5 disabled:opacity-40";
const PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-teal-500/90 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40";
const CHIP = { submitted: "bg-amber-400/25 text-amber-100", approved: "bg-emerald-500/20 text-emerald-100", rejected: "bg-rose-500/20 text-rose-100" };
const uk = (key) => (key ? key.split("-").reverse().join("/") : "");
const monthLabel = (key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

function Tile({ label, value, sub, tone }) {
  return <div className={`rounded-xl border border-white/10 p-3 ${tone || "bg-slate-900/60"}`}><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-50">{value}</p>{sub && <p className="text-xs text-slate-400">{sub}</p>}</div>;
}

const journey = (c) => `${c.fromName} to ${c.toName}${c.returnTrip ? " and back" : ""}`;

function MyMileage({ me, places, actor, uid }) {
  const claims = useClaims({ scope: "mine" });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const list = claims.list || [];
  const priced = useMemo(() => priceClaims(list, places.rates), [list, places.rates]);
  const year = taxYearOf(dateKey(new Date()));
  const thisYear = list.filter((c) => c.status === STATUS.approved && c.date >= year.from && c.date <= year.to);
  const yearMiles = thisYear.reduce((n, c) => n + totalMiles(c), 0);
  const yearPence = thisYear.reduce((n, c) => n + (priced.get(c.id)?.pence || 0), 0);
  const waiting = list.filter((c) => c.status === STATUS.submitted).length;
  const milesBefore = (vehicle, date) => { const y = taxYearOf(date); return y ? list.filter((c) => c.status === STATUS.approved && c.vehicle === vehicle && c.date >= y.from && c.date <= y.to).reduce((n, c) => n + totalMiles(c), 0) : 0; };

  async function send(form) { await submitClaim(form, { me, uid, options: places.options, actor }); setAdding(false); setMessage("Sent to your line manager for approval."); }
  async function edit(form) { await updateClaim(editing, form, { options: places.options }); setEditing(null); setMessage("Changes saved."); }
  async function withdraw(claim) { setProblem(""); try { await withdrawClaim(claim); setMessage("That journey was withdrawn."); } catch (failure) { setProblem(failure?.message || "That didn't work."); } }

  if (!me) return <p className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">Your sign-in isn't linked to a staff record yet, so mileage can't be claimed. Ask the Practice Manager to link it (Timesheets, then People).</p>;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Tile label={`Approved this tax year (${year.label})`} value={`${Math.round(yearMiles * 10) / 10} miles`} sub={money(yearPence)} />
        <Tile label="Waiting for approval" value={waiting} tone={waiting ? "bg-amber-400/10" : ""} />
        <Tile label="Your line manager" value={me.managerId ? "Set" : "Not set"} sub={me.managerUid ? "" : "A manager must be set (and linked to an account) before a claim can be approved by them."} tone={me.managerUid ? "" : "bg-amber-400/10"} />
      </div>
      {message && <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100" role="status">{message}</p>}
      {problem && <p className="text-sm text-rose-300" role="alert">{problem}</p>}
      {adding || editing ? (
        <section className="rounded-2xl border border-teal-300/30 bg-slate-900/80 p-4">
          <h3 className="mb-3 text-base font-semibold text-slate-100">{editing ? "Change this journey" : "Add a journey"}</h3>
          <ClaimForm skin="desktop" options={places.options} routes={places.routes} rates={places.rates} initial={editing} milesBefore={milesBefore} onSubmit={editing ? edit : send} onCancel={() => { setAdding(false); setEditing(null); }} />
        </section>
      ) : <div><button type="button" className={PRIMARY} onClick={() => { setAdding(true); setMessage(""); }}><Plus className="h-4 w-4" /> Add a journey</button></div>}
      {claims.error && <p className="text-sm text-amber-200">{claims.error}</p>}
      {!list.length ? <p className="text-sm text-slate-400">You haven't added any journeys yet.</p> : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Journey</th><th className="px-3 py-2">Miles</th><th className="px-3 py-2">Paid</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-t border-white/5">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-100">{uk(c.date)}</td>
                  <td className="px-3 py-2 text-slate-200">{journey(c)}<span className="block text-xs text-slate-400">{c.purpose} · {vehicleLabel(c.vehicle)}</span></td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-200">{totalMiles(c)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-200">{c.status === STATUS.approved ? money(priced.get(c.id)?.pence) : ""}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${CHIP[c.status]}`}>{STATUS_LABEL[c.status]}</span>{c.status === STATUS.rejected && c.decisionNote ? <span className="block text-xs text-slate-400">{c.decisionNote}</span> : null}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{c.status === STATUS.submitted && <><button type="button" className={BTN} onClick={() => { setEditing(c); setAdding(false); setMessage(""); }}>Change</button> <button type="button" className="ml-2 text-xs font-semibold text-slate-400 underline hover:text-rose-300" onClick={() => withdraw(c)}>Withdraw</button></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ToApprove({ actor, places, canManage }) {
  const claims = useClaims({ scope: canManage ? "all" : "approve" });
  const { user } = useAuth();
  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState("");
  const [problem, setProblem] = useState("");
  const waiting = (claims.list || []).filter((c) => c.status === STATUS.submitted && c.uid !== user?.uid);
  async function decide(claim, status) {
    setBusyId(claim.id); setProblem("");
    try { await decideClaim(claim, status, notes[claim.id] || "", actor); } catch (failure) { setProblem(failure?.message || "That didn't save. Check you have permission."); } finally { setBusyId(""); }
  }
  if (claims.list === null) return <p className="text-sm text-slate-400">Opening…</p>;
  return (
    <div className="space-y-3">
      {problem && <p className="text-sm text-rose-300" role="alert">{problem}</p>}
      {claims.error && <p className="text-sm text-amber-200">{claims.error}</p>}
      {!waiting.length ? <p className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">Nothing is waiting for your approval.</p> : waiting.map((c) => {
        const cost = priceClaims([{ ...c, status: STATUS.approved }], places.rates).get(c.id);
        return (
          <section key={c.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-semibold text-slate-100">{c.staffName} <span className="font-normal text-slate-400">· {uk(c.date)}</span></p><p className="text-sm text-slate-200">{journey(c)}</p><p className="text-xs text-slate-400">{c.purpose} · {vehicleLabel(c.vehicle)}{c.note ? ` · ${c.note}` : ""}</p></div>
              <div className="text-right"><p className="text-lg font-black text-slate-50">{totalMiles(c)} miles</p><p className="text-xs text-slate-400">about {money(cost?.pence)} from the start of the tax year</p></div>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className={`${LABEL} min-w-[12rem] flex-1`}>Note (optional)<input className={FIELD} value={notes[c.id] || ""} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} placeholder="Shown to them if not approved" /></label>
              <button type="button" className={PRIMARY} disabled={busyId === c.id} onClick={() => decide(c, STATUS.approved)}>Approve</button>
              <button type="button" className={BTN} disabled={busyId === c.id} onClick={() => decide(c, STATUS.rejected)}>Don't approve</button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Everyone({ places }) {
  const claims = useClaims({ scope: "all" });
  const list = claims.list || [];
  const months = useMemo(() => [...new Set(list.map((c) => c.date.slice(0, 7)))].sort().reverse(), [list]);
  const [month, setMonth] = useState("");
  const chosen = month || months[0] || dateKey(new Date()).slice(0, 7);
  const from = `${chosen}-01`;
  const to = `${chosen}-31`;
  const totals = useMemo(() => periodTotals(list, from, to, places.rates), [list, from, to, places.rates]);
  const inMonth = list.filter((c) => c.date >= from && c.date <= to);
  const waiting = inMonth.filter((c) => c.status === STATUS.submitted).length;
  const sum = totals.reduce((acc, r) => ({ miles: acc.miles + r.miles, pence: acc.pence + r.pence }), { miles: 0, pence: 0 });
  function download() {
    const url = URL.createObjectURL(new Blob([claimsCsv(inMonth, places.rates)], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `primovex-mileage-${chosen}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  if (claims.list === null) return <p className="text-sm text-slate-400">Opening…</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className={LABEL}>Month<select className={FIELD} value={chosen} onChange={(e) => setMonth(e.target.value)}>{(months.length ? months : [chosen]).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
        <button type="button" className={`${BTN} ml-auto`} onClick={download} disabled={!totals.length}>Download for payroll (CSV)</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3"><Tile label="Approved miles" value={Math.round(sum.miles * 10) / 10} /><Tile label="Approved amount" value={money(sum.pence)} /><Tile label="Still waiting for approval" value={waiting} tone={waiting ? "bg-amber-400/10" : ""} /></div>
      {!totals.length ? <p className="text-sm text-slate-400">No approved mileage in {monthLabel(chosen)}.</p> : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-sm"><thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2">Person</th><th className="px-3 py-2">Journeys</th><th className="px-3 py-2">Miles</th><th className="px-3 py-2">Amount</th></tr></thead>
            <tbody>{totals.map((r) => <tr key={r.uid} className="border-t border-white/5"><td className="px-3 py-2 font-semibold text-slate-100">{r.name}</td><td className="px-3 py-2 text-slate-200">{r.journeys}</td><td className="px-3 py-2 text-slate-200">{r.miles}</td><td className="px-3 py-2 text-slate-100">{money(r.pence)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">Rates: 45p a mile for a car or van up to 10,000 miles in the tax year (6 April to 5 April), then 25p; motorcycle 24p; bicycle 20p. Amounts are worked out in date order for each person, so the lower rate starts on the journey that takes them over 10,000 miles.</p>
    </div>
  );
}

function PlacesAndRoutes({ places }) {
  const [name, setName] = useState("");
  const [route, setRoute] = useState({ fromId: "", toId: "", miles: "" });
  const [message, setMessage] = useState("");
  const nameOf = (id) => places.options.find((o) => o.id === id)?.name || id;
  async function run(work, done) { setMessage(""); try { await work(); setMessage(done); } catch (failure) { setMessage(failure?.message || "That didn't save."); } }
  return (
    <div className="space-y-4">
      {message && <p className="text-sm text-slate-200" role="status">{message}</p>}
      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
        <h3 className="font-semibold text-slate-100">Places</h3>
        <p className="text-sm text-slate-400">Your sites come from Practice Admin. Add other places staff drive to (a hospital, a pharmacy).</p>
        <p className="mt-2 text-sm text-slate-200">{places.options.map((o) => o.name).join(" · ")}</p>
        <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run(async () => { await savePlace({ name }); setName(""); }, "Place added."); }}>
          <label className={LABEL}>Add a place<input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. District Hospital" /></label>
          <button type="submit" className={PRIMARY} disabled={!name.trim()}>Add</button>
        </form>
      </section>
      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
        <h3 className="font-semibold text-slate-100">Known routes</h3>
        <p className="text-sm text-slate-400">The miles one way between two places. Staff then don't have to type them.</p>
        <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await saveRoute(route); setRoute({ fromId: "", toId: "", miles: "" }); }, "Route saved."); }}>
          {["fromId", "toId"].map((k) => <label key={k} className={LABEL}>{k === "fromId" ? "Between" : "and"}<select className={FIELD} value={route[k]} onChange={(e) => setRoute({ ...route, [k]: e.target.value })}><option value="">Choose a place</option>{places.options.filter((o) => o.id !== "visit").map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>)}
          <label className={LABEL}>Miles<input type="number" step="0.1" min="0" className={`${FIELD} w-24`} value={route.miles} onChange={(e) => setRoute({ ...route, miles: e.target.value })} /></label>
          <button type="submit" className={PRIMARY} disabled={!route.fromId || !route.toId || route.fromId === route.toId || !(Number(route.miles) > 0)}>Save route</button>
        </form>
        {places.routes.length > 0 && <ul className="mt-3 divide-y divide-white/5 text-sm">{places.routes.map((r) => <li key={r.id} className="flex items-center justify-between py-1.5"><span className="text-slate-200">{nameOf(r.fromId)} and {nameOf(r.toId)}: <b>{r.miles} miles</b></span><button type="button" className="text-xs text-slate-400 underline hover:text-rose-300" onClick={() => run(() => removeRoute(r), "Route removed.")}>Remove</button></li>)}</ul>}
      </section>
    </div>
  );
}

export default function Mileage() {
  const { user, displayName, can } = useAuth();
  const actor = { displayName: displayName || user?.email || "", email: user?.email || "" };
  const canManage = can("timesheets.manage");
  const mine = useMyStaffRecord();
  const places = usePlaces(true);
  const approvals = useClaims({ scope: canManage ? "all" : "approve" });
  const pending = (approvals.list || []).filter((c) => c.status === STATUS.submitted && c.uid !== user?.uid).length;
  const [tab, setTab] = useState("mine");
  const showApprove = canManage || (approvals.list || []).length > 0;
  const tabs = [["mine", "My mileage"], ...(showApprove ? [["approve", `To approve${pending ? ` (${pending})` : ""}`]] : []), ...(canManage ? [["everyone", "Totals for payroll"], ["places", "Places and routes"]] : [])];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-50"><Car className="h-6 w-6 text-teal-300" aria-hidden="true" /> Mileage</h1>
        <p className="max-w-3xl text-sm text-slate-400">Journeys made in your own vehicle for work. Add them as you go, your line manager approves them, and they are paid through payroll.</p>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-white/10" role="tablist">{tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${tab === key ? "bg-white/10 text-slate-50" : "text-slate-400 hover:text-slate-200"}`}>{label}</button>)}</div>
      {!mine.ready || !places.ready ? <p className="text-sm text-slate-400">Opening…</p>
        : tab === "mine" ? <MyMileage me={mine.record} places={places} actor={actor} uid={user?.uid} />
          : tab === "approve" ? <ToApprove actor={actor} places={places} canManage={canManage} />
            : tab === "everyone" ? <Everyone places={places} />
              : <PlacesAndRoutes places={places} />}
    </div>
  );
}
