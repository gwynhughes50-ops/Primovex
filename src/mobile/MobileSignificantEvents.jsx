import { useNavigate } from "react-router-dom";
import SignificantEventsView from "@/modules/governance/components/SignificantEventsView";

// Significant events on the phone: report one, follow the ones you reported, review what you have
// been asked to, and (for the team) run them. Same screens as the desktop.
export default function MobileSignificantEvents() {
  const navigate = useNavigate();
  return (
    <main className="pvx-mobile-page pvx-mobile-stack">
      <SignificantEventsView variant="mobile" onBack={() => navigate("/dashboard")} />
    </main>
  );
}
