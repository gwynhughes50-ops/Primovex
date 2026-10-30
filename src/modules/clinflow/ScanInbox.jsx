import { useEffect, useRef, useState } from "react";
import { FolderInput, Pause, Play, ScanLine, Share2, X } from "lucide-react";
import { analyzeSyntheticDocument } from "./azureDocumentIntelligenceClient";
import { setClinFlowMirror } from "./clinflowDocumentCache";
import { activeShare, createSharedStore } from "./clinflowShare";
import { LIST_WORDS, localStamps, syncSharedLists } from "./clinflowSharedLists";
import { chooseFolder, desktopFoldersAvailable, incomingScans, loadFolders, sharedLetters } from "./docmanFolders";
import { POLL_MS, createInboxRunner } from "./scanInboxRunner";
import { splitAtBlankPages } from "./scanSplit";

const remembered = (key) => { try { return globalThis.localStorage?.getItem(key) === "true"; } catch { return false; } };
const remember = (key, value) => { try { globalThis.localStorage?.setItem(key, String(value)); } catch { /* only a convenience */ } };
const SHARE_POLL_MS = 8000;
const LIST_POLL_MS = 5 * 60 * 1000;

// Two things that need the desktop app and ClinFlow being open:
//  * Incoming scans: scanners save letters into one folder and this computer reads them in the background. Switch it on for ONE computer only.
//  * Sharing: every computer keeps the letters being worked on in one shared folder (a OneDrive folder only the coding team can see), so they all see the same list. A letter is
//    deleted from the shared folder when it is finished and its Docman PDF saved.
// Both are for invented test letters until the data protection sign-off is done, so a person confirms that each time; it is never remembered.
export default function ScanInbox({ documents, onLetter, onShared, notify, record, canRun, who, lists }) {
  const desktop = desktopFoldersAvailable();
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState({ incoming: "", shared: "" });
  const [attested, setAttested] = useState(false);
  const [running, setRunning] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [split, setSplit] = useState(() => remembered("primovex.clinflow.inbox.split"));
  const [status, setStatus] = useState({ waiting: 0, current: "", read: 0, problems: 0, lastProblem: "", error: "" });
  const [shareStatus, setShareStatus] = useState({ count: 0, lastAt: 0, conflicts: 0, error: "" });
  const [listStatus, setListStatus] = useState({ present: [], loaded: {}, error: "", lastAt: 0 });
  const [message, setMessage] = useState("");
  const [probe, setProbe] = useState(null); // what this computer sees in the shared folder, from the "Check the folder" button
  const splitRef = useRef(split);
  splitRef.current = split;
  const latest = useRef({});
  latest.current = { documents, onLetter, onShared, notify, record, who, lists };
  const store = useRef(null);

  useEffect(() => { if (desktop) loadFolders().then((all) => setFolders({ incoming: all.incoming, shared: all.shared })); }, [desktop]);

  // sharing: bring other people's letters in, keep the shared folder up to date after each save, and clear finished letters out of it
  useEffect(() => {
    if (!sharing || !folders.shared || !desktop) return undefined;
    let stopped = false;
    const shared = createSharedStore({ api: sharedLetters, who: latest.current.who });
    store.current = shared;
    activeShare.current = shared;
    let conflicts = 0;
    async function cycle() {
      if (stopped) return;
      try {
        const result = await shared.pull({ hasPdf: (id) => latest.current.documents.find((d) => d.id === id)?.syntheticOcr?.sourceFile instanceof Blob });
        if (result.upserts.length || result.finishedIds.length) latest.current.onShared(result);
        setShareStatus({ count: result.count, lastAt: Date.now(), conflicts, error: result.problems[0] || "" });
      } catch (error) {
        setShareStatus((current) => ({ ...current, error: String(error?.message || error).slice(0, 160) }));
      }
    }
    setClinFlowMirror(async (docs) => {
      for (const document of docs) {
        const outcome = await shared.push(document);
        if (outcome.conflict) {
          conflicts += 1;
          latest.current.notify("Someone else changed this letter first. Their version has been loaded: please make your change again.", 5000);
          await cycle();
        }
      }
    });
    (async () => {
      await cycle(); // first learn what the shared folder holds, including letters already finished
      for (const document of latest.current.documents) if (!shared.knows(document.id)) await shared.push(document).catch(() => {});
      await cycle();
    })();
    const timer = setInterval(cycle, SHARE_POLL_MS);
    // the three lists, kept once in the "lists" folder of the shared folder: loaded here when they are new or different, checked every few minutes
    async function syncLists() {
      if (stopped || !latest.current.lists) return;
      try {
        const { results, present } = await syncSharedLists({ api: sharedLetters, loaders: latest.current.lists.loaders, stamps: localStamps(), have: latest.current.lists.have });
        const loaded = results.filter((r) => r.ok);
        setListStatus((current) => ({ present, loaded: { ...current.loaded, ...Object.fromEntries(loaded.map((r) => [r.kind, Date.now()])) }, error: results.find((r) => !r.ok)?.error || "", lastAt: Date.now() }));
        if (loaded.length) {
          latest.current.notify(`${loaded.map((r) => LIST_WORDS[r.kind]).join(", ")} loaded from the shared folder`, 4000);
          latest.current.record("clinflow.share.lists", "Lists were loaded from the shared folder", { lists: loaded.map((r) => r.kind).join(",") });
        }
      } catch (error) {
        setListStatus((current) => ({ ...current, error: String(error?.message || error).slice(0, 160), lastAt: Date.now() }));
      }
    }
    syncLists();
    const listTimer = setInterval(syncLists, LIST_POLL_MS);
    return () => { stopped = true; clearInterval(timer); clearInterval(listTimer); setClinFlowMirror(null); activeShare.current = null; store.current = null; };
  }, [sharing, folders.shared, desktop]);

  // the background reader for the Incoming scans folder
  useEffect(() => {
    if (!running || !folders.incoming || !desktop) return undefined;
    const runner = createInboxRunner({
      folder: { ...incomingScans, finishStored: (name, ids) => incomingScans.finish(name, "stored", ids) },
      analyse: (file) => analyzeSyntheticDocument(file, true),
      split: (bytes) => (splitRef.current ? splitAtBlankPages(bytes).catch(() => null) : null),
      onStatus: setStatus,
      onLetter: async (item) => {
        if (item.problem) { latest.current.record("clinflow.inbox.problem", "A scan could not be read and was moved to the problems folder", { reason: "unreadable_or_too_large" }); return null; }
        const existing = latest.current.documents.find((d) => d.syntheticOcr?.fileSha256 && d.syntheticOcr.fileSha256 === item.response.fileSha256);
        const imported = existing ? [existing] : latest.current.onLetter(item.response);
        latest.current.record("clinflow.inbox.read", "A scanned letter was read in the background", { parts: item.parts, split: item.split, attempts: item.attempts, duplicate: Boolean(existing), automatedTransmission: false });
        if (!store.current || !imported?.[0]) return null;
        // the scan is only deleted once the letter is safely in the shared folder
        const outcome = await store.current.push(imported[0]);
        if (outcome.conflict) throw new Error("The shared folder already has a newer copy of this letter.");
        return { storedId: imported[0].id };
      },
    });
    runner.tick();
    const timer = setInterval(runner.tick, POLL_MS);
    return () => { clearInterval(timer); runner.stop(); };
  }, [running, folders.incoming, desktop]);

  async function choose(kind) {
    try {
      const path = await chooseFolder(kind);
      if (!path) return;
      setFolders((current) => ({ ...current, [kind]: path }));
      setMessage("");
      record(kind === "shared" ? "clinflow.share.folder_set" : "clinflow.inbox.folder_set", `The ${kind === "shared" ? "shared letters" : "Incoming scans"} folder was chosen on this computer`, {});
    } catch (error) { setMessage(error?.message || "The folder could not be chosen"); }
  }
  const startReading = () => { setRunning(true); setMessage(""); record("clinflow.inbox.start", "Reading the Incoming scans folder in the background was switched on", { attestedSyntheticOnly: true, splitAtBlankPages: split, sharing }); };
  const pauseReading = () => { setRunning(false); record("clinflow.inbox.pause", "Reading the Incoming scans folder was paused", { read: status.read, problems: status.problems }); };
  const startSharing = () => { setSharing(true); setMessage(""); record("clinflow.share.start", "Sharing letters through the shared folder was switched on", { attestedSyntheticOnly: true }); };
  const checkSharedFolder = async () => {
    setProbe({ checking: true });
    try { setProbe(await sharedLetters.probe()); } catch (error) { setProbe({ error: String(error?.message || error).slice(0, 200) }); }
  };
  const stopSharing = () => { setSharing(false); record("clinflow.share.stop", "Sharing letters through the shared folder was switched off", {}); };

  const Folder = ({ kind, label, busy }) => (
    <div className="cf-inbox-row"><b>{label}</b><span title={folders[kind]}>{folders[kind] || "Not chosen yet"}</span><button type="button" onClick={() => choose(kind)} disabled={busy}><FolderInput size={14} /> {folders[kind] ? "Change" : "Choose folder"}</button></div>
  );

  return (
    <>
      <button type="button" className={`cf-inbox-button${running || sharing ? " is-running" : ""}`} onClick={() => setOpen(true)} title="Letters scanned into the Incoming folder, and sharing letters with the team">
        <ScanLine size={15} aria-hidden="true" /> Incoming scans{sharing ? " · shared" : ""}{running ? ` · ${status.waiting}` : ""}
      </button>
      {open && (
        <div className="cf-modal cf-inbox" role="dialog" aria-modal="true" aria-label="Incoming scans and sharing"><div>
          <header className="cf-scorecard-head"><h2><ScanLine size={18} /> Incoming scans and sharing</h2><button type="button" className="cf-scorecard-close" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button></header>
          {!desktop ? <p className="cf-modal-guidance">Reading scans from a folder and sharing letters need the Primovex desktop app. Open ClinFlow there.</p> : (
            <>
              <label className="cf-inbox-check"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} disabled={running || sharing} /><span>I confirm every letter here is an <b>invented test letter</b> with no real patient or staff details. (Real letters cannot be used until the data protection sign-off is done.)</span></label>

              <h3 className="cf-score-title"><Share2 size={15} /> Share letters with the team</h3>
              <p className="cf-modal-guidance">Every computer using ClinFlow keeps the letters being worked on in one shared folder, so the whole coding team sees the same list, codes and decisions. When a letter is finished and its Docman PDF saved, ClinFlow deletes it from the shared folder. The folder must be shared with the named coding team only, and fully synced (not online-only) on every computer.</p>
              <Folder kind="shared" label="Shared letters folder (OneDrive)" busy={sharing} />
              <div className="cf-inbox-actions">
                {sharing
                  ? <button type="button" className="primary" onClick={stopSharing}><Pause size={14} /> Stop sharing</button>
                  : <button type="button" className="primary" onClick={startSharing} disabled={!folders.shared || !attested || !canRun}><Play size={14} /> Start sharing</button>}
                {sharing && <span>{shareStatus.count} letter{shareStatus.count === 1 ? "" : "s"} in the shared folder{shareStatus.lastAt ? ` · checked ${new Date(shareStatus.lastAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}{shareStatus.conflicts ? ` · ${shareStatus.conflicts} clash${shareStatus.conflicts === 1 ? "" : "es"}` : ""}</span>}
              </div>
              {shareStatus.error && sharing && <p className="cf-inbox-error">Still syncing, trying again: {shareStatus.error}</p>}
              {sharing && shareStatus.lastAt > 0 && shareStatus.count === 0 && !shareStatus.error && <p className="cf-inbox-error">No letters were found in the shared folder. Press "Check the folder" to see why.</p>}
              {folders.shared && <div className="cf-inbox-actions"><button type="button" onClick={checkSharedFolder} disabled={probe?.checking}>Check the folder</button><small className="cf-muted">Shows exactly what this computer can see in the shared folder.</small></div>}
              {probe && !probe.checking && (
                <ul className="cf-inbox-status">
                  {probe.error && !probe.folder ? <li className="cf-inbox-error">{probe.error}</li> : (
                    <>
                      <li>Looking in: <b>{probe.folder}</b></li>
                      <li>{probe.exists && probe.isFolder ? "The folder is there." : "That folder cannot be found on this computer."}</li>
                      <li>Letter folders found: <b>{probe.letters}</b>{probe.folders !== probe.letters ? ` (and ${probe.folders - probe.letters} other folder${probe.folders - probe.letters === 1 ? "" : "s"}${probe.otherFolders?.length ? `: ${probe.otherFolders.join(", ")}` : ""})` : ""}</li>
                      {probe.files > 0 && <li>Loose files in it: <b>{probe.files}</b>{probe.otherFiles?.length ? ` (${probe.otherFiles.join(", ")})` : ""}</li>}
                      {probe.letters === 0 && probe.folders > 0 && <li className="cf-inbox-error">There are folders, but none is named like a letter, so this is probably one level too high or too low. Choose the folder that holds the letter folders directly.</li>}
                      {probe.letters === 0 && probe.folders === 0 && probe.exists && <li className="cf-inbox-error">The folder looks empty to this computer. If File Explorer shows letters, they are probably still online-only: right-click the folder there and choose Always keep on this device.</li>}
                      {probe.error && <li className="cf-inbox-error">{probe.error}</li>}
                    </>
                  )}
                </ul>
              )}
              <p className="cf-muted"><small>The three lists (SNOMED, dm+d, abbreviations) can be kept once in a folder called <b>lists</b> inside the shared folder, as <b>snomed-uk-index.json.gz</b>, <b>dmd-index.json.gz</b> and <b>abbreviations.csv</b>. Every computer then loads them from there, and picks up a new file within about five minutes.{sharing ? ` In the shared folder now: ${listStatus.present.length ? listStatus.present.map((k) => LIST_WORDS[k]).join(", ") : "none yet"}.` : ""}</small></p>
              {listStatus.error && sharing && <p className="cf-inbox-error">A list could not be loaded yet: {listStatus.error}</p>}

              <h3 className="cf-score-title"><ScanLine size={15} /> Read scanned letters</h3>
              <p className="cf-modal-guidance">Scanners save letters into one folder and this computer reads each in the background. <b>Switch this on for one computer only</b>, or two computers will read the same scan. ClinFlow must stay open on it. With sharing on, a scan is deleted from the folder once its letter is safely in the shared folder; without sharing it is moved to "ClinFlow done".</p>
              <Folder kind="incoming" label="Incoming scans folder" busy={running} />
              <label className="cf-inbox-check"><input type="checkbox" checked={split} onChange={(event) => { setSplit(event.target.checked); remember("primovex.clinflow.inbox.split", event.target.checked); }} /><span>If a scan holds a stack of letters, split it at blank pages. <small>Better done in the scanner's own software. The original scan is kept untouched unless every letter from it is stored.</small></span></label>
              <div className="cf-inbox-actions">
                {running
                  ? <button type="button" className="primary" onClick={pauseReading}><Pause size={14} /> Pause reading</button>
                  : <button type="button" className="primary" onClick={startReading} disabled={!folders.incoming || !attested || !canRun}><Play size={14} /> Start reading</button>}
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
              <p className="cf-muted"><small>A scan is read once it has stopped growing, about ten seconds after it is saved. Each file must be a PDF of no more than 4 MB (one letter). Ones that could not be read go into a "ClinFlow problems" folder inside the Incoming folder.</small></p>
            </>
          )}
          <footer><button type="button" onClick={() => setOpen(false)}>Close</button></footer>
        </div></div>
      )}
    </>
  );
}
