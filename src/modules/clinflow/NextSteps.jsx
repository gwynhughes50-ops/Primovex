import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ListChecks, Send } from "lucide-react";
import { buildNextSteps } from "./clinflowNextSteps";
import { NO_ACTION_REASONS, describeDecision, stepKey } from "./clinflowStepDecisions";
import SendToColleague from "./SendToColleague";
import { taskPayload } from "./qualityOpportunityPayload";

// "What to do with this letter": the headline decision, then numbered steps, each saying who is suggested to do it, when, and why (the words in the letter).
// The suggested owner is only a suggestion. For each step the person chooses: do it themselves, send it to a colleague, or say no action is needed (with a
// reason). Every choice is kept on the letter and written to the audit trail with who made it and when.
export default function NextSteps({ analysis, coding, letter, letterRef, decisions = {}, canDecide, onDecide }) {
  const plan = useMemo(() => buildNextSteps(analysis, coding, letter), [analysis, coding, letter]);
  const [sending, setSending] = useState(null);
  const [reasoning, setReasoning] = useState(null);
  const [reason, setReason] = useState(NO_ACTION_REASONS[0]);
  if (!plan.headline) return null;
  const { headline, steps } = plan;
  const decided = steps.filter((step) => decisions[stepKey(step)]).length;
  return (
    <section className="cf-next" aria-label="What to do with this letter">
      <div className={`cf-next-head cf-next-head--${headline.tone}`}>
        {headline.tone === "danger" || headline.tone === "warning" ? <AlertTriangle size={26} aria-hidden="true" /> : <ListChecks size={26} aria-hidden="true" />}
        <div><p className="cf-next-kicker">What to do with this letter</p><h3>{headline.title}</h3><p>{headline.detail}</p></div>
      </div>
      <p className="cf-next-progress"><b>{decided} of {steps.length}</b> steps decided</p>
      <ol className="cf-next-steps">
        {steps.map((step) => {
          const key = stepKey(step);
          const decision = decisions[key];
          return (
            <li key={key} className={`cf-next-step cf-next-step--${step.tone}${decision ? ` cf-next-step--${decision.choice}` : ""}`}>
              <span className="cf-next-no">{decision?.choice === "done" ? <CheckCircle2 size={16} /> : step.number}</span>
              <div className="cf-next-body">
                <div className="cf-next-top">
                  <b>{step.title}</b>
                  <span className="cf-next-owner" title="Only a suggestion: you choose who deals with it">Suggested: {step.owner}</span>
                  {step.when && <span className="cf-next-when">{step.when}{step.due ? ` · by about ${step.due}` : ""}</span>}
                </div>
                <p>{step.detail}</p>
                {step.points?.length > 0 && <ul className="cf-next-points">{step.points.map((point) => <li key={point}>{point}</li>)}</ul>}
                {step.because && <p className="cf-next-because">From the letter: “{step.because}”</p>}
                {canDecide && (
                  <div className="cf-next-actions">
                    {decision ? (
                      <>
                        <span className={`cf-next-state cf-next-state--${decision.choice}`}>{describeDecision(decision)}</span>
                        {decision.choice === "self" && <button type="button" onClick={() => onDecide(step, "done")}>Mark done</button>}
                        {decision.choice === "sent" && <button type="button" onClick={() => setSending(step)}><Send size={12} /> Send to someone else</button>}
                        <button type="button" className="cf-next-undo" onClick={() => onDecide(step, null)}>Change</button>
                      </>
                    ) : reasoning === key ? (
                      <>
                        <label className="cf-next-reason">Why no action?
                          <select value={reason} onChange={(e) => setReason(e.target.value)}>{NO_ACTION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                        </label>
                        <button type="button" className="primary" onClick={() => { onDecide(step, "none", { reason }); setReasoning(null); }}>Save</button>
                        <button type="button" onClick={() => setReasoning(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="primary" onClick={() => onDecide(step, "self")}>I'll do this</button>
                        <button type="button" onClick={() => setSending(step)}><Send size={12} /> Send to a colleague</button>
                        <button type="button" onClick={() => { setReason(NO_ACTION_REASONS[0]); setReasoning(key); }}>No action needed</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="cf-next-note"><CheckCircle2 size={13} aria-hidden="true" /> {plan.note}</p>
      {sending && (
        <SendToColleague
          item={{ title: sending.title, domain: "Task", nextStep: sending.because ? `The letter says: ${sending.because}` : sending.detail, tone: sending.tone === "gp" ? "rose" : sending.tone === "nurse" ? "teal" : sending.tone === "pharmacist" ? "purple" : sending.tone === "manager" ? "amber" : "blue", key: stepKey(sending) }}
          analysis={analysis}
          buildPayload={(options) => taskPayload({ step: sending, analysis, letterRef, ...options })}
          onClose={() => setSending(null)}
          onSent={(info) => { onDecide(sending, "sent", { to: info.who, withDetails: info.withDetails, sent: info.sent }); setSending(null); }}
        />
      )}
    </section>
  );
}
