import { useMemo, useState } from "react";
import { CheckCircle2, ThumbsDown, ThumbsUp } from "lucide-react";
import { NFW_WRONG_REASONS, pickableSentences } from "./clinflowNfwf";

// ClinFlow has suggested a letter needs no action. The person says whether that is right. Yes: it goes in the NFW folder. No: they say why, from a short list, and
// tick the words in the letter that need action; it goes in the Action folder, and the reason and the words are kept for whoever reviews the rules (ClinFlow never
// changes its own rules from them).
export default function NfwConfirm({ letterText, destinations = [], disabled, onRight, onWrong }) {
  const [stage, setStage] = useState("ask");
  const [reasonCode, setReasonCode] = useState("");
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState("");
  const [destination, setDestination] = useState(destinations.includes("Workflow Team") ? "Workflow Team" : destinations[0] || "Workflow Team");
  const sentences = useMemo(() => pickableSentences(letterText), [letterText]);
  const toggle = (sentence) => setPicked((current) => (current.includes(sentence) ? current.filter((s) => s !== sentence) : [...current, sentence].slice(0, 3)));
  return (
    <section className="cf-nfw" aria-label="Is this letter really no action needed?">
      <h3>Is this letter really no action needed?</h3>
      {stage === "ask" ? (
        <>
          <p>If you agree, it goes in the <b>NFW</b> folder for Docman. If not, it goes in the <b>Action needed</b> folder, and you tell ClinFlow why so it can do better.</p>
          <div className="cf-nfw-buttons">
            <button type="button" className="cf-nfw-yes" disabled={disabled} onClick={onRight}><ThumbsUp size={16} /> Yes, no action needed</button>
            <button type="button" className="cf-nfw-no" disabled={disabled} onClick={() => setStage("why")}><ThumbsDown size={16} /> No, action is needed</button>
          </div>
        </>
      ) : (
        <>
          <fieldset className="cf-nfw-reasons">
            <legend>What needs action?</legend>
            {NFW_WRONG_REASONS.map(([code, label]) => (
              <label key={code}><input type="radio" name="nfw-reason" checked={reasonCode === code} onChange={() => setReasonCode(code)} /> {label}</label>
            ))}
          </fieldset>
          {sentences.length > 0 && (
            <fieldset className="cf-nfw-words">
              <legend>Which words in the letter? <small>(optional, up to 3)</small></legend>
              {sentences.map((sentence) => (
                <label key={sentence}><input type="checkbox" checked={picked.includes(sentence)} disabled={!picked.includes(sentence) && picked.length >= 3} onChange={() => toggle(sentence)} /> {sentence}</label>
              ))}
            </fieldset>
          )}
          {reasonCode === "other" && <label className="cf-nfw-note">What else?<input value={note} maxLength={120} onChange={(event) => setNote(event.target.value)} placeholder="A few words" /></label>}
          <label className="cf-nfw-dest">Who should deal with it?
            <select value={destination} onChange={(event) => setDestination(event.target.value)}>{destinations.map((d) => <option key={d} value={d}>{d}</option>)}</select>
          </label>
          <div className="cf-nfw-buttons">
            <button type="button" className="primary" disabled={disabled || !reasonCode} onClick={() => onWrong({ reasonCode, sentences: picked, note: note.trim(), destination })}><CheckCircle2 size={15} /> Save: action needed</button>
            <button type="button" disabled={disabled} onClick={() => setStage("ask")}>Back</button>
          </div>
        </>
      )}
    </section>
  );
}
