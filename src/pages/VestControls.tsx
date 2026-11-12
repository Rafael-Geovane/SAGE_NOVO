import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  emitSimulatedReading,
  lookupConnectedDevice,
} from "../features/devices/managed";
import { listDevices, type Device } from "../features/devices/api";
import { Button } from "../components/ui/Button";
import { State } from "../components/ui/State";
import { scenarios, type Scenario } from "../features/devices/scenarios";
export default function VestControls() {
  const cache = useQueryClient();
  const [code, setCode] = useState("SGE-067");
  const [device, setDevice] = useState<Device>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pending = useRef<{ id: string; scenario: Scenario } | null>(null);
  const lock = useRef(false);
  async function connect() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setDevice(undefined);
    pending.current = null;
    try {
      const connection = await lookupConnectedDevice(code);
      if (!connection)
        throw new Error(
          "Colete não encontrado ou sem autorização. Vincule-o no acompanhamento.",
        );
      const result = await listDevices(connection.page);
      const found = result.rows.find((d) => d.id === connection.deviceId);
      if (!found || found.telemetry_source !== "simulated" || !found.enabled)
        throw new Error("Selecione um colete habilitado com origem simulada.");
      setDevice(found);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível carregar o colete.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function send(scenario: Scenario) {
    if (!device || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const request = pending.current ?? { id: crypto.randomUUID(), scenario };
    pending.current = request;
    try {
      await emitSimulatedReading(
        device.id,
        device.assignment_id,
        request.id,
        undefined,
        request.scenario,
      );
      pending.current = null;
      await cache.invalidateQueries({ queryKey: ["devices"] });
      await cache.invalidateQueries({ queryKey: ["readings"] });
      await cache.invalidateQueries({ queryKey: ["notifications"] });
      setMessage(
        request.scenario === "fall"
          ? "Possível queda simulada enviada. Confira o sino e o dashboard."
          : "Leitura enviada ao banco. Confira o dashboard.",
      );
    } catch {
      setError(
        "Envio não confirmado. Tente novamente: a mesma leitura será reenviada sem duplicação. Confira também se a migration de controles foi aplicada.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="container section" style={{ maxWidth: 900 }}>
      <span className="eyebrow">CONTROLE DE DEMONSTRAÇÃO</span>
      <h1>Teste do colete</h1>
      <p>
        Abra o acompanhamento em outra aba. Cada clique envia uma amostra
        simulada ao colete autorizado e atualiza seu histórico.
      </p>
      <section className="panel">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
        >
          <label htmlFor="control-code">Código do colete de teste</label>
          <input
            id="control-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={busy}
          />
          <Button disabled={busy} type="submit">
            Carregar colete
          </Button>
        </form>
        {device && (
          <>
            <h2>{device.code}</h2>
            <p>
              Temperatura fixa em 36,5 °C, batimentos entre 70 e 76 bpm, SpO₂
              entre 97 e 99% e bateria em 85%. Valores demonstrativos.
            </p>
            <p className="status-note">
              Os cenários alteram apenas os campos descritos. Somente “possível
              queda” cria um aviso no sino. Restaurar uma leitura estável não
              encerra avaliações de queda pendentes.
            </p>
            <div className="scenario-grid">
              {pending.current ? (
                <Button
                  disabled={busy}
                  onClick={() => void send(pending.current!.scenario)}
                >
                  Tentar o mesmo envio novamente
                </Button>
              ) : (
                <>
                  {scenarios.map((scenario) => (
                    <div key={scenario.id} className="scenario-card">
                      <Button
                        disabled={busy}
                        variant="outline"
                        onClick={() => void send(scenario.id)}
                      >
                        {scenario.label}
                      </Button>
                      <p>{scenario.detail}</p>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
        {busy && <State title="Processando envio" tone="loading" />}
        {error && <State title={error} tone="error" />}
        {message && <State title={message} tone="success" />}
      </section>
      <p>
        Para acompanhar somente os cliques, pause “dados aleatórios” no
        dashboard. A atualização entre abas usa Realtime; se a conexão cair, a
        consulta periódica pode levar até 15 segundos.
      </p>
      <Link href="/dashboard" className="text-link">
        Abrir acompanhamento
      </Link>
    </div>
  );
}
