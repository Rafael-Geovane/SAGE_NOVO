import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Download, Printer, Sparkles } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import { listDevices } from "../features/devices/api";
import {
  weeklyReport,
  currentPlan,
  analyzeWeek,
  analyzeWeekNvidia,
  exportWeek,
  reportCsv,
  metricNames,
  reportSourceName as sourceName,
  type Analysis,
} from "../features/reports/api";
import { WorkspaceHeader } from "../components/layout/WorkspaceHeader";
import { Pagination } from "../components/ui/Pagination";
import { Button } from "../components/ui/Button";
import { State } from "../components/ui/State";
const number = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
export default function Reports() {
  const [aiConsent, setAiConsent] = useState(false);
  const a = useAuth();
  const [page, setPage] = useState(0),
    [selected, setSelected] = useState("");
  const [start, setStart] = useState(() =>
    new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<{
    scope: string;
    data: Analysis;
  } | null>(null);
  const devices = useQuery({
    queryKey: ["devices", a.profile!.id, page],
    queryFn: ({ signal }) => listDevices(page, signal),
    gcTime: 0,
    refetchInterval: 15000,
  });
  const plan = useQuery({
    queryKey: ["plan", a.profile!.id],
    queryFn: currentPlan,
  });
  const device =
    devices.data?.rows.find((d) => d.id === selected) ?? devices.data?.rows[0];
  const scope = JSON.stringify([
    a.profile!.id,
    device?.id,
    device?.assignment_id,
    device?.person_id,
    start,
  ]);
  const report = useQuery({
    queryKey: ["weekly-report", scope],
    queryFn: ({ signal }) =>
      weeklyReport(device!.id, device!.assignment_id, start, signal),
    enabled: !!device && !!start,
    gcTime: 0,
  });
  const data = report.data;
  const allowedExport = plan.data === "plus" || plan.data === "premium";
  async function exportReport(print = false) {
    if (!device || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await exportWeek(device.id, device.assignment_id, start);
      if (print) window.print();
      else {
        const url = URL.createObjectURL(
          new Blob([reportCsv(result)], { type: "text/csv;charset=utf-8" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = `SAGE-${result.device_code}-${start}.csv`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível exportar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container section reports-page">
      <div className="no-print">
        <WorkspaceHeader
          title="Relatórios"
          description="Uma semana de registros, com contexto para acompanhar melhor."
        />
      </div>
      <div className="panel no-print">
        <div className="report-filters">
          <div>
            <label htmlFor="report-device">Colete autorizado</label>
            <select
              id="report-device"
              value={device?.id ?? ""}
              onChange={(e) => {
                setSelected(e.target.value);
                setError("");
              }}
              disabled={busy || !devices.data?.rows.length}
            >
              {devices.data?.rows.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} · {d.people?.display_name ?? "Cadastro a completar"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="report-start">Primeiro dia da semana (UTC)</label>
            <input
              id="report-start"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              min={new Date(Date.now() - 366 * 86400000)
                .toISOString()
                .slice(0, 10)}
              value={start}
              disabled={busy}
              onChange={(e) => {
                setStart(e.target.value);
                setError("");
              }}
            />
          </div>
          <Button
            variant="outline"
            disabled={!device || busy || report.isFetching}
            onClick={() => void report.refetch()}
          >
            Atualizar relatório
          </Button>
        </div>
        {devices.data && devices.data.count > 25 && (
          <Pagination
            page={page}
            count={devices.data.count}
            setPage={(p) => {
              setPage(p);
              setSelected("");
            }}
          />
        )}
      </div>
      {devices.isPending ? (
        <State title="Consultando coletes" tone="loading" />
      ) : devices.isError ? (
        <State
          title="Não foi possível carregar coletes"
          tone="error"
          retry={() => void devices.refetch()}
        />
      ) : !device ? (
        <State title="Adicione um colete para gerar relatórios">
          <Link href="/dashboard">Ir ao acompanhamento</Link>
        </State>
      ) : !start ? (
        <State title="Selecione o início do período" />
      ) : report.isPending ? (
        <State title="Preparando relatório semanal" tone="loading" />
      ) : report.isError ? (
        <State
          title="Não foi possível gerar o relatório"
          tone="error"
          retry={() => void report.refetch()}
        />
      ) : (
        data && (
          <>
            <section className="report-cover">
              <div>
                <span className="eyebrow">SAGE · RELATÓRIO SEMANAL</span>
                <h2>{data.device_code}</h2>
                <p>
                  {data.start.slice(0, 10)} até{" "}
                  {new Date(Date.parse(data.end) - 86400000)
                    .toISOString()
                    .slice(0, 10)}{" "}
                  · UTC
                </p>
              </div>
              <div>
                <strong>
                  {number(data.sources.reduce((sum, s) => sum + s.samples, 0))}
                </strong>
                <span>amostras no período</span>
              </div>
            </section>
            <div className="report-actions no-print">
              <Button
                variant="outline"
                disabled={busy || !allowedExport}
                onClick={() => void exportReport()}
              >
                <Download size={17} />
                Exportar CSV
              </Button>
              <Button
                variant="outline"
                disabled={busy || !allowedExport}
                onClick={() => void exportReport(true)}
              >
                <Printer size={17} />
                Imprimir / PDF
              </Button>
              {!allowedExport && (
                <Link href="/planos" className="text-link">
                  Exportações disponíveis no Plus e Premium
                </Link>
              )}
            </div>
            <section className="panel">
              <h2>Distribuição de registros</h2>
              <p>
                Quantidade recebida por dia e origem. Dias sem amostras não
                significam valores normais.
              </p>
              {!data.days.length ? (
                <State title="Sem registros nesta semana" />
              ) : (
                <div className="report-days">
                  {data.days.map((d) => (
                    <div key={d.day + d.source}>
                      <div>
                        <time>{d.day}</time>
                        <small>{sourceName(d.source)}</small>
                      </div>
                      <meter
                        min={0}
                        max={Math.max(
                          ...data.days.map((day) => day.samples),
                          1,
                        )}
                        value={d.samples}
                        aria-label={`${d.day} ${sourceName(d.source)}: ${d.samples} amostras`}
                      />
                      <strong>{number(d.samples)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="panel">
              <h2>Resumo das medições</h2>
              <div className="table-scroll">
                <table>
                  <caption>
                    Métricas calculadas por origem. A quantidade de valores
                    válidos pode variar entre sensores.
                  </caption>
                  <thead>
                    <tr>
                      <th>Métrica</th>
                      <th>Origem</th>
                      <th>Amostras</th>
                      <th>Média</th>
                      <th>Mínimo</th>
                      <th>Máximo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.metrics.map((m) => (
                      <tr key={m.source + m.metric}>
                        <td>{metricNames[m.metric] ?? m.metric}</td>
                        <td>{sourceName(m.source)}</td>
                        <td>{number(m.samples)}</td>
                        <td>{number(m.mean)}</td>
                        <td>{number(m.minimum)}</td>
                        <td>{number(m.maximum)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.metrics.length && (
                <p>Sem valores válidos para calcular as métricas.</p>
              )}
            </section>
            <section className="panel">
              <h2>Eventos da semana</h2>
              {!data.events.length ? (
                <p>Nenhum evento registrado no período selecionado.</p>
              ) : (
                <ul>
                  {data.events.map((e) => (
                    <li key={e.source + e.event}>
                      {e.event === "fall_detected"
                        ? "Possível queda reportada"
                        : "Teste do dispositivo"}{" "}
                      · {sourceName(e.source)} · {e.count} registro(s)
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel weekly-analysis">
              <span className="badge">EXCLUSIVO SAGE PREMIUM · IA NVIDIA</span>
              <h2>
                <Sparkles size={24} />
                Análise da semana
              </h2>
              <p>
                A IA resume os registros da semana e sugere melhorias no
                acompanhamento. Ela não determina se a pessoa está bem nem
                substitui avaliação profissional.
              </p>
              <div className="no-print">
                {plan.data === "premium" && (
                  <>
                    <label className="ai-consent">
                      <input
                        type="checkbox"
                        checked={aiConsent}
                        disabled={busy}
                        onChange={(e) => setAiConsent(e.target.checked)}
                      />
                      <span>
                        Autorizo enviar à NVIDIA os agregados desta semana
                        (métricas, contagens e eventos), sem nome, endereço,
                        contato ou histórico de doenças.
                      </span>
                    </label>
                    <Button
                      disabled={!aiConsent || busy || report.isFetching}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        setAnalysis(null);
                        try {
                          setAnalysis({
                            scope,
                            data: await analyzeWeekNvidia(
                              device.id,
                              device.assignment_id,
                              start,
                            ),
                          });
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Não foi possível analisar com a NVIDIA.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {busy
                        ? "Preparando análise…"
                        : "Gerar relatório com IA NVIDIA"}
                    </Button>
                    <p className="status-note">
                      A IA requer uma chave NVIDIA configurada no backend. O
                      resumo por regras abaixo continua disponível para
                      demonstração.
                    </p>
                  </>
                )}
                {plan.data === "premium" ? (
                  <Button
                    disabled={busy || report.isFetching}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        setAnalysis({
                          scope,
                          data: await analyzeWeek(
                            device.id,
                            device.assignment_id,
                            start,
                          ),
                        });
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Não foi possível analisar.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy ? "Preparando análise…" : "Gerar resumo por regras"}
                  </Button>
                ) : (
                  <Link href="/planos" className="button button-primary">
                    Liberar IA com SAGE Premium
                  </Link>
                )}
              </div>
              {analysis?.scope === scope && plan.data === "premium" && (
                <div className="analysis-result">
                  {analysis.data.mode === "nvidia" ? (
                    <>
                      <span className="badge">
                        Gerado por IA · {analysis.data.model}
                      </span>
                      <p>{analysis.data.health_status}</p>
                      <h3>Resumo</h3>
                      <p>{analysis.data.summary}</p>
                      <h3>Observações dos registros</h3>
                      <ul>
                        {analysis.data.observations?.map((text, i) => (
                          <li key={i}>{text}</li>
                        ))}
                      </ul>
                      <h3>O que aprimorar no acompanhamento</h3>
                      <ul>
                        {analysis.data.improvements?.map((text, i) => (
                          <li key={i}>{text}</li>
                        ))}
                      </ul>
                      <h3>Pontos para verificação</h3>
                      <ul>
                        {analysis.data.attention?.map((text, i) => (
                          <li key={i}>{text}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    analysis.data.paragraphs.map((p, i) => <p key={i}>{p}</p>)
                  )}
                </div>
              )}
            </section>
            <p className="status-note">
              Gerado em {new Date(data.generated_at).toLocaleString("pt-BR")}. O
              período cobre sete dias e pode incluir dias futuros sem amostras.
              A leitura não constitui diagnóstico.
            </p>
          </>
        )
      )}
      {error && <State title={error} tone="error" />}
    </div>
  );
}
