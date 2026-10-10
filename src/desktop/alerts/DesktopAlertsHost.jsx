import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { summariseNotifications } from "@/services/notificationCentreService";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { isTauriRuntime } from "@/release/updateService";
import useExpirySettings from "@/hooks/useExpirySettings";
import { getExpirySettings, summariseStockAlerts } from "@/lib/stockAlerts";
import { normalizeStockItemCategory } from "@/services/stockService";
import { isPersonMessage } from "@/messaging/messageCard";
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

// Watches the open SARs and concerns for the people on those teams, and the
// stock list for everyone who can view inventory, and when something is
// overdue / due within two days / expired / expiring soon / out of stock / low,
// asks the desktop shell to show the corner alert (see src-tauri/src/lib.rs and
// src/alert). Renders nothing. Only runs in the desktop app; the alert holds
// counts only. What counts as an expiring or low stock item is decided in
// src/lib/stockAlerts.js, the same rule every other screen uses, and an alert
// someone has already resolved on the Alerts page is left out.
export default function DesktopAlertsHost() {
  const { user, displayName, can } = useAuth();
  const navigate = useNavigate();
  const uid = user?.uid || null;
  const inSarTeam = can("governance.manageSars");
  const inConcernsTeam = can("governance.concernsTeam");
  const canSeeStock = can("inventory.read");
  // Everyone signed in gets the pop-up for their own new notifications; the teams add their lists.
  const active = isTauriRuntime() && Boolean(uid);
  // Keeps the practice's "expiring soon" windows live for the checks below.
  useExpirySettings();

  const rows = useRef({ sars: [], concerns: [], stock: [], resolved: {}, notifications: [] });
  const ready = useRef({ sars: true, concerns: true, stock: true });
  const lastPayload = useRef(null);
  const latest = useRef({});
  latest.current = { uid, displayName, navigate };
  const canSeeStockRef = useRef(canSeeStock);
  canSeeStockRef.current = canSeeStock;

  const summarise = () => {
    const stock = canSeeStockRef.current
      ? summariseStockAlerts(rows.current.stock, {
          categoryOf: (item) => normalizeStockItemCategory(item).category,
          settings: getExpirySettings(),
          now: new Date(),
          resolved: rows.current.resolved,
        }).alerts
      : [];
    return summariseDueItems({ sars: rows.current.sars, concerns: rows.current.concerns, stock, notifications: rows.current.notifications, now: Date.now() });
  };

  function evaluate() {
    const { uid: who, displayName: name } = latest.current;
    if (!who || !ready.current.sars || !ready.current.concerns || !ready.current.stock) return;
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
    rows.current = { sars: [], concerns: [], stock: [], resolved: {}, notifications: [] };
    ready.current = { sars: !inSarTeam, concerns: !inConcernsTeam, stock: !canSeeStock };
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

    // This person's own unread notifications (messages from colleagues, reminders).
    unsubs.push(
      onSnapshot(
        query(collection(db, "users", uid, "notifications"), orderBy("createdAt", "desc"), limit(50)),
        (snap) => {
          const unread = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((row) => row.read !== true && !isPersonMessage(row));
          rows.current.notifications = summariseNotifications(unread).active.map((row) => ({ id: row.id, priority: row.priority }));
          evaluateRef.current();
        },
        (err) => console.warn("Desktop alerts: could not read notifications.", err)
      )
    );

    // Stock for everyone who can view inventory, and the alerts already marked
    // resolved on the Alerts page (so those aren't nagged about again).
    if (canSeeStock) {
      unsubs.push(
        onSnapshot(
          collection(db, "stock_items"),
          (snap) => {
            rows.current.stock = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            ready.current.stock = true;
            evaluateRef.current();
          },
          (err) => {
            console.warn("Desktop alerts: could not read stock_items.", err);
            rows.current.stock = [];
            ready.current.stock = true;
          }
        )
      );
      unsubs.push(
        onSnapshot(
          collection(db, "alert_resolutions"),
          (snap) => {
            const next = {};
            snap.docs.forEach((d) => { next[d.id] = true; });
            rows.current.resolved = next;
            evaluateRef.current();
          },
          (err) => console.warn("Desktop alerts: could not read alert_resolutions.", err)
        )
      );
    }

    // Items become overdue with the passing of time, not because a record changed.
    const timer = window.setInterval(() => evaluateRef.current(), CHECK_EVERY_MS);
    return () => {
      unsubs.forEach((u) => u());
      window.clearInterval(timer);
      invoke("close_alert_popup").catch(() => {});
    };
  }, [active, uid, inSarTeam, inConcernsTeam, canSeeStock]);

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
