import { z } from "zod";
import { db } from "../../lib/supabase";
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use até ${max} caracteres.`)
    .nullable()
    .transform((v) => v || null);
export const profileInput = z
  .object({
    display_name: z.string().trim().min(1, "Informe o nome do idoso.").max(120),
    address: optionalText(1000),
    allergy_status: z.enum(["unknown", "none", "reported"]),
    allergies: optionalText(1000),
    health_conditions: optionalText(3000),
    contact_name: optionalText(120),
    contact_phone: optionalText(25).refine(
      (v) => !v || /^\+?[0-9 ()-]{8,25}$/.test(v),
      "Informe um telefone válido com DDD.",
    ),
    consent_confirmed: z
      .boolean()
      .refine((v) => v, "Confirme a autorização para registrar esses dados."),
    consent_note: optionalText(1000),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.allergy_status === "reported") !== !!v.allergies)
      ctx.addIssue({
        code: "custom",
        path: ["allergies"],
        message:
          "Descreva a alergia informada ou selecione a situação correspondente.",
      });
  });
export type ElderProfile = {
  id: string;
  display_name: string;
  address: string | null;
  allergy_status: "unknown" | "none" | "reported";
  allergies: string | null;
  health_conditions: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  consent_recorded_at: string | null;
  consent_note: string | null;
};
export type ProfileDevice = {
  can_manage_profile?: boolean;
  id: string;
  person_id: string | null;
  assignment_id: string;
  people: ElderProfile | null;
};
export async function loadProfileDevice(
  deviceId: string,
  signal?: AbortSignal,
): Promise<ProfileDevice> {
  let q = db()
    .from("devices")
    .select(
      "id,person_id,assignment_id,people(id,display_name,address,allergy_status,allergies,health_conditions,contact_name,contact_phone,consent_recorded_at,consent_note)",
    )
    .eq("id", deviceId);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q.maybeSingle();
  if (error || !data)
    throw new Error(
      "Não foi possível consultar o cadastro. Atualize e confira o acesso.",
    );
  let permission = db().rpc("can_manage_device_profile", {
    p_device_id: deviceId,
  });
  if (signal) permission = permission.abortSignal(signal);
  const { data: canManage, error: permissionError } = await permission;
  if (permissionError)
    throw new Error("Não foi possível confirmar a permissão de edição.");
  return {
    ...data,
    can_manage_profile: canManage === true,
  } as unknown as ProfileDevice;
}
export async function saveElderProfile(
  deviceId: string,
  assignmentId: string,
  input: unknown,
) {
  const parsed = profileInput.parse(input);
  const { data, error } = await db().rpc("complete_device_profile", {
    p_device_id: deviceId,
    p_expected_assignment_id: assignmentId,
    p_data: parsed,
  });
  if (error)
    throw new Error(
      error.code === "40001"
        ? "O vínculo mudou durante o cadastro. Feche e abra novamente para atualizar."
        : error.code === "42501"
          ? "Sua conta não tem permissão para editar o cadastro deste colete."
          : "Não foi possível salvar. Confira os dados, o consentimento e tente novamente.",
    );
  const result = z
    .object({
      device_id: z.uuid(),
      person_id: z.uuid(),
      assignment_id: z.uuid(),
    })
    .safeParse(data);
  if (!result.success)
    throw new Error(
      "Não foi possível confirmar o cadastro. Atualize a lista antes de tentar novamente.",
    );
  return result.data;
}
