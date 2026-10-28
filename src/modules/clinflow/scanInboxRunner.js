// The background reader for the Incoming scans folder. It looks at the folder every few seconds, waits until a scan has stopped growing (the scanner may still be writing it),
// reads each letter one at a time, hands the result to the letters list, and moves the scan out of the way: into "done" when it has been read, "problems" when it cannot be.
// A scan is never deleted. A temporary fault (the network, the reader busy) is tried again a few times before a scan is given up on. The folder, the reader and the clock
// are passed in, so this is tested without any of them. Pure apart from those.

export const MAX_LETTER_BYTES = 4 * 1024 * 1024; // what the reader accepts for one letter
export const SETTLE_MS = 8000;
export const POLL_MS = 10000;
export const MAX_ATTEMPTS = 3;

// a scan that will never read, however many times it is tried (too large, not a PDF): it goes straight to "problems"
export class ScanProblem extends Error {}

const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const stemOf = (name) => name.replace(/\.pdf$/i, "");

export function createInboxRunner({ folder, analyse, split = null, onLetter, onStatus = () => {}, now = () => Date.now(), pauseMs = 1500, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), settleMs = SETTLE_MS, maxAttempts = MAX_ATTEMPTS }) {
  const sizes = new Map(); // name -> size at the last look: a scan is ready once it is old enough and the same size twice running
  const attempts = new Map();
  const finishedParts = new Map(); // name -> parts already read, so a retry does not read a letter twice
  const status = { waiting: 0, current: "", read: 0, problems: 0, lastProblem: "", lastReadAt: 0, error: "" };
  let busy = false;
  let stopped = false;
  const publish = () => onStatus({ ...status });

  async function problem(name, reason) {
    status.problems += 1;
    status.lastProblem = reason;
    try { await folder.finish(name, "problem"); } catch { /* it stays where it is and will be looked at again */ }
    attempts.delete(name); finishedParts.delete(name); sizes.delete(name);
    onLetter({ problem: true, reason });
  }

  async function processOne(file) {
    status.current = file.name;
    publish();
    try {
      if (file.size > 25 * 1024 * 1024) throw new ScanProblem(`The scan is too large (${megabytes(file.size)}; the limit is 25 MB).`);
      const bytes = await folder.read(file.name);
      const split_ = split ? await split(bytes) : null;
      const letters = split_ ? split_.parts : [{ bytes }];
      const done = finishedParts.get(file.name) || new Set();
      finishedParts.set(file.name, done);
      for (let index = 0; index < letters.length; index += 1) {
        if (done.has(index)) continue;
        const part = letters[index].bytes;
        if (part.length > MAX_LETTER_BYTES) throw new ScanProblem(`${letters.length > 1 ? `Letter ${index + 1} of the scan` : "The scan"} is too large (${megabytes(part.length)}; the limit is 4 MB). Scan at a lower resolution or in black and white.`);
        const name = letters.length > 1 ? `${stemOf(file.name)} - letter ${index + 1} of ${letters.length}.pdf` : file.name;
        const letter = new File([part], name, { type: "application/pdf" });
        const response = await analyse(letter);
        onLetter({ response: { ...response, sourceFile: letter }, parts: letters.length, split: Boolean(split_), attempts: (attempts.get(file.name) || 0) + 1 });
        done.add(index);
        status.read += 1;
        status.lastReadAt = now();
        publish();
        if (index < letters.length - 1) await sleep(pauseMs);
      }
      await folder.finish(file.name, "done");
      attempts.delete(file.name); finishedParts.delete(file.name); sizes.delete(file.name);
      status.error = "";
    } catch (error) {
      if (error instanceof ScanProblem) return problem(file.name, error.message);
      const tries = (attempts.get(file.name) || 0) + 1;
      attempts.set(file.name, tries);
      status.error = String(error?.message || error || "The scan could not be read").slice(0, 200);
      if (tries >= maxAttempts) await problem(file.name, `It could not be read after ${tries} tries: ${status.error}`);
    }
  }

  // One look at the folder. Safe to call on a timer: a look that is still going stops the next one starting.
  async function tick() {
    if (busy || stopped) return;
    busy = true;
    try {
      const files = await folder.list();
      status.waiting = files.length;
      const ready = files.filter((file) => sizes.get(file.name) === file.size && now() - file.modifiedMs >= settleMs);
      files.forEach((file) => sizes.set(file.name, file.size));
      for (const name of [...sizes.keys()]) if (!files.some((file) => file.name === name)) sizes.delete(name);
      publish();
      for (const file of ready) {
        if (stopped) break;
        await processOne(file);
        status.waiting = Math.max(0, status.waiting - 1);
        if (!stopped) await sleep(pauseMs);
      }
    } catch (error) {
      status.error = String(error?.message || error || "The Incoming scans folder could not be read").slice(0, 200);
    } finally {
      status.current = "";
      busy = false;
      publish();
    }
  }

  return { tick, stop: () => { stopped = true; }, status: () => ({ ...status }) };
}
