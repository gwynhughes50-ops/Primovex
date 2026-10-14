/* Primovex: shows an alert on the phone when one arrives, and opens Primovex when it is tapped.
   Alerts carry only a short title (never a patient detail): see functions/services/pushService.js. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  // the message may arrive as { data: {...} } or { notification: {...} } depending on how it was sent
  const data = payload.data || payload.notification || payload || {};
  const title = data.title || "Primovex";
  const options = {
    body: data.body || "Open Primovex to see it.",
    icon: "/branding/primovex-app-192.png",
    badge: "/branding/primovex-app-192.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        try { await client.navigate(target); } catch { /* it may not be allowed: focusing is enough */ }
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
