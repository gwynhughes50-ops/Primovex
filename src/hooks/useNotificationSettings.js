// src/hooks/useNotificationSettings.js
import { useEffect, useState, useCallback } from "react";
import { doc, onSnapshot, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function useNotificationSettings(uid) {
  const [settings, setSettings] = useState({ emailEnabled: true, pushEnabled: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      setSettings({ emailEnabled: true, pushEnabled: false });
      return;
    }

    const ref = doc(db, "user_settings", uid);

    const unsub = onSnapshot(
      ref,
      async (snap) => {
        try {
          if (!snap.exists()) {
            // create default doc for this user
            await setDoc(ref, {
              emailEnabled: true,
              pushEnabled: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            return;
          }

          const data = snap.data() || {};
          setSettings({
            emailEnabled: !!data.emailEnabled,
            pushEnabled: !!data.pushEnabled,
          });
          setError(null);
        } catch (e) {
          setError(e);
        } finally {
          setLoading(false);
        }
      },
      (e) => {
        setError(e);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [uid]);

  const setEmailEnabled = useCallback(
    async (val) => {
      if (!uid) return;
      setSaving(true);
      try {
        await updateDoc(doc(db, "user_settings", uid), {
          emailEnabled: !!val,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        setError(e);
      } finally {
        setSaving(false);
      }
    },
    [uid]
  );

  const setPushEnabled = useCallback(
    async (val) => {
      if (!uid) return;
      setSaving(true);
      try {
        await updateDoc(doc(db, "user_settings", uid), {
          pushEnabled: !!val,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        setError(e);
      } finally {
        setSaving(false);
      }
    },
    [uid]
  );

  return {
    settings,
    loading,
    saving,
    error,
    setEmailEnabled,
    setPushEnabled,
  };
}

