import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_TEMPLATES } from "@/core/identity/capabilities";
import { listStaffDirectory } from "@/services/staffDirectoryService";
import {
  ACTION_STATUSES, REVIEW_STATUSES, SE_STATUSES, actionTone, formatDate, friendly, saveReviewerRoles, seMetrics, setActionDone,
  subscribeActions, subscribeEvents, subscribeMeetings, subscribeMyReviews, subscribeSeSettings,
} from "../services/seService";
import SeDetail from "./SeDetail";
import SeMeetings from "./SeMeetings";
import SeReportForm from "./SeReportForm";
import { CARD, ErrorText, FIELD, HarmPill, PRIMARY, Pill, StagePill } from "./SeShared";

// Significant events: one screen for the phone and the desktop. Anyone can report an event and
// follow the ones they reported; the significant events team runs them; reviewers see what they
// have been asked to review. See firestore.rules ("SIGNIFICANT EVENTS") for who can read what.

const actorFrom = (user, displayName) => ({ uid: user?.uid || null, displayName: displayName || user?.email || "Unknown", email: user?.email || null });

function Metric({ label, value }) {
  return <div className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-2 text-center"><p className="text-lg font-black">{value}</p><p className="text-[10px] uppercase text-[var(--medtrak-muted)]">{label}</p></div>;
}

function ActionsTab({ actions, uid, isTeam, actor }) {
  const [filter, setFilter] = useState("open");
  const [error, setError] = useState("");
  const rows = actions.filter((a) => (filter === "all" ? true : filter === "mine" ? a.ownerUid === uid && a.status !== ACTION_STATUSES.done : filter === "done" ? a.status === ACTION_STATUSES.done : a.status !== ACTION_STATUSES.done));
  const toggle = async (a, done) => { try { setError(""); await setActionDone(a, done, "", actor); } catch (err) { setError(err?.message || "Could not update."); } };
  return (
    <div className="space-y-2">
      <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${FIELD} mt-0`} aria-label="Filter actions">
        <option value="open">Open</option><option value="mine">Mine</option><option value="done">Done</option><option value="all">All</option>
      </select>
      <ErrorText>{error}</ErrorText>
      {rows.length === 0 && <p className="rounded-xl border border-dashed border-[var(--medtrak-border)] p-6 text-center text-sm text-[var(--medtrak-muted)]">No actions here.</p>}
      {rows.map((a) => {
        const tone = actionTone(a);
        return (
          <div key={a.id} className={`${CARD} flex items-start gap-3`}>
            <input type="checkbox" className="mt-1 h-4 w-4" checked={a.status === ACTION_STATUSES.done} disabled={!(isTeam || a.ownerUid === uid)} onChange={(e) => toggle(a, e.target.checked)} aria-label={`Mark done: ${a.title}`} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${a.status === ACTION_STATUSES.done ? "line-through opacity-60" : ""}`}>{a.title}</p>
              <p className="text-xs text-[var(--medtrak-muted)]">{a.seReference ? `${a.seReference} · ` : ""}{a.ownerName || "Unassigned"}{a.dueDate ? ` · due ${formatDate(a.dueDate)}` : ""}</p>
            </div>
            <Pill tone={tone.id === "overdue" ? "bad" : tone.id === "soon" ? "warn" : tone.id === "done" ? "good" : "plain"}>{tone.label}</Pill>
          </div>
        );
      })}
    </div>
  );
}

function SettingsTab({ settings, staff, actor }) {
  const known = useMemo(() => [...new Set([...Object.keys(ROLE_TEMPLATES), ...staff.map((s) => s.role)].filter(Boolean))].sort(), [staff]);
  const [roles, setRoles] = useState(settings.reviewerRoles || []);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setRoles(settings.reviewerRoles || []); }, [settings.reviewerRoles]);
  const save = async () => { try { setError(""); await saveReviewerRoles(roles, actor); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch (err) { setError(err?.message || "Could not save."); } };
  return (
    <div className={CARD}>
      <p className="font-bold">Who usually reviews</p>
      <p className="mt-1 text-sm text-[var(--medtrak-muted)]">When you ask for reviews on an event, people in these roles are ticked for you. You can always add or remove people for a particular event.</p>
      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {known.map((role) => (
          <label key={role} className="flex items-center gap-3 rounded-xl border border-[var(--medtrak-border)] px-3 py-2.5 text-sm font-semibold">
            <input type="checkbox" className="h-4 w-4" checked={roles.includes(role)} onChange={(e) => setRoles(e.target.checked ? [...roles, role] : roles.filter((r) => r !== role))} /> {role}
          </label>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      <button type="button" onClick={save} className={`${PRIMARY} mt-3`}>{saved ? "Saved" : "Save"}</button>
    </div>
  );
}

export default function SignificantEventsView({ variant = "desktop", onBack }) {
  const { user, displayName, can } = useAuth();
  const actor = useMemo(() => actorFrom(user, displayName), [user, displayName]);
  const uid = user?.uid || null;
  const isTeam = can("governance.seTeam");
  const seesAll = isTeam || can("governance.partnerAccess");
  const [searchParams, setSearchParams] = useSearchParams();

  const [events, setEvents] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [actions, setActions] = useState([]);
  const [myReviews, setMyReviews] = useState([]);
  const [settings, setSettings] = useState({});
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("events");
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(searchParams.get("open") || "");
  const [reporting, setReporting] = useState(false);

  useEffect(() => subscribeEvents({ seesAll, uid }, setEvents, (err) => { console.error(err); setError("Couldn't load significant events."); }), [seesAll, uid]);
  useEffect(() => subscribeMeetings({ seesAll, uid }, setMeetings, console.error), [seesAll, uid]);
  useEffect(() => subscribeActions({ seesAll, uid }, setActions, console.error), [seesAll, uid]);
  useEffect(() => subscribeMyReviews(uid, setMyReviews, console.error), [uid]);
  useEffect(() => subscribeSeSettings(setSettings), []);
  useEffect(() => {
    if (!isTeam) return;
    listStaffDirectory().then(setStaff).catch((err) => console.error("Could not load the staff list", err));
  }, [isTeam]);

  const waitingReviewIds = useMemo(() => new Set(myReviews.filter((r) => r.status === REVIEW_STATUSES.requested).map((r) => r.seId)), [myReviews]);
  const metrics = useMemo(() => seMetrics(events, actions), [events, actions]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((e) => {
      if (term && ![e.reference, e.title, e.category, e.locationName].some((v) => String(v || "").toLowerCase().includes(term))) return false;
      if (filter === "all") return true;
      if (filter === "closed") return e.status === SE_STATUSES.closed;
      if (filter === "mine") return e.reportedByUid === uid;
      if (filter === "review") return waitingReviewIds.has(e.id);
      if (filter === "triage") return e.status === SE_STATUSES.reported;
      return e.status !== SE_STATUSES.closed;
    });
  }, [events, filter, search, uid, waitingReviewIds]);
  const selected = events.find((e) => e.id === openId) || null;

  const closeDetail = () => { setOpenId(""); if (searchParams.get("open")) { searchParams.delete("open"); setSearchParams(searchParams, { replace: true }); } };
  const tabs = [["events", "Events"], ...(seesAll || meetings.length ? [["meetings", "Meetings"]] : []), ...(seesAll || actions.length ? [["actions", "Actions"]] : []), ...(isTeam ? [["settings", "Settings"]] : [])];
  const mobile = variant === "mobile";

  return (
    <div className={mobile ? "pvx-mobile-stack" : "space-y-4"}>
      <section className={mobile ? "pvx-mobile-card" : "rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4"}>
        <div className="flex items-center justify-between gap-3">
          {mobile && onBack && <button type="button" onClick={onBack} className="grid h-10 w-10 place-items-center rounded-2xl border border-[var(--medtrak-border)]" aria-label="Back"><ChevronLeft className="h-5 w-5" /></button>}
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Governance</p>
            <h1 className={mobile ? "pvx-mobile-title" : "text-2xl font-bold"}>Significant events</h1>
          </div>
          <button type="button" onClick={() => setReporting(true)} className={`${PRIMARY} inline-flex items-center gap-1.5`}><Plus className="h-4 w-4" /> Report</button>
        </div>
        {seesAll && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Open" value={metrics.open} /><Metric label="To triage" value={metrics.toTriage} /><Metric label="Awaiting meeting" value={metrics.awaitingMeeting} /><Metric label="Overdue actions" value={metrics.overdueActions} />
          </div>
        )}
        {waitingReviewIds.size > 0 && <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm font-semibold text-amber-700">You've been asked to review {waitingReviewIds.size} event{waitingReviewIds.size === 1 ? "" : "s"}.</p>}
        {tabs.length > 1 && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto" role="tablist">
            {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-bold ${tab === id ? "border-[var(--medtrak-accent)] bg-[var(--medtrak-accent)] text-white" : "border-[var(--medtrak-border)]"}`}>{label}</button>)}
          </div>
        )}
      </section>

      <ErrorText>{error}</ErrorText>

      {tab === "events" && (
        <>
          <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reference, title, place" className={`${FIELD} mt-0`} />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${FIELD} mt-0`} aria-label="Filter events">
              <option value="open">Open</option>
              {isTeam && <option value="triage">To triage</option>}
              {waitingReviewIds.size > 0 && <option value="review">Needs my review</option>}
              <option value="mine">Reported by me</option>
              <option value="closed">Closed</option>
              <option value="all">All</option>
            </select>
          </div>
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--medtrak-border)] p-6 text-center text-sm text-[var(--medtrak-muted)]">{events.length === 0 ? "Nothing reported yet. If something happened, or nearly happened, that we could learn from, press Report." : "No matching events."}</p>
            ) : filtered.map((event) => (
              <button key={event.id} type="button" onClick={() => setOpenId(event.id)} className={`${CARD} w-full text-left`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="font-bold">{event.reference}</p><p className="mt-0.5 truncate text-sm">{event.title}</p></div>
                  <HarmPill harm={event.harm} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StagePill status={event.status} />
                  <Pill>{friendly(event.category)}</Pill>
                  {waitingReviewIds.has(event.id) && <Pill tone="warn">Your review needed</Pill>}
                  <span className="text-[10px] text-[var(--medtrak-muted)]">{formatDate(event.eventDate)}{event.locationName ? ` · ${event.locationName}` : ""}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      {tab === "meetings" && <SeMeetings meetings={meetings} events={events} actions={actions} staff={staff} isTeam={isTeam} actor={actor} />}
      {tab === "actions" && <ActionsTab actions={actions} uid={uid} isTeam={isTeam} actor={actor} />}
      {tab === "settings" && isTeam && <SettingsTab settings={settings} staff={staff} actor={actor} />}

      {selected && <SeDetail event={selected} actor={actor} isTeam={isTeam} seesAll={seesAll} staff={staff} settings={settings} meetings={meetings} actions={actions} onClose={closeDetail} />}
      {reporting && <SeReportForm actor={actor} onClose={() => setReporting(false)} />}
    </div>
  );
}
