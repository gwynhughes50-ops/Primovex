// Counts how many times someone visits each area of the app, ready to be reported to the server. Pure, so it can be tested.
//
// It counts VISITS only. How long a person spends in an area is NOT recorded (a decision of 9 November 2026: time-per-area reads as productivity monitoring, and the security
// review does not need it). The sign-in session's start, last report and end are still kept, because "who signed in, when, on which device" is what the review is for.

// An area of the app, never a record: no query string, at most two path levels,
// nothing that looks like an id. (The server applies the same rule again.)
export function areaOf(pathname) {
  const segments = String(pathname || "")
    .split(/[?#]/)[0]
    .toLowerCase()
    .split("/")
    .map((segment) => segment.replace(/[^a-z0-9_-]/g, "").slice(0, 32))
    .filter(Boolean)
    .filter((segment) => !(segment.length >= 12 && /\d/.test(segment)))
    .slice(0, 2);
  return `/${segments.join("/")}`;
}

export function createUsageTracker() {
  let path = null;
  const pending = new Map(); // area -> visits not yet sent

  return {
    // The person moved to an area (or the first one on sign-in). Staying in the same area is not a new visit.
    setPath(pathname) {
      const area = areaOf(pathname);
      if (area === path) return;
      path = area;
      pending.set(area, (pending.get(area) || 0) + 1);
    },
    // What to send now: visits per area. Nothing else is in it.
    drain() {
      const pages = [...pending].filter(([, visits]) => visits > 0).map(([area, visits]) => ({ path: area, visits }));
      pending.clear();
      return pages;
    },
    // A report that couldn't be sent goes back to be sent with the next one.
    restore(pages = []) {
      pages.forEach((page) => {
        const area = areaOf(page.path);
        pending.set(area, (pending.get(area) || 0) + (Math.max(0, Math.floor(Number(page.visits))) || 0));
      });
    },
    current: () => path,
  };
}
