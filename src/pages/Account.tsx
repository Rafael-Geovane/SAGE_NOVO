import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { HeartHandshake, UserRound } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import { listDevices } from "../features/devices/api";
import { ElderProfileDetails } from "../features/people/ElderProfileDetails";
import { WorkspaceHeader } from "../components/layout/WorkspaceHeader";
import { Pagination } from "../components/ui/Pagination";
import { State } from "../components/ui/State";
import { dateTime } from "../domain/connectivity";
import "../styles/account.css";
import { BrowserNotifications } from "../features/notifications/BrowserNotifications";

export default function Account() {
  const a = useAuth();
  const [page, setPage] = useState(0);
  const devices = useQuery({
    queryKey: ["devices", a.profile!.id, page],
    queryFn: ({ signal }) => listDevices(page, signal),
    refetchInterval: 15000,
    gcTime: 0,
  });
  return (
    <div className="container section account-page">
      <WorkspaceHeader
        title="Minha conta"
        description="Seus dados e as pessoas que fazem parte da sua rede de cuidado."
      />
      <div className="account-layout">
        <aside className="panel account-identity">
          <span className="account-avatar" aria-hidden="true">
            <UserRound size={30} />
          </span>
          <h2>Seus dados</h2>
          <dl className="account-data">
            <div>
              <dt>Nome</dt>
              <dd>{a.profile!.display_name}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{a.session?.user.email || "Não informado"}</dd>
            </div>
            <div>
              <dt>Perfil de acesso</dt>
              <dd>
                {a.profile!.role === "admin" ? "Administrador" : "Cuidador"}
              </dd>
            </div>
            <div>
              <dt>Conta criada em</dt>
              <dd>{dateTime(a.session?.user.created_at ?? null)}</dd>
            </div>
          </dl>
          <Link href="/dashboard" className="button button-outline">
            Voltar ao acompanhamento
          </Link>
        </aside>
        <section
          aria-labelledby="account-people-title"
          className="account-people"
        >
          <div className="panel-heading">
            <div>
              <span className="eyebrow">SUA REDE DE CUIDADO</span>
              <h2 id="account-people-title">Pessoas acompanhadas</h2>
            </div>
            <HeartHandshake size={25} aria-hidden="true" />
          </div>
          <p>
            Consulte nome, endereço, alergias, condições de saúde e contato. Use
            “Editar cadastro” para atualizar os dados quando sua conta tiver
            autorização.
          </p>
          {devices.isPending ? (
            <State title="Carregando sua rede de cuidado" tone="loading" />
          ) : devices.isError ? (
            <State
              title="Não foi possível consultar sua rede"
              tone="error"
              retry={() => void devices.refetch()}
            />
          ) : !devices.data.count ? (
            <State title="Nenhum colete vinculado">
              <p>
                Adicione um colete no acompanhamento para iniciar o cadastro.
              </p>
              <Link href="/dashboard" className="text-link">
                Adicionar um colete
              </Link>
            </State>
          ) : (
            <>
              {devices.data.rows.map((device) => (
                <div
                  key={JSON.stringify([
                    device.id,
                    device.person_id,
                    device.assignment_id,
                  ])}
                  className="account-person"
                >
                  <div className="account-device-label">
                    <code>{device.code}</code>
                    <span>
                      {device.people?.display_name ?? "Cadastro a completar"}
                    </span>
                  </div>
                  <ElderProfileDetails device={device} />
                </div>
              ))}
              <Pagination
                page={page}
                count={devices.data.count}
                setPage={setPage}
                busy={devices.isFetching}
              />
            </>
          )}
        </section>
      </div>
      <BrowserNotifications userId={a.profile!.id} controls />
    </div>
  );
}
