import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "../../lib/supabase";
import { listAlerts } from "../devices/api";
import { dateTime } from "../../domain/connectivity";
import { State } from "../../components/ui/State";
import { Pagination } from "../../components/ui/Pagination";
import { useAuth } from "../auth/AuthProvider";
import { FallActions } from "../notifications/FallActions";
const labels = {
  new: "Novo",
  acknowledged: "Em acompanhamento",
  resolved: "Resolvido",
};
export function Alerts({
  deviceId = null,
  personId,
  assignmentId,
}: {
  deviceId?: string | null;
  personId?: string | null;
  assignmentId?: string;
}) {
  const a = useAuth(),
    cache = useQueryClient();
  const [page, setPage] = useState(0),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const q = useQuery({
    queryKey: [
      "alerts",
      a.profile!.id,
      deviceId,
      personId,
      assignmentId,
      status,
      page,
    ],
    queryFn: ({ signal }) =>
      listAlerts(deviceId, status, page, signal, personId, assignmentId),
    refetchInterval: 15000,
  });
  async function triage(id: string, value: string) {
    setBusy(id);
    setError("");
    try {
      const { error } = await db().rpc("triage_alert", {
        target: id,
        new_status: value,
      });
      if (error) throw error;
      void cache.invalidateQueries({ queryKey: ["alerts"] });
    } catch {
      setError(
        "Não foi possível registrar a triagem. Confira o acesso e tente novamente.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Eventos e alertas</h2>
        <div className="select-field">
          <label htmlFor="alert-filter">Estado</label>
          <select
            id="alert-filter"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todos os estados</option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <State title={error} tone="error" />}
      {q.isPending ? (
        <State title="Carregando eventos" tone="loading" />
      ) : q.isError ? (
        <State
          title="Não foi possível consultar os eventos"
          tone="error"
          retry={() => void q.refetch()}
        />
      ) : !q.data.count ? (
        <State title="Nenhum evento neste filtro">
          Eventos recebidos do dispositivo aparecerão aqui. A ausência de
          eventos não confirma ausência de risco.
        </State>
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <caption>
                Eventos reportados pelo dispositivo, sem diagnóstico automático.
              </caption>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Evento</th>
                  <th>Severidade</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <time>{dateTime(row.created_at)}</time>
                    </td>
                    <td>
                      {row.description}
                      {row.source === "simulated" && (
                        <p className="status-note">Origem: dados simulados</p>
                      )}
                      {row.triaged_at && (
                        <p className="status-note">
                          Triagem registrada em {dateTime(row.triaged_at)}
                        </p>
                      )}
                    </td>
                    <td>
                      {
                        (
                          {
                            info: "Informação",
                            warning: "Atenção",
                            critical: "Prioridade alta",
                          } as Record<string, string>
                        )[row.severity]
                      }
                    </td>
                    <td>
                      {row.kind === "fall_detected" ? (
                        <FallActions
                          id={row.id}
                          status={row.status}
                          outcome={row.fall_outcome}
                        />
                      ) : (
                        <select
                          aria-label={`Estado do evento de ${dateTime(row.created_at)}`}
                          value={row.status}
                          disabled={busy === row.id}
                          onChange={(e) => void triage(row.id, e.target.value)}
                        >
                          {Object.entries(labels).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            count={q.data.count}
            setPage={setPage}
            busy={q.isFetching}
          />
        </>
      )}
    </section>
  );
}
