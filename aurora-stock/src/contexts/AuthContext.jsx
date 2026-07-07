// src/contexts/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut as fbSignOut } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // firebase auth user
  const [profile, setProfile] = useState(null); // firestore /users/{uid}
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let unsubscribeProfile = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setError("");

      // Reset profile state when auth changes
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

      // Live subscribe to profile doc so UI updates immediately after role changes
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
  }, []);

  const role = profile?.role || null;
  const displayName =
    profile?.displayName ||
    user?.displayName ||
    profile?.email ||
    user?.email ||
    "";

  const isAdmin = role === "System Admin";

  const value = useMemo(
    () => ({
      user,
      profile,
      role,
      displayName,
      isAdmin,
      loading: loading || profileLoading,
      error,
      signOut: () => fbSignOut(auth),
    }),
    [user, profile, role, displayName, isAdmin, loading, profileLoading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

