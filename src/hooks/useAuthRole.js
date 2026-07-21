import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { db, auth } from "../lib/firebase";

export function useAuthRole() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState("viewer"); // "admin" | "viewer"
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubUserDoc = null;

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);

      if (unsubUserDoc) unsubUserDoc();
      unsubUserDoc = null;

      if (!u) {
        setRole("viewer");
        setLoading(false);
        return;
      }

      // users/{uid} should exist with { role: "admin" } for admins
      const ref = doc(db, "users", u.uid);
      unsubUserDoc = onSnapshot(
        ref,
        (snap) => {
          const data = snap.data();
          setRole(data?.role === "admin" ? "admin" : "viewer");
          setLoading(false);
        },
        () => {
          // If user doc missing, default to viewer
          setRole("viewer");
          setLoading(false);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, []);

  return {
    user,
    role,
    isAdmin: role === "admin",
    loading,
  };
}
