import { expect, it, vi } from "vitest";
import { createPresenceHandler } from "../supabase/functions/esp-presence/handler";
import { espPresence } from "../src/features/devices/espPresence";
import type { Device } from "../src/features/devices/api";
const packet = {
  device_code: "SGE-004",
  boot_id: "00000000-0000-4000-8000-000000000001",
  sequence: 1,
  attached: false,
};
const request = (body: unknown = packet, token = "a".repeat(64)) =>
  new Request("https://local/esp-presence", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Token": token },
    body: JSON.stringify(body),
  });
it("records bare ESP presence without sending health metrics and hashes the individual credential", async () => {
  const store = vi.fn(async (_packet: unknown, _hash: string) => ({
    status: 200,
    accepted: true,
    attached: false,
    received_at: new Date().toISOString(),
  }));
  const response = await createPresenceHandler({ store })(request());
  expect(response.status).toBe(200);
  expect((await response.json()).attached).toBe(false);
  expect(store.mock.calls[0][0]).toEqual(packet);
  expect(store.mock.calls[0][1]).toMatch(/^[a-f0-9]{64}$/);
  expect(store.mock.calls[0][1]).not.toBe("a".repeat(64));
});
it("rejects invalid credentials, metrics in heartbeat and invalid attachment flags", async () => {
  const store = vi.fn(async () => ({ status: 200 }));
  const handler = createPresenceHandler({ store });
  expect(
    (await handler(request(packet, "sb_secret_" + "a".repeat(40)))).status,
  ).toBe(401);
  expect(
    (await handler(request({ ...packet, metrics: { temperature_c: 36.5 } })))
      .status,
  ).toBe(400);
  expect((await handler(request({ ...packet, attached: "true" }))).status).toBe(
    400,
  );
  expect(store).not.toHaveBeenCalled();
});
it("restricts returned errors and never returns the device token", async () => {
  const handler = createPresenceHandler({
    store: async () => ({ status: 500, error: "private detail" }),
  });
  const response = await handler(request());
  expect(response.status).toBe(503);
  expect(await response.text()).toBe('{"error":"temporarily_unavailable"}');
});
it("distinguishes powered, attached and stale presence", () => {
  const now = new Date();
  const device = {
    enabled: true,
    requires_esp: true,
    esp_last_seen_at: now.toISOString(),
    esp_attached: false,
  } as Device;
  expect(espPresence(device, now)).toMatchObject({
    online: true,
    attached: false,
  });
  expect(espPresence({ ...device, esp_attached: true }, now).attached).toBe(
    true,
  );
  expect(
    espPresence({ ...device, esp_attached: true }, new Date(+now + 12001)),
  ).toMatchObject({ online: false, attached: false });
});
