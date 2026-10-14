// The public key that lets Primovex send alerts to phones (Firebase console > Project settings > Cloud Messaging > Web
// Push certificates > Key pair). It is a public key, safe to keep in the app. Until it is filled in, "Phone alerts" in
// the phone's Me tab says it isn't set up yet.
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || "";
