import { useSearchParams } from "react-router-dom";
import { Laptop } from "lucide-react";
import LaptopRegisterPanel from "@/components/laptops/LaptopRegisterPanel";

// IT equipment (Operations > IT equipment): the laptop register. The IT team add laptops, print their QR labels, and record loans, returns and updates. A reminder goes to whoever has a laptop when
// it is due an update or back.
export default function ITEquipment() {
  const [params] = useSearchParams();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-50"><Laptop className="h-6 w-6 text-teal-300" aria-hidden="true" /> IT equipment</h1>
        <p className="max-w-3xl text-sm text-slate-400">Every laptop, who has it, and when it is next due an update. Scan a laptop's QR label on a phone to loan it out or take it back. The person who has it is reminded when an update or its return is due.</p>
      </div>
      <LaptopRegisterPanel initialId={params.get("open") || ""} />
    </div>
  );
}
