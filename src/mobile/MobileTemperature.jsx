import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import MobileConnect from "./MobileConnect";
import MobileFridgeReadings from "./MobileFridgeReadings";

// The phone's Temperature screen. "Fridge checks" (the readings people take by hand) comes first, because that is what
// most people want to look at; "Sensors" is the Primovex Connect live view of the devices.
const TABS = [
  { key: "checks", label: "Fridge checks" },
  { key: "sensors", label: "Sensors" },
];

export default function MobileTemperature({ onBack }) {
  const [tab, setTab] = useState("checks");
  return (
    <div className="min-h-screen bg-[var(--medtrak-bg)] text-[var(--medtrak-text)]">
      <div className="flex items-center gap-3 px-4 pt-4">
        {onBack && <button type="button" onClick={onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--medtrak-border)]" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>}
        <h1 className="text-2xl font-black">Temperature</h1>
      </div>
      <div className="mx-4 mt-3 grid grid-cols-2 gap-1 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-1" role="tablist" aria-label="Temperature views">
        {TABS.map(({ key, label }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`min-h-11 rounded-xl text-sm font-bold ${tab === key ? "bg-[var(--medtrak-accent)] text-white" : "text-[var(--medtrak-muted)]"}`}>{label}</button>
        ))}
      </div>
      {tab === "checks" ? <MobileFridgeReadings /> : <MobileConnect />}
    </div>
  );
}
