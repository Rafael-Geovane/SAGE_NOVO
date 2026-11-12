import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import type { Device } from "../devices/api";
import { loadProfileDevice } from "./profile";
import { ElderProfileForm } from "./ElderProfileForm";
import { Dialog } from "../../components/ui/Dialog";
import { Button } from "../../components/ui/Button";
import { State } from "../../components/ui/State";
export function ElderProfileDetails({ device }: { device: Device }) {
  const a = useAuth(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: [
      "elder-profile",
      a.profile!.id,
      device.id,
      device.person_id,
      device.assignment_id,
    ],
    queryFn: async ({ signal }) => {
      const result = await loadProfileDevice(device.id, signal);
      if (
        result.person_id !== device.person_id ||
        result.assignment_id !== device.assignment_id
      )
        throw new Error("O vínculo foi atualizado.");
      return result;
    },
    refetchInterval: 15000,
    gcTime: 0,
  });
  const p = q.data?.people;
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Dados do idoso</h2>
        {(a.profile?.role === "admin" || q.data?.can_manage_profile) &&
          !q.isError && (
            <Dialog
              title="Dados do idoso"
              description="Atualize o cadastro autorizado da pessoa acompanhada."
              open={open}
              onOpenChange={(v) => {
                if (!busy) setOpen(v);
              }}
              trigger={
                <Button variant="outline" size="sm">
                  {device.person_id ? "Editar cadastro" : "Completar cadastro"}
                </Button>
              }
            >
              {open && (
                <ElderProfileForm
                  deviceId={device.id}
                  setBusy={setBusy}
                  onSaved={async () => {
                    setOpen(false);
                    await q.refetch();
                  }}
                />
              )}
            </Dialog>
          )}
      </div>
      {q.isPending ? (
        <State title="Carregando dados do idoso" tone="loading" />
      ) : q.isError ? (
        <State
          title="Não foi possível consultar o cadastro"
          tone="error"
          retry={() => void q.refetch()}
        />
      ) : !p ? (
        <p>Complete o cadastro para vincular uma pessoa a este colete.</p>
      ) : (
        <dl className="care-profile-details">
          <div>
            <dt>Nome</dt>
            <dd>{p.display_name}</dd>
          </div>
          <div>
            <dt>Endereço</dt>
            <dd>{p.address || "Não informado"}</dd>
          </div>
          <div>
            <dt>Alergias informadas</dt>
            <dd>
              {p.allergy_status === "reported"
                ? p.allergies
                : p.allergy_status === "none"
                  ? "Nenhuma alergia informada"
                  : "Não informado"}
            </dd>
          </div>
          <div>
            <dt>Doenças e condições informadas</dt>
            <dd>{p.health_conditions || "Não informado"}</dd>
          </div>
          <div>
            <dt>Contato</dt>
            <dd>
              {[p.contact_name, p.contact_phone].filter(Boolean).join(" · ") ||
                "Não informado"}
            </dd>
          </div>
        </dl>
      )}
      <p className="status-note">
        Dados informados pela pessoa ou responsável. Acesso restrito às pessoas
        autorizadas.
      </p>
    </section>
  );
}
