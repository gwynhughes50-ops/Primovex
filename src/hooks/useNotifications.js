// src/hooks/useNotifications.js
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  deleteDoc,
  writeBatch,
  limit,
  serverTimestamp,
  getDocs,
} from "firebase/firestore";
import { buildSnoozeUpdate, NOTIFICATION_STATUS, summariseNotifications } from "@/services/notificationCentreService";
import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { demoNotifications } from "@/data/demoDataset";

export default function useNotifications(uid) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // reset when uid changes
    setRows([]);
    setError(null);

    if (isSafeSyntheticMode()) {
      setRows(demoNotifications);
      setLoading(false);
      return;
    }

    if (!uid) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const colRef = collection(db, "users", uid, "notifications");
    // keep it bounded (adjust if you want)
    const q = query(colRef, orderBy("createdAt", "desc"), limit(200));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRows(next);
        setLoading(false);
        setError(null);
      },
      (e) => {
        setError(e);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [uid]);

  const summary = useMemo(() => summariseNotifications(rows), [rows]);

  const unreadCount = useMemo(() => {
    if (!rows?.length) return 0;
    return rows.reduce((acc, n) => acc + (n?.read ? 0 : 1), 0);
  }, [rows]);

  const activeCount = summary?.counts?.total || 0;

  const markRead = useCallback(
    async (nid) => {
      if (!uid || !nid) return;
      if (isSafeSyntheticMode()) return;

      await updateDoc(doc(db, "users", uid, "notifications", nid), {
        read: true,
        readAt: serverTimestamp(),
      });
    },
    [uid]
  );

  const clearOne = useCallback(
    async (nid) => {
      if (!uid || !nid) return;
      if (isSafeSyntheticMode()) return;
      await deleteDoc(doc(db, "users", uid, "notifications", nid));
    },
    [uid]
  );



  const snooze = useCallback(
    async (nid, option = "tomorrow") => {
      if (!uid || !nid) return;
      if (isSafeSyntheticMode()) return;
      await updateDoc(doc(db, "users", uid, "notifications", nid), buildSnoozeUpdate(option));
    },
    [uid]
  );

  const complete = useCallback(
    async (nid) => {
      if (!uid || !nid) return;
      if (isSafeSyntheticMode()) return;
      await updateDoc(doc(db, "users", uid, "notifications", nid), {
        status: NOTIFICATION_STATUS.completed,
        read: true,
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    },
    [uid]
  );

  /**
   * Clear all notifications currently in the feed.
   * Uses chunked batches (Firestore batch limit is 500 ops).
   */
  const clearAll = useCallback(async () => {
    if (!uid) return;
    if (isSafeSyntheticMode()) { setRows([]); return; }

    // safer than relying on React state: re-fetch ids to delete
    const colRef = collection(db, "users", uid, "notifications");
    const snap = await getDocs(query(colRef, limit(500))); // first 500 only
    if (snap.empty) return;

    let batch = writeBatch(db);
    let ops = 0;

    for (const d of snap.docs) {
      batch.delete(d.ref);
      ops += 1;

      if (ops === 450) {
        // keep headroom (some people hit limits with 500 exactly)
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }

    if (ops > 0) {
      await batch.commit();
    }
  }, [uid]);

  return {
    rows,
    loading,
    error,
    unreadCount,
    activeCount,
    summary,
    markRead,
    clearOne,
    clearAll,
    snooze,
    complete,
  };
}
