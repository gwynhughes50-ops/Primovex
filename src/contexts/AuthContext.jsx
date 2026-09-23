// src/contexts/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, onIdTokenChanged, signOut as fbSignOut } from "firebase/auth";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { getCapabilitiesForProfile, hasCapability, hasAnyCapability, CAPABILITY_CATALOG } from "@/core/identity/capabilities";
import { getStoredPlatformMode, isSafeSyntheticMode, setPlatformMode } from "@/config/platformMode";
import { getActiveDemoProfile } from "@/config/demoMode";
import { writeAuditEvent } from "@/core/identity/auditService";
import { getDeviceId } from "@/services/deviceSessionService";
import { startShellyLocalPolling } from "@/services/connect/shellyLocalPoller";
import { recordLoginTimestamp } from "@/desktop/alerts/alertRules";

const AuthContext = createContext(null);

function createSyntheticUser(mode) {
  const profile = getActiveDemoProfile();
  const label = mode === "training" ? "Training User" : mode === "staging" ? "Staging User" : "Demo User";

  return {
    user: {
      uid: `synthetic-${mode}-user`,
      email: `${mode}@medtrak.local`,
      displayName: label,
      isAnonymous: true,
    },
    profile: {
      id: `synthetic-${mode}-user`,
      uid: `synthetic-${mode}-user`,
      email: `${mode}@medtrak.local`,
      displayName: label,
      role: "System Admin",
      organisationName: profile?.organisationName || "MedTrak Demo Practice",
      platformMode: mode,
      permissions: ["*"],
    },
  };
}

export function AuthProvider({ children }) {
  const [platformMode, setPlatformModeState] = useState(() => getStoredPlatformMode());
  const [user, setUser] = useState(null); // firebase auth user or synthetic demo user
  const [profile, setProfile] = useState(null); // firestore /users/{uid} or synthetic profile
  const [moduleToggles, setModuleToggles] = useState(null); // practice_config.moduleToggles — per-module on/off with an allow-list
  const [customRoles, setCustomRoles] = useState([]); // admin-defined roles/{roleId} docs, on top of the built-in ROLE_TEMPLATES
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    function handleModeChange(event) {
      setPlatformModeState(event?.detail?.mode || getStoredPlatformMode());
    }

    window.addEventListener("medtrak:platform-mode-changed", handleModeChange);
    window.addEventListener("storage", handleModeChange);

    return () => {
      window.removeEventListener("medtrak:platform-mode-changed", handleModeChange);
      window.removeEventListener("storage", handleModeChange);
    };
  }, []);

  useEffect(() => {
    let unsubscribeProfile = null;

    if (isSafeSyntheticMode(platformMode)) {
      const synthetic = createSyntheticUser(platformMode);
      setUser(synthetic.user);
      setProfile(synthetic.profile);
      setError("");
      setProfileLoading(false);
      setLoading(false);
      return () => {};
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setError("");
      // Powers the desktop "please sign in" corner reminder (see
      // DesktopLoginReminderHost) - it has no uid to key off while signed
      // out, so this is the one moment it can learn when someone last
      // actually signed in on this PC.
      if (u) {
        const lastSignIn = u.metadata?.lastSignInTime ? new Date(u.metadata.lastSignInTime).getTime() : Date.now();
        recordLoginTimestamp(Number.isFinite(lastSignIn) ? lastSignIn : Date.now());
      }

      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }
      setProfile(null);

      if (!u) {
        setProfileLoading(false);
        setLoading(false);
        return;
      }

      setProfileLoading(true);

      const ref = doc(db, "users", u.uid);

      unsubscribeProfile = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            setProfile(null);
            setError(
              "Your user profile is missing in Firestore (/users/{uid}). Ask an admin to create it."
            );
          } else {
            setProfile({ id: snap.id, ...snap.data() });
          }
          setProfileLoading(false);
          setLoading(false);
        },
        (err) => {
          setProfile(null);
          setProfileLoading(false);
          setLoading(false);
          setError(err?.message || String(err));
        }
      );
    });

    return () => {
      if (unsubscribeProfile) unsubscribeProfile();
      unsubscribeAuth();
    };
  }, [platformMode]);

  // Caches a bearer session (uid, ID token, expiry, device id) into native
  // Android storage so NfcSightingActivity can record a room-presence NFC
  // tap without ever booting this webview. window.PrimovexAuth only exists
  // inside the Android Tauri shell, so this is a no-op on desktop/web.
  useEffect(() => {
    if (isSafeSyntheticMode(platformMode)) return undefined;
    return onIdTokenChanged(auth, async (u) => {
      const bridge = window.PrimovexAuth;
      if (!bridge) return;
      if (!u) {
        bridge.clearSession?.();
        return;
      }
      try {
        const result = await u.getIdTokenResult();
        const expiresAtMillis = new Date(result.expirationTime).getTime();
        bridge.cacheSession?.(u.uid, result.token, expiresAtMillis, getDeviceId(), u.displayName || u.email || "");
      } catch (error) {
        console.warn("Unable to cache native session", error);
      }
    });
  }, [platformMode]);

  useEffect(() => {
    if (!user?.uid || String(user.uid).startsWith("synthetic-")) return undefined;
    const forwardGovernedAudit = (event) => {
      if (!event?.detail?.action) return;
      writeAuditEvent(event.detail).catch(() => {});
    };
    window.addEventListener("primovex:governed-audit", forwardGovernedAudit);
    return () => window.removeEventListener("primovex:governed-audit", forwardGovernedAudit);
  }, [user?.uid]);

  // Polls any registered local-network thermometers directly from this PC —
  // see shellyLocalPoller.js. Safely no-ops outside the Tauri desktop shell
  // and in synthetic/demo mode, same guard as the audit forwarder above.
  useEffect(() => {
    if (!user?.uid || String(user.uid).startsWith("synthetic-")) return undefined;
    return startShellyLocalPolling();
  }, [user?.uid]);

  // Lets an admin switch a whole module off for everyone except a chosen
  // allow-list (e.g. "turn ClinFlow off for everyone but me") without
  // touching per-role permissions. Read by every signed-in user (practice_config
  // already allows that), written only by admins — see PracticeAdministration's
  // Modules tab.
  // Both this and the roles subscription below are keyed on WHO is signed in,
  // not just the platform mode: the app starts listening the moment it loads,
  // and if nobody is signed in yet Firestore refuses the read, ends the
  // listener for good, and it never restarts after the person signs in — so
  // custom roles silently vanished (and newly saved ones never appeared)
  // until the app was fully restarted while already signed in.
  const authUid = user?.uid || null;

  useEffect(() => {
    if (isSafeSyntheticMode(platformMode) || !authUid) { setModuleToggles(null); return undefined; }
    return onSnapshot(doc(db, "practice_config", "main"), (snap) => {
      setModuleToggles(snap.exists() ? snap.data()?.moduleToggles || null : null);
    }, (err) => {
      console.error("Module toggles subscription failed", err);
      setModuleToggles(null);
    });
  }, [platformMode, authUid]);

  // Admin-created roles (see AdminDashboard's Add Role) — same live-subscription
  // shape as moduleToggles above, just a collection instead of a single doc.
  useEffect(() => {
    if (isSafeSyntheticMode(platformMode) || !authUid) { setCustomRoles([]); return undefined; }
    return onSnapshot(collection(db, "roles"), (snap) => {
      setCustomRoles(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.active !== false));
    }, (err) => {
      console.error("Custom roles subscription failed", err);
      setCustomRoles([]);
    });
  }, [platformMode, authUid]);

  const customRoleCapabilities = useMemo(
    () => Object.fromEntries(customRoles.map((r) => [r.name, r.capabilities || []])),
    [customRoles]
  );

  const role = profile?.role || null;
  const rawCapabilities = getCapabilitiesForProfile(profile, customRoleCapabilities);
  // Modules switched off (practice_config.moduleToggles) are removed from the
  // capabilities list itself — not just checked in can()/canAny() — because
  // navigation.js filters the sidebar straight off this array, bypassing
  // can() entirely. Filtering here means a blocked module disappears from
  // the nav AND its route, from one place, for every capability check in the
  // app including a System Admin's "*" wildcard (expanded against the full
  // catalog so the block actually applies rather than being shortcut past).
  const blockedDomains = new Set(
    Object.keys(moduleToggles || {}).filter((domain) => {
      const toggle = moduleToggles[domain];
      if (!toggle?.disabled) return false;
      return !(toggle.allowUids || []).includes(user?.uid);
    })
  );
  const capabilities = blockedDomains.size === 0
    ? rawCapabilities
    : (rawCapabilities.includes("*") ? CAPABILITY_CATALOG.map((item) => item.id) : rawCapabilities)
        .filter((capability) => !blockedDomains.has(String(capability).split(".")[0]));
  const can = (required) => hasCapability(capabilities, required);
  const canAny = (required = []) => hasAnyCapability(capabilities, required);
  const displayName =
    profile?.displayName ||
    user?.displayName ||
    profile?.email ||
    user?.email ||
    "";

  const isAdmin = role === "System Admin" || can("admin.access");

  async function signOut() {
    if (isSafeSyntheticMode(platformMode)) {
      setPlatformMode("live");
      setPlatformModeState("live");
      return;
    }
    await writeAuditEvent({
      action: "auth.logout",
      module: "identity",
      targetType: "user_session",
      targetId: user?.uid || "current",
      summary: "User signed out",
      classification: "security",
      disclosureLevel: "restricted",
    }).catch(() => {});
    return fbSignOut(auth);
  }

  const value = useMemo(
    () => ({
      user,
      profile,
      role,
      capabilities,
      can,
      canAny,
      customRoles,
      displayName,
      isAdmin,
      platformMode,
      isSyntheticMode: isSafeSyntheticMode(platformMode),
      loading: loading || profileLoading,
      error,
      signOut,
    }),
    [user, profile, role, capabilities, moduleToggles, customRoles, displayName, isAdmin, platformMode, loading, profileLoading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
