import { useEffect, useState } from 'react';
import { subscribeCleaningLogs, subscribeRoomOperational } from '@/modules/facilities/services/cleaningRecordService';

// Live room_operational/cleaning_logs data for the Operations engine (Dashboard
// readiness + timeline) and Orb, so both agree with the real Firestore
// cleaning records instead of the space registry, which never carries
// lastCleanedAt (that field lives in room_operational — see
// cleaningRecordService.js).
export default function useRoomOperationalContext() {
  const [operational, setOperational] = useState({});
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let operationalReady = false;
    let logsReady = false;
    const markReady = () => {
      if (operationalReady && logsReady) setLoading(false);
    };
    const unsubOperational = subscribeRoomOperational(
      (map) => { setOperational(map); operationalReady = true; markReady(); },
      () => { operationalReady = true; markReady(); }
    );
    const unsubLogs = subscribeCleaningLogs(
      (rows) => { setLogs(rows); logsReady = true; markReady(); },
      () => { logsReady = true; markReady(); }
    );
    return () => { unsubOperational?.(); unsubLogs?.(); };
  }, []);

  return { operational, logs, loading };
}
