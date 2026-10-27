import { useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, GraduationCap, Send } from "lucide-react";
import SendToColleague from "./SendToColleague";
import NfwConfirm from "./NfwConfirm";
import { FOLDER_WORDS, folderKindFor } from "./clinflowNfwf";
import { TRIAGE_WORDS, triagePayload } from "./qualityOpportunityPayload";

// The triage page of a letter: what ClinFlow suggests, why, and where it should go, in a banner coloured by the outcome; the workflow and NFWF assessments; the
// evidence; and the buttons that confirm or correct it. The suggested outcome can be sent to a colleague (a person, or a role) to look at.
const TONE = { urgent: "rose", workflow_required: "amber", no_workflow: "teal", review_required: "blue" };
const CHOICES = [["urgent", "Urgent"], ["workflow_required", "Workflow required"], ["no_workflow", "NFWF"], ["review_required", "Needs review"]];

export default function TriageReview({ analysis, review, canSend, canConfirm, onDecision, onOpenTeaching, onOpenSend, onSent, letterRef, letterText, destinations }) {
  const triage = analysis?.triage || {};
  const workflow = analysis?.workflowDecision || {};
  const nfwf = analysis?.nfwfAssessment || {};
  const confirmed = review?.status === "human_confirmed" ? review.confirmedDecision : null;
  const decision = confirmed || triage.decision || "review_required";
  const destination = (confirmed && review.confirmedDestination) || triage.destination || workflow.suggestedDestination || "Workflow review";
  const confidence = Math.round((triage.confidence || 0) * 100);
  const tone = TONE[decision] || "blue";
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const reasons = triage.reasons || [];
  const triggers = analysis?.clinicalTriggers || [];
  return (
    <div className="cf-tab-content cf-triage">
      <section className={`cf-t-hero cf-qtone--${tone}`}>
        <div className="cf-t-hero-main">
          {decision === "urgent" ? <AlertTriangle size={30} aria-hidden="true" /> : <BrainCircuit size={30} aria-hidden="true" />}
          <div>
            <p className="cf-t-kicker">{confirmed ? "Confirmed by a person" : "ClinFlow suggests"}</p>
            <h3>{TRIAGE_WORDS[decision] || decision}</h3>
            <p>Route to <b>{destination}</b>{!confirmed && confidence ? ` · ${confidence}% sure` : ""}</p>
          </div>
        </div>
        <div className="cf-t-hero-side">
          <span className="cf-t-status">{confirmed ? <><CheckCircle2 size={14} /> Confirmed as {TRIAGE_WORDS[confirmed] || confirmed}</> : "Human confirmation required"}</span>
          {canSend && <button type="button" className="cf-t-send" onClick={() => { setSending(true); onOpenSend?.(); }}><Send size={14} /> {sentTo ? "Send to someone else" : "Send to a colleague"}</button>}
          {sentTo && <span className="cf-t-sent"><CheckCircle2 size={13} /> Sent to {sentTo.who}</span>}
        </div>
      </section>

      {decision === "no_workflow" && !confirmed && (
        <section className="cf-t-noaction" aria-label="Why ClinFlow thinks no action is needed">
          <b>ClinFlow suggests nothing here is asked of the practice.</b>
          <span>It found no request, no medicine change, no result still awaited and nothing urgent. This is a suggestion only: skim the letter, and the words it relied on below, before you confirm.</span>
        </section>
      )}

      {decision === "no_workflow" && !confirmed && canConfirm && (
        <NfwConfirm
          letterText={letterText}
          destinations={(destinations || []).filter((d) => d !== "NFWF")}
          onRight={() => onDecision("no_workflow", { nfwfCategory: nfwf.category || "No GP/practice action requested", reasonCode: "confirmed_right" })}
          onWrong={({ reasonCode, sentences, note, destination }) => onDecision("workflow_required", { confirmedDestination: destination, nfwfCategory: "Not NFWF", reasonCode, reasonSentences: sentences, correctionReason: note ? `${reasonCode}: ${note}` : reasonCode })}
        />
      )}
      {confirmed && (
        <section className="cf-nfw-state">
          <b>Docman folder: {FOLDER_WORDS[folderKindFor(review)]}</b>
          {review.spotCheck?.status === "pending" && <span>A clinician will double-check this one. It stays in the NFW folder unless they disagree.</span>}
          {review.spotCheck?.status === "agree" && <span>A clinician checked it and agreed.</span>}
          {review.spotCheck?.status === "disagree" && <span>A clinician checked it and said action is needed, so it now belongs in the Action needed folder.{review.savedFolder === "nfw" ? " Its PDF was already saved in the NFW folder: please move it." : ""}</span>}
        </section>
      )}

      <div className="cf-q-tiles">
        <section className="cf-q-tile cf-qtone--blue"><small>Suggested destination</small><b>{destination}</b><span>Where ClinFlow would route this letter</span></section>
        <section className={`cf-q-tile cf-qtone--${/^yes/i.test(workflow.stillNeedsWorkflow || "") ? "amber" : /^no/i.test(workflow.stillNeedsWorkflow || "") ? "teal" : "slate"}`}><small>Still needs workflow?</small><b>{workflow.stillNeedsWorkflow || "Maybe"}</b><span>{workflow.category || "Human review required"}{workflow.suggestedDestination ? ` · ${workflow.suggestedDestination}` : ""}</span></section>
        <section className="cf-q-tile cf-qtone--purple"><small>NFWF assessment</small><b>{nfwf.score || 0}%</b><span>{nfwf.category || "Human review required"}</span></section>
      </div>

      <h3 className="cf-score-title">Why ClinFlow suggests this</h3>
      {reasons.length === 0 && triggers.length === 0 ? <p className="cf-muted">No reliable triage evidence was generated.</p> : (
        <div className="cf-t-evidence">
          {reasons.map((item) => <article key={item.key || item.label} className="cf-t-reason cf-qtone--blue"><b>{item.label}</b><span>{item.detail}</span></article>)}
          {triggers.map((item, index) => <article key={`${item.type}-${index}`} className="cf-t-reason cf-qtone--rose"><b>{item.label}</b><span>{item.evidence}</span></article>)}
        </div>
      )}
      {(nfwf.reasons?.length > 0 || nfwf.blockers?.length > 0) && (
        <div className="cf-t-nfwf">
          {nfwf.reasons?.length > 0 && <p><b>For no further action:</b> {nfwf.reasons.join("; ")}</p>}
          {nfwf.blockers?.length > 0 && <p><b>Against it:</b> {nfwf.blockers.join("; ")}</p>}
        </div>
      )}

      <h3 className="cf-score-title">Confirm the outcome</h3>
      <div className="cf-t-choices" role="group" aria-label="Confirm the outcome">
        {CHOICES.map(([key, label]) => (
          <button key={key} type="button" disabled={!canConfirm} className={`cf-t-choice cf-qtone--${TONE[key]}${decision === key && confirmed ? " on" : ""}`} aria-pressed={decision === key && Boolean(confirmed)} onClick={() => onDecision(key)}>{label}</button>
        ))}
      </div>
      <p><button type="button" className="cf-teach-link" onClick={onOpenTeaching}><GraduationCap size={14} /> Score and teach this case</button></p>
      <p className="cf-muted"><small>{triage.learningPolicy} Ruleset: {triage.rulesetVersion}. ClinFlow suggests; staff confirm or correct every decision, and teaching evidence cannot change live rules automatically.</small></p>

      {sending && (
        <SendToColleague
          item={{ title: `Triage: ${TRIAGE_WORDS[decision] || decision}`, domain: "Triage", nextStep: `Route to ${destination}`, tone, key: "triage" }}
          analysis={analysis}
          buildPayload={(options) => triagePayload({ analysis, decision, destination, letterRef, ...options })}
          onClose={() => setSending(false)}
          onSent={(info) => { setSentTo(info); setSending(false); onSent?.(info); }}
        />
      )}
    </div>
  );
}
