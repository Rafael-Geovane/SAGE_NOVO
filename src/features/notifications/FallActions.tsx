import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "../../lib/supabase";
import { Button } from "../../components/ui/Button";
import { State } from "../../components/ui/State";
import { Dialog } from "../../components/ui/Dialog";
export function FallActions({
  id,
  status,
  outcome,
}: {
  id: string;
  status: string;
  outcome?: string | null;
}) {
  const cache = useQueryClient(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [review, setReview] = useState<"confirmed" | "dismissed" | null>(null);
  async function act(value: "acknowledged" | "confirmed" | "dismissed") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { error } =
        value === "acknowledged"
          ? await db().rpc("triage_alert", { target: id, new_status: value })
          : await db().rpc("review_fall_alert", {
              target: id,
              p_outcome: value,
            });
      if (error) throw error;
      setReview(null);
      await cache.invalidateQueries({ queryKey: ["alerts"] });
      await cache.invalidateQueries({ queryKey: ["notifications"] });
    } catch {
      setError(
        "Não foi possível registrar a avaliação. Confira seu acesso e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fall-actions">
      {outcome ? (
        <span className="badge">
          {outcome === "confirmed"
            ? "Ocorrência confirmada por pessoa autorizada"
            : "Alerta descartado por pessoa autorizada"}
        </span>
      ) : (
        <>
          {status === "new" && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void act("acknowledged")}
            >
              Estou verificando
            </Button>
          )}
          {status === "acknowledged" && (
            <span className="status-note">Em verificação</span>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setReview("confirmed")}
          >
            Confirmar ocorrência
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setReview("dismissed")}
          >
            Está tudo bem / descartar
          </Button>
        </>
      )}
      <Dialog
        open={review !== null}
        onOpenChange={(v) => {
          if (!busy && !v) setReview(null);
        }}
        title={
          review === "confirmed" ? "Confirmar ocorrência" : "Descartar alerta"
        }
        description={
          review === "confirmed"
            ? "Registre somente após verificar o ocorrido com a pessoa ou responsável. Essa avaliação ficará no histórico."
            : "Registre somente após verificar que este alerta não corresponde à ocorrência reportada. O evento será mantido no histórico."
        }
      >
        {error && <State title={error} tone="error" />}
        <div className="fall-actions">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setReview(null)}
          >
            Voltar
          </Button>
          <Button
            disabled={busy}
            aria-busy={busy}
            onClick={() => {
              if (review) void act(review);
            }}
          >
            {busy
              ? "Registrando..."
              : review === "confirmed"
                ? "Registrar confirmação"
                : "Registrar descarte"}
          </Button>
        </div>
      </Dialog>
      {error && !review && <State title={error} tone="error" />}
    </div>
  );
}
