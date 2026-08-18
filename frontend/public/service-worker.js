/* Only handles push notifications. API, auth, chat and audio requests are never cached. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const unread = Math.max(0, Number(data.unread_count) || 0);
  const badgeUpdate = unread > 0 && typeof self.navigator.setAppBadge === "function"
    ? self.navigator.setAppBadge(unread)
    : unread === 0 && typeof self.navigator.clearAppBadge === "function"
      ? self.navigator.clearAppBadge()
      : Promise.resolve();
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title || "WorkForce", {
      body: data.body || "You have a new message.",
      data: { url: data.url || "/", conversationId: data.conversation_id || null },
      tag: data.conversation_id || "workforce-message",
      renotify: true,
    }),
    badgeUpdate,
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(Promise.all([
    self.registration.getNotifications({ tag: event.notification.tag }).then((notifications) => {
      notifications.forEach((notification) => notification.close());
    }),
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url.startsWith(self.location.origin));
      if (existing) return existing.focus().then(() => existing.navigate(target));
      return clients.openWindow(target);
    }),
  ]));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CONVERSATION_READ" || !event.data.conversationId) return;
  const unread = Math.max(0, Number(event.data.totalUnreadCount) || 0);
  const badgeUpdate = unread > 0 && typeof self.navigator.setAppBadge === "function"
    ? self.navigator.setAppBadge(unread)
    : unread === 0 && typeof self.navigator.clearAppBadge === "function"
      ? self.navigator.clearAppBadge()
      : Promise.resolve();
  event.waitUntil(Promise.all([
    self.registration.getNotifications({ tag: event.data.conversationId }).then((notifications) => {
      notifications.forEach((notification) => notification.close());
    }),
    badgeUpdate,
  ]));
});
