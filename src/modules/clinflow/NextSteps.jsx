import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, ListChecks } from "lucide-react";
import { buildNextSteps } from "./clinflowNextSteps";

// "What to do with this letter": the headline decision, then numbered steps, each saying who does it, when, and why (the words in the letter).
// Written for the administrator who opens the letter first: nothing clinical is left for them to decide.
export default function NextSteps({ analysis, coding }) {
  const plan = useMemo(() => buildNextSteps(analysis, coding), [analysis, coding]);
  if (!plan.headline) return null;
  const { headline, steps } = plan;
  return (
    <section className="cf-next" aria-label="What to do with this letter">
      <div className={`cf-next-head cf-next-head--${headline.tone}`}>
        {headline.tone === "danger" || headline.tone === "warning" ? <AlertTriangle size={26} aria-hidden="true" /> : <ListChecks size={26} aria-hidden="true" />}
        <div><p className="cf-next-kicker">What to do with this letter</p><h3>{headline.title}</h3><p>{headline.detail}</p></div>
      </div>
      <ol className="cf-next-steps">
        {steps.map((step) => (
          <li key={step.id} className={`cf-next-step cf-next-step--${step.tone}`}>
            <span className="cf-next-no">{step.number}</span>
            <div className="cf-next-body">
              <div className="cf-next-top">
                <b>{step.title}</b>
                <span className="cf-next-owner">{step.owner}</span>
                {step.when && <span className="cf-next-when">{step.when}{step.due ? ` · by about ${step.due}` : ""}</span>}
              </div>
              <p>{step.detail}</p>
              {step.because && <p className="cf-next-because">From the letter: “{step.because}”</p>}
            </div>
          </li>
        ))}
      </ol>
      <p className="cf-next-note"><CheckCircle2 size={13} aria-hidden="true" /> {plan.note}</p>
    </section>
  );
}
