export type ConnectionState = "no-data" | "online" | "stale" | "offline";
export function connectionState(
  receivedAt: string | null,
  now = new Date(),
  staleAfterSeconds = 15,
  offlineAfterSeconds = 90,
  enabled = true,
): ConnectionState {
  if (!enabled) return "offline";
  if (!receivedAt || !Number.isFinite(Date.parse(receivedAt))) return "no-data";
  const age = now.getTime() - Date.parse(receivedAt);
  if (!Number.isFinite(age) || age < -60000) return "no-data";
  if (age <= staleAfterSeconds * 1000) return "online";
  return age <= Math.max(staleAfterSeconds, offlineAfterSeconds) * 1000
    ? "stale"
    : "offline";
}
export const connectionLabels: Record<ConnectionState, string> = {
  "no-data": "Sem leituras",
  online: "Recebimento recente",
  stale: "Dados desatualizados",
  offline: "Sem comunicação recente",
};
export function dateTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium",
      }).format(new Date(value))
    : "Não informado";
}
export const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const raw = Number(import.meta.env?.VITE_STALE_AFTER_SECONDS ?? 15);
export const staleAfterSeconds =
  Number.isInteger(raw) && raw >= 2 && raw <= 86400 ? raw : 15;
const offlineRaw = Number(import.meta.env?.VITE_OFFLINE_AFTER_SECONDS ?? 90);
export const offlineAfterSeconds =
  Number.isFinite(offlineRaw) && offlineRaw > staleAfterSeconds
    ? offlineRaw
    : Math.max(90, staleAfterSeconds * 2);
