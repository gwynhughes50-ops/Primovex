import { useSearchParams } from "react-router-dom";
import { Laptop } from "lucide-react";
import LaptopRegisterPanel from "@/components/laptops/LaptopRegisterPanel";
import ComputerRegisterPanel from "@/components/computers/ComputerRegisterPanel";

// IT equipment (Operations > IT equipment): the laptop register and the PC register. The IT team add laptops and PCs, print their QR labels, record loans, returns and updates on laptops, and record a
// check on a PC as they go round the building. A reminder goes to whoever has a laptop when it is due an update or back.
const TABS = [["laptops", "Laptops"], ["pcs", "PCs"]];

export default function ITEquipment() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "pcs" ? "pcs" : "laptops";
  const open = params.get("open") || "";
  const go = (next) => setParams(next === "laptops" ? {} : { tab: next }, { replace: true });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-50"><Laptop className="h-6 w-6 text-teal-300" aria-hidden="true" /> IT equipment</h1>
        <p className="max-w-3xl text-sm text-slate-400">{tab === "pcs"
          ? "Every PC, where it is, what is installed and when it was last checked. Scan a PC's QR label on a phone to open it and record a check as you go round the building."
          : "Every laptop, who has it, and when it is next due an update. Scan a laptop's QR label on a phone to loan it out or take it back. The person who has it is reminded when an update or its return is due."}</p>
      </div>
      <div className="flex gap-1.5" role="tablist" aria-label="Equipment">
        {TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => go(key)} className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${tab === key ? "border-teal-300 bg-teal-400/20 text-slate-50" : "border-white/15 text-slate-300"}`}>{label}</button>)}
      </div>
      {tab === "pcs" ? <ComputerRegisterPanel initialId={open} /> : <LaptopRegisterPanel initialId={open} />}
    </div>
  );
}
