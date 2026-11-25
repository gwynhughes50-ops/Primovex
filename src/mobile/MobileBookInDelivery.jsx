import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import DocumentIntakePanel from "@/components/documents/DocumentIntakePanel";

// The phone's Book in a delivery: take a photo of the supplier's delivery note at the door (or choose a file), check each row, and book the stock in.
export default function MobileBookInDelivery() {
  const navigate = useNavigate();
  return (
    <main className="pvx-mobile-page pvx-mobile-stack min-w-0">
      <button type="button" onClick={() => navigate("/", { replace: true })} className="inline-flex min-h-10 items-center gap-1.5 self-start text-sm font-semibold"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back</button>
      <h1 className="text-xl font-black">Book in a delivery</h1>
      <div style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 7rem)" }}><DocumentIntakePanel phone onlyKind="delivery" /></div>
    </main>
  );
}
