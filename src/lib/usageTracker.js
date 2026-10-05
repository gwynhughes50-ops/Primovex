// Counts how long someone actively spends in each area of the app, ready to be
// reported to the server. Pure (the clock is passed in), so it can be tested.
//
// Time only counts while the window is visible and the person has touched the
// screen or keyboard in the last few minutes - a tab left open overnight, or a
// locked screen, isn't "time spent".

export const IDLE_AFTER_MS = 5 * 60 * 1000;

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

export function createUsageTracker({ now = () => Date.now(), idleAfterMs = IDLE_AFTER_MS } = {}) {
  let path = null;
  let visible = true;
  let lastTickAt = now();
  let lastInteractionAt = now();
  const pending = new Map(); // area -> { seconds (ms internally), visits }

  const row = (area) => {
    if (!pending.has(area)) pending.set(area, { ms: 0, visits: 0 });
    return pending.get(area);
  };

  // Credit the time since the last tick to the current area, if it was active time.
  function tick() {
    const t = now();
    if (path && visible) {
      const activeUntil = lastInteractionAt + idleAfterMs;
      const credited = Math.max(0, Math.min(t, activeUntil) - lastTickAt);
      if (credited > 0) row(path).ms += credited;
    }
    lastTickAt = t;
  }

  return {
    tick,
    // The person moved to an area (or the first one on sign-in).
    setPath(pathname) {
      const area = areaOf(pathname);
      tick();
      if (area === path) return;
      path = area;
      row(area).visits += 1;
      lastInteractionAt = Math.max(lastInteractionAt, now() - 1); // moving counts as being there
    },
    interact() {
      tick();
      lastInteractionAt = now();
    },
    setVisible(isVisible) {
      tick();
      visible = Boolean(isVisible);
      if (visible) lastTickAt = now();
    },
    // What to send now: whole seconds per area. Anything under a second stays
    // behind so it isn't lost to rounding.
    drain() {
      tick();
      const pages = [];
      for (const [area, value] of pending) {
        const seconds = Math.floor(value.ms / 1000);
        if (!seconds && !value.visits) continue;
        pages.push({ path: area, seconds, visits: value.visits });
        value.ms -= seconds * 1000;
        value.visits = 0;
      }
      return pages;
    },
    // A report that couldn't be sent goes back to be sent with the next one.
    restore(pages = []) {
      pages.forEach((page) => {
        const value = row(areaOf(page.path));
        value.ms += (Number(page.seconds) || 0) * 1000;
        value.visits += Number(page.visits) || 0;
      });
    },
    current: () => path,
  };
}
