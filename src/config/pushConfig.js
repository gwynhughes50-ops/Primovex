// The public key that lets Primovex send alerts to phones (Firebase console > Project settings > Cloud Messaging > Web
// Push certificates > Key pair). It is a public key, safe to keep in the app. Until it is filled in, "Phone alerts" in
// the phone's Me tab says it isn't set up yet.
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || "BE71l6uhwV-6-khbJ5AHoDuOLPJGTeP_pUvqoB6kWaeCspM0goPO2XdeSpAkJi0LATUA_0U4dEV10ZfBa71xI9o";
