import "./PulseOrbFace.css";

const DESIGN_SIZE = 174;

// The Pulse orb's face. `size` is the box the widget gives it in pixels; the artwork is
// drawn at 174px and scaled to fit. `active` = a substantial change (faster pulse). `level` = the traffic light
// ("green" | "amber" | "red"); without it the orb keeps its original blue.
export default function PulseOrbFace({ size = DESIGN_SIZE, active = false, still = false, level = "" }) {
  const scale = size / DESIGN_SIZE;
  return (
    <div
      className={`pvx-orb${active ? " pvx-orb--active" : ""}${still ? " pvx-orb--still" : ""}${level ? ` pvx-orb--${level}` : ""}`}
      style={{ transform: `scale(${scale})` }}
      aria-hidden="true"
    >
      <span className="pvx-orb-ring" />
      <span className="pvx-orb-core" />
      <span className="pvx-orb-light" />
      <span className="pvx-orb-spark" />
    </div>
  );
}
