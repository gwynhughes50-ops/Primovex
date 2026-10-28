import { useEffect, useRef, useState } from "react";
import { FolderInput, Pause, Play, ScanLine, X } from "lucide-react";
import { analyzeSyntheticDocument } from "./azureDocumentIntelligenceClient";
import { chooseFolder, desktopFoldersAvailable, incomingScans, loadFolders } from "./docmanFolders";
import { POLL_MS, createInboxRunner } from "./scanInboxRunner";
import { splitAtBlankPages } from "./scanSplit";

const remembered = (key) => { try { return globalThis.localStorage?.getItem(key) === "true"; } catch { return false; } };
const remember = (key, value) => { try { globalThis.localStorage?.setItem(key, String(value)); } catch { /* only a convenience */ } };

// The Incoming scans folder: scanners save letters into one folder, ClinFlow reads them in the background and they appear in the letters list, ready to check. It only works
// in the desktop app, only while ClinFlow is open, and only after a person confirms the scans are invented test letters (there is no sign-off for real patient letters yet).
// Nothing is deleted: a scan is moved to "ClinFlow done" or "ClinFlow problems" inside the folder.
export default function ScanInbox({ onLetter, record, canRun }) {
  const desktop = desktopFoldersAvailable();
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState("");
  const [attested, setAttested] = useState(false);
  const [running, setRunning] = useState(false);
  const [split, setSplit] = useState(() => remembered("primovex.clinflow.inbox.split"));
  const [status, setStatus] = useState({ waiting: 0, current: "", read: 0, problems: 0, lastProblem: "", error: "" });
  const [message, setMessage] = useState("");
  const splitRef = useRef(split);
  splitRef.current = split;
  const latest = useRef({ onLetter, record });
  latest.current = { onLetter, record };

  useEffect(() => { if (desktop) loadFolders().then((folders) => setFolder(folders.incoming)); }, [desktop]);

  // the background reader: it runs while this is switched on, and stops when ClinFlow is closed or it is paused
  useEffect(() => {
    if (!running || !folder || !desktop) return undefined;
    const runner = createInboxRunner({
      folder: incomingScans,
      analyse: (file) => analyzeSyntheticDocument(file, true),
      split: (bytes) => (splitRef.current ? splitAtBlankPages(bytes).catch(() => null) : null),
      onStatus: setStatus,
      onLetter: (item) => {
        if (item.problem) { latest.current.record("clinflow.inbox.problem", "A scan could not be read and was moved to the problems folder", { reason: "unreadable_or_too_large" }); return; }
        latest.current.onLetter(item.response);
        latest.current.record("clinflow.inbox.read", "A scanned letter was read in the background", { parts: item.parts, split: item.split, attempts: item.attempts, automatedTransmission: false });
      },
    });
    runner.tick();
    const timer = setInterval(runner.tick, POLL_MS);
    return () => { clearInterval(timer); runner.stop(); };
  }, [running, folder, desktop]);

  async function choose() {
    try {
      const path = await chooseFolder("incoming");
      if (!path) return;
      setFolder(path);
      setMessage("");
      record("clinflow.inbox.folder_set", "The Incoming scans folder was chosen on this computer", {});
    } catch (error) { setMessage(error?.message || "The folder could not be chosen"); }
  }
  function start() {
    setRunning(true);
    setMessage("");
    record("clinflow.inbox.start", "Reading the Incoming scans folder in the background was switched on", { attestedSyntheticOnly: true, splitAtBlankPages: split });
  }
  function pause() {
    setRunning(false);
    record("clinflow.inbox.pause", "Reading the Incoming scans folder was paused", { read: status.read, problems: status.problems });
  }

  return (
    <>
      <button type="button" className={`cf-inbox-button${running ? " is-running" : ""}`} onClick={() => setOpen(true)} title="Letters scanned into the Incoming folder are read here in the background">
        <ScanLine size={15} aria-hidden="true" /> Incoming scans{running ? ` · ${status.waiting}` : ""}
      </button>
      {open && (
        <div className="cf-modal cf-inbox" role="dialog" aria-modal="true" aria-label="Incoming scans"><div>
          <header className="cf-scorecard-head"><h2><ScanLine size={18} /> Incoming scans</h2><button type="button" className="cf-scorecard-close" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button></header>
          {!desktop ? <p className="cf-modal-guidance">Reading scans from a folder needs the Primovex desktop app. Open ClinFlow there.</p> : (
            <>
              <p className="cf-modal-guidance">Scanners save letters into one folder. ClinFlow reads each one in the background and it appears in your letters list, ready to check. The person scanning does not need to do anything else. ClinFlow must stay open on this computer for it to work.</p>
              <div className="cf-inbox-row"><b>Incoming scans folder</b><span title={folder}>{folder || "Not chosen yet"}</span><button type="button" onClick={choose} disabled={running}><FolderInput size={14} /> {folder ? "Change" : "Choose folder"}</button></div>
              <label className="cf-inbox-check"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} disabled={running} /><span>I confirm everything scanned into this folder is an <b>invented test letter</b> with no real patient or staff details. (Real letters cannot be read here until the data protection sign-off is done.)</span></label>
              <label className="cf-inbox-check"><input type="checkbox" checked={split} onChange={(event) => { setSplit(event.target.checked); remember("primovex.clinflow.inbox.split", event.target.checked); }} /><span>If a scan holds a stack of letters, split it at blank pages. <small>Better done in the scanner's own software; use this only if that is not possible. The original scan is kept untouched.</small></span></label>
              <div className="cf-inbox-actions">
                {running
                  ? <button type="button" className="primary" onClick={pause}><Pause size={14} /> Pause reading</button>
                  : <button type="button" className="primary" onClick={start} disabled={!folder || !attested || !canRun}><Play size={14} /> Start reading</button>}
                {!canRun && <small>Your role cannot add letters to ClinFlow.</small>}
              </div>
              {message && <p className="cf-code-error" role="alert">{message}</p>}
              <ul className="cf-inbox-status" aria-label="What is happening">
                <li><b>{running ? (status.current ? "Reading now" : "Watching the folder") : "Not reading"}</b>{status.current ? <span> a scan…</span> : null}</li>
                <li>Waiting in the folder: <b>{status.waiting}</b></li>
                <li>Read since you started: <b>{status.read}</b></li>
                <li>Could not be read: <b>{status.problems}</b>{status.lastProblem ? <span> · last: {status.lastProblem}</span> : null}</li>
                {status.error && <li className="cf-inbox-error">Trying again: {status.error}</li>}
              </ul>
              <p className="cf-muted"><small>Finished scans are moved into a <b>ClinFlow done</b> folder inside the Incoming folder, and ones that could not be read into <b>ClinFlow problems</b>. Nothing is deleted. A scan is read once it has stopped growing, about ten seconds after it is saved. Each file must be a PDF of no more than 4 MB (one letter).</small></p>
            </>
          )}
          <footer><button type="button" onClick={() => setOpen(false)}>Close</button></footer>
        </div></div>
      )}
    </>
  );
}
