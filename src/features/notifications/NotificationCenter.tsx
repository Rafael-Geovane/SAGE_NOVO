import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../../lib/supabase";
import { pendingFalls } from "./api";
import { FallActions } from "./FallActions";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { State } from "../../components/ui/State";
import { Pagination } from "../../components/ui/Pagination";
import { dateTime } from "../../domain/connectivity";
import "../../styles/notifications.css";
export function NotificationCenter() {
  const a = useAuth();
  return a.status === "authenticated" && a.profile ? (
    <AuthenticatedCenter
      key={a.profile.id + ":" + a.profile.role}
      userId={a.profile.id}
    />
  ) : null;
}
function AuthenticatedCenter({ userId }: { userId: string }) {
  const cache = useQueryClient(),
    [open, setOpen] = useState(false),
    [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["notifications", userId, page],
    queryFn: ({ signal }) => pendingFalls(page, signal),
    refetchInterval: 15000,
    gcTime: 0,
  });
  useEffect(() => {
    const client = db();
    let active = true;
    const refresh = () => {
      if (active)
        void cache.invalidateQueries(
          { queryKey: ["notifications", userId] },
          { cancelRefetch: false },
        );
    };
    // Discard stale previews immediately on permission/device changes; never
    // render a realtime payload directly without the SELECT policy.
    const reauthorize = () => {
      if (active) {
        void cache.cancelQueries(
          { queryKey: ["notifications", userId] },
          { revert: false },
        );
        void cache.invalidateQueries({ queryKey: ["notifications", userId] });
      }
    };
    const channel = client
      .channel("site-notifications-" + userId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "devices" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "caregiver_device_links" },
        reauthorize,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });
    return () => {
      active = false;
      void client.removeChannel(channel);
      void cache.cancelQueries(
        { queryKey: ["notifications", userId] },
        { revert: false },
      );
      cache.removeQueries({ queryKey: ["notifications", userId] });
    };
  }, [cache, userId]);
  useEffect(() => {
    if (q.data && page > 0 && q.data.count <= page * 25) setPage(0);
  }, [q.data, page]);
  const count = q.data?.count ?? 0;
  return (
    <div className="notification-center">
      <Dialog
        title="Notificações de possível queda"
        description="Eventos recebidos que precisam de verificação humana. Os avisos são atualizados enquanto o site está aberto."
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) setPage(0);
        }}
        trigger={
          <Button
            className={count ? "notification-urgent" : undefined}
            variant="outline"
            size="sm"
            aria-label={
              q.isError
                ? "Notificações: falha ao atualizar"
                : `Notificações: ${count} pendentes`
            }
          >
            <Bell size={19} />
            <span>{count > 99 ? "99+" : count}</span>
          </Button>
        }
      >
        {q.isPending ? (
          <State tone="loading" title="Consultando notificações" />
        ) : q.isError ? (
          <State
            tone="error"
            title="Não foi possível atualizar as notificações"
            retry={() => void q.refetch()}
          />
        ) : !count ? (
          <State title="Nenhuma notificação pendente">
            A ausência de eventos não confirma ausência de risco.
          </State>
        ) : (
          <>
            <p>
              {count} {count === 1 ? "evento pendente" : "eventos pendentes"}
            </p>
            <ul className="notification-list">
              {q.data.rows.map((row) => (
                <li key={row.id}>
                  <strong>
                    {row.devices?.code ?? "Colete autorizado"} · Possível queda
                  </strong>
                  {row.source === "simulated" && <p>Origem: dados simulados</p>}
                  <p>
                    <time>{dateTime(row.created_at)}</time>
                  </p>
                  <FallActions
                    id={row.id}
                    status={row.status}
                    outcome={row.fall_outcome}
                  />
                </li>
              ))}
            </ul>
            <Pagination
              page={page}
              count={count}
              setPage={setPage}
              busy={q.isFetching}
            />
          </>
        )}
      </Dialog>
      <span className="sr-only" role="status" aria-live="polite">
        {q.isError
          ? "Falha ao atualizar notificações. Abra o sino para tentar novamente."
          : count
            ? `${count} eventos de possível queda aguardam verificação nas notificações.`
            : ""}
      </span>
      {count > 0 && (
        <div className="notification-banner" role="alert">
          <Bell size={18} />
          <span>
            {count}{" "}
            {count === 1
              ? "possível queda aguarda"
              : "possíveis quedas aguardam"}{" "}
            verificação.
          </span>
          <button onClick={() => setOpen(true)}>Ver notificações</button>
          <small>
            O aviso permanece até registrar a avaliação do cuidador.
          </small>
        </div>
      )}
    </div>
  );
}
