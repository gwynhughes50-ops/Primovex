import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { deleteToken, getMessaging, getToken } from "firebase/messaging";
import { app, db } from "@/lib/firebase";
import { VAPID_PUBLIC_KEY } from "@/config/pushConfig";
import { isIos, isStandalone, isTauriApp } from "@/lib/platformInfo";

// Alerts on the phone's lock screen, for the web app added to the Home Screen (an iPhone needs it installed first).
// The phone gives Primovex a token; it is kept under the person's own account (users/{uid}/push_tokens) and a Cloud
// Function sends an alert to it whenever something new arrives in their notifications.

const SW_URL = "/firebase-messaging-sw.js";
const KEY = "primovex.push.enabled";

// SHA-256 of the token, as the document id (so the same phone is one record)
async function tokenId(token) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

// What this device can do and what to tell the person.
//   state: "unsupported" | "needs-home-screen" | "not-set-up" | "blocked" | "off" | "on"
export function pushStatus() {
  if (typeof window === "undefined" || isTauriApp()) return { state: "unsupported", message: "Phone alerts for the Android app need the next update. Use the web app for alerts." };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { state: isIos() && !isStandalone() ? "needs-home-screen" : "unsupported", message: isIos() && !isStandalone() ? "On an iPhone, add Primovex to your Home Screen first (Share, then Add to Home Screen), then open it from the icon." : "This browser can't show alerts." };
  }
  if (isIos() && !isStandalone()) return { state: "needs-home-screen", message: "Add Primovex to your Home Screen first (Share, then Add to Home Screen), then open it from the icon and turn this on." };
  if (!VAPID_PUBLIC_KEY) return { state: "not-set-up", message: "Phone alerts have not been set up for the practice yet." };
  if (Notification.permission === "denied") return { state: "blocked", message: "Alerts are blocked for Primovex. Turn them on in your phone's Settings, then Notifications, then Primovex." };
  let on = false;
  try { on = window.localStorage.getItem(KEY) === "1" && Notification.permission === "granted"; } catch { on = false; }
  return { state: on ? "on" : "off", message: on ? "Alerts are on for this phone." : "Alerts are off for this phone." };
}

export async function enablePush(user) {
  const status = pushStatus();
  if (!["off", "on"].includes(status.state)) throw new Error(status.message);
  if (!user?.uid) throw new Error("Sign in first.");
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Alerts were not allowed. You can change this in your phone's Settings.");
  const registration = await navigator.serviceWorker.register(SW_URL);
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_PUBLIC_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error("This phone did not give Primovex an alert address. Try again.");
  await setDoc(doc(db, "users", user.uid, "push_tokens", await tokenId(token)), {
    token,
    platform: isIos() ? "ios-web" : "web",
    installed: isStandalone(),
    createdAt: serverTimestamp(),
  });
  try { window.localStorage.setItem(KEY, "1"); } catch { /* the setting just won't be remembered */ }
}

export async function disablePush(user) {
  try {
    const messaging = getMessaging(app);
    const registration = await navigator.serviceWorker.getRegistration(SW_URL);
    const token = registration ? await getToken(messaging, { vapidKey: VAPID_PUBLIC_KEY, serviceWorkerRegistration: registration }).catch(() => "") : "";
    if (token && user?.uid) await deleteDoc(doc(db, "users", user.uid, "push_tokens", await tokenId(token))).catch(() => {});
    await deleteToken(messaging).catch(() => {});
  } finally {
    try { window.localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
  }
}
