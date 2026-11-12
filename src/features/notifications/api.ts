import { db } from "../../lib/supabase";
export type FallNotification = {
  source?: "device" | "simulated";
  id: string;
  device_id: string;
  assignment_id: string;
  kind: string;
  status: "new" | "acknowledged" | "resolved";
  created_at: string;
  fall_outcome: "confirmed" | "dismissed" | null;
  devices: { code: string } | null;
};
export function uniqueNotifications(rows: FallNotification[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()].sort(
    (a, b) =>
      b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
  );
}
export async function pendingFalls(page: number, signal?: AbortSignal) {
  let q = db()
    .from("alerts")
    .select(
      "id,device_id,assignment_id,kind,status,created_at,fall_outcome,source,devices(code)",
      { count: "exact" },
    )
    .eq("kind", "fall_detected")
    .neq("status", "resolved")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(page * 25, (page + 1) * 25 - 1);
  if (signal) q = q.abortSignal(signal);
  const { data, count, error } = await q;
  if (error) throw new Error("Não foi possível atualizar as notificações.");
  return {
    rows: uniqueNotifications((data ?? []) as unknown as FallNotification[]),
    count: count ?? 0,
  };
}
