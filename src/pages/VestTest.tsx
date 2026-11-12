import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Activity,
  ArrowLeft,
  BatteryLow,
  FlaskConical,
  HeartPulse,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Thermometer,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button, buttonVariants } from "../components/ui/Button";
import {
  createSimulation,
  updateSimulation,
  startSimulationClock,
  MAX_SIMULATED_READINGS,
  type SimulationAction,
  type SimulatedEvent,
} from "../features/simulator/engine";
import { dateTime, localZone } from "../domain/connectivity";
import vestImage from "../../assets/vest_product.png";
import "../styles/simulator.css";

const metrics = [
  { key: "heart_rate_bpm", label: "Batimentos", unit: "bpm", icon: HeartPulse },
  { key: "spo2_percent", label: "SpO₂", unit: "%", icon: Activity },
  { key: "temperature_c", label: "Temperatura", unit: "°C", icon: Thermometer },
  { key: "battery_percent", label: "Bateria", unit: "%", icon: BatteryLow },
] as const;
const eventLabels: Record<SimulatedEvent["type"], string> = {
  device_test: "Evento de teste simulado",
  fall_detected: "Queda simulada",
  battery_test: "Bateria de teste em 5%",
  disconnected: "Desconexão simulada",
  reconnected: "Reconexão simulada",
};
const number = (value: number | null | undefined) =>
  value == null
    ? "--"
    : value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export default function VestTest() {
  const [state, setState] = useState(() => createSimulation());
  const [testReview, setTestReview] = useState<Record<string, string>>({});
  const lastTestFall = state.events.find(
    (event) => event.type === "fall_detected",
  );
  const [metric, setMetric] =
    useState<(typeof metrics)[number]["key"]>("heart_rate_bpm");
  const send = useCallback(
    (action: SimulationAction) =>
      setState((previous) => updateSimulation(previous, action)),
    [],
  );
  useEffect(() => {
    if (!state.running || !state.connected) return;
    return startSimulationClock(() => send({ type: "tick" }));
  }, [state.running, state.connected, send]);
  const last = state.readings[0];
  const selected = metrics.find((item) => item.key === metric)!;
  const chronological = [...state.readings].reverse();
  const values = chronological.map((row) => row.payload.metrics[metric]);
  const present = values.filter(
    (value): value is number => typeof value === "number",
  );
  const min = present.length ? Math.floor(Math.min(...present)) - 2 : 0;
  const max = present.length ? Math.ceil(Math.max(...present)) + 2 : 1;
  const segments: { x: number; y: number }[][] = [];
  let segment: { x: number; y: number }[] = [];
  values.forEach((value, index) => {
    if (value == null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else
      segment.push({
        x: 46 + (index / (MAX_SIMULATED_READINGS - 1)) * 570,
        y: 176 - ((value - min) / (max - min)) * 144,
      });
  });
  if (segment.length) segments.push(segment);
  const status = !state.connected
    ? "Desconectado no teste"
    : state.running
      ? "Teste em execução"
      : "Teste pausado";

  return (
    <main className="container simulator">
      <Link href="/dashboard" className="sim-back">
        <ArrowLeft size={16} /> Acompanhamento
      </Link>
      <header className="sim-heading">
        <div>
          <span className="sim-label">
            <FlaskConical size={15} /> DADOS SIMULADOS
          </span>
          <h1>
            Teste do colete <code>SGE-001</code>
          </h1>
          <p>
            Amostras sintéticas. Nenhuma medição de uma pessoa real ou gravação
            no banco.
          </p>
        </div>
        <figure className="sim-vest">
          <img
            src={vestImage}
            alt="Referência visual do protótipo SAGE Smart Vest"
          />
          <figcaption>Imagem conceitual</figcaption>
        </figure>
      </header>

      <section className="sim-controls" aria-label="Controles de teste">
        <div className="sim-actions">
          <Button
            onClick={() => send({ type: "running", value: !state.running })}
          >
            {state.running ? <Pause size={17} /> : <Play size={17} />}
            {state.running ? "Pausar teste" : "Iniciar teste"}
          </Button>
          <Button
            variant="outline"
            disabled={!state.connected}
            onClick={() => send({ type: "sample" })}
          >
            <RefreshCw size={17} />
            Gerar leitura
          </Button>
          <Button
            variant="outline"
            onClick={() => send({ type: "connected", value: !state.connected })}
          >
            {state.connected ? <WifiOff size={17} /> : <Wifi size={17} />}
            {state.connected ? "Simular desconexão" : "Reconectar"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              send({ type: "reset" });
              setTestReview({});
            }}
          >
            <RotateCcw size={17} />
            Reiniciar teste
          </Button>
        </div>
        <div className="sim-status">
          <span
            className={
              state.connected ? "sim-connection" : "sim-connection sim-offline"
            }
            role="status"
          >
            {state.connected ? <Wifi size={16} /> : <WifiOff size={16} />}
            {status}
          </span>
          <span>
            Intervalo: <strong>3 segundos</strong>
          </span>
          <span>
            Leituras de teste:{" "}
            <strong data-testid="sim-count">{state.total}</strong>
          </span>
        </div>
      </section>

      {lastTestFall && (
        <section className="panel" aria-label="Notificação simulada de queda">
          <h2>Notificação de teste: possível queda</h2>
          <p role="status">
            SGE-001 · {dateTime(lastTestFall.recordedAt)} ·{" "}
            {testReview[lastTestFall.id] ?? "Aguardando verificação no teste"}
          </p>
          <p className="status-note">
            Simulação local. Não envia alertas reais e não grava no Supabase.
          </p>
          <div className="sim-actions">
            {!testReview[lastTestFall.id]?.includes("registrad") && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setTestReview({
                      [lastTestFall.id]: "Em verificação no teste",
                    })
                  }
                >
                  Verificar no teste
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setTestReview({
                      [lastTestFall.id]: "Confirmação registrada no teste",
                    })
                  }
                >
                  Confirmar no teste
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setTestReview({
                      [lastTestFall.id]: "Descarte registrado no teste",
                    })
                  }
                >
                  Descartar no teste
                </Button>
              </>
            )}
          </div>
        </section>
      )}
      <section className="sim-metrics" aria-label="Última leitura simulada">
        {metrics.map(({ key, label, unit, icon: Icon }) => (
          <div className="sim-metric" key={key}>
            <div>
              <span>{label}</span>
              <Icon size={18} aria-hidden="true" />
            </div>
            <strong data-testid={`sim-${key}`}>
              {number(last.payload.metrics[key])}
              <small>{last.payload.metrics[key] == null ? "" : unit}</small>
            </strong>
            <span className="sim-caption">
              {last.payload.metrics[key] == null
                ? "Não fornecido no teste"
                : "Valor simulado"}
            </span>
          </div>
        ))}
      </section>
      <p className="sim-timestamp">
        Última leitura de teste:{" "}
        <time dateTime={last.payload.recorded_at}>
          {dateTime(last.payload.recorded_at)}
        </time>{" "}
        · {localZone}
      </p>

      <div className="sim-workspace">
        <section
          className="sim-chart-section"
          aria-label="Sinal simulado ao longo do tempo"
        >
          <div className="sim-section-heading">
            <h2>Sinal simulado</h2>
            <label className="sim-signal-picker">
              Métrica
              <select
                value={metric}
                onChange={(event) =>
                  setMetric(event.target.value as typeof metric)
                }
              >
                {metrics.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label} ({item.unit})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="sim-chart">
            {present.length ? (
              <svg
                viewBox="0 0 640 210"
                role="img"
                aria-label={`Gráfico de ${selected.label.toLowerCase()} com ${present.length} valores simulados`}
              >
                {[0, 1, 2].map((i) => (
                  <g key={i}>
                    <line
                      x1="46"
                      x2="616"
                      y1={32 + i * 72}
                      y2={32 + i * 72}
                      className="sim-grid-line"
                    />
                    <text x="36" y={36 + i * 72} textAnchor="end">
                      {number(max - ((max - min) * i) / 2)}
                    </text>
                  </g>
                ))}
                {segments.map((points, i) => (
                  <g key={i}>
                    <polyline
                      points={points
                        .map((point) => `${point.x},${point.y}`)
                        .join(" ")}
                      className="sim-trace"
                    />
                    {points.map((point, j) => (
                      <circle
                        key={j}
                        cx={point.x}
                        cy={point.y}
                        r="3"
                        className="sim-point"
                      />
                    ))}
                  </g>
                ))}
                <text x="46" y="203">
                  Mais antigo
                </text>
                <text x="616" y="203" textAnchor="end">
                  Até 30 leituras de teste
                </text>
              </svg>
            ) : (
              <p className="sim-chart-empty">
                Sem valores simulados neste sinal.
              </p>
            )}
          </div>
          <div className="sim-scenarios">
            <h3>Cenários de teste</h3>
            <div className="sim-actions">
              <Button
                variant="outline"
                disabled={!state.connected}
                onClick={() => send({ type: "event" })}
              >
                <FlaskConical size={16} />
                Evento de teste
              </Button>
              <Button
                variant="outline"
                disabled={!state.connected}
                onClick={() => send({ type: "fall" })}
              >
                <ShieldAlert size={16} />
                Queda simulada
              </Button>
              <Button
                variant="outline"
                disabled={!state.connected}
                onClick={() => send({ type: "low-battery" })}
              >
                <BatteryLow size={16} />
                Bateria em 5%
              </Button>
            </div>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={state.partial}
                onChange={(event) =>
                  send({ type: "partial", value: event.target.checked })
                }
              />{" "}
              Leituras parciais no teste
            </label>
          </div>
        </section>
        <section className="sim-event-section" aria-label="Eventos simulados">
          <div className="sim-section-heading">
            <h2>Eventos simulados</h2>
            <span>{state.events.length}</span>
          </div>
          <div
            className="sim-event-list"
            role="log"
            aria-live="polite"
            aria-label="Registro de eventos simulados"
            tabIndex={0}
          >
            {state.events.length ? (
              state.events.map((event) => (
                <article key={event.id} className="sim-event">
                  <FlaskConical size={17} />
                  <div>
                    <strong>{eventLabels[event.type]}</strong>
                    <time dateTime={event.recordedAt}>
                      {dateTime(event.recordedAt)}
                    </time>
                    <span>Origem: simulação local</span>
                  </div>
                </article>
              ))
            ) : (
              <p className="sim-empty">Nenhum evento simulado.</p>
            )}
          </div>
        </section>
      </div>

      <section className="sim-history">
        <div className="sim-section-heading">
          <h2>Leituras simuladas recentes</h2>
          <span>Últimas {Math.min(state.readings.length, 10)} amostras</span>
        </div>
        <div
          className="table-scroll sim-table"
          tabIndex={0}
          role="region"
          aria-label="Histórico de teste SGE-001"
        >
          <table>
            <thead>
              <tr>
                <th>Amostra</th>
                <th>Horário</th>
                <th>Batimentos</th>
                <th>SpO₂</th>
                <th>Temperatura</th>
                <th>Bateria</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              {state.readings.slice(0, 10).map((row) => (
                <tr key={row.payload.message_id}>
                  <td>#{row.sequence}</td>
                  <td>
                    {new Date(row.payload.recorded_at).toLocaleTimeString(
                      "pt-BR",
                    )}
                  </td>
                  {metrics.map(({ key, unit }) => (
                    <td key={key}>
                      {number(row.payload.metrics[key])}
                      {row.payload.metrics[key] == null ? "" : ` ${unit}`}
                    </td>
                  ))}
                  <td>
                    <span className="sim-source">Simulado</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <footer className="sim-footer">
        <span>
          <FlaskConical size={16} /> Ambiente de teste local
        </span>
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ArrowLeft size={15} />
          Voltar ao acompanhamento
        </Link>
      </footer>
    </main>
  );
}
