// Panel responsibilities recovered from relations.ts; readings come from authorized queries.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Activity,
  BatteryMedium,
  HeartPulse,
  RefreshCw,
  ShieldCheck,
  Signal,
  UserRound,
  WifiOff,
} from "lucide-react";
import { listDevices } from "../features/devices/api";
import { useAuth } from "../features/auth/AuthProvider";
import { useTelemetry } from "../features/devices/useTelemetry";
import { scopeHistoryPage } from "../features/devices/realtime";
import { ConnectDevice } from "../features/devices/ConnectDevice";
import { ElderProfileDetails } from "../features/people/ElderProfileDetails";
import { useRandomReadings } from "../features/devices/useRandomReadings";
import { espPresence } from "../features/devices/espPresence";
import type { DeviceConnection } from "../features/devices/managed";
import {
  connectionState,
  connectionLabels,
  dateTime,
  localZone,
  staleAfterSeconds,
  offlineAfterSeconds,
} from "../domain/connectivity";
import { WorkspaceHeader } from "../components/layout/WorkspaceHeader";
import { State } from "../components/ui/State";
import { Button } from "../components/ui/Button";
import { Pagination } from "../components/ui/Pagination";
import { Alerts } from "../features/alerts/Alerts";
const metrics = [
  ["heart_rate_bpm", "Batimentos", "bpm"],
  ["spo2_percent", "SpO₂", "%"],
  ["temperature_c", "Temperatura", "°C"],
  ["battery_percent", "Bateria", "%"],
];
export default function Caregiver() {
  const a = useAuth(),
    cache = useQueryClient(),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState(""),
    [history, setHistory] = useState({ scope: "", page: 0 }),
    [now, setNow] = useState(new Date());
  const [connectionNotice, setConnectionNotice] = useState("");
  const choice = useQuery<DeviceConnection | null>({
    queryKey: ["selected-device", a.profile!.id],
    queryFn: () => null,
    enabled: false,
    initialData: null,
    gcTime: 0,
  });
  useEffect(() => {
    if (!choice.data) return;
    setPage(choice.data.page);
    setSelected(choice.data.deviceId);
    setHistory({ scope: "", page: 0 });
    cache.setQueryData(["selected-device", a.profile!.id], null);
  }, [choice.data, cache, a.profile!.id]);
  const q = useQuery({
    queryKey: ["devices", a.profile!.id, page],
    queryFn: ({ signal }) => listDevices(page, signal),
    refetchInterval: (query) =>
      query.state.data?.rows.some((d) => d.requires_esp) ? 2000 : 15000,
  });
  const device = q.data?.rows.find((d) => d.id === selected) ?? q.data?.rows[0];
  const randomReadings = useRandomReadings(device);
  const scope = device
    ? JSON.stringify([
        a.profile!.id,
        device.id,
        device.person_id,
        device.assignment_id,
      ])
    : "";
  const currentHistory = scopeHistoryPage(history, scope);
  if (currentHistory !== history) setHistory(currentHistory);
  const historyPage = currentHistory.page;
  const setHistoryPage = (page: number) => setHistory({ scope, page });
  const { readings, channelState } = useTelemetry(device, historyPage);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const esp = espPresence(device, now);
  const state =
    device?.requires_esp && !esp.attached
      ? "offline"
      : connectionState(
          device?.last_received_at ?? null,
          now,
          staleAfterSeconds,
          offlineAfterSeconds,
          device?.enabled,
        );
  return (
    <div className="dashboard-shell">
      <WorkspaceHeader
        title={`Olá, ${a.profile?.display_name.split(" ")[0]}.`}
        description="Acompanhe somente os coletes vinculados à sua conta."
      />
      <section
        className="dashboard-overview"
        aria-labelledby="dashboard-overview-title"
      >
        <div className="dashboard-overview-copy">
          <span className="eyebrow">REDE DE CUIDADO</span>
          <h2 id="dashboard-overview-title">
            Informação clara para cuidar com mais presença.
          </h2>
          <p>
            O SAGE reúne sinais do colete, estado de conexão e alertas em um só
            lugar — com o contexto necessário para uma decisão humana.
          </p>
        </div>
        <div className="dashboard-overview-status">
          <div className="overview-status-line">
            <span
              className="overview-status-dot"
              data-state={state}
              aria-hidden="true"
            />
            <strong>
              {device
                ? device.requires_esp
                  ? esp.label
                  : connectionLabels[state]
                : "Aguardando vínculo"}
            </strong>
          </div>
          <span>
            {device
              ? `Monitorando ${device.code}`
              : "Adicione um colete para começar"}
          </span>
          <div className="overview-trust">
            <ShieldCheck size={16} />
            <span>Dados protegidos por vínculo autorizado</span>
          </div>
        </div>
      </section>
      <div className="panel-heading">
        <h2>Meus coletes</h2>
        {a.profile && (
          <ConnectDevice
            key={a.profile.id}
            mode={a.profile.role === "admin" ? "register" : "pair"}
            onConnected={async ({ deviceId, page: devicePage }) => {
              setPage(devicePage);
              setSelected(deviceId);
              setHistory({ scope: "", page: 0 });
              setConnectionNotice(
                "Colete adicionado à lista de acompanhamento.",
              );
              await cache.invalidateQueries({
                queryKey: ["devices", a.profile!.id],
              });
            }}
          />
        )}
      </div>
      {connectionNotice && <State title={connectionNotice} tone="success" />}
      {q.isPending ? (
        <State title="Buscando seus coletes" tone="loading" />
      ) : q.isError ? (
        <State
          title="Não foi possível consultar seus coletes"
          tone="error"
          retry={() => void q.refetch()}
        />
      ) : !q.data.count ? (
        <State title="Sua rede de cuidado começa com um vínculo">
          <p>
            Nenhum colete autorizado está vinculado à sua conta. A equipe SAGE
            pode orientar o cadastro e o consentimento.
          </p>
          <Link href="/suporte" className="text-link">
            Conversar com o suporte
          </Link>
        </State>
      ) : (
        <>
          <div className="device-grid">
            {q.data.rows.map((d) => (
              <button
                className="device-card"
                key={d.id}
                aria-pressed={device?.id === d.id}
                onClick={() => {
                  setSelected(d.id);
                  setHistoryPage(0);
                }}
              >
                <span className="device-card-top">
                  <code>{d.code}</code>
                  <span
                    className={`device-card-signal ${d.requires_esp ? (espPresence(d, now).attached ? "online" : "offline") : connectionState(d.last_received_at, now, staleAfterSeconds, offlineAfterSeconds, d.enabled)}`}
                    aria-label={
                      d.requires_esp
                        ? espPresence(d, now).label
                        : connectionLabels[
                            connectionState(
                              d.last_received_at,
                              now,
                              staleAfterSeconds,
                              offlineAfterSeconds,
                              d.enabled,
                            )
                          ]
                    }
                  />
                </span>
                <p className="device-card-person">
                  <UserRound size={15} />
                  {d.people?.display_name ?? "Sem pessoa vinculada"}
                </p>
                <span className="device-card-meta">
                  <span
                    className={`badge ${(d.requires_esp ? espPresence(d, now).attached : connectionState(d.last_received_at, now, staleAfterSeconds, offlineAfterSeconds, d.enabled) === "online") ? "badge-success" : "badge-warning"}`}
                  >
                    {d.requires_esp
                      ? espPresence(d, now).label
                      : connectionLabels[
                          connectionState(
                            d.last_received_at,
                            now,
                            staleAfterSeconds,
                            offlineAfterSeconds,
                            d.enabled,
                          )
                        ]}
                  </span>
                  <small>
                    {d.telemetry_source === "simulated"
                      ? "Demonstração"
                      : "Dispositivo físico"}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <Pagination
            page={page}
            count={q.data.count}
            setPage={(p) => {
              setPage(p);
              setSelected("");
              setHistoryPage(0);
            }}
          />
          {device && (
            <>
              <ElderProfileDetails key={`profile:${scope}`} device={device} />
              {device.requires_esp && (
                <div className="connection-banner" role="status">
                  <Signal size={19} />
                  <span>
                    <strong>{esp.label}.</strong> Último sinal do ESP:{" "}
                    {dateTime(device.esp_last_seen_at ?? null)}. Os valores são
                    fictícios e só são aceitos com o colete encaixado e um sinal
                    recebido nos últimos 12 segundos.
                  </span>
                </div>
              )}
              {(state !== "online" || channelState !== "connected") && (
                <div className="connection-banner" role="status">
                  <WifiOff size={19} />
                  <span>
                    {state === "stale"
                      ? "Os dados estão desatualizados. O colete não confirma recebimento recente."
                      : state === "offline"
                        ? "Sem comunicação recente com este colete. Os dados disponíveis podem estar antigos."
                        : state === "no-data"
                          ? "Este colete ainda não enviou leituras."
                          : "A conexão ao vivo está sendo restabelecida."}{" "}
                    Último recebimento: {dateTime(device.last_received_at)}.
                  </span>
                </div>
              )}
              <div className="panel-heading">
                <div>
                  <h2>
                    {device.code} · {device.people?.display_name ?? "Colete"}
                  </h2>
                  <p>
                    Última leitura: {dateTime(device.latest_recorded_at)} ·
                    Fuso: {localZone}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void q.refetch();
                    void readings.refetch();
                  }}
                >
                  <RefreshCw size={15} />
                  Atualizar
                </Button>
              </div>
              {device.telemetry_source === "simulated" && (
                <div
                  className="connection-banner simulation-feed"
                  role="status"
                >
                  <span>
                    <strong>Origem: dados simulados.</strong>{" "}
                    {device.requires_esp
                      ? "As amostras demonstrativas são enviadas pelo ESP após detectar o colete. "
                      : randomReadings.active
                        ? "Novas amostras aleatórias a cada 3 segundos."
                        : !randomReadings.visible
                          ? "Atualização pausada enquanto a página está oculta."
                          : "Atualização de dados aleatórios pausada."}{" "}
                    Estes valores não são medições do idoso.
                  </span>
                  {device.device_profile_editable && !device.requires_esp && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={randomReadings.toggle}
                    >
                      {randomReadings.active
                        ? "Pausar dados aleatórios"
                        : randomReadings.error
                          ? "Tentar novamente"
                          : "Iniciar dados aleatórios"}
                    </Button>
                  )}
                </div>
              )}
              {randomReadings.error && (
                <State title={randomReadings.error} tone="error" />
              )}
              <div className="metric-grid">
                {metrics.map(([key, label, unit]) => {
                  const value = device.latest_metrics?.[key];
                  const MetricIcon =
                    key === "heart_rate_bpm"
                      ? HeartPulse
                      : key === "battery_percent"
                        ? BatteryMedium
                        : key === "spo2_percent"
                          ? Activity
                          : Signal;
                  return (
                    <div className="metric" key={key}>
                      <span className="metric-label">
                        <MetricIcon size={16} />
                        {label}
                      </span>
                      <strong>
                        {typeof value === "number"
                          ? new Intl.NumberFormat("pt-BR", {
                              maximumFractionDigits: 1,
                            }).format(value)
                          : "—"}
                      </strong>
                      {typeof value === "number" ? (
                        <small>
                          {unit} ·{" "}
                          {device.telemetry_source === "simulated"
                            ? "valor aleatório"
                            : "última leitura recebida"}
                        </small>
                      ) : (
                        <small>Não informado pelo dispositivo</small>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="status-note">
                Campos previstos na integração; sua presença depende dos
                sensores e do firmware. Leituras não constituem diagnóstico.
                Atualização considerada recente por até {staleAfterSeconds}{" "}
                segundos.
              </p>
              {device.people?.contact_phone && (
                <div className="panel">
                  <h3>Contato autorizado</h3>
                  <p>
                    {device.people.contact_name ?? "Contato de cuidado"} ·{" "}
                    {device.people.contact_phone}
                  </p>
                  <p className="status-note">
                    Use seu próprio telefone para entrar em contato. O SAGE não
                    dispara chamadas ou mensagens externas.
                  </p>
                </div>
              )}
              <section className="panel">
                <h2>Histórico de leituras</h2>
                {readings.isPending ? (
                  <State title="Consultando histórico" tone="loading" />
                ) : readings.isError ? (
                  <State
                    title="Não foi possível consultar o histórico"
                    tone="error"
                    retry={() => void readings.refetch()}
                  />
                ) : !readings.data?.count ? (
                  <State title="Sem leituras registradas">
                    As informações aparecerão após o primeiro envio autorizado.
                  </State>
                ) : (
                  <>
                    <div className="table-scroll">
                      <table>
                        <caption>
                          Valores efetivamente recebidos. Ausência de leitura
                          permanece sem valor.
                        </caption>
                        <thead>
                          <tr>
                            <th>Data e hora</th>
                            {metrics.map(([, label, unit]) => (
                              <th key={label}>
                                {label} ({unit})
                              </th>
                            ))}
                            <th>Evento</th>
                            <th>Origem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {readings.data.rows.map((r) => (
                            <tr key={r.id}>
                              <td>
                                <time>{dateTime(r.recorded_at)}</time>
                              </td>
                              {metrics.map(([key]) => (
                                <td key={key}>
                                  {typeof r.metrics[key] === "number"
                                    ? new Intl.NumberFormat("pt-BR", {
                                        maximumFractionDigits: 2,
                                      }).format(r.metrics[key] as number)
                                    : "Não informado"}
                                </td>
                              ))}
                              <td>
                                {r.event === "fall_detected"
                                  ? "Possível queda reportada"
                                  : r.event === "device_test"
                                    ? "Teste do dispositivo"
                                    : "—"}
                              </td>
                              <td>
                                {r.source === "simulated"
                                  ? "Dados simulados"
                                  : "Dispositivo"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Pagination
                      page={historyPage}
                      count={readings.data.count}
                      setPage={setHistoryPage}
                      busy={readings.isFetching}
                    />
                    {readings.data.countExact === false && (
                      <p className="status-note" role="status">
                        Total aproximado. Atualize para confirmar a contagem.
                      </p>
                    )}
                  </>
                )}
              </section>
              <Alerts
                key={`alerts:${scope}`}
                deviceId={device.id}
                personId={device.person_id}
                assignmentId={device.assignment_id}
              />
            </>
          )}
        </>
      )}
      <p className="status-note">
        O SAGE apoia o acompanhamento. Em emergências, procure os serviços
        locais e orientação profissional.
      </p>
    </div>
  );
}
