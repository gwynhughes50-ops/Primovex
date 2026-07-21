// src/contexts/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut as fbSignOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { getCapabilitiesForProfile, hasCapability, hasAnyCapability } from "@/core/identity/capabilities";
import { getStoredPlatformMode, isSafeSyntheticMode, setPlatformMode } from "@/config/platformMode";
import { getActiveDemoProfile } from "@/config/demoMode";

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

  const role = profile?.role || null;
  const capabilities = getCapabilitiesForProfile(profile);
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
      displayName,
      isAdmin,
      platformMode,
      isSyntheticMode: isSafeSyntheticMode(platformMode),
      loading: loading || profileLoading,
      error,
      signOut,
    }),
    [user, profile, role, capabilities, displayName, isAdmin, platformMode, loading, profileLoading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
