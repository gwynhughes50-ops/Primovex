import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauriRuntime } from "@/release/updateService";
import {
  LOGIN_REMINDER_GRACE_MS,
  LOGIN_REMINDER_ID,
  LOGIN_REMINDER_SUMMARY,
  afterShown,
  afterSnooze,
  buildLoginReminderPayload,
  daysSinceLogin,
  isDesktopAlertsEnabled,
  loadAlertState,
  readLastLoginAt,
  saveAlertState,
  shouldShowAlert,
} from "./alertRules";

const CHECK_EVERY_MS = 30 * 1000;

// The same corner popup as DesktopAlertsHost, mounted on the opposite screen:
// /login, when nobody is signed in yet. Only active inside the Tauri desktop
// shell. Since DesktopApp's routes are mutually exclusive, this and
// DesktopAlertsHost never run at the same time. Renders nothing.
export default function DesktopLoginReminderHost() {
  const active = isTauriRuntime();
  const mountedAt = useRef(Date.now());

  function evaluate() {
    if (!isDesktopAlertsEnabled(LOGIN_REMINDER_ID)) return;
    const now = Date.now();
    if (now - mountedAt.current < LOGIN_REMINDER_GRACE_MS) return;
    const state = loadAlertState(LOGIN_REMINDER_ID);
    if (!shouldShowAlert({ summary: LOGIN_REMINDER_SUMMARY, state, now })) return;

    const days = daysSinceLogin(readLastLoginAt(), now);
    const payload = buildLoginReminderPayload({ days });
    saveAlertState(LOGIN_REMINDER_ID, afterShown(state, LOGIN_REMINDER_SUMMARY, now));
    invoke("show_alert_popup", { payload }).catch((err) => console.warn("Login reminder could not be shown.", err));
  }
  const evaluateRef = useRef(evaluate);
  evaluateRef.current = evaluate;

  useEffect(() => {
    if (!active) return undefined;
    mountedAt.current = Date.now();
    const timer = window.setInterval(() => evaluateRef.current(), CHECK_EVERY_MS);
    return () => {
      window.clearInterval(timer);
      invoke("close_alert_popup").catch(() => {});
    };
  }, [active]);

  // "open" needs nothing here: the native side already brings the main window
  // to the front on any action, and that's the login screen itself. "dismiss"
  // and "timeout" are also left alone - there is no new item to wait for, so
  // the popup just returns on the normal hourly cadence. Only snoozing changes
  // anything.
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let unlisten = null;
    listen("alert-action", (event) => {
      const action = event.payload;
      if (typeof action === "string" && action.startsWith("snooze_")) {
        saveAlertState(LOGIN_REMINDER_ID, afterSnooze(loadAlertState(LOGIN_REMINDER_ID), action));
      }
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((err) => console.warn("Login reminder: could not listen for actions.", err));
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [active]);

  return null;
}
