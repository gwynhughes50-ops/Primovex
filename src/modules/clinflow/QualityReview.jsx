import { useState } from "react";
import { AlertTriangle, CheckCircle2, Send, ShieldCheck } from "lucide-react";
import SendToColleague from "./SendToColleague";
import { opportunityPayload, toneOf } from "./qualityOpportunityPayload";

// The quality and register review of a letter: the record-check prompts ClinFlow raises (it never confirms an opportunity from a hospital letter alone),
// each in its own coloured card with a button to send it to a colleague (a person, or everyone with a role such as the business team) to follow up.
const keyOf = (item) => `${item.domain}|${item.title}`;

export default function QualityReview({ analysis, letterRef, canSend, onSent, onOpenSend }) {
  const prompts = analysis?.qualityPrompts || [];
  const confirmed = analysis?.qaifOpportunities?.length || 0;
  const relevance = analysis?.qualityAwareness?.relevance || "Low";
  const [sending, setSending] = useState(null);
  const [sentTo, setSentTo] = useState({});
  const finished = (info) => { setSentTo((current) => ({ ...current, [info.key]: info })); setSending(null); onSent?.(info); };
  return (
    <div className="cf-tab-content cf-quality">
      <section className="cf-q-hero">
        <ShieldCheck size={26} aria-hidden="true" />
        <div>
          <p className="cf-q-kicker">Wales and England</p>
          <h3>Quality and register review</h3>
          <p>A hospital letter cannot establish a QAIF, Unified Contract or QOF opportunity by itself. ClinFlow gives record-check prompts, not confirmed opportunities. Send a prompt to a colleague to follow up.</p>
        </div>
      </section>
      <div className="cf-q-tiles">
        <section className="cf-q-tile cf-qtone--teal"><small>Prompts to check</small><b>{prompts.length}</b><span>{prompts.length ? "From the words in this letter" : "Nothing raised"}</span></section>
        <section className="cf-q-tile cf-qtone--blue"><small>Confirmed from this letter</small><b>{confirmed}</b><span>None are confirmed from a letter alone</span></section>
        <section className={`cf-q-tile cf-qtone--${/high/i.test(relevance) ? "rose" : /medium/i.test(relevance) ? "amber" : "slate"}`}><small>Awareness</small><b>{relevance}</b><span>How much quality work the letter touches</span></section>
      </div>
      {prompts.length === 0 && <p className="cf-muted">No record-check prompts were raised for this letter.</p>}
      <div className="cf-q-list">
        {prompts.map((item) => {
          const sent = sentTo[keyOf(item)];
          return (
            <article key={keyOf(item)} className={`cf-q-card cf-qtone--${toneOf(item.domain)}`}>
              <header><span className="cf-q-domain">{item.domain}</span>{item.priority === "high" && <span className="cf-q-high"><AlertTriangle size={12} /> High priority</span>}</header>
              <h4>{item.title}</h4>
              <p>{item.rationale}</p>
              <div className="cf-q-next"><small>Next step</small><span>{item.nextStep}</span></div>
              {item.framework && <p className="cf-q-framework">{item.framework}</p>}
              <footer>
                {sent ? <span className="cf-q-sent"><CheckCircle2 size={14} /> Sent to {sent.who}{sent.withDetails ? " with the patient's details" : ""}</span> : <span />}
                {canSend && <button type="button" className="cf-q-send" onClick={() => { setSending(item); onOpenSend?.(item); }}><Send size={14} /> {sent ? "Send to someone else" : "Send to a colleague"}</button>}
              </footer>
            </article>
          );
        })}
      </div>
      {sending && <SendToColleague item={{ title: sending.title, domain: sending.domain, nextStep: sending.nextStep, tone: toneOf(sending.domain), key: keyOf(sending) }} analysis={analysis} buildPayload={(options) => opportunityPayload({ prompt: sending, letterRef, analysis, ...options })} onClose={() => setSending(null)} onSent={finished} />}
    </div>
  );
}
