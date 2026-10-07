import { invoke } from "@tauri-apps/api/core";
import "../components/pulse/PulseOrbFace.css";
import "./orb.css";

// The Pulse orb window. It knows nothing about the app: the desktop shell hands it a
// score, whether anything has changed and a short note, and it reports one thing back:
// the person wants Primovex open (double-click or Enter). Dragging moves the window and
// the shell notices where it was left and remembers it.

const orb = document.getElementById("orb");
const face = document.getElementById("face");
const status = document.getElementById("status");

let lastNote = "";

function setOrb(state = {}) {
  const changed = Boolean(state.changed);
  const note = String(state.note || (changed ? "Substantial change." : "System steady."));
  face.classList.toggle("pvx-orb--active", changed);
  const score = Number.isFinite(Number(state.score)) ? ` Practice Pulse ${Math.round(Number(state.score))}.` : "";
  const label = `Primovex Orb.${score} ${note} Double-click to open Primovex.`;
  orb.setAttribute("aria-label", label);
  orb.title = label.replace("Primovex Orb. ", "");
  // Say so (once) when something changes, for screen readers.
  if (note !== lastNote) status.textContent = note;
  lastNote = note;
}

window.__setOrb = setOrb;

function open() {
  invoke("orb_open_main").catch(() => {});
}

orb.addEventListener("dblclick", open);
orb.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    open();
  }
});

// A small movement starts the operating system's own drag; a double-click without
// movement opens Primovex.
let down = null;
orb.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  down = { x: event.clientX, y: event.clientY };
});
window.addEventListener("pointermove", (event) => {
  if (!down) return;
  if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) {
    down = null;
    invoke("orb_drag").catch(() => {});
  }
});
window.addEventListener("pointerup", () => { down = null; });

invoke("orb_payload").then((payload) => payload && setOrb(payload)).catch(() => {});
