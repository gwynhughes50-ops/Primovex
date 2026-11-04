import { useEffect, useMemo, useRef, useState } from "react";
import { Printer, QrCode, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import MobileBarcodeScanner from "@/components/ui/MobileBarcodeScanner";
import { printHtmlDocument } from "@/modules/governance/services/concernPrint";
import { listStaffDirectory } from "@/services/staffDirectoryService";
import { STATUS, dayKey, holderText, isLive, isOnLoan, loanState, parseLaptopLink, updateState } from "@/modules/laptops/laptops";
import { addLaptops, subscribeLaptops } from "@/modules/laptops/laptopService";
import LaptopActions, { Chips } from "./LaptopActions";
import LaptopImportPanel from "./LaptopImportPanel";
import { buildLabelsHtml } from "./laptopLabels";

// The laptop register: every laptop, who has it, whether it is on loan or due an update, and the IT team's actions on each. For the desktop and the phone. People who may only read the register
// see it without the actions; the IT team (itAssets.manage) can add laptops, paste a list, print QR labels and record loans, returns and updates.
const FIELD = "rounded-lg border border-[var(--medtrak-border)] bg-transparent px-2 py-2 text-sm text-[var(--medtrak-text)] [&>option]:text-slate-900";
const FILTERS = [["live", "Not decommissioned"], ["in_use", "In use"], ["spare", "Spare"], ["on_loan", "On loan"], ["due", "Needs attention"], ["decommissioned", "Decommissioned"], ["all", "All"]];

export default function LaptopRegisterPanel({ scan = false, initialId = "" }) {
  const { user, displayName, can } = useAuth();
  const canManage = can("itAssets.manage");
  const actor = useMemo(() => ({ uid: user?.uid || "", displayName: displayName || user?.email || "" }), [user, displayName]);
  const [laptops, setLaptops] = useState([]);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("live");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(initialId);
  const [panel, setPanel] = useState(""); // "" | "import" | "add"
  const [add, setAdd] = useState({ assetCode: "", status: "spare", holder: null });
  const [addProblem, setAddProblem] = useState("");
  const [message, setMessage] = useState("");
  const cards = useRef({});
  const today = dayKey();

  useEffect(() => subscribeLaptops(setLaptops, (e) => setError(e?.code || e?.message || "unknown")), []);
  useEffect(() => { if (canManage) listStaffDirectory().then((rows) => setStaff(rows.map((r) => ({ uid: r.id, displayName: r.label })))).catch(() => setStaff([])); }, [canManage]);
  useEffect(() => { if (initialId) setOpenId(initialId); }, [initialId]);
  useEffect(() => { if (openId && cards.current[openId]) cards.current[openId].scrollIntoView?.({ block: "center" }); }, [openId, laptops.length]);

  const needsAttention = (l) => isLive(l) && (updateState(l, today).state !== "none" && updateState(l, today).state !== "ok" || loanState(l, today).state === "overdue" || loanState(l, today).state === "soon");
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return laptops.filter((l) => {
      if (term && ![l.assetCode, l.currentUserName, l.loan?.borrowerName].some((v) => String(v || "").toLowerCase().includes(term))) return false;
      if (filter === "all") return true;
      if (filter === "live") return isLive(l);
      if (filter === "due") return needsAttention(l);
      return l.status === filter;
    });
  }, [laptops, search, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (f) => laptops.filter((l) => (f === "live" ? isLive(l) : f === "due" ? needsAttention(l) : f === "all" ? true : l.status === f)).length;

  function found(raw) {
    const link = parseLaptopLink(raw);
    const code = String(raw || "").trim().toUpperCase();
    const hit = laptops.find((l) => (link && l.id === link.id) || l.assetCode === code);
    if (!hit) { setMessage(`No laptop matches "${String(raw).slice(0, 60)}".`); return; }
    setFilter("all"); setSearch(""); setOpenId(hit.id); setMessage("");
  }
  async function addOne() {
    setAddProblem("");
    try {
      if (laptops.some((l) => l.assetCode === add.assetCode.trim().toUpperCase())) throw new Error("That asset code is already in the register.");
      await addLaptops([{ assetCode: add.assetCode, status: add.status, currentUser: add.status === "in_use" ? add.holder : null }], actor);
      setAdd({ assetCode: "", status: "spare", holder: null }); setPanel(""); setMessage("Laptop added.");
    } catch (e) { setAddProblem(e?.message || "That could not be saved."); }
  }
  async function printLabels() {
    const list = shown.filter(isLive);
    if (!list.length) { setMessage("There are no laptops to print labels for."); return; }
    await printHtmlDocument(buildLabelsHtml(list));
  }

  return (
    <div className="space-y-3 text-[var(--medtrak-text)]">
      {error && <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm font-semibold text-rose-700">The laptop register could not be read ({error}). Tell whoever looks after Primovex, with that word.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--medtrak-muted)]" aria-hidden="true" /><input className={`${FIELD} w-full pl-8`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a laptop or a person" aria-label="Find a laptop or a person" /></label>
        {scan && <><button type="button" data-laptop-scan className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--medtrak-accent)] px-4 text-sm font-bold text-white"><QrCode className="h-4 w-4" aria-hidden="true" /> Scan</button><MobileBarcodeScanner onScan={found} triggerAttribute="data-laptop-scan" title="Scan a laptop label" helper="Point the camera at the QR label on the laptop. You can also type its asset code." /></>}
      </div>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Show">
        {FILTERS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${filter === key ? "border-[var(--medtrak-accent)] bg-[var(--medtrak-accent)] text-white" : "border-[var(--medtrak-border)]"}`}>{label} ({count(key)})</button>)}
      </div>
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="min-h-10 rounded-xl border border-[var(--medtrak-border)] px-3 text-sm font-semibold" onClick={() => setPanel(panel === "add" ? "" : "add")}>Add a laptop</button>
          <button type="button" className="min-h-10 rounded-xl border border-[var(--medtrak-border)] px-3 text-sm font-semibold" onClick={() => setPanel(panel === "import" ? "" : "import")}>Add from a list</button>
          <button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--medtrak-border)] px-3 text-sm font-semibold" onClick={printLabels}><Printer className="h-4 w-4" aria-hidden="true" /> Print QR labels ({shown.filter(isLive).length})</button>
        </div>
      )}
      {canManage && panel === "add" && (
        <section className="space-y-2 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3" aria-label="Add a laptop">
          <label className="block text-xs font-bold">Asset code<input className={`${FIELD} mt-1 w-full font-normal`} value={add.assetCode} onChange={(e) => { setAdd({ ...add, assetCode: e.target.value }); setAddProblem(""); }} placeholder="W91003MLAP10026" /></label>
          <label className="block text-xs font-bold">Status<select className={`${FIELD} mt-1 w-full font-normal`} value={add.status} onChange={(e) => setAdd({ ...add, status: e.target.value, holder: null })}>{Object.entries(STATUS).filter(([k]) => k !== "on_loan").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {add.status === "in_use" && <label className="block text-xs font-bold">Who has it<select className={`${FIELD} mt-1 w-full font-normal`} value={add.holder?.uid || ""} onChange={(e) => { const s = staff.find((x) => x.uid === e.target.value); setAdd({ ...add, holder: s ? { uid: s.uid, name: s.displayName } : null }); }}><option value="">Choose from the staff list</option>{staff.map((s) => <option key={s.uid} value={s.uid}>{s.displayName}</option>)}</select></label>}
          {addProblem && <p className="text-sm font-semibold text-rose-600" role="alert">{addProblem}</p>}
          <button type="button" className="min-h-10 rounded-xl bg-[var(--medtrak-accent)] px-4 text-sm font-bold text-white" onClick={addOne}>Add it</button>
        </section>
      )}
      {canManage && panel === "import" && <LaptopImportPanel staff={staff} existing={laptops} actor={actor} onClose={() => setPanel("")} onCreated={(n) => setMessage(`${n} laptop${n === 1 ? "" : "s"} added.`)} />}
      {message && <p className="text-sm font-semibold" role="status">{message}</p>}

      {shown.length === 0 ? <p className="text-sm text-[var(--medtrak-muted)]">{laptops.length === 0 ? (canManage ? "No laptops yet. Add one, or paste your list." : "No laptops yet.") : "No laptop matches."}</p> : (
        <ul className="space-y-2">
          {shown.map((l) => (
            <li key={l.id} ref={(el) => { cards.current[l.id] = el; }} className={`rounded-2xl border bg-[var(--medtrak-panel)] p-3 ${openId === l.id ? "border-[var(--medtrak-accent)]" : "border-[var(--medtrak-border)]"}`}>
              <button type="button" className="block w-full text-left" onClick={() => setOpenId(openId === l.id ? "" : l.id)} aria-expanded={openId === l.id}>
                <span className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="font-bold">{l.assetCode}</span><span className="text-sm text-[var(--medtrak-muted)]">{isOnLoan(l) || l.status === "decommissioned" ? "" : holderText(l)}</span></span>
                <Chips laptop={l} today={today} />
              </button>
              {openId === l.id && <LaptopActions laptop={l} staff={staff} actor={actor} canManage={canManage} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
