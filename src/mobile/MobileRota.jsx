import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import MyRota from "@/components/rota/MyRota";
import CoordinatorRota from "@/components/rota/CoordinatorRota";

// The phone's My rota: the reception team's own shifts, who is on each day, swaps and requests. With `coordinator`, the Reception rota for the Practice Manager and whoever builds the rota.
export default function MobileRota({ coordinator = false }) {
  const navigate = useNavigate();
  return (
    <main className="pvx-mobile-page pvx-mobile-stack">
      <button type="button" onClick={() => navigate("/", { replace: true })} className="inline-flex min-h-10 items-center gap-1.5 self-start text-sm font-semibold"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Home</button>
      <h1 className="text-xl font-black">{coordinator ? "Reception rota" : "My rota"}</h1>
      {coordinator ? <CoordinatorRota /> : <MyRota />}
    </main>
  );
}
