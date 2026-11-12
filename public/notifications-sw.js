self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const target = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (target) {
        await target.navigate("/dashboard");
        await target.focus();
      } else await self.clients.openWindow("/dashboard");
    })(),
  );
});
