import { AlertTriangle, ArrowLeft, ArrowRight, Building2, CheckCircle2, Clock3, Package, Search, ShieldCheck, UserRound, FileWarning, ClipboardCheck, MessageSquarePlus, UsersRound, Nfc } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import useStock from "@/hooks/useStock";
import { useAuth } from "@/contexts/AuthContext";
import useOperationsSummary from "@/operations/hooks/useOperationsSummary";
import usePracticeManagerOverview from "./usePracticeManagerOverview";
import { getOperationalEscalations } from "@/operations/escalations/operationalEscalationService";
import ReleaseUpdateCard from "@/release/ReleaseUpdateCard";

const FACILITY_KEY = "primovex.facilities.v2";
function facilitiesData() { try { return JSON.parse(localStorage.getItem(FACILITY_KEY) || "{}"); } catch { return {}; } }
function Card({ children, className = "" }) { return <div className={`rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 ${className}`}>{children}</div>; }

export default function MobileHome({ mode="home", onNavigate, onScan, onSearch, onSelectItem, onRaiseIssue, onScanNfc }) {
  const { displayName, role, capabilities=[] } = useAuth();
  const { allItems=[], loading } = useStock({ includeArchived:false });
  const low = useMemo(() => allItems.filter(i => Number(i.current_stock||0) <= Number(i.min_stock||0)), [allItems]);
  const context = useMemo(() => ({ inventory:{ totalItems:allItems.length, lowStockItems:low.length, expiringSoon:0, loading }, temperature:{ loading:false, hasReading:false }, recentMoves:[] }), [allItems.length, low.length, loading]);
  const summary = useOperationsSummary(context);
  const governance = usePracticeManagerOverview();
  const facility = facilitiesData();
  const rooms = facility.rooms || [];
  const maintenance = (facility.maintenance || facility.maintenanceTasks || []).filter(x => !["complete","completed","closed"].includes(String(x.status||"").toLowerCase()));
  const [escalations, setEscalations] = useState(() => getOperationalEscalations());
  useEffect(() => {
    const refresh = () => setEscalations(getOperationalEscalations());
    window.addEventListener("primovex:operational-escalations-changed", refresh);
    return () => window.removeEventListener("primovex:operational-escalations-changed", refresh);
  }, []);
  const openEscalations = escalations.filter(x => x.status !== "resolved");
  const first = String(displayName||"").split(" ")[0] || "there";

  if (mode === "stock") return (
    <Page title="Stock" subtitle={`${allItems.length} active items`}>
      <div className="grid grid-cols-2 gap-3"><Quick icon={Package} label="Scan item" onClick={onScan}/><Quick icon={Search} label="Search" onClick={onSearch}/></div>
      <Section title="Needs attention">
        {low.length ? low.slice(0,8).map(item => <button key={item.id} onClick={() => onSelectItem?.(item)} className="flex w-full items-center justify-between border-b border-[var(--medtrak-border)] py-3 text-left last:border-0"><span><b>{item.name}</b><small className="block text-[var(--medtrak-muted)]">Minimum {item.min_stock||0}</small></span><b className="text-red-600">{item.current_stock||0}</b></button>) : <Empty text="Stock levels look healthy" />}
      </Section>
    </Page>
  );

  if (mode === "facilities") return (
    <Page title="Facilities" subtitle={`${rooms.length} rooms recorded`}>
      <div className="grid grid-cols-2 gap-3"><Stat label="Rooms" value={rooms.length}/><Stat label="Open jobs" value={maintenance.length} warn={maintenance.length>0}/></div>
      <Quick icon={Nfc} label="Scan room or asset tag" onClick={onScanNfc}/>
      <Section title="Room status">{rooms.length ? rooms.slice(0,8).map(room => <div key={room.id||room.roomId||room.name} className="flex items-center justify-between border-b border-[var(--medtrak-border)] py-3 last:border-0"><span className="font-semibold">{room.name}</span><span className="text-sm text-[var(--medtrak-muted)]">{room.status||"Ready"}</span></div>) : <Empty text="No rooms have been added yet" />}</Section>
    </Page>
  );


  if (mode === "concerns") {
    const reviewItems = [...governance.buckets.executive, ...governance.buckets.management];
    return (
      <Page title="Concerns review" subtitle="Management review and executive oversight">
        <button
          type="button"
          onClick={() => onNavigate?.("home")}
          className="inline-flex items-center gap-2 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 py-3 text-sm font-bold"
        >
          <ArrowLeft className="h-4 w-4" /> Back to overview
        </button>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Management review" value={governance.buckets.management.length} warn={governance.buckets.management.length > 0} />
          <Stat label="Executive oversight" value={governance.buckets.executive.length} warn={governance.buckets.executive.length > 0} />
        </div>

        <Section title="Requires Practice Manager attention">
          {governance.loading ? (
            <p className="py-3 text-sm text-[var(--medtrak-muted)]">Loading concerns…</p>
          ) : governance.error ? (
            <p className="py-3 text-sm text-red-600">{governance.error}</p>
          ) : reviewItems.length ? (
            reviewItems.map((concern) => (
              <ConcernReviewRow
                key={concern.id || concern.reference}
                concern={concern}
                level={governance.buckets.executive.includes(concern) ? "Executive oversight" : "Management review"}
              />
            ))
          ) : (
            <Empty text="No concerns currently require Practice Manager review" />
          )}
        </Section>

        <Section title="Operational handling">
          <div className="flex items-center gap-3 py-2">
            <UsersRound className="h-5 w-5 text-[var(--medtrak-accent)]" />
            <div>
              <b>{governance.buckets.operational.length} routine concern{governance.buckets.operational.length === 1 ? "" : "s"}</b>
              <p className="text-sm text-[var(--medtrak-muted)]">Logged and progressed through the existing Welsh concerns workflow by the appropriate team or supervisor.</p>
            </div>
          </div>
        </Section>
      </Page>
    );
  }

  if (mode === "me") return (
    <Page title="Me" subtitle={role||"Primovex user"}>
      <Card><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--medtrak-accent)_12%,var(--medtrak-panel))]"><UserRound /></div><div><b>{displayName}</b><p className="text-sm text-[var(--medtrak-muted)]">{capabilities.length} capabilities</p></div></div></Card>
      <Section title="Security"><div className="flex items-center gap-3 py-2"><ShieldCheck className="text-[var(--medtrak-accent)]"/><div><b>Mobile access protected</b><p className="text-sm text-[var(--medtrak-muted)]">Biometric, PIN and account password fallback</p></div></div></Section>
      <ReleaseUpdateCard />
    </Page>
  );

  const priorities = summary?.priorities || [];
  const managementCount = governance.buckets.management.length;
  const executiveCount = governance.buckets.executive.length;
  const operationalCount = governance.buckets.operational.length;
  const attentionCount = priorities.length + managementCount + executiveCount + openEscalations.length;
  const statusCopy = executiveCount
    ? "Governance requires executive oversight today."
    : managementCount
      ? "Practice stable. Management review is required."
      : priorities.length
        ? "Practice stable, with operational work due."
        : "Practice operating normally.";

  const domains = [
    { label:"Governance", icon:FileWarning, value: executiveCount + managementCount, helper: executiveCount ? `${executiveCount} executive oversight` : `${operationalCount} operational`, tone: executiveCount ? "critical" : managementCount ? "warning" : "healthy" },
    { label:"Inventory", icon:Package, value:low.length, helper: low.length ? "below minimum" : "stable", tone:low.length ? "warning" : "healthy", action:()=>onNavigate?.("stock") },
    { label:"Facilities", icon:Building2, value:maintenance.length, helper: maintenance.length ? "open issues" : "operating normally", tone:maintenance.length ? "warning" : "healthy", action:()=>onNavigate?.("facilities") },
    { label:"Escalations", icon:UsersRound, value:openEscalations.length, helper: openEscalations.length ? "awaiting team action" : "none open", tone:openEscalations.length ? "info" : "healthy" },
  ];

  return (
    <Page title={`Good morning, ${first}`} subtitle="Practice Manager overview">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4"><div><p className="text-sm text-[var(--medtrak-muted)]">Practice readiness</p><p className="mt-1 text-4xl font-bold">{Number.isFinite(summary?.readiness?.overall) ? summary.readiness.overall : "—"}%</p></div>{attentionCount ? <AlertTriangle className="text-amber-500"/> : <CheckCircle2 className="text-emerald-600"/>}</div>
        <p className="mt-3 font-semibold">{statusCopy}</p>
        <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{attentionCount ? `${attentionCount} item${attentionCount===1?"":"s"} need management visibility.` : "No management intervention is currently required."}</p>
      </Card>

      <Section title="Operational health">
        <div className="grid grid-cols-2 gap-3">
          {domains.map(({label,icon:Icon,value,helper,tone,action}) => <button key={label} onClick={action} className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3 text-left">
            <div className="flex items-center justify-between"><Icon className="h-5 w-5 text-[var(--medtrak-accent)]"/><ToneDot tone={tone}/></div>
            <p className="mt-3 text-sm font-bold">{label}</p><p className="text-2xl font-bold">{value}</p><p className="text-xs text-[var(--medtrak-muted)]">{helper}</p>
          </button>)}
        </div>
      </Section>

      <Section title="Management attention">
        {executiveCount > 0 && <AttentionRow icon={FileWarning} title={`${executiveCount} concern${executiveCount===1?"":"s"} need executive oversight`} detail="Practice Manager involvement or external liaison may be required" />}
        {managementCount > 0 && <AttentionRow icon={ClipboardCheck} title={`${managementCount} concern${managementCount===1?"":"s"} await management review`} detail="Routine concerns remain with operational leads" />}
        {priorities.slice(0,3).map((p,i)=><AttentionRow key={p.id||i} icon={AlertTriangle} title={p.title||p.label||"Needs review"} detail={p.detail||p.description||"Open to review"} onClick={() => onNavigate?.(p.moduleId === "facilities" ? "facilities" : "stock")} />)}
        {!executiveCount && !managementCount && !priorities.length && <Empty text="No leadership intervention is currently required" />}
      </Section>

      <div className="grid grid-cols-2 gap-3">
        <Quick icon={Nfc} label="Scan NFC tag" onClick={onScanNfc}/>
        <Quick icon={MessageSquarePlus} label="Raise issue" onClick={() => onRaiseIssue?.({})}/>
        <Quick icon={FileWarning} label="Review concerns" onClick={() => onNavigate?.("concerns")}/>
        <Quick icon={Building2} label="Open Facilities" onClick={() => onNavigate?.("facilities")}/>
      </div>

      <Section title="Recent operational changes"><div className="flex items-center gap-3 py-2"><Clock3 className="h-5 w-5 text-[var(--medtrak-accent)]"/><div><b>{openEscalations.length ? `${openEscalations.length} issue${openEscalations.length===1?"":"s"} routed to teams` : "Operations current"}</b><p className="text-sm text-[var(--medtrak-muted)]">Use Primovex AI for the live practice brief</p></div></div></Section>
    </Page>
  );
}

function AttentionRow({icon:Icon,title,detail,onClick}) { const Wrapper=onClick?"button":"div"; return <Wrapper onClick={onClick} className="flex w-full items-center gap-3 border-b border-[var(--medtrak-border)] py-3 text-left last:border-0"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--medtrak-accent)_10%,var(--medtrak-panel))]"><Icon className="h-4 w-4"/></span><span className="min-w-0 flex-1"><b className="block">{title}</b><small className="text-[var(--medtrak-muted)]">{detail}</small></span>{onClick&&<ArrowRight className="h-4 w-4 text-[var(--medtrak-muted)]"/>}</Wrapper> }
function ConcernReviewRow({ concern, level }) {
  const isExecutive = level === "Executive oversight";
  const reference = concern.reference || concern.externalReference || "Concern";
  const summary = concern.summary || concern.category || "Open concern requiring review";
  const owner = concern.ownerName || concern.namedContactName || (isExecutive ? "Practice Manager" : "Concerns Team");
  return (
    <div className="border-b border-[var(--medtrak-border)] py-3 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">{reference}</p>
          <p className="mt-1 line-clamp-2 text-sm text-[var(--medtrak-muted)]">{summary}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${isExecutive ? "bg-red-500/10 text-red-700" : "bg-amber-500/10 text-amber-700"}`}>{level}</span>
      </div>
      <p className="mt-2 text-xs text-[var(--medtrak-muted)]">Current owner: {owner}</p>
    </div>
  );
}

function ToneDot({tone}) { const cls={critical:"bg-red-500",warning:"bg-amber-500",info:"bg-sky-500",healthy:"bg-emerald-500"}[tone]||"bg-slate-400"; return <span className={`h-2.5 w-2.5 rounded-full ${cls}`}/> }
function Page({title,subtitle,children}) { return <main className="min-h-screen px-4 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))] text-[var(--medtrak-text)]"><header className="pr-12"><h1 className="text-2xl font-bold">{title}</h1><p className="mt-1 text-sm text-[var(--medtrak-muted)]">{subtitle}</p></header><div className="mt-5 space-y-4">{children}</div></main> }
function Section({title,children}) { return <Card><h2 className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-[var(--medtrak-muted)]">{title}</h2>{children}</Card> }
function Quick({icon:Icon,label,onClick}) { return <button onClick={onClick} className="flex min-h-20 items-center gap-3 rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 text-left font-bold"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--medtrak-accent)_12%,var(--medtrak-panel))] text-[var(--medtrak-accent)]"><Icon className="h-5 w-5"/></span>{label}</button> }
function Stat({label,value,warn}) { return <Card><p className="text-xs text-[var(--medtrak-muted)]">{label}</p><p className={`mt-1 text-2xl font-bold ${warn?"text-amber-600":""}`}>{value}</p></Card> }
function Empty({text}) { return <div className="flex items-center gap-2 py-3 text-sm text-[var(--medtrak-muted)]"><CheckCircle2 className="h-4 w-4 text-emerald-600"/>{text}</div> }
