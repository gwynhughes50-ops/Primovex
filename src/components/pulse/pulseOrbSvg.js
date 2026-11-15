import { P_BOWL, P_PLUS, P_STEM } from "./pMarkPaths.js";

// The orb's drawing: the Primovex P on a disc, a ring round it, and a light that orbits. One source for the React face (PulseOrbFace.jsx) and the separate orb
// window (src/orb-window/orb.js), so the two can never drift apart. Colours that follow the theme or the traffic light are set in PulseOrbFace.css; only the brand
// gradients are here. `uid` keeps each orb's gradient and glow ids its own when several are on one page.
//
// Layers, back to front: two pulse rings (listening), the ring's track, the voice bars (listening and speaking), the orbiting arc and light, the disc, the P.

const BARS = 36;

export function orbSvg(uid = "o") {
  const id = String(uid).replace(/[^a-zA-Z0-9_-]/g, "") || "o";
  let bars = "";
  for (let i = 0; i < BARS; i += 1) bars += `<g transform="rotate(${i * (360 / BARS)} 100 100)"><line class="pvx-orb-bar" style="--i:${i}" x1="100" y1="26" x2="100" y2="12"/></g>`;
  return `<svg class="pvx-orb-svg" viewBox="0 0 200 200" focusable="false" aria-hidden="true">`
    + `<defs>`
    + `<linearGradient id="${id}-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#25c6ee"/><stop offset=".5" stop-color="#4a6df0"/><stop offset="1" stop-color="#8d5cff"/></linearGradient>`
    + `<linearGradient id="${id}-bowl" x1=".1" y1=".9" x2=".9" y2=".1"><stop offset="0" stop-color="#3b6cf0"/><stop offset=".55" stop-color="#6a5cf8"/><stop offset="1" stop-color="#8d5cff"/></linearGradient>`
    + `<linearGradient id="${id}-stem" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#25c6ee"/><stop offset="1" stop-color="#3a78e8"/></linearGradient>`
    + `<filter id="${id}-glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3.2"/></filter>`
    + `</defs>`
    + `<circle class="pvx-orb-pulse" cx="100" cy="100" r="76"/><circle class="pvx-orb-pulse pvx-orb-pulse--b" cx="100" cy="100" r="76"/>`
    + `<circle class="pvx-orb-track" cx="100" cy="100" r="76"/>`
    + `<g class="pvx-orb-bars">${bars}</g>`
    + `<g class="pvx-orb-orbit"><circle class="pvx-orb-arc" cx="100" cy="100" r="76" stroke="url(#${id}-ring)"/><circle class="pvx-orb-dot" cx="138" cy="165.8" r="8"/></g>`
    + `<g class="pvx-orb-beat"><circle class="pvx-orb-disc" cx="100" cy="100" r="64"/>`
    + `<g transform="translate(67.3 67) scale(.66)">`
    + `<path class="pvx-orb-bowl" d="${P_BOWL}" fill="url(#${id}-bowl)"/>`
    + `<path class="pvx-orb-stem" d="${P_STEM}" fill="url(#${id}-stem)"/>`
    + `<path class="pvx-orb-plus-glow" d="${P_PLUS}" filter="url(#${id}-glow)"/>`
    + `<path class="pvx-orb-plus" d="${P_PLUS}"/>`
    + `</g></g></svg>`;
}
