// General resting-adult references, not individualized clinical thresholds.
// https://medlineplus.gov/ency/article/002341.htm
// https://www.ncbi.nlm.nih.gov/sites/books/NBK553213/
export function metricStatus(key: string, value: unknown, fresh: boolean) {
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
  const range =
    key === "heart_rate_bpm"
      ? [60, 100]
      : key === "spo2_percent"
        ? [95, 100]
        : [36.5, 37.3];
  const invalid = key === "spo2_percent" && (value < 0 || value > 100);
  return {
    label: invalid
      ? "Verificar sensor"
      : value < range[0]
        ? "Abaixo da referência"
        : value > range[1]
          ? "Acima da referência"
          : "Normal na referência",
    tone:
      invalid || value < range[0] || value > range[1] ? "warning" : "normal",
    detail:
      key === "temperature_c"
        ? "Referência corporal: 36,5–37,3 °C; depende do local de medição"
        : key === "heart_rate_bpm"
          ? "Referência em repouso: 60–100 bpm"
          : "Estimativa de oxigenação · referência: 95–100%",
  };
}
