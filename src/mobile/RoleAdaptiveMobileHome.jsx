import { MapPin, Mic, QrCode, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSenseSession } from "@/contexts/SenseSessionContext";
import { getMobilePersona } from "./roleAdaptiveMobile";

export default function RoleAdaptiveMobileHome({ onAction }) {
  const { role, capabilities = [], displayName } = useAuth();
  const { activeSenseSession } = useSenseSession();
  const persona = getMobilePersona(role, capabilities);
  const firstName = String(displayName || "").trim().split(" ")[0] || "there";
  const PrimaryIcon = persona.primary.Icon;

  return (
    <section className="pvx-role-home">
      <div className="pvx-role-hero">
        <div>
          <p className="pvx-role-eyebrow">{persona.eyebrow}</p>
          <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {firstName}</h1>
          <p>{persona.headline}</p>
        </div>
        <button type="button" className="pvx-orb-command" onClick={() => onAction?.("orb")} aria-label="Wake Orb">
          <Sparkles className="h-6 w-6" />
          <span>Orb</span>
        </button>
      </div>

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

      <button type="button" className="pvx-primary-action" onClick={() => onAction?.(persona.primary.key)}>
        <span className="pvx-primary-icon"><PrimaryIcon className="h-7 w-7" /></span>
        <span><b>{persona.primary.label}</b><small>{persona.primary.helper}</small></span>
      </button>

      <div className="pvx-role-actions">
        {persona.actions.map(({ key, label, helper, Icon }) => (
          <button key={key} type="button" onClick={() => onAction?.(key)}>
            <Icon className="h-5 w-5" />
            <b>{label}</b>
            <small>{helper}</small>
          </button>
        ))}
      </div>

      <div className="pvx-orb-hint">
        <Mic className="h-4 w-4" />
        <span>Future command layer: say <b>“Orb”</b>, give the action, then carry on working.</span>
      </div>
    </section>
  );
}
