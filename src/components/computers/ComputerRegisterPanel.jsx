import { useEffect, useMemo, useRef, useState } from "react";
import { Printer, QrCode, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import MobileBarcodeScanner from "@/components/ui/MobileBarcodeScanner";
import { printHtmlDocument } from "@/modules/governance/services/concernPrint";
import { listStaffDirectory } from "@/services/staffDirectoryService";
import { listActiveSites } from "@/lib/checklistsFirestore";
import { filterComputers, isLive, needsCheck, parseComputerLink, summariseComputers, usualSoftware, SOFTWARE } from "@/modules/computers/computers";
import { dayKey } from "@/modules/laptops/laptops";
import { addComputers, subscribeComputers } from "@/modules/computers/computerService";
import ComputerActions, { Chips } from "./ComputerActions";
import ComputerImportPanel from "./ComputerImportPanel";
import { DEFAULT_SHEET, SHEETS, buildComputerLabelsHtml, perSheet } from "./computerLabels";

// The PC register: every PC, where it is, what is installed, and when it was last checked. For the desktop and the phone. People who may only read the register see it without the actions; the IT team
// (itAssets.manage) can add PCs, add them from the practice's spreadsheet, print QR labels, and record a check when they scan a PC's label as they go round the building.
const FIELD = "rounded-lg border border-[var(--medtrak-border)] bg-transparent px-2 py-2 text-sm text-[var(--medtrak-text)] [&>option]:text-slate-900";
// the sticker sheet and the nudge are the laptop labels' own settings: one printer, one setting
const SETTINGS_KEY = "primovex.laptopLabels";
function loadLabelSettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}");
    return { sheet: SHEETS[saved.sheet] ? saved.sheet : DEFAULT_SHEET, nudgeX: Number(saved.nudgeX) || 0, nudgeY: Number(saved.nudgeY) || 0 };
  } catch { return { sheet: DEFAULT_SHEET, nudgeX: 0, nudgeY: 0 }; }
}
const FILTERS = [["live", "Not decommissioned"], ["due", "Needs a check"], ["in_use", "In use"], ["spare", "Spare"], ["decommissioned", "Decommissioned"], ["all", "All"]];

export default function ComputerRegisterPanel({ scan = false, initialId = "" }) {
  const { user, displayName, can } = useAuth();
  const canManage = can("itAssets.manage");
  const actor = useMemo(() => ({ uid: user?.uid || "", displayName: displayName || user?.email || "" }), [user, displayName]);
  const [computers, setComputers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [sites, setSites] = useState([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("live");
  const [search, setSearch] = useState("");
  const [siteId, setSiteId] = useState("");
  const [department, setDepartment] = useState("");
  const [software, setSoftware] = useState(""); // "" | "usual" | "missing:key" | "has:key"
  const [openId, setOpenId] = useState(initialId);
  const [notice, setNotice] = useState("");
  const [panel, setPanel] = useState(""); // "" | "import" | "add"
  const [add, setAdd] = useState({ assetNumber: "", siteId: "", department: "", label: "" });
  const [addProblem, setAddProblem] = useState("");
  const [message, setMessage] = useState("");
  const [labels] = useState(loadLabelSettings);
  const cards = useRef({});
  const today = dayKey();

  useEffect(() => subscribeComputers(setComputers, (e) => setError(e?.code || e?.message || "unknown")), []);
  useEffect(() => { listActiveSites().then(setSites).catch(() => setSites([])); }, []);
  useEffect(() => { if (canManage) listStaffDirectory().then((rows) => setStaff(rows.map((r) => ({ uid: r.id, displayName: r.label })))).catch(() => setStaff([])); }, [canManage]);
  useEffect(() => { if (initialId) { setOpenId(initialId); setFilter("all"); } }, [initialId]);
  useEffect(() => { if (openId && cards.current[openId]) cards.current[openId].scrollIntoView?.({ block: "center" }); }, [openId, computers.length]);

  const usual = useMemo(() => usualSoftware(computers), [computers]);
  const summary = useMemo(() => summariseComputers(computers), [computers]);
  const departments = useMemo(() => [...new Set(computers.map((c) => c.department).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [computers]);
  const shown = useMemo(() => filterComputers(computers, {
    term: search, siteId, department, status: filter, today,
    missing: software === "usual" ? "usual" : software.startsWith("missing:") ? software.slice(8) : "", has: software.startsWith("has:") ? software.slice(4) : "",
  }), [computers, search, siteId, department, filter, software, today]);
  const count = (f) => (f === "all" ? computers.length : filterComputers(computers, { status: f, today }).length);
  const dueCount = computers.filter((c) => needsCheck(c, today)).length;

  function found(raw) {
    const link = parseComputerLink(raw);
    const code = String(raw || "").trim().toUpperCase();
    const hit = computers.find((c) => (link && c.id === link.id) || c.assetNumber === code);
    if (!hit) { setMessage(`No PC matches "${String(raw).slice(0, 60)}".`); return; }
    setFilter("all"); setSearch(""); setSiteId(""); setDepartment(""); setSoftware(""); setOpenId(hit.id); setMessage("");
  }
  async function addOne() {
    setAddProblem("");
    try {
      if (computers.some((c) => c.assetNumber === add.assetNumber.trim().toUpperCase())) throw new Error("That PC number is already in the register.");
      const site = sites.find((s) => s.id === add.siteId);
      await addComputers([{ assetNumber: add.assetNumber, site: site ? { id: site.id, name: site.name } : null, department: add.department, label: add.label, status: "in_use" }], actor);
      setAdd({ assetNumber: "", siteId: add.siteId, department: "", label: "" }); setPanel(""); setMessage("PC added.");
    } catch (e) { setAddProblem(e?.message || "That could not be saved."); }
  }
  async function printLabels(guides = false) {
    const list = shown.filter(isLive);
    if (!list.length) { setMessage("There are no PCs to print labels for."); return; }
    await printHtmlDocument(buildComputerLabelsHtml(guides ? list.slice(0, perSheet(labels.sheet)) : list, { guides, sheet: labels.sheet, nudgeXMm: labels.nudgeX, nudgeYMm: labels.nudgeY }));
  }

  return (
    <div className="space-y-3 text-[var(--medtrak-text)]">
      {error && <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm font-semibold text-rose-700">The PC register could not be read ({error}). Tell whoever looks after Primovex, with that word.</p>}
      {computers.length > 0 && <p className="text-sm text-[var(--medtrak-muted)]">{summary.total} PC{summary.total === 1 ? "" : "s"}: {summary.inUse} in use, {summary.spare} spare{dueCount ? `, ${dueCount} need a check` : ""}{summary.withGaps ? `, ${summary.withGaps} missing something nearly every PC has` : ""}.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--medtrak-muted)]" aria-hidden="true" /><input className={`${FIELD} w-full pl-8`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="PC number, room, person or printer" aria-label="Find a PC" /></label>
        {scan && <><button type="button" data-pc-scan className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--medtrak-accent)] px-4 text-sm font-bold text-white"><QrCode className="h-4 w-4" aria-hidden="true" /> Scan</button><MobileBarcodeScanner onScan={found} triggerAttribute="data-pc-scan" title="Scan a PC label" helper="Point the camera at the QR label on the PC. You can also type its number." /></>}
      </div>
      {notice && <p className="text-sm font-semibold text-emerald-600" role="status">{notice}</p>}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Show">
        {FILTERS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${filter === key ? "border-[var(--medtrak-accent)] bg-[var(--medtrak-accent)] text-white" : "border-[var(--medtrak-border)]"}`}>{label} ({count(key)})</button>)}
      </div>
      <div className="flex flex-wrap gap-2">
        {sites.length > 1 && <select className={FIELD} value={siteId} onChange={(e) => setSiteId(e.target.value)} aria-label="Site"><option value="">All sites</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
        {departments.length > 1 && <select className={FIELD} value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department"><option value="">All departments</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}</select>}
        <select className={FIELD} value={software} onChange={(e) => setSoftware(e.target.value)} aria-label="Software">
          <option value="">Any software</option>
          {usual.length > 0 && <option value="usual">Missing something nearly every PC has</option>}
          <optgroup label="Missing">{SOFTWARE.map((s) => <option key={s.key} value={`missing:${s.key}`}>Missing {s.label}</option>)}</optgroup>
          <optgroup label="Has">{SOFTWARE.map((s) => <option key={s.key} value={`has:${s.key}`}>Has {s.label}</option>)}</optgroup>
        </select>
      </div>
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="min-h-10 rounded-xl border border-[var(--medtrak-border)] px-3 text-sm font-semibold" onClick={() => setPanel(panel === "add" ? "" : "add")}>Add a PC</button>
          <button type="button" className="min-h-10 rounded-xl border border-[var(--medtrak-border)] px-3 text-sm font-semibold" onClick={() => setPanel(panel === "import" ? "" : "import")}>Add from a spreadsheet</button>
          <button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--medtrak-border)] px-3 text-sm font-semibold" onClick={() => printLabels(false)}><Printer className="h-4 w-4" aria-hidden="true" /> Print QR labels{shown.filter(isLive).length !== computers.filter(isLive).length ? ` (${shown.filter(isLive).length} shown)` : ""}</button>
          <button type="button" className="min-h-10 rounded-xl border border-[var(--medtrak-border)] px-3 text-sm font-semibold" onClick={() => printLabels(true)} title="One sheet with each sticker outlined, to print on plain paper first">Trial sheet</button>
        </div>
      )}
      {canManage && <p className="text-xs text-[var(--medtrak-muted)]">Labels print on the same sticker sheet and settings as the laptop labels (IT equipment, Laptops, Label sheet).</p>}
      {canManage && panel === "add" && (
        <section className="space-y-2 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3" aria-label="Add a PC">
          <label className="block text-xs font-bold">PC number<input className={`${FIELD} mt-1 w-full font-normal`} value={add.assetNumber} onChange={(e) => { setAdd({ ...add, assetNumber: e.target.value }); setAddProblem(""); }} placeholder="For example 146" /></label>
          <label className="block text-xs font-bold">Site<select className={`${FIELD} mt-1 w-full font-normal`} value={add.siteId} onChange={(e) => setAdd({ ...add, siteId: e.target.value })}><option value="">Choose the site</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="block text-xs font-bold">Department<input className={`${FIELD} mt-1 w-full font-normal`} list="pc-add-dept" value={add.department} onChange={(e) => setAdd({ ...add, department: e.target.value })} /><datalist id="pc-add-dept">{departments.map((d) => <option key={d} value={d} />)}</datalist></label>
          <label className="block text-xs font-bold">Who or what uses it<input className={`${FIELD} mt-1 w-full font-normal`} value={add.label} onChange={(e) => setAdd({ ...add, label: e.target.value })} placeholder="A room, a desk or a person" /></label>
          {addProblem && <p className="text-sm font-semibold text-rose-600" role="alert">{addProblem}</p>}
          <button type="button" className="min-h-10 rounded-xl bg-[var(--medtrak-accent)] px-4 text-sm font-bold text-white" onClick={addOne}>Add it</button>
        </section>
      )}
      {canManage && panel === "import" && <ComputerImportPanel staff={staff} sites={sites} existing={computers} actor={actor} onClose={() => setPanel("")} onCreated={(n) => setMessage(`${n} PC${n === 1 ? "" : "s"} added.`)} />}
      {message && <p className="text-sm font-semibold" role="status">{message}</p>}

      {shown.length === 0 ? <p className="text-sm text-[var(--medtrak-muted)]">{computers.length === 0 ? (canManage ? "No PCs yet. Add one, or add them from your spreadsheet." : "No PCs yet.") : "No PC matches."}</p> : (
        <ul className="space-y-2">
          {shown.map((c) => (
            <li key={c.id} ref={(el) => { cards.current[c.id] = el; }} className={`rounded-2xl border bg-[var(--medtrak-panel)] p-3 ${openId === c.id ? "border-[var(--medtrak-accent)]" : "border-[var(--medtrak-border)]"}`}>
              <button type="button" className="block w-full text-left" onClick={() => setOpenId(openId === c.id ? "" : c.id)} aria-expanded={openId === c.id}>
                <span className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="font-bold">PC {c.assetNumber}</span><span className="text-sm text-[var(--medtrak-muted)]">{[c.siteName, c.department, c.label].filter(Boolean).join(" · ")}</span></span>
                <Chips computer={c} usual={usual} today={today} />
              </button>
              {openId === c.id && <ComputerActions computer={c} staff={staff} sites={sites} departments={departments} usual={usual} actor={actor} canManage={canManage} onChanged={(message) => setNotice(/deleted\.$/.test(message || "") ? message : "")} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
