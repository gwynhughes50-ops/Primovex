import { useEffect, useState } from "react";
import { MapPin, Nfc, Bluetooth, QrCode } from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import HomeWidget from "@/smart-home/components/HomeWidget";

function toDate(value) {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timeAgo(value) {
  const date = toDate(value);
  if (!date) return "unknown";
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const SOURCE_ICON = { nfc: Nfc, ble: Bluetooth, qr: QrCode, barcode: QrCode };

// A snapshot, not a tracker: each row is whoever's Sense session (NFC/BLE/QR
// tap) was last activated, however long ago that was — the relative time is
// shown precisely so it reads as "last known" rather than implying live
// presence. Sessions only close when someone scans somewhere new, so a
// person who scanned once and stopped will still show here until they do.
export default function WhoIsWhereWidget() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "sense_sessions"), where("status", "==", "active"));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const byUser = new Map();
      rows.forEach((row) => {
        const existing = byUser.get(row.userId);
        if (!existing || (toDate(row.startedAt)?.getTime() || 0) > (toDate(existing.startedAt)?.getTime() || 0)) {
          byUser.set(row.userId, row);
        }
      });
      const merged = Array.from(byUser.values()).sort((a, b) => (toDate(b.startedAt)?.getTime() || 0) - (toDate(a.startedAt)?.getTime() || 0));
      setSessions(merged);
      setLoading(false);
    }, (error) => { console.error("Who's where subscription failed", error); setLoading(false); });
  }, []);

  return (
    <HomeWidget title="Who's where" description="Last scanned location for each active staff member." icon={MapPin}>
      <div className="space-y-2 text-sm">
        {loading ? (
          <p className="text-[color:var(--medtrak-muted)]">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-[color:var(--medtrak-muted)]">No one has an active scanned location right now.</p>
        ) : sessions.map((session) => {
          const Icon = SOURCE_ICON[session.source] || MapPin;
          return (
            <div key={session.id} className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{session.userDisplayName || "Unknown"}</p>
                <p className="truncate text-xs text-[color:var(--medtrak-muted)]">{session.senseObjectName}{session.senseObjectType ? ` · ${session.senseObjectType}` : ""}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-xs text-[color:var(--medtrak-muted)]">
                <Icon className="h-3.5 w-3.5" />
                {timeAgo(session.startedAt)}
              </div>
            </div>
          );
        })}
      </div>
    </HomeWidget>
  );
}
