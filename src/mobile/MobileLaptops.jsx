import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import LaptopRegisterPanel from "@/components/laptops/LaptopRegisterPanel";
import MyLaptopPanel from "@/components/laptops/MyLaptopPanel";

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

// The phone's laptop register: scan a laptop's QR label, or find it, then loan it out, take it back or record an update.
export function MobileLaptops() {
  return <Frame title="IT equipment"><LaptopRegisterPanel scan /></Frame>;
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
