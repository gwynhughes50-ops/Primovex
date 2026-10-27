import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Download, FolderOpen } from "lucide-react";
import { FOLDER_KINDS, FOLDER_WORDS } from "./clinflowNfwf";
import { buildDocmanPayload } from "./docmanPayload";
import { copyText } from "./copyText";
import { handoverCodes, handoverFields, handoverText } from "./docmanHandover";

// Getting a coded letter into Docman 10X by hand: one banner that says whether it is ready, the one PDF to download and drag in, the details Docman asks for with
// a Copy button on each, and the codes a clinician accepted. Nothing is sent from here. What only matters to filing through the Docman Connect interface (sender and
// recipient organisation codes), which the practice does not use today, is kept under "Technical details" so it does not look like a problem.
const CONNECT_ONLY = /^(?:Sender\.|RecipientOdsCode|CaptureSource)/;

export default function DocmanReadiness({ analysis, fileReady, outcome, onDownload, onCopy, onOpenCodes, folderKind, folders = {}, canChooseFolders, onChooseFolder, savedFolder }) {
  const [copied, setCopied] = useState("");
  const [showRecord, setShowRecord] = useState(false);
  const result = useMemo(() => buildDocmanPayload(analysis?.docmanDraft || {}, { fileReady: Boolean(fileReady) }), [analysis, fileReady]);
  const fields = useMemo(() => handoverFields(result), [result]);
  const codes = useMemo(() => handoverCodes(result), [result]);
  const todo = result.blocking.filter((p) => !CONNECT_ONLY.test(p.field));
  const connectOnly = result.blocking.filter((p) => CONNECT_ONLY.test(p.field));
  const notes = result.problems.filter((p) => p.severity !== "blocks");
  const waiting = outcome?.waiting?.length || 0;
  const ready = todo.length === 0;
  const copy = async (key, value) => {
    const done = await copyText(value);
    setCopied(done ? key : `!${key}`);
    setTimeout(() => setCopied(""), done ? 1800 : 3500);
    if (done) onCopy?.(key === "all" ? "all the details" : /^\d/.test(key) ? "a SNOMED code" : key);
  };
  return (
    <div className="cf-dm" aria-label="Filing this letter in Docman">
      <section className={`cf-dm-banner ${ready ? "cf-dm-banner--ready" : "cf-dm-banner--todo"}`}>
        <div className="cf-dm-banner-main">
          {ready ? <CheckCircle2 size={26} aria-hidden="true" /> : <AlertTriangle size={26} aria-hidden="true" />}
          <div>
            <h3>{ready ? "Ready to file in Docman" : `${todo.length} thing${todo.length === 1 ? "" : "s"} to put right before filing`}</h3>
            <p>{ready ? "Download the PDF, drag it into Docman, then enter the details underneath." : todo.map((p) => p.label).join(" · ")}</p>
          </div>
        </div>
        {onDownload && <button type="button" className="cf-dm-download" onClick={onDownload}><Download size={16} /> {folderKind ? (folders[folderKind] && canChooseFolders ? `Save into the ${FOLDER_WORDS[folderKind]} folder` : `Download the Docman PDF (${folderKind === "nfw" ? "NFW" : "Action needed"})`) : "Confirm the outcome, then save the PDF"}</button>}
      </section>
      {!folderKind && <p className="cf-dm-folder-note">The PDF goes in the <b>NFW</b> folder or the <b>Action needed</b> folder, so a person has to confirm which on the Triage tab first.</p>}
      {savedFolder && <p className="cf-dm-folder-note cf-dm-folder-note--done"><CheckCircle2 size={14} aria-hidden="true" /> Saved for the {FOLDER_WORDS[savedFolder]} folder.</p>}
      {canChooseFolders && (
        <section className="cf-dm-folders" aria-label="Docman upload folders">
          <h4><FolderOpen size={15} aria-hidden="true" /> Docman upload folders on this computer</h4>
          {FOLDER_KINDS.map((kind) => (
            <div key={kind} className={`cf-dm-folder${folderKind === kind ? " is-target" : ""}`}>
              <b>{FOLDER_WORDS[kind]}{folderKind === kind ? " · this letter" : ""}</b>
              <span title={folders[kind] || ""}>{folders[kind] || "Not chosen yet"}</span>
              <button type="button" onClick={() => onChooseFolder?.(kind)}>{folders[kind] ? "Change" : "Choose folder"}</button>
            </div>
          ))}
          <small>Once both are chosen, saving a letter puts its PDF straight into the right one.</small>
        </section>
      )}

      <h4 className="cf-handover-title">Details to enter in Docman</h4>
      <ul className="cf-fields">
        {fields.map((f) => (
          <li key={f.label} className={f.missing ? "cf-field cf-field--missing" : "cf-field"}>
            <span><small>{f.label}</small><b>{f.value || "Not on the letter"}</b></span>
            {!f.missing && <button type="button" className="cf-copy" onClick={() => copy(f.label, f.copy)} aria-label={`Copy ${f.label}`}>{copied === f.label ? "Copied" : copied === `!${f.label}` ? "Not copied" : <Copy size={13} />}</button>}
          </li>
        ))}
      </ul>
      <p><button type="button" className="cf-top-button" onClick={() => copy("all", handoverText(result))}>{copied === "all" ? "Copied everything" : copied === "!all" ? "Could not copy: select and copy by hand" : "Copy all the details"}</button></p>

      <h4 className="cf-handover-title">SNOMED codes accepted ({codes.length})</h4>
      {codes.length > 0 ? (
        <ul className="cf-fields cf-fields--codes">
          {codes.map((c) => (
            <li key={`${c.code}-${c.descriptionId}`} className="cf-field">
              <span><small>SNOMED {c.code} · description {c.descriptionId}</small><b>{c.description}</b></span>
              <button type="button" className="cf-copy" onClick={() => copy(c.code, c.code)} aria-label={`Copy code ${c.code}`}>{copied === c.code ? "Copied" : copied === `!${c.code}` ? "Not copied" : <Copy size={13} />}</button>
            </li>
          ))}
        </ul>
      ) : <p className="cf-muted">No codes have been accepted yet.</p>}
      {waiting > 0 && <p className="cf-dm-waiting">{waiting} suggested code{waiting === 1 ? " is" : "s are"} not checked yet. {onOpenCodes && <button type="button" onClick={onOpenCodes}>Open the codes</button>}</p>}

      <details className="cf-dm-tech">
        <summary>Technical details</summary>
        {notes.length > 0 && <ul className="cf-docman-list cf-docman-notes">{notes.map((p) => <li key={`${p.field}-${p.message}`}>{p.message}</li>)}</ul>}
        {connectOnly.length > 0 && (
          <>
            <p className="cf-muted"><small>Only needed if letters are ever filed through Docman Connect (the interface), which the practice does not use today:</small></p>
            <ul className="cf-docman-list cf-docman-notes">{connectOnly.map((p) => <li key={`${p.field}-${p.message}`}>{p.message}</li>)}</ul>
          </>
        )}
        <p className="cf-muted"><small>Nothing is sent to Docman from here: a person downloads the PDF and files it.</small></p>
        <button type="button" className="cf-top-button" onClick={() => setShowRecord(!showRecord)} aria-expanded={showRecord}>{showRecord ? "Hide" : "Show"} the record Docman Connect would receive</button>
        {showRecord && <pre className="cf-docman-record" tabIndex={0}>{JSON.stringify(result.payload, null, 2)}</pre>}
      </details>
    </div>
  );
}
