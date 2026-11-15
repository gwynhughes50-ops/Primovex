import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import LaptopRegisterPanel from "@/components/laptops/LaptopRegisterPanel";
import MyLaptopPanel from "@/components/laptops/MyLaptopPanel";
import ComputerRegisterPanel from "@/components/computers/ComputerRegisterPanel";

function Frame({ title, children }) {
  const navigate = useNavigate();
  return (
    <main className="pvx-mobile-page pvx-mobile-stack">
      <button type="button" onClick={() => navigate("/", { replace: true })} className="inline-flex min-h-10 items-center gap-1.5 self-start text-sm font-semibold"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back</button>
      <h1 className="text-xl font-black">{title}</h1>
      {children}
    </main>
  );
}

// The phone's IT equipment: laptops (scan a laptop's QR label, or find it, then loan it out, take it back or record an update) and PCs (scan a PC's label as you go round the building, and record a check).
function Tabs({ tab, onChange }) {
  return (
    <div className="flex gap-1.5" role="tablist" aria-label="Equipment">
      {[["laptops", "Laptops"], ["pcs", "PCs"]].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => onChange(key)} className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${tab === key ? "border-[var(--medtrak-accent)] bg-[var(--medtrak-accent)] text-white" : "border-[var(--medtrak-border)]"}`}>{label}</button>)}
    </div>
  );
}
export function MobileLaptops() {
  const [tab, setTab] = useState("laptops");
  return <Frame title="IT equipment"><Tabs tab={tab} onChange={setTab} />{tab === "pcs" ? <ComputerRegisterPanel scan /> : <LaptopRegisterPanel scan />}</Frame>;
}

// Where a PC's own QR label lands when the phone's camera reads it: that PC open, with its check. PCs are for the IT team (who can see the register); nobody else has anything here.
export function ComputerLanding({ id }) {
  const { can } = useAuth();
  if (can("itAssets.read") || can("itAssets.manage")) return <Frame title="IT equipment"><ComputerRegisterPanel scan initialId={id} /></Frame>;
  return <Frame title="IT equipment"><p className="text-sm">That label is for the IT team. Ask whoever looks after the computers.</p></Frame>;
}

// Where a laptop's own QR label lands when the phone's camera reads it. The IT team get that laptop open with its actions; anyone else gets their own laptop (they cannot see other people's).
export function LaptopLanding({ id }) {
  const { can } = useAuth();
  if (can("itAssets.read") || can("itAssets.manage")) return <Frame title="IT equipment"><LaptopRegisterPanel scan initialId={id} /></Frame>;
  return <Frame title="My laptop"><MyLaptopPanel /></Frame>;
}

export function MobileMyLaptop() {
  return <Frame title="My laptop"><MyLaptopPanel /></Frame>;
}
