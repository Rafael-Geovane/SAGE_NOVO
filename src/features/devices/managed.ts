import { z } from "zod";
import { db } from "../../lib/supabase";
import { pairingInput } from "./pairing";
import type { Scenario } from "./scenarios";
import { activeScenario } from "./activeScenario";
export type DeviceConnection = {
  deviceId: string;
  page: number;
  configureProfile?: boolean;
};
export const isPresentationDevice = (code: string) =>
  code === "SGE-005" || code === "SGE-006";
export async function claimPresentationDevice(
  code: string,
): Promise<DeviceConnection> {
  const { data, error } = await db().rpc("claim_presentation_device", {
    p_code: pairingInput.shape.code.parse(code),
  });
  if (error)
    throw new Error(
      "Este colete de apresentação já foi vinculado a outra conta ou está indisponível. Use a conta responsável ou solicite ajuda ao administrador.",
    );
  const parsed = z
    .object({
      device_id: z.uuid(),
      page: z.number().int().nonnegative(),
      configure_profile: z.boolean(),
    })
    .safeParse(data);
  if (!parsed.success)
    throw new Error("Não foi possível confirmar o vínculo do colete.");
  return {
    deviceId: parsed.data.device_id,
    page: parsed.data.page,
    configureProfile: parsed.data.configure_profile,
  };
}
export async function lookupConnectedDevice(
  code: string,
): Promise<DeviceConnection | null> {
  const { data, error } = await db().rpc("lookup_connected_device", {
    p_code: pairingInput.shape.code.parse(code),
  });
  if (error)
    throw new Error(
      "Não foi possível consultar o colete. Confira a conexão e tente novamente.",
    );
  if (data === null) return null;
  const parsed = z
    .object({
      device_id: z.uuid(),
      page: z.number().int().nonnegative(),
      configure_profile: z.boolean(),
    })
    .safeParse(data);
  if (!parsed.success)
    throw new Error("Não foi possível confirmar o vínculo do colete.");
  return {
    deviceId: parsed.data.device_id,
    page: parsed.data.page,
    configureProfile: parsed.data.configure_profile,
  };
}
export async function emitSimulatedReading(
  deviceId: string,
  assignmentId: string,
  messageId: string,
  signal?: AbortSignal,
  scenario?: Scenario,
) {
  let q = db().rpc("emit_simulated_reading", {
    p_device_id: deviceId,
    p_expected_assignment_id: assignmentId,
    p_message_id: messageId,
    p_scenario: scenario ?? activeScenario(deviceId, assignmentId),
  });
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error || data?.status !== 200 || data?.accepted !== true)
    throw new Error(
      "Os dados aleatórios foram pausados. Confira o acesso, o vínculo e a credencial antes de tentar novamente.",
    );
  return data as {
    status: 200;
    accepted: true;
    duplicate: boolean;
    received_at: string;
  };
}
