import { MapPin, QrCode, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSenseSession } from "@/contexts/SenseSessionContext";
import { getRoleHome, visibleActions } from "./roleHomes";
import MobileAttentionStrip from "./MobileAttentionStrip";

// The phone home for everyone except the Cleaner (who has MobileCleanerHome): its tiles come from the role
// (see roleHomes.js). Managers and partners also see what needs attention at the top.
export default function RoleAdaptiveMobileHome({ onAction }) {
  const { role, capabilities = [], displayName } = useAuth();
  const { activeSenseSession } = useSenseSession();
  const home = getRoleHome(role, capabilities);
  const firstName = String(displayName || "").trim().split(" ")[0] || "there";
  const PrimaryIcon = home.primary.Icon;

  return (
    <section className="pvx-role-home">
      <div className="pvx-role-hero">
        <div>
          <p className="pvx-role-eyebrow">{home.eyebrow}</p>
          <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {firstName}</h1>
          <p>{home.headline}</p>
        </div>
        <button type="button" className="pvx-orb-command" onClick={() => onAction?.("orb")} aria-label="Ask the Orb">
          <Sparkles className="h-6 w-6" />
          <span>Orb</span>
        </button>
      </div>

      {home.attention && <MobileAttentionStrip onAction={onAction} />}

      {activeSenseSession ? (
        <button type="button" className="pvx-active-context" onClick={() => onAction?.("room")}>
          <MapPin className="h-5 w-5" />
          <span><small>Active space</small><b>{activeSenseSession.senseObjectName}</b></span>
          <span className="pvx-context-ready">Ready</span>
        </button>
      ) : (
        <button type="button" className="pvx-no-context" onClick={() => onAction?.("scan-room")}>
          <QrCode className="h-5 w-5" />
          <span><b>No room active</b><small>Tap NFC or scan the room code</small></span>
        </button>
      )}

      <button type="button" className={`pvx-primary-action${home.primary.compact ? " is-compact" : ""}`} onClick={() => onAction?.(home.primary.key)}>
        <span className="pvx-primary-icon"><PrimaryIcon className="h-7 w-7" /></span>
        <span><b>{home.primary.label}</b><small>{home.primary.helper}</small></span>
      </button>

      <div className="pvx-role-actions">
        {visibleActions(home, capabilities).map(({ key, label, helper, Icon }) => (
          <button key={key} type="button" onClick={() => onAction?.(key)}>
            <Icon className="h-5 w-5" />
            <b>{label}</b>
            <small>{helper}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
