import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, X } from "lucide-react";
import { loadClinFlowTeachingFeedback } from "./clinflowDocumentCache";
import { buildScorecard, scorecardCsv } from "./clinflowScorecard";
import { downloadBlob } from "./clinflowZipService";
import { NFW_WRONG_REASONS, canSpotCheck } from "./clinflowNfwf";

const shown = (value) => (value === null || value === undefined ? "No data yet" : `${value}%`);
const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };

// How ClinFlow is doing, from what staff have told it. Read-only; it changes no rule.
export default function Scorecard({ documents, canExport, checkerUid, canCheck, onSpotCheck, onOpenDocument, onClose, onExported }) {
  const [teaching, setTeaching] = useState(null);
  const [problem, setProblem] = useState("");
  const [disagreeing, setDisagreeing] = useState(null);
  const [reason, setReason] = useState("");
  useEffect(() => {
    let live = true;
    loadClinFlowTeachingFeedback().then((items) => { if (live) setTeaching(items); }).catch(() => { if (live) { setTeaching([]); setProblem("The saved corrections on this computer could not be read."); } });
    return () => { live = false; };
  }, [documents]);
  const card = useMemo(() => buildScorecard({ teaching: teaching || [], documents }), [teaching, documents]);
  const waiting = useMemo(() => (documents || []).filter((doc) => doc?.triageReview?.spotCheck?.status === "pending"), [documents]);
  const exportCsv = () => {
    downloadBlob(new Blob([scorecardCsv(card, teaching || [])], { type: "text/csv;charset=utf-8" }), `ClinFlow-scorecard-${new Date().toISOString().slice(0, 10)}.csv`);
    onExported?.(card);
  };
  return (
    <div className="cf-modal cf-scorecard" role="dialog" aria-modal="true" aria-label="ClinFlow scorecard"><div>
      <header className="cf-scorecard-head"><h2><BarChart3 size={18} /> ClinFlow scorecard</h2><button type="button" className="cf-scorecard-close" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
      <p className="cf-modal-guidance">How often ClinFlow was right, from the corrections and ticks staff have recorded on this computer. It is evidence for whoever reviews the rules: it changes no rule by itself.</p>
      {problem && <p className="cf-code-error" role="alert">{problem}</p>}
      {teaching === null ? <p className="cf-muted">Opening…</p> : (
        <>
          <div className="cf-score-tiles">
            <section className="cf-score-tile cf-score-tile--blue"><small>Triage right first time</small><b>{shown(card.triage.rightPct)}</b><span>{card.triage.total} confirmed · {card.triage.corrected} corrected</span></section>
            <section className="cf-score-tile cf-score-tile--purple"><small>Codes accepted as suggested</small><b>{shown(card.coding.rightPct)}</b><span>{card.coding.accepted} accepted · {card.coding.removed} removed · {card.coding.added} added by the coder</span></section>
            <section className="cf-score-tile cf-score-tile--teal"><small>Destination changed</small><b>{card.triage.total ? `${card.triage.destinationChanged}` : "No data yet"}</b><span>of {card.triage.total} confirmed</span></section>
          </div>
          <h3 className="cf-score-title">Letters ClinFlow said need no action</h3>
          <div className="cf-score-tiles">
            <section className="cf-score-tile cf-score-tile--teal"><small>Confirmed right by staff</small><b>{shown(card.nfw.rightPct)}</b><span>{card.nfw.right} right · {card.nfw.wrong} said to need action</span></section>
            <section className="cf-score-tile cf-score-tile--purple"><small>Clinician spot-checks agreeing</small><b>{shown(card.nfw.checkedPct)}</b><span>{card.nfw.checkedAgreed} agreed · {card.nfw.checkedDisagreed} disagreed</span></section>
            <section className="cf-score-tile cf-score-tile--blue"><small>Waiting for a clinician check</small><b>{waiting.length}</b><span>one in ten, and any ClinFlow was only possibly sure of</span></section>
          </div>
          {waiting.length > 0 && (
            <ul className="cf-score-list cf-spot-list">
              {waiting.map((doc) => {
                const mine = !canSpotCheck({ checkerUid, confirmedByUid: doc.triageReview?.confirmedByUid });
                return (
                  <li key={doc.id}>
                    <p><b>{doc.title || "Letter"}</b> <small>confirmed as no action needed{doc.triageReview?.reviewedAt ? ` · ${when(doc.triageReview.reviewedAt)}` : ""}</small></p>
                    {disagreeing === doc.id ? (
                      <p className="cf-spot-actions">
                        <select value={reason} onChange={(event) => setReason(event.target.value)} aria-label="What needs action?"><option value="">What needs action?</option>{NFW_WRONG_REASONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>
                        <button type="button" className="primary" disabled={!reason} onClick={async () => { await onSpotCheck(doc, false, reason); setDisagreeing(null); setReason(""); }}>Save: action needed</button>
                        <button type="button" onClick={() => setDisagreeing(null)}>Back</button>
                      </p>
                    ) : (
                      <p className="cf-spot-actions">
                        <button type="button" onClick={() => onOpenDocument?.(doc.id)}>Open the letter</button>
                        {canCheck && !mine && <><button type="button" className="primary" onClick={() => onSpotCheck(doc, true)}>Agree: no action needed</button><button type="button" onClick={() => { setDisagreeing(doc.id); setReason(""); }}>Disagree</button></>}
                        {canCheck && mine && <small>A different person from the one who confirmed it has to check it.</small>}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {card.nfw.reasons.length > 0 && <p className="cf-muted">Why they needed action: {card.nfw.reasons.map((r) => `${r.label} (${r.count})`).join("; ")}.</p>}
          {card.nfw.missedWording.length > 0 && <p className="cf-muted">Wording ClinFlow missed: {card.nfw.missedWording.map((w) => `“${w.sentence}”`).join("; ")}.</p>}
          <h3 className="cf-score-title">What was accurate</h3>
          <p className="cf-muted">From the "What was accurate?" ticks in Score and Teach ({card.scoredCount} scored case{card.scoredCount === 1 ? "" : "s"}).</p>
          <ul className="cf-score-bars">
            {card.areas.map((a) => (
              <li key={a.key}><span>{a.label}</span><div className="cf-score-bar" role="img" aria-label={`${a.label}: ${shown(a.pct)}`}><i style={{ width: `${a.pct || 0}%` }} /></div><b>{a.pct === null ? "–" : `${a.pct}%`}</b></li>
            ))}
          </ul>
          <h3 className="cf-score-title">Corrections and notes ({card.corrections.length})</h3>
          {card.corrections.length === 0
            ? <p className="cf-muted">Nothing has been corrected yet. When someone changes ClinFlow's suggestion, or adds a note in Score and Teach, it is listed here.</p>
            : <ul className="cf-score-list">{card.corrections.map((c) => (
              <li key={c.id}>
                <p><b>{c.suggested}</b> → <b>{c.confirmed}</b>{c.destination ? ` · ${c.destination}` : ""} <small>{c.document} · {when(c.at)}</small></p>
                {c.reason && <p>Why: {c.reason}</p>}
                {c.summary && <p>Should have said: {c.summary}</p>}
                {c.notes && <p className="cf-muted">Note for the reviewer: {c.notes}</p>}
              </li>
            ))}</ul>}
        </>
      )}
      <footer>
        <button type="button" onClick={onClose}>Close</button>
        {canExport && <button type="button" className="primary" onClick={exportCsv} disabled={teaching === null}><Download size={14} /> Download for the rule reviewer (CSV)</button>}
      </footer>
    </div></div>
  );
}
