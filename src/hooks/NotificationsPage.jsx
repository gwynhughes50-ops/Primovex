import useNotifications from "@/hooks/useNotifications";
import useNotificationSettings from "@/hooks/useNotificationSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

export default function NotificationsPage({ uid }) {
  const { settings, updateNotifications, loading: settingsLoading } =
    useNotificationSettings({ uid, practiceId: "main_branch" });

  const { rows, loading, unreadCount, markRead, remove } = useNotifications({ uid });

  const prefs = settings?.notifications || {};

  return (
    <div className="mt-6 space-y-6">
      <Card className="rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100">
        <CardHeader>
          <CardTitle>Notifications ({unreadCount} unread)</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Preferences */}
          <div className="space-y-3 rounded-xl border border-slate-800/70 bg-slate-950/40 p-4">
            <div className="font-semibold">Your preferences</div>

            {settingsLoading ? (
              <div className="text-sm text-slate-400">Loading settings…</div>
            ) : (
              <div className="space-y-3">
                <Row
                  label="In-app notifications"
                  checked={!!prefs.inAppEnabled}
                  onChange={(v) => updateNotifications({ inAppEnabled: !!v })}
                />
                <Row
                  label="Low stock alerts"
                  checked={!!prefs.lowStock}
                  onChange={(v) => updateNotifications({ lowStock: !!v })}
                />
                <Row
                  label="Temperature incidents"
                  checked={!!prefs.tempIncidents}
                  onChange={(v) => updateNotifications({ tempIncidents: !!v })}
                />
              </div>
            )}
          </div>

          {/* Feed */}
          <div className="space-y-2">
            {loading && <div className="text-sm text-slate-400">Loading notifications…</div>}
            {!loading && rows.length === 0 && <div className="text-sm text-slate-400">No notifications yet.</div>}

            {rows.map((n) => (
              <div
                key={n.id}
                className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-50">{n.title || "Notification"}</div>
                  <div className="text-sm text-slate-300 mt-1">{n.message || "—"}</div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!n.read_at && (
                    <Button variant="outline" onClick={() => markRead(n.id)}>
                      Mark read
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => remove(n.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/30 p-3">
      <div className="text-sm text-slate-200">{label}</div>
      <Checkbox checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
