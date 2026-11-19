import { z } from "zod";
const bound = (min: number, max: number) =>
  z
    .object({
      min: z.number().min(min).max(max),
      max: z.number().min(min).max(max),
    })
    .strict()
    .refine((v) => v.min < v.max, "O mínimo deve ser menor que o máximo.");
export const careSettingsSchema = z
  .object({
    birth_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de nascimento.")
      .refine(
        (v) =>
          Number.isFinite(Date.parse(v)) &&
          v <= new Date().toISOString().slice(0, 10) &&
          v >= "1900-01-01",
        "Data de nascimento inválida.",
      ),
    weight_kg: z.number().min(20).max(400),
    height_cm: z.number().min(80).max(250),
    medications: z
      .string()
      .trim()
      .min(1, "Informe medicamentos ou 'Nenhum informado'.")
      .max(2000),
    professional_reference: z.string().trim().max(500),
    heart_rate_bpm: bound(20, 250).nullable(),
    spo2_percent: bound(50, 100).nullable(),
    temperature_c: bound(30, 43).nullable(),
  })
  .strict()
  .refine(
    (v) =>
      ![v.heart_rate_bpm, v.spo2_percent, v.temperature_c].some(Boolean) ||
      v.professional_reference.length > 0,
    "Informe o profissional ou a orientação que definiu as faixas.",
  );
export type CareSettings = z.infer<typeof careSettingsSchema>;
