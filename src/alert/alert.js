import { invoke } from "@tauri-apps/api/core";
import "./alert.css";

// The corner alert. It knows nothing about the app: it asks the desktop shell
// what to say, shows it for a few seconds, and reports the one thing the person
// did (open / snooze / dismiss) or that it timed out.

const VISIBLE_MS = 15000;

const $ = (id) => document.getElementById(id);
const title = $("title");
const lines = $("lines");
const mainActions = $("mainActions");
const snoozeActions = $("snoozeActions");
const snoozeBtn = $("snoozeBtn");
const barFill = $("barFill");

let remaining = VISIBLE_MS;
let last = performance.now();
let hovering = false;
let choosingSnooze = false;
let timer = 0;
let finished = false;

function report(action) {
  if (finished) return;
  finished = true;
  clearInterval(timer);
  invoke("alert_action", { action }).catch(() => invoke("close_alert_popup").catch(() => {}));
}

// Counts down only while the person is neither pointing at the alert nor
// choosing a snooze time, so it never vanishes under their mouse.
function tick() {
  const now = performance.now();
  const dt = now - last;
  last = now;
  if (!hovering && !choosingSnooze) remaining -= dt;
  barFill.style.transform = `scaleX(${Math.max(0, remaining / VISIBLE_MS)})`;
  if (remaining <= 0) report("timeout");
}

function setSnoozeOpen(open) {
  choosingSnooze = open;
  mainActions.classList.toggle("hidden", open);
  snoozeActions.classList.toggle("hidden", !open);
  snoozeBtn.setAttribute("aria-expanded", String(open));
}

function render(payload) {
  title.textContent = payload?.title || "You have items that need attention";
  lines.replaceChildren(
    ...(payload?.lines || []).map((line) => {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = `dot ${line.tone === "danger" ? "danger" : "warning"}`;
      const text = document.createElement("span");
      text.textContent = line.text;
      li.append(dot, text);
      return li;
    })
  );
}

async function load() {
  let payload = null;
  try {
    payload = await invoke("alert_payload");
  } catch {
    // fall through with the generic wording
  }
  render(payload);
  setSnoozeOpen(false);
  remaining = VISIBLE_MS;
  last = performance.now();
  clearInterval(timer);
  timer = setInterval(tick, 100);
}

// Called by the desktop shell when a newer alert arrives while this one is still up.
window.__refreshAlert = () => {
  finished = false;
  load();
};

$("openBtn").addEventListener("click", () => report("open"));
$("dismissBtn").addEventListener("click", () => report("dismiss"));
snoozeBtn.addEventListener("click", () => setSnoozeOpen(true));
$("backBtn").addEventListener("click", () => setSnoozeOpen(false));
snoozeActions.querySelectorAll("[data-action]").forEach((btn) => btn.addEventListener("click", () => report(btn.dataset.action)));
document.addEventListener("mouseover", () => (hovering = true));
document.documentElement.addEventListener("mouseleave", () => (hovering = false));

load();
