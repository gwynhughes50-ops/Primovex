import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const CONNECTED_DEVICES_COLLECTION = "connected_devices";

export const MOCK_CONNECTED_DEVICES = [
  {
    id: "mock-vaccine-fridge-1",
    name: "Vaccine Fridge 1",
    type: "fridge",
    site: "Main Branch",
    room: "Treatment Room 1",
    status: "online",
    currentValue: 4.2,
    unit: "°C",
    min: 2,
    max: 8,
    battery: 98,
    signal: 92,
    lastSeenMinutes: 1,
    lastSeenLabel: "32 seconds ago",
    provider: "Simulated Wi-Fi thermometer",
  },
  {
    id: "mock-vaccine-fridge-2",
    name: "Vaccine Fridge 2",
    type: "fridge",
    site: "Main Branch",
    room: "Nurses Room",
    status: "online",
    currentValue: 5.1,
    unit: "°C",
    min: 2,
    max: 8,
    battery: 91,
    signal: 88,
    lastSeenMinutes: 2,
    lastSeenLabel: "2 minutes ago",
    provider: "Simulated Wi-Fi thermometer",
  },
  {
    id: "mock-drug-fridge",
    name: "Drug Fridge",
    type: "fridge",
    site: "Main Branch",
    room: "Stock Room",
    status: "online",
    currentValue: 3.8,
    unit: "°C",
    min: 2,
    max: 8,
    battery: 84,
    signal: 76,
    lastSeenMinutes: 3,
    lastSeenLabel: "3 minutes ago",
    provider: "Simulated Wi-Fi thermometer",
  },
  {
    id: "mock-treatment-room-sensor",
    name: "Treatment Room Sensor",
    type: "environment",
    site: "Main Branch",
    room: "Treatment Room 2",
    status: "warning",
    currentValue: 21.4,
    unit: "°C",
    min: 16,
    max: 26,
    battery: 27,
    signal: 64,
    lastSeenMinutes: 12,
    lastSeenLabel: "12 minutes ago",
    provider: "Simulated room sensor",
  },
];

export function normaliseDevice(docLike) {
  const data = docLike?.data ? docLike.data() : docLike || {};
  const id = docLike?.id || data.id;
  const min = Number(data.min ?? data.rangeMin ?? data.safeMin ?? 2);
  const max = Number(data.max ?? data.rangeMax ?? data.safeMax ?? 8);
  const currentValue = Number(data.currentValue ?? data.current_value ?? data.temperature ?? data.temp ?? 0);
  const lastSeenDate = data.lastSeen?.toDate?.() || data.last_seen?.toDate?.() || null;
  const lastSeenMinutes = Number.isFinite(Number(data.lastSeenMinutes))
    ? Number(data.lastSeenMinutes)
    : lastSeenDate
      ? Math.max(0, Math.round((Date.now() - lastSeenDate.getTime()) / 60000))
      : 0;

  return {
    id,
    name: data.name || data.deviceName || "Connected Device",
    type: data.type || "fridge",
    site: data.site || data.siteName || "Main Branch",
    room: data.room || data.location || "Unassigned",
    status: data.status || inferDeviceStatus({ currentValue, min, max, battery: data.battery, lastSeenMinutes }),
    currentValue,
    unit: data.unit || "°C",
    min,
    max,
    battery: Number(data.battery ?? data.batteryPercent ?? 100),
    signal: Number(data.signal ?? data.signalPercent ?? 100),
    lastSeenMinutes,
    lastSeenLabel: formatLastSeen(lastSeenMinutes),
    provider: data.provider || "Connected sensor",
    raw: data,
  };
}

export function inferDeviceStatus({ currentValue, min, max, battery, lastSeenMinutes }) {
  const value = Number(currentValue);
  if (Number(lastSeenMinutes) > 30) return "offline";
  if (Number(battery) <= 20) return "warning";
  if (Number.isFinite(value) && (value < Number(min) || value > Number(max))) return "critical";
  return "online";
}

export function formatLastSeen(minutes) {
  const m = Number(minutes || 0);
  if (m < 1) return "just now";
  if (m === 1) return "1 minute ago";
  if (m < 60) return `${m} minutes ago`;
  const h = Math.floor(m / 60);
  return h === 1 ? "1 hour ago" : `${h} hours ago`;
}

export function getDeviceStatus(device) {
  const status = inferDeviceStatus(device);
  if (status === "critical") {
    return {
      key: "critical",
      label: "Action required",
      className: "border-rose-400/40 bg-rose-500/10 text-rose-100",
      dotClassName: "bg-rose-400",
    };
  }
  if (status === "offline") {
    return {
      key: "offline",
      label: "Offline",
      className: "border-slate-500/40 bg-slate-500/10 text-slate-200",
      dotClassName: "bg-slate-400",
    };
  }
  if (status === "warning") {
    return {
      key: "warning",
      label: "Needs attention",
      className: "border-amber-400/40 bg-amber-500/10 text-amber-100",
      dotClassName: "bg-amber-300",
    };
  }
  return {
    key: "online",
    label: "Online",
    className: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
    dotClassName: "bg-emerald-300",
  };
}

export function buildDeviceHistory(device, points = 18) {
  const base = Number(device?.currentValue ?? 4.5);
  const min = Number(device?.min ?? 2);
  const max = Number(device?.max ?? 8);
  const safeMiddle = min + (max - min) / 2;
  const anchor = Number.isFinite(base) && base !== 0 ? base : safeMiddle;

  return Array.from({ length: points }).map((_, index) => {
    const drift = Math.sin(index / 2.4) * 0.35 + Math.cos(index / 3.1) * 0.18;
    const value = Number((anchor + drift).toFixed(1));
    const hour = 8 + index;
    return {
      label: `${String(hour % 24).padStart(2, "0")}:00`,
      value,
    };
  });
}

export function buildConnectIntelligence(devices = []) {
  const normalised = devices.map(normaliseDevice);
  const coldChainDevices = normalised.filter((d) => d.type === "fridge" || d.type === "freezer");
  const critical = normalised.filter((d) => getDeviceStatus(d).key === "critical");
  const offline = normalised.filter((d) => getDeviceStatus(d).key === "offline");
  const warnings = normalised.filter((d) => getDeviceStatus(d).key === "warning");
  const allOnline = normalised.length > 0 && offline.length === 0;
  const coldChainOk = coldChainDevices.length > 0 && coldChainDevices.every((d) => getDeviceStatus(d).key === "online");
  const avgBattery = normalised.length
    ? Math.round(normalised.reduce((sum, d) => sum + Number(d.battery || 0), 0) / normalised.length)
    : 0;
  const avgSignal = normalised.length
    ? Math.round(normalised.reduce((sum, d) => sum + Number(d.signal || 0), 0) / normalised.length)
    : 0;

  const healthScore = Math.max(
    0,
    Math.min(
      100,
      100 - critical.length * 24 - offline.length * 18 - warnings.length * 8 - (avgBattery < 35 ? 8 : 0)
    )
  );

  const headline = critical.length
    ? `${critical.length} device${critical.length === 1 ? "" : "s"} require urgent review.`
    : offline.length
      ? `${offline.length} device${offline.length === 1 ? " is" : "s are"} offline.`
      : warnings.length
        ? `${warnings.length} device${warnings.length === 1 ? " needs" : "s need"} attention.`
        : "All connected devices are reporting normally.";

  const dailyBrief = [
    headline,
    coldChainOk
      ? "Cold chain is stable and all fridge readings are within range."
      : "Cold chain needs review before stored medicines are assumed safe.",
    `Average device battery is ${avgBattery || "—"}% and average signal is ${avgSignal || "—"}%.`,
    "Sensor readings are simulated in this sprint and ready for future hardware integration.",
  ];

  const recommendations = [];
  critical.forEach((d) => {
    recommendations.push({
      id: `${d.id}-critical`,
      priority: "High",
      title: `Review ${d.name}`,
      reason: `${d.currentValue}${d.unit} is outside the safe range of ${d.min}-${d.max}${d.unit}.`,
      action: "Check the device, door closure and affected stock.",
      estimate: "3 mins",
      score: 94,
    });
  });
  offline.forEach((d) => {
    recommendations.push({
      id: `${d.id}-offline`,
      priority: "High",
      title: `Restore ${d.name}`,
      reason: `No reading received for ${d.lastSeenLabel}.`,
      action: "Check Wi-Fi, power and sensor battery.",
      estimate: "2 mins",
      score: 88,
    });
  });
  warnings.forEach((d) => {
    recommendations.push({
      id: `${d.id}-warning`,
      priority: "Medium",
      title: `Check ${d.name}`,
      reason: d.battery <= 30 ? `Battery is ${d.battery}%.` : "Device health is below ideal.",
      action: "Check battery/signal during the next room round.",
      estimate: "1 min",
      score: 62,
    });
  });

  if (recommendations.length === 0) {
    recommendations.push({
      id: "connect-all-good",
      priority: "Low",
      title: "No cold-chain action required",
      reason: "All simulated fridge readings are within range.",
      action: "Continue normal monitoring.",
      estimate: "0 mins",
      score: 12,
    });
  }

  return {
    devices: normalised,
    coldChainDevices,
    critical,
    warnings,
    offline,
    allOnline,
    coldChainOk,
    avgBattery,
    avgSignal,
    healthScore,
    headline,
    dailyBrief,
    recommendations: recommendations.slice(0, 5),
  };
}

export function subscribeConnectedDevices(callback, onError) {
  const qy = query(collection(db, CONNECTED_DEVICES_COLLECTION), orderBy("name", "asc"), limit(100));
  return onSnapshot(
    qy,
    (snap) => {
      const rows = snap.docs.map((doc) => normaliseDevice(doc));
      callback(rows.length ? rows : MOCK_CONNECTED_DEVICES);
    },
    (error) => {
      console.error("Connect device subscription failed", error);
      onError?.(error);
      callback(MOCK_CONNECTED_DEVICES);
    }
  );
}
