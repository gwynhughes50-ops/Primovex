import React, { useState } from "react";
import { ArrowLeft, Battery, CheckCircle2, Link2, RadioTower, Signal, Sparkles, Thermometer, Wifi, Zap } from "lucide-react";

import useConnectedDevices from "@/hooks/useConnectedDevices";
import { getDeviceStatus } from "@/services/connectService";
import { useAuth } from "@/contexts/AuthContext";
import DeviceAssignmentSheet from "@/components/temperature/DeviceAssignmentSheet";

function MobileDeviceCard({ device, canManage, onAssign }) {
  const status = getDeviceStatus(device);
  const isFridge = device.type === "fridge" || device.type === "freezer";
  const current = Number(device.currentValue);
  const currentLabel = Number.isFinite(current) ? current.toFixed(1) : "—";
  const batteryLabel = Number.isFinite(Number(device.battery))
    ? `${Number(device.battery)}%`
    : device.batteryState
      ? String(device.batteryState)
      : "Not reported";
  const signalLabel = Number.isFinite(Number(device.signal)) ? `${Number(device.signal)}%` : "Not reported";

  return (
    <div className="rounded-3xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] p-4 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`grid h-11 w-11 place-items-center rounded-2xl ${isFridge ? "bg-teal-500/15 text-teal-200" : "bg-sky-500/15 text-sky-200"}`}>
            <Thermometer className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-white">{device.name}</h3>
            <p className="text-xs text-slate-400">{device.room}</p>
          </div>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${status.className}`}>{status.label}</span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Current</p>
          <p className="text-4xl font-black tracking-tight text-white">
            {currentLabel}<span className="text-base text-slate-500">{device.unit}</span>
          </p>
          <p className="text-xs text-slate-500">Range {device.min}-{device.max}{device.unit}</p>
        </div>
        <div className="space-y-1 text-right text-xs text-slate-400">
          <div className="flex items-center justify-end gap-1"><Battery className="h-3.5 w-3.5" /> {batteryLabel}</div>
          <div className="flex items-center justify-end gap-1"><Signal className="h-3.5 w-3.5" /> {signalLabel}</div>
          <div>{device.lastSeenLabel}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[color:var(--medtrak-border)] pt-3">
        <p className="text-xs text-[color:var(--medtrak-muted)]">{device.integrationStatus === "active" ? `${device.equipment} · ${device.room}` : "Assignment required"}</p>
        {canManage && <button type="button" onClick={() => onAssign(device)} className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-[color:var(--medtrak-accent)] px-3 text-xs font-bold text-white"><Link2 className="h-4 w-4" />{device.integrationStatus === "active" ? "Edit" : "Assign"}</button>}
      </div>
    </div>
  );
}

export default function MobileConnect({ onBack }) {
  const { devices, loading, intelligence } = useConnectedDevices();
  const { can, isAdmin } = useAuth();
  const canManage = isAdmin || can("connect.manageDevices");
  const [assigningDevice, setAssigningDevice] = useState(null);
  const primaryRecommendation = intelligence.recommendations?.[0];

  return (
    <div className="min-h-screen bg-[color:var(--medtrak-bg)] px-4 pb-28 pt-4 text-[color:var(--medtrak-text)]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {onBack && <button type="button" onClick={onBack} className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[color:var(--medtrak-border)]" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>}
          <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/20 bg-teal-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-teal-100">
            <RadioTower className="h-3.5 w-3.5" /> MedTrak Connect
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight">Cold Chain</h1>
          <p className="mt-1 text-sm text-slate-400">Mobile live device view</p>
          </div>
        </div>
        <div className="grid h-16 w-16 place-items-center rounded-full border border-emerald-400/30 bg-emerald-500/10">
          <span className="text-xl font-black text-emerald-100">{loading ? "—" : intelligence.healthScore}</span>
        </div>
      </div>

      <div className={`mb-4 rounded-3xl border p-4 ${intelligence.critical.length || intelligence.offline.length ? "border-rose-400/30 bg-rose-500/10" : "border-emerald-400/30 bg-emerald-500/10"}`}>
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-950/50">
            <CheckCircle2 className="h-5 w-5 text-emerald-200" />
          </div>
          <div>
            <h2 className="font-bold text-white">
              {intelligence.critical.length || intelligence.offline.length ? "Check cold chain" : "Cold Chain OK"}
            </h2>
            <p className="mt-1 text-sm text-slate-300">{intelligence.headline}</p>
            <p className="mt-2 text-xs text-slate-500">Designed for quick checks on phones and iPads.</p>
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-3 text-center">
          <Wifi className="mx-auto h-4 w-4 text-teal-200" />
          <p className="mt-1 text-xl font-black">{devices.length}</p>
          <p className="text-[10px] text-slate-500">devices</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-3 text-center">
          <Thermometer className="mx-auto h-4 w-4 text-emerald-200" />
          <p className="mt-1 text-xl font-black">{intelligence.coldChainOk ? "OK" : "Review"}</p>
          <p className="text-[10px] text-slate-500">fridges</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-3 text-center">
          <Zap className="mx-auto h-4 w-4 text-amber-200" />
          <p className="mt-1 text-xl font-black">{intelligence.critical.length + intelligence.offline.length}</p>
          <p className="text-[10px] text-slate-500">alerts</p>
        </div>
      </div>

      <div className="mb-5 rounded-3xl border border-teal-400/20 bg-teal-500/10 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 text-teal-100" />
          <div>
            <h2 className="font-bold text-white">MedAI mobile brief</h2>
            <p className="mt-1 text-sm text-slate-300">{intelligence.dailyBrief?.[1] || intelligence.headline}</p>
            {primaryRecommendation && (
              <p className="mt-2 text-xs text-teal-100">
                Recommended: {primaryRecommendation.title} • {primaryRecommendation.estimate}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Live devices</h2>
        <span className="rounded-full border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] px-3 py-1 text-xs text-[color:var(--medtrak-muted)]">Live registry</span>
      </div>

      <div className="space-y-3">
        {!loading && devices.length === 0 && (
          <div className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-5">
            <h3 className="font-bold text-amber-100">No live temperature device found</h3>
            <p className="mt-1 text-sm text-amber-50/80">
              Primovex is connected to the live Device Registry, but no Tuya device is currently available. Run a Tuya sync and check the T13 assignment in Connected Practice.
            </p>
          </div>
        )}
        {devices.map((device) => (
          <MobileDeviceCard key={device.id} device={device} canManage={canManage} onAssign={setAssigningDevice} />
        ))}
      </div>

      <div className="mt-5 rounded-3xl border border-white/10 bg-slate-900 p-4">
        <h2 className="font-bold text-white">Tablet ready</h2>
        <p className="mt-1 text-sm text-slate-400">
          On iPad this same page becomes a room/device console for fridges, treatment rooms and stock areas.
        </p>
      </div>
      {assigningDevice && <DeviceAssignmentSheet compact device={assigningDevice} onClose={() => setAssigningDevice(null)} />}
    </div>
  );
}
