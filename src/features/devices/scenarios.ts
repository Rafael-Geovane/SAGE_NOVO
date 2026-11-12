export const scenarios = [
  {
    id: "normal",
    label: "Enviar leitura estável",
    detail: "70–76 bpm · SpO₂ 97–99%",
  },
  {
    id: "fall",
    label: "Simular possível queda",
    detail: "Cria um evento no sino para avaliação",
  },
  {
    id: "battery",
    label: "Simular bateria em 15%",
    detail: "Altera a leitura de bateria",
  },
  { id: "rest", label: "Simular repouso", detail: "64 bpm · SpO₂ 98%" },
  {
    id: "movement",
    label: "Simular movimento",
    detail: "92 bpm e eixos do acelerômetro",
  },
  {
    id: "high-pulse",
    label: "Simular pulso elevado",
    detail: "120 bpm · cenário de demonstração",
  },
  {
    id: "low-oxygen",
    label: "Simular SpO₂ reduzida",
    detail: "92% · cenário de demonstração",
  },
  {
    id: "partial",
    label: "Simular sensor sem leitura",
    detail: "Batimentos e SpO₂ ausentes",
  },
  {
    id: "device-test",
    label: "Enviar evento de teste",
    detail: "Registra device_test no histórico",
  },
  {
    id: "recovery",
    label: "Restaurar leitura estável",
    detail: "72 bpm · 98% · bateria 85%",
  },
] as const;
export type Scenario = (typeof scenarios)[number]["id"];
