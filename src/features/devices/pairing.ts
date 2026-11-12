import { z } from "zod";
import { db } from "../../lib/supabase";

export const pairingInput = z.object({
  code: z
    .string()
    .transform((value) =>
      value
        .trim()
        .toUpperCase()
        .replace(/\s*-\s*/g, "-"),
    )
    .pipe(z.string().regex(/^SGE-\d{3}$/, "Use o formato SGE-000.")),
  activationCode: z
    .string()
    .transform((value) => value.trim().replace(/-/g, "").toLowerCase())
    .pipe(
      z
        .string()
        .regex(/^[0-9a-f]{32}$/, "Informe o código de ativação completo."),
    ),
});

const connection = z.object({
  device_id: z.uuid(),
  page: z.number().int().nonnegative(),
});
const activation = z.object({
  code: z.string().regex(/^SGE-\d{3}$/),
  activation_code: z.string().regex(/^[0-9a-f]{32}$/),
  expires_at: z.iso.datetime({ offset: true }),
});
const unavailable =
  "A conexão de coletes ainda não está disponível neste ambiente. Entre em contato com o suporte.";

export async function connectDevice(input: z.input<typeof pairingInput>) {
  const values = pairingInput.parse(input);
  const { data, error } = await db().rpc("connect_device", {
    p_code: values.code,
    p_activation_code: values.activationCode,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883")
      throw new Error(unavailable);
    throw new Error(
      "Não foi possível confirmar a conexão. Tente novamente com os mesmos códigos.",
    );
  }
  if (data?.status === "rate_limited")
    throw new Error("Muitas tentativas. Aguarde 15 minutos e tente novamente.");
  if (data?.status !== "connected" && data?.status !== "already_connected")
    throw new Error(
      "Confira os códigos do colete e de ativação. O código pode ter expirado ou já ter sido utilizado.",
    );
  const parsed = connection.safeParse(data);
  if (!parsed.success)
    throw new Error(
      "Não foi possível confirmar a conexão. Atualize seus coletes e tente novamente.",
    );
  return { deviceId: parsed.data.device_id, page: parsed.data.page };
}

export async function issueDeviceActivation(deviceId: string) {
  const { data, error } = await db().rpc("issue_device_pairing_code", {
    p_device_id: z.uuid().parse(deviceId),
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883")
      throw new Error(unavailable);
    throw new Error(
      "Não foi possível gerar o código. Verifique se o colete está habilitado e a pessoa tem consentimento registrado.",
    );
  }
  const parsed = activation.safeParse(data);
  if (!parsed.success)
    throw new Error(
      "Não foi possível confirmar o código de ativação. Tente gerar um novo código.",
    );
  return {
    code: parsed.data.code,
    activationCode: parsed.data.activation_code,
    expiresAt: parsed.data.expires_at,
  };
}
