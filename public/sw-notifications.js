/** Notification taps + FCM background messages. Loaded by the Workbox service worker. */

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url || "/checkin";
  const url = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});

try {
  if (self.__FIREBASE_CONFIG__ && self.__FIREBASE_CONFIG__.apiKey) {
    importScripts(
      "https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js",
      "https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js",
    );
    firebase.initializeApp(self.__FIREBASE_CONFIG__);
    firebase.messaging().onBackgroundMessage((payload) => {
      const data = payload.data || {};
      const title = data.title || (payload.notification && payload.notification.title) || "Upscale";
      const body = data.body || (payload.notification && payload.notification.body) || "";
      const url = data.url || "/";
      const tag = data.tag || "upscale";
      return self.registration.showNotification(title, {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag,
        data: { url },
      });
    });
  }
} catch (e) {
  console.warn("FCM background handler failed", e);
}
