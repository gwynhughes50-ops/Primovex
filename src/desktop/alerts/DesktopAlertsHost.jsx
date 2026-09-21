import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { isTauriRuntime } from "@/release/updateService";
import { SAR_STATUSES } from "@/modules/governance/services/sarService";
import { CONCERN_STATUSES } from "@/modules/governance/services/concernService";
import {
  afterDismiss,
  afterShown,
  afterSnooze,
  buildAlertPayload,
  isDesktopAlertsEnabled,
  loadAlertState,
  saveAlertState,
  shouldShowAlert,
  summariseDueItems,
} from "./alertRules";

const CHECK_EVERY_MS = 30 * 1000;

const OPEN_SAR_STATUSES = [SAR_STATUSES.new, SAR_STATUSES.assigned, SAR_STATUSES.in_progress, SAR_STATUSES.quality_check];
const OPEN_CONCERN_STATUSES = [
  CONCERN_STATUSES.received,
  CONCERN_STATUSES.acknowledged,
  CONCERN_STATUSES.listening,
  CONCERN_STATUSES.early_resolution,
  CONCERN_STATUSES.investigation,
  CONCERN_STATUSES.response,
  CONCERN_STATUSES.learning,
];

// Watches the open SARs and concerns for the people on those teams and, when
// something is overdue or due within two days, asks the desktop shell to show
// the corner alert (see src-tauri/src/lib.rs and src/alert). Renders nothing.
// Only runs in the desktop app; the alert holds counts only.
export default function DesktopAlertsHost() {
  const { user, displayName, can } = useAuth();
  const navigate = useNavigate();
  const uid = user?.uid || null;
  const inSarTeam = can("governance.manageSars");
  const inConcernsTeam = can("governance.concernsTeam");
  const active = isTauriRuntime() && Boolean(uid) && (inSarTeam || inConcernsTeam);

  const rows = useRef({ sars: [], concerns: [] });
  const ready = useRef({ sars: true, concerns: true });
  const lastPayload = useRef(null);
  const latest = useRef({});
  latest.current = { uid, displayName, navigate };

  const summarise = () => summariseDueItems({ sars: rows.current.sars, concerns: rows.current.concerns, now: Date.now() });

  function evaluate() {
    const { uid: who, displayName: name } = latest.current;
    if (!who || !ready.current.sars || !ready.current.concerns) return;
    if (!isDesktopAlertsEnabled(who)) {
      invoke("close_alert_popup").catch(() => {});
      return;
    }
    const now = Date.now();
    const summary = summarise();
    const state = loadAlertState(who);
    if (!shouldShowAlert({ summary, state, now })) return;

    const payload = buildAlertPayload({ displayName: name, counts: summary.counts });
    lastPayload.current = payload;
    saveAlertState(who, afterShown(state, summary, now));
    invoke("show_alert_popup", { payload }).catch((err) => console.warn("Desktop alert could not be shown.", err));
  }
  const evaluateRef = useRef(evaluate);
  evaluateRef.current = evaluate;

  // Live lists of the open items this person's team can see.
  useEffect(() => {
    if (!active) return undefined;
    rows.current = { sars: [], concerns: [] };
    ready.current = { sars: !inSarTeam, concerns: !inConcernsTeam };
    const unsubs = [];

    const watch = (key, enabled, collectionName, statuses) => {
      if (!enabled) return;
      unsubs.push(
        onSnapshot(
          query(collection(db, collectionName), where("status", "in", statuses)),
          (snap) => {
            rows.current[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            ready.current[key] = true;
            evaluateRef.current();
          },
          (err) => {
            // Not fatal (e.g. rules refuse this account): carry on without this team's items.
            console.warn(`Desktop alerts: could not read ${collectionName}.`, err);
            rows.current[key] = [];
            ready.current[key] = true;
          }
        )
      );
    };
    watch("sars", inSarTeam, "governance_sars", OPEN_SAR_STATUSES);
    watch("concerns", inConcernsTeam, "governance_concerns", OPEN_CONCERN_STATUSES);

    // Items become overdue with the passing of time, not because a record changed.
    const timer = window.setInterval(() => evaluateRef.current(), CHECK_EVERY_MS);
    return () => {
      unsubs.forEach((u) => u());
      window.clearInterval(timer);
      invoke("close_alert_popup").catch(() => {});
    };
  }, [active, uid, inSarTeam, inConcernsTeam]);

  // What the person chose on the alert.
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let unlisten = null;
    listen("alert-action", (event) => {
      const action = event.payload;
      const { uid: who, navigate: go } = latest.current;
      if (!who) return;
      if (action === "open") {
        go(lastPayload.current?.openPath || "/governance/sars");
      } else if (action === "dismiss") {
        saveAlertState(who, afterDismiss(loadAlertState(who), summarise()));
      } else if (typeof action === "string" && action.startsWith("snooze_")) {
        saveAlertState(who, afterSnooze(loadAlertState(who), action));
      }
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((err) => console.warn("Desktop alerts: could not listen for actions.", err));
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [active, uid]);

  return null;
}
