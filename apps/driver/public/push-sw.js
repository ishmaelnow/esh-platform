self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "ESH update", body: "Open ESH for details.", url: "/" };
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body,
    tag: data.tag || "esh-update", data: { url: data.url || "/" }, renotify: true }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
