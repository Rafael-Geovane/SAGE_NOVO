// Admin sections recovered from 0002_snapshot.json; all numbers now queried from Supabase.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, SquarePen, ShieldCheck } from "lucide-react";
import { db } from "../lib/supabase";
import { useAuth } from "../features/auth/AuthProvider";
import {
  listDevices,
  activeWindowHours,
  adminSummary,
  type Device,
  type Person,
} from "../features/devices/api";
import {
  DeviceForm,
  PersonForm,
  LinkForm,
} from "../features/devices/AdminForms";
import {
  connectionState,
  connectionLabels,
  dateTime,
  staleAfterSeconds,
  offlineAfterSeconds,
} from "../domain/connectivity";
import { WorkspaceHeader } from "../components/layout/WorkspaceHeader";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { State } from "../components/ui/State";
import { Pagination } from "../components/ui/Pagination";
import { Alerts } from "../features/alerts/Alerts";
import Support from "./Support";
type Tab =
  "overview" | "devices" | "people" | "users" | "links" | "alerts" | "support";
type Row = Record<string, unknown> & { id: string };
export default function Admin() {
  const a = useAuth(),
    cache = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview"),
    [page, setPage] = useState(0),
    [modal, setModal] = useState<"device" | "person" | "link" | null>(null),
    [editing, setEditing] = useState<Device | Person | undefined>(),
    [revoke, setRevoke] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [notice, setNotice] = useState("");
  const table =
    tab === "people"
      ? "people"
      : tab === "users"
        ? "profiles"
        : "caregiver_device_links";
  const deviceQ = useQuery({
    queryKey: ["devices", a.profile!.id, "admin", page],
    queryFn: ({ signal }) => listDevices(page, signal),
    enabled: tab === "devices",
    refetchInterval: 15000,
  });
  const records = useQuery({
    queryKey: ["admin-list", a.profile!.id, table, page],
    enabled: ["people", "users", "links"].includes(tab),
    queryFn: async ({ signal }) => {
      const { data, count, error } = await db()
        .from(table)
        .select(
          table === "caregiver_device_links"
            ? "*,profiles!caregiver_device_links_caregiver_id_fkey(display_name),devices(code)"
            : "*",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(page * 25, page * 25 + 24)
        .abortSignal(signal);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Row[], count: count ?? 0 };
    },
  });
  const kpis = useQuery({
    queryKey: ["admin-kpis", a.profile!.id],
    enabled: tab === "overview",
    queryFn: ({ signal }) =>
      adminSummary(activeWindowHours, staleAfterSeconds, signal),
    refetchInterval: 15000,
  });
  function saved() {
    setModal(null);
    setEditing(undefined);
    setNotice("Alteração salva.");
    void cache.invalidateQueries();
  }
  async function revokeLink() {
    if (!revoke || busy) return;
    setBusy(true);
    setFailure("");
    try {
      const { error } = await db().rpc("revoke_caregiver_link", {
        target: revoke.id,
      });
      if (error) throw error;
      setRevoke(null);
      saved();
    } catch {
      setFailure("Não foi possível revogar o vínculo. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  const columns =
    tab === "people"
      ? ["Pessoa", "Consentimento", "Contato", "Ações"]
      : tab === "users"
        ? ["Nome", "Perfil", "Última atividade"]
        : ["Cuidador", "Colete", "Concessão", "Estado", "Ações"];
  return (
    <>
      <WorkspaceHeader
        title="Administração SAGE"
        description="Gestão de coletes, acesso autorizado e atendimento interno."
      />
      <div className="workspace-tabs" aria-label="Seções administrativas">
        {(
          [
            ["overview", "Visão geral"],
            ["devices", "Coletes"],
            ["people", "Pessoas"],
            ["users", "Usuários"],
            ["links", "Vínculos"],
            ["alerts", "Alertas"],
            ["support", "Suporte"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            data-navigate
            key={key}
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key);
              setPage(0);
              setNotice("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {notice && <State title={notice} tone="success" />}
      {tab === "overview" &&
        (kpis.isPending ? (
          <State title="Consultando indicadores" tone="loading" />
        ) : kpis.isError ? (
          <State
            title="Não foi possível consultar os indicadores"
            tone="error"
            retry={() => void kpis.refetch()}
          />
        ) : (
          <>
            <div className="metric-grid">
              {[
                "Usuários ativos",
                "Cuidadores cadastrados",
                "Coletes cadastrados",
                "Coletes com envio recente",
                "Alertas recentes",
              ].map((label, i) => (
                <div className="metric" key={label}>
                  <span>{label}</span>
                  <strong>
                    {
                      [
                        kpis.data.active_users,
                        kpis.data.caregivers,
                        kpis.data.devices,
                        kpis.data.recent_devices,
                        kpis.data.recent_alerts,
                      ][i]
                    }
                  </strong>
                  <small>
                    {i === 0 || i === 4
                      ? `Na janela de ${activeWindowHours} horas`
                      : i === 3
                        ? `Recebimento nos últimos ${staleAfterSeconds}s`
                        : "Total cadastrado"}
                  </small>
                </div>
              ))}
            </div>
            <State title="Atividade tem uma definição técnica">
              <p>
                Usuário ativo: sessão com atividade observada nas últimas{" "}
                {activeWindowHours} horas. Colete com envio recente: recebeu
                dados nos últimos {staleAfterSeconds} segundos. Esses
                indicadores não confirmam acompanhamento contínuo.
              </p>
            </State>
          </>
        ))}
      {tab === "devices" && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Coletes cadastrados</h2>
            <Button
              onClick={() => {
                setEditing(undefined);
                setModal("device");
              }}
            >
              <Plus size={16} />
              Cadastrar colete
            </Button>
          </div>
          {deviceQ.isPending ? (
            <State title="Consultando coletes" tone="loading" />
          ) : deviceQ.isError ? (
            <State
              title="Não foi possível consultar coletes"
              tone="error"
              retry={() => void deviceQ.refetch()}
            />
          ) : !deviceQ.data.count ? (
            <State title="Nenhum colete cadastrado">
              Cadastre o código do dispositivo e, depois, configure seu token no
              servidor.
            </State>
          ) : (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Pessoa</th>
                      <th>Conexão</th>
                      <th>Último recebimento</th>
                      <th>Bateria</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deviceQ.data.rows.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <code>{d.code}</code>
                          {!d.enabled && <p>Desabilitado</p>}
                        </td>
                        <td>{d.people?.display_name ?? "Sem vínculo"}</td>
                        <td>
                          {
                            connectionLabels[
                              connectionState(
                                d.last_received_at,
                                new Date(),
                                staleAfterSeconds,
                                offlineAfterSeconds,
                                d.enabled,
                              )
                            ]
                          }
                        </td>
                        <td>{dateTime(d.last_received_at)}</td>
                        <td>
                          {typeof d.latest_metrics?.battery_percent === "number"
                            ? `${d.latest_metrics.battery_percent}%`
                            : "Não informado"}
                        </td>
                        <td>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Editar ${d.code}`}
                            onClick={() => {
                              setEditing(d);
                              setModal("device");
                            }}
                          >
                            <SquarePen size={16} />
                            Editar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={page}
                count={deviceQ.data.count}
                setPage={setPage}
              />
            </>
          )}
        </section>
      )}
      {["people", "users", "links"].includes(tab) && (
        <section className="panel">
          <div className="panel-heading">
            <h2>
              {tab === "people"
                ? "Pessoas acompanhadas"
                : tab === "users"
                  ? "Usuários e perfis"
                  : "Acesso dos cuidadores"}
            </h2>
            {tab !== "users" && (
              <Button
                onClick={() => {
                  setEditing(undefined);
                  setModal(tab === "people" ? "person" : "link");
                }}
              >
                <Plus size={16} />
                {tab === "people" ? "Cadastrar pessoa" : "Conceder acesso"}
              </Button>
            )}
          </div>
          {records.isPending ? (
            <State title="Consultando registros" tone="loading" />
          ) : records.isError ? (
            <State
              title="Não foi possível consultar os registros"
              tone="error"
              retry={() => void records.refetch()}
            />
          ) : !records.data.count ? (
            <State title="Nenhum registro cadastrado" />
          ) : (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.data.rows.map((row) => (
                      <tr key={row.id}>
                        {tab === "people" ? (
                          <>
                            <td>{String(row.display_name)}</td>
                            <td>
                              {row.consent_recorded_at
                                ? "Registrado"
                                : "Não registrado"}
                            </td>
                            <td>
                              {String(row.contact_name ?? "Não informado")}
                            </td>
                            <td>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditing(row as unknown as Person);
                                  setModal("person");
                                }}
                              >
                                Editar
                              </Button>
                            </td>
                          </>
                        ) : tab === "users" ? (
                          <>
                            <td>{String(row.display_name)}</td>
                            <td>
                              {row.role === "admin"
                                ? "Administrador"
                                : "Cuidador"}
                            </td>
                            <td>
                              {dateTime(row.last_seen_at as string | null)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td>
                              {String(
                                (
                                  row.profiles as {
                                    display_name: string;
                                  } | null
                                )?.display_name ?? "Cuidador",
                              )}
                            </td>
                            <td>
                              {String(
                                (row.devices as { code: string } | null)
                                  ?.code ?? "Colete",
                              )}
                            </td>
                            <td>{dateTime(row.created_at as string)}</td>
                            <td>
                              {row.revoked_at ? "Revogado" : "Autorizado"}
                            </td>
                            <td>
                              {!row.revoked_at && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setFailure("");
                                    setRevoke(row);
                                  }}
                                >
                                  Revogar acesso
                                </Button>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={page}
                count={records.data.count}
                setPage={setPage}
              />
            </>
          )}
          {tab === "users" && (
            <p className="status-note">
              <ShieldCheck size={14} /> Novas contas são de cuidadores. Promoção
              de administrador exige processo seguro no banco, descrito no
              README.
            </p>
          )}
        </section>
      )}
      {tab === "alerts" && <Alerts />}
      {tab === "support" && <Support embedded />}
      <Dialog
        title={
          modal === "device"
            ? "Cadastro do colete"
            : modal === "person"
              ? "Pessoa acompanhada"
              : "Conceder acesso"
        }
        description="Revise os dados e as consequências antes de salvar. Permissões também são verificadas no servidor."
        open={!!modal}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        {modal === "device" ? (
          <DeviceForm device={editing as Device | undefined} onSaved={saved} />
        ) : modal === "person" ? (
          <PersonForm person={editing as Person | undefined} onSaved={saved} />
        ) : modal === "link" ? (
          <LinkForm onSaved={saved} />
        ) : null}
      </Dialog>
      <Dialog
        title="Revogar acesso ao colete?"
        description="O cuidador perderá acesso às próximas consultas de histórico, eventos e leituras deste colete. O vínculo permanece registrado para auditoria."
        open={!!revoke}
        onOpenChange={(open) => {
          if (!open) setRevoke(null);
        }}
      >
        {failure && <State title={failure} tone="error" />}
        <div className="form-actions">
          <Button
            autoFocus
            variant="outline"
            disabled={busy}
            onClick={() => setRevoke(null)}
          >
            Manter acesso
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => void revokeLink()}
          >
            Revogar acesso
          </Button>
        </div>
      </Dialog>
    </>
  );
}
