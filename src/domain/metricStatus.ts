// General resting-adult references, not individualized clinical thresholds.
// https://medlineplus.gov/ency/article/002341.htm
// https://www.ncbi.nlm.nih.gov/sites/books/NBK553213/
export function metricStatus(
  key: string,
  value: unknown,
  fresh: boolean,
  care?: import("../features/people/careSettings").CareSettings | null,
) {
  if (typeof value !== "number" || !Number.isFinite(value))
    return {
      label: "Sem leitura",
      tone: "muted",
      detail: "Aguardando dados do sensor",
    };
  if (!fresh)
    return {
      label: "Leitura desatualizada",
      tone: "muted",
      detail: "Confira a conexão antes de interpretar",
    };
  if (key === "battery_percent")
    return {
      label: value <= 20 ? "Bateria fraca" : "Carga suficiente",
      tone: value <= 20 ? "warning" : "normal",
      detail: value <= 20 ? "Recarregue o colete" : "Nível de carga do colete",
    };
  const configured =
    care &&
    (key === "heart_rate_bpm" ||
      key === "spo2_percent" ||
      key === "temperature_c")
      ? care[key]
      : null;
  if (!configured)
    return {
      label: "Sem faixa individual",
      tone: "muted",
      detail:
        "Configure a faixa orientada por profissional no cadastro do idoso",
    };
  const range = [configured.min, configured.max];
  const invalid = key === "spo2_percent" && (value < 0 || value > 100);
  return {
    label: invalid
      ? "Verificar sensor"
      : value < range[0]
        ? "Abaixo da referência"
        : value > range[1]
          ? "Acima da referência"
          : "Dentro da faixa individual",
    tone:
      invalid || value < range[0] || value > range[1] ? "warning" : "normal",
    detail: `Faixa individual: ${configured.min}–${configured.max}. Orientação: ${care!.professional_reference}`,
  };
}
