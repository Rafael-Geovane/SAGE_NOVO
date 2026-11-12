import { db } from "../../lib/supabase";
import { historyWindow, type HistoryRange } from "./realtime";
export const PAGE_SIZE = 25;
export type Person = {
  id: string;
  display_name: string;
  consent_recorded_at: string | null;
  contact_name: string | null;
  contact_phone: string | null;
};
export type Device = {
  telemetry_source?: "device" | "simulated";
  device_profile_editable?: boolean;
  id: string;
  code: string;
  person_id: string | null;
  assignment_id: string;
  enabled: boolean;
  firmware_version: string | null;
  last_received_at: string | null;
  latest_recorded_at: string | null;
  latest_metrics: Record<string, unknown> | null;
  people: Person | null;
};
export type AlertRow = {
  source?: "device" | "simulated";
  fall_outcome?: "confirmed" | "dismissed" | null;
  fall_reviewed_at?: string | null;
  fall_reviewed_by?: string | null;
  id: string;
  device_id: string;
  assignment_id: string;
  source_telemetry_id: number | null;
  kind: string;
  severity: string;
  description: string;
  status: "new" | "acknowledged" | "resolved";
  created_at: string;
  triaged_at: string | null;
  triaged_by: string | null;
};
export type Reading = {
  source?: "device" | "simulated";
  id: number;
  device_id: string;
  person_id: string | null;
  assignment_id: string;
  recorded_at: string;
  received_at: string;
  metrics: Record<string, unknown>;
  event: string | null;
};
export async function listDevices(page = 0, signal?: AbortSignal) {
  let q = db()
    .from("devices")
    .select(
      "*,device_profile_editable,people(id,display_name,consent_recorded_at,contact_name,contact_phone)",
      { count: "exact" },
    )
    .order("code")
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  if (signal) q = q.abortSignal(signal);
  const { data, count, error } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as Device[], count: count ?? 0 };
}
export async function listReadings(
  deviceId: string,
  page = 0,
  signal?: AbortSignal,
  personId: string | null = null,
  range: HistoryRange = {},
  assignmentId?: string,
) {
  if (!Number.isSafeInteger(page) || page < 0)
    throw new Error("Página inválida.");
  const window = historyWindow(range);
  let q = db()
    .from("telemetry")
    .select(
      "id,device_id,person_id,assignment_id,recorded_at,received_at,metrics,event,source",
      { count: "exact" },
    )
    .eq("device_id", deviceId)
    .order("recorded_at", { ascending: false })
    .order("id", { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  q = personId ? q.eq("person_id", personId) : q.is("person_id", null);
  if (assignmentId) q = q.eq("assignment_id", assignmentId);
  if (window.from) q = q.gte("recorded_at", window.from);
  if (window.to) q = q.lte("recorded_at", window.to);
  if (signal) q = q.abortSignal(signal);
  const { data, count, error } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as Reading[], count: count ?? 0 };
}
export async function listAlerts(
  deviceId: string | null,
  status: string,
  page = 0,
  signal?: AbortSignal,
  personId?: string | null,
  assignmentId?: string,
) {
  let q = db()
    .from("alerts")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  if (deviceId) {
    q = q.eq("device_id", deviceId);
    q = personId ? q.eq("person_id", personId) : q.is("person_id", null);
    if (assignmentId) q = q.eq("assignment_id", assignmentId);
  }
  if (status) q = q.eq("status", status);
  if (signal) q = q.abortSignal(signal);
  const { data, count, error } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as AlertRow[], count: count ?? 0 };
}
export async function latestReading(device: Device, signal?: AbortSignal) {
  let q = db()
    .from("telemetry")
    .select(
      "id,device_id,person_id,assignment_id,recorded_at,received_at,metrics,event,source",
    )
    .eq("device_id", device.id)
    .eq("assignment_id", device.assignment_id)
    .order("recorded_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);
  q = device.person_id
    ? q.eq("person_id", device.person_id)
    : q.is("person_id", null);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) throw error;
  return (data?.[0] as Reading | undefined) ?? null;
}
export type AlertTransition = {
  id: number;
  alert_id: string;
  device_id: string;
  person_id: string | null;
  assignment_id: string;
  previous_status: string | null;
  status: string;
  actor_id: string | null;
  source: "device" | "user" | "system" | "legacy";
  occurred_at: string;
};
export async function listAlertHistory(
  alertId: string,
  page = 0,
  signal?: AbortSignal,
) {
  if (!Number.isSafeInteger(page) || page < 0)
    throw new Error("Página inválida.");
  let q = db()
    .from("alert_status_history")
    .select("*", { count: "exact" })
    .eq("alert_id", alertId)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  if (signal) q = q.abortSignal(signal);
  const { data, count, error } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as AlertTransition[], count: count ?? 0 };
}
export type AdminSummary = {
  active_users: number;
  caregivers: number;
  devices: number;
  recent_devices: number;
  recent_alerts: number;
  enabled_devices: number;
  disabled_devices: number;
  recent_readings: number;
  open_alerts: number;
  generated_at: string;
};
export async function adminSummary(
  activeHours: number,
  staleSeconds: number,
  signal?: AbortSignal,
): Promise<AdminSummary> {
  let q = db().rpc("admin_dashboard", {
    p_active_hours: activeHours,
    p_stale_seconds: staleSeconds,
  });
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error || !data || !Number.isFinite(Date.parse(data.generated_at)))
    throw new Error("Não foi possível consultar os indicadores.");
  return data as AdminSummary;
}
export async function saveDevice(
  id: string | null,
  values: {
    code: string;
    person_id: string | null;
    enabled: boolean;
    firmware_version: string | null;
  },
) {
  const result = id
    ? await db()
        .from("devices")
        .update(values)
        .eq("id", id)
        .select("id")
        .single()
    : await db().from("devices").insert(values).select("id").single();
  if (result.error) throw result.error;
  return result.data;
}
export const activeWindowHours = (() => {
  const n = Number(import.meta.env.VITE_ACTIVE_WINDOW_HOURS ?? 24);
  return Number.isInteger(n) && n >= 1 && n <= 8760 ? n : 24;
})();
