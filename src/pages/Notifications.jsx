// src/pages/Notifications.jsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import PageHeader from "@/components/common/PageHeader";
import SectionCard from "@/components/common/SectionCard";
import StatusBadge from "@/components/common/StatusBadge";
import NotificationItem from "@/components/notifications/NotificationItem";

import { Icons } from "@/config/medtrakIcons";
import useNotificationSettings from "@/hooks/useNotificationSettings";
import useNotifications from "@/hooks/useNotifications";
import { normalizeNotification } from "@/services/notificationCentreService";

const tabs = [
  { key: "active", label: "Active" },
  { key: "snoozed", label: "Snoozed" },
  { key: "completed", label: "Completed" },
  { key: "settings", label: "Settings" },
];

export default function Notifications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = user?.uid || null;
  const [activeTab, setActiveTab] = useState("active");

  const {
    settings,
    setEmailEnabled,
    setPushEnabled,
    setLowStockEmail,
    setIncidentEmail,
  } = useNotificationSettings(uid);

  const {
    rows,
    unreadCount,
    markRead,
    clearAll,
    loading,
    summary,
    snooze,
    complete,
  } = useNotifications(uid);

  const canShow = !!uid;
  const showLowStockToggle = typeof settings?.lowStockEmail === "boolean";
  const showIncidentToggle = typeof settings?.incidentEmail === "boolean";

  const visibleRows = useMemo(() => {
    if (activeTab === "snoozed") return summary?.snoozed || [];
    if (activeTab === "completed") return summary?.completed || [];
    return summary?.active || [];
  }, [activeTab, summary]);

  const counts = summary?.counts || { critical: 0, high: 0, routine: 0, info: 0, total: 0 };

  const openNotification = (notification) => {
    const item = normalizeNotification(notification);
    if (item.actionUrl) navigate(item.actionUrl);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Icons.notifications}
        eyebrow="Operations Centre"
        title="Inbox"
        description="Your personal MedTrak+ work queue. Snooze items when they are not for now; complete them when they are done."
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge status="info">Unread: {unreadCount || 0}</StatusBadge>
            <Button
              variant="outline"
              className="rounded-full border-slate-700/70 bg-slate-950/40 text-slate-200 hover:bg-slate-800"
              onClick={clearAll}
              disabled={!canShow || (rows?.length || 0) === 0}
            >
              <Icons.trash className="mr-2 h-4 w-4" />
              Clear all
            </Button>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-200/80">Critical</p>
          <p className="mt-1 text-3xl font-black">{counts.critical || 0}</p>
        </div>
        <div className="rounded-2xl border border-orange-400/30 bg-orange-500/10 p-4 text-orange-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-200/80">High</p>
          <p className="mt-1 text-3xl font-black">{counts.high || 0}</p>
        </div>
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-amber-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">Routine</p>
          <p className="mt-1 text-3xl font-black">{counts.routine || 0}</p>
        </div>
        <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-4 text-sky-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-200/80">Info</p>
          <p className="mt-1 text-3xl font-black">{counts.info || 0}</p>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              activeTab === tab.key
                ? "bg-teal-400 text-slate-950"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "settings" ? (
        <SectionCard title="Notification Settings" description="These preferences are stored per user and saved automatically.">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/40 p-4">
              <div>
                <div className="font-semibold text-slate-50">Email alerts</div>
                <div className="mt-0.5 text-xs text-slate-400">Low stock + important events via email</div>
              </div>
              <Checkbox checked={!!settings?.emailEnabled} onCheckedChange={(v) => setEmailEnabled(!!v)} disabled={!canShow} />
            </div>

            {showLowStockToggle && (
              <div className="flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/40 p-4">
                <div>
                  <div className="font-semibold text-slate-50">Low stock emails</div>
                  <div className="mt-0.5 text-xs text-slate-400">Send email when items fall below minimum</div>
                </div>
                <Checkbox checked={!!settings?.lowStockEmail} onCheckedChange={(v) => setLowStockEmail?.(!!v)} disabled={!canShow || !settings?.emailEnabled} />
              </div>
            )}

            {showIncidentToggle && (
              <div className="flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/40 p-4">
                <div>
                  <div className="font-semibold text-slate-50">Incident emails</div>
                  <div className="mt-0.5 text-xs text-slate-400">Send email for temperature incidents</div>
                </div>
                <Checkbox checked={!!settings?.incidentEmail} onCheckedChange={(v) => setIncidentEmail?.(!!v)} disabled={!canShow || !settings?.emailEnabled} />
              </div>
            )}

            <div className="flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/40 p-4">
              <div>
                <div className="font-semibold text-slate-50">Push notifications</div>
                <div className="mt-0.5 text-xs text-slate-400">Future device alerts. Critical items will remain calm and role-aware.</div>
              </div>
              <Checkbox checked={!!settings?.pushEnabled} onCheckedChange={(v) => setPushEnabled(!!v)} disabled={!canShow} />
            </div>
          </div>
        </SectionCard>
      ) : (
        <SectionCard
          title={activeTab === "snoozed" ? "Snoozed items" : activeTab === "completed" ? "Completed items" : "Active priorities"}
          description={activeTab === "active" ? "Items needing attention now. Snoozed items are hidden until they wake up." : undefined}
        >
          <Separator className="mb-4 bg-slate-800/70" />

          {!canShow && (
            <div className="flex h-40 items-center justify-center rounded-xl border border-slate-800/70 bg-slate-950/40 text-slate-400">
              Sign in to view your inbox.
            </div>
          )}

          {canShow && loading && (
            <div className="flex h-40 items-center justify-center rounded-xl border border-slate-800/70 bg-slate-950/40 text-slate-400">
              Loading inbox…
            </div>
          )}

          {canShow && !loading && visibleRows.length === 0 && (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-800/70 bg-slate-950/40 text-slate-400">
              Nothing here.
            </div>
          )}

          {canShow && !loading && visibleRows.length > 0 && (
            <div className="space-y-3">
              {visibleRows.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onOpen={openNotification}
                  onComplete={(item) => complete(item.id)}
                  onSnooze={(item, option) => snooze(item.id, option)}
                />
              ))}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
