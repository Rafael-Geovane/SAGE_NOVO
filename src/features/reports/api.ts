import { db } from "../../lib/supabase";
export type Plan = "essential" | "plus" | "premium";
export async function currentPlan(): Promise<Plan> {
  const { data, error } = await db()
    .from("demo_subscriptions")
    .select("plan")
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar o plano.");
  return data?.plan ?? "essential";
}
export async function selectPlan(plan: Plan) {
  const { error } = await db().rpc("select_demo_plan", { p_plan: plan });
  if (error) throw new Error("Não foi possível alterar o plano demonstrativo.");
}
export type WeeklyReport = {
  device_code: string;
  assignment_id: string;
  start: string;
  end: string;
  generated_at: string;
  timezone: string;
  sources: {
    source: string;
    samples: number;
    first_reading: string;
    last_reading: string;
  }[];
  days: { day: string; source: string; samples: number }[];
  metrics: {
    source: string;
    metric: string;
    samples: number;
    mean: number;
    minimum: number;
    maximum: number;
  }[];
  events: { source: string; event: string; count: number }[];
};
export type Analysis = {
  mode: "demo_rules" | "nvidia";
  model?: string;
  summary?: string;
  observations?: string[];
  improvements?: string[];
  attention?: string[];
  health_status?: string;
  generated_at: string;
  paragraphs: string[];
  report: WeeklyReport;
};
export async function analyzeWeekNvidia(
  deviceId: string,
  assignmentId: string,
  start: string,
): Promise<Analysis> {
  const { data, error } = await db().functions.invoke("weekly-analysis", {
    body: {
      device_id: deviceId,
      assignment_id: assignmentId,
      start,
      consent: true,
    },
  });
  if (error) {
    let code = "analysis_unavailable";
    try {
      code = (await error.context?.json())?.error ?? code;
    } catch {
      /* Keep the safe generic error. */
    }
    const messages: Record<string, string> = {
      nvidia_not_configured:
        "Configure NVIDIA_API_KEY nos secrets do Supabase para ativar a IA NVIDIA.",
      insufficient_data: "Não há amostras nesta semana para analisar.",
      rate_limited: "Limite de análises atingido. Aguarde um minuto.",
      provider_rate_limited:
        "A NVIDIA está limitando as chamadas. Aguarde e tente novamente.",
      premium_or_access_required:
        "A análise exige Premium e acesso autorizado ao colete.",
      access_changed: "Seu vínculo ou plano mudou. Atualize a página.",
    };
    throw new Error(
      messages[code] ??
        "A IA NVIDIA não respondeu. Tente novamente ou use a análise demonstrativa.",
    );
  }
  if (data?.mode !== "nvidia" || !Array.isArray(data.paragraphs))
    throw new Error("Resposta da IA inválida.");
  return data as Analysis;
}
export async function weeklyReport(
  deviceId: string,
  assignmentId: string,
  start: string,
  signal?: AbortSignal,
): Promise<WeeklyReport> {
  let q = db().rpc("weekly_device_report", {
    p_device_id: deviceId,
    p_expected_assignment_id: assignmentId,
    p_start: start,
  });
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error)
    throw new Error(
      "Não foi possível gerar o relatório. Confira o período e seu vínculo.",
    );
  return data as WeeklyReport;
}
export async function analyzeWeek(
  deviceId: string,
  assignmentId: string,
  start: string,
): Promise<Analysis> {
  const { data, error } = await db().rpc("demo_weekly_analysis", {
    p_device_id: deviceId,
    p_expected_assignment_id: assignmentId,
    p_start: start,
  });
  if (error)
    throw new Error(
      "A análise demonstrativa exige plano Premium e vínculo autorizado.",
    );
  return data as Analysis;
}
export async function exportWeek(
  deviceId: string,
  assignmentId: string,
  start: string,
): Promise<WeeklyReport> {
  const { data, error } = await db().rpc("export_weekly_report", {
    p_device_id: deviceId,
    p_expected_assignment_id: assignmentId,
    p_start: start,
  });
  if (error)
    throw new Error(
      "A exportação exige plano Plus ou Premium e vínculo autorizado.",
    );
  return data as WeeklyReport;
}
export const metricNames: Record<string, string> = {
  heart_rate_bpm: "Batimentos (bpm)",
  spo2_percent: "SpO₂ (%)",
  temperature_c: "Temperatura (°C)",
  battery_percent: "Bateria (%)",
};
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  return (
    '"' +
    (/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""') +
    '"'
  );
}
export function reportCsv(report: WeeklyReport) {
  return (
    "\uFEFF" +
    [
      [
        "Colete",
        "Início UTC",
        "Fim exclusivo UTC",
        "Origem",
        "Métrica",
        "Amostras",
        "Média",
        "Mínimo",
        "Máximo",
      ],
      ...report.metrics.map((m) => [
        report.device_code,
        report.start,
        report.end,
        m.source,
        metricNames[m.metric] ?? m.metric,
        m.samples,
        m.mean,
        m.minimum,
        m.maximum,
      ]),
    ]
      .map((row) => row.map(csvCell).join(";"))
      .join("\r\n")
  );
}
