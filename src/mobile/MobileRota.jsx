import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import MyRota from "@/components/rota/MyRota";

// The phone's My rota: the reception team's own shifts, who is on each day, swaps and requests.
export default function MobileRota() {
  const navigate = useNavigate();
  return (
    <main className="pvx-mobile-page pvx-mobile-stack">
      <button type="button" onClick={() => navigate("/", { replace: true })} className="inline-flex min-h-10 items-center gap-1.5 self-start text-sm font-semibold"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Home</button>
      <h1 className="text-xl font-black">My rota</h1>
      <MyRota />
    </main>
  );
}
