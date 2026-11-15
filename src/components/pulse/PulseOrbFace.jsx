import { useId } from "react";
import "./PulseOrbFace.css";
import { orbSvg } from "./pulseOrbSvg.js";

const DESIGN_SIZE = 174;
const MODES = ["listening", "thinking", "speaking"];

// The Pulse orb's face: the Primovex P on a disc, in a ring with a light that orbits it. `size` is the box the widget gives it in pixels; the artwork is drawn at
// 174px and scaled to fit. `level` is the traffic light ("green" | "amber" | "red"): the orbiting light takes that colour; without it the light keeps the brand
// cyan. `active` = a substantial change (the light moves faster). `still` = no movement. `mode` = what Ask Primovex is doing: "listening" (pulse rings and voice
// bars), "thinking" (a long fast arc) or "speaking" (voice bars); empty when it is simply waiting.
// The disc is coloured from the theme (see PulseOrbFace.css), so it sits on the page instead of clashing with it.
export default function PulseOrbFace({ size = DESIGN_SIZE, active = false, still = false, level = "", mode = "" }) {
  const uid = useId();
  const scale = size / DESIGN_SIZE;
  const doing = MODES.includes(mode) ? mode : "";
  return (
    <div
      className={`pvx-orb${active ? " pvx-orb--active" : ""}${still ? " pvx-orb--still" : ""}${level ? ` pvx-orb--${level}` : ""}${doing ? ` pvx-orb--${doing}` : ""}`}
      style={{ transform: `scale(${scale})` }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: orbSvg(`pvx${uid}`) }}
    />
  );
}
