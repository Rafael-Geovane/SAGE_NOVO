import type { Device } from "./api";
export function espPresence(device: Device | undefined, now = new Date()) {
  const age = now.getTime() - Date.parse(device?.esp_last_seen_at ?? "");
  const online =
    !!device?.enabled && Number.isFinite(age) && age >= -1000 && age <= 12000;
  const attached = online && device?.esp_attached === true;
  return {
    online,
    attached,
    label: !online
      ? "ESP sem comunicação"
      : !attached
        ? "ESP ligado · fora do colete"
        : "ESP conectado ao colete",
  };
}
