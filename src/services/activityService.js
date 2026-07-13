import {
    collection,
    limit,
    onSnapshot,
    orderBy,
    query,
  } from "firebase/firestore";
  import { db } from "../lib/firebase";
  
  const MOVES_COL = "stock_movements";
  
  // Realtime activity feed (latest first)
  export function subscribeToActivity(onData, onError, { max = 50 } = {}) {
    const q = query(
      collection(db, MOVES_COL),
      orderBy("created_at", "desc"),
      limit(max)
    );
  
    return onSnapshot(
      q,
      (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      onError
    );
  }
  