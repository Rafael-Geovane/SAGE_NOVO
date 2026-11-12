import { useEffect, useRef, useState } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { Button } from "../../components/ui/Button";
export function DraftGuard({
  dirty,
  onDiscard,
  busy = false,
}: {
  dirty: boolean;
  onDiscard: () => void;
  busy?: boolean;
}) {
  const [pending, setPending] = useState<HTMLElement | null>(null);
  const bypass = useRef(false);
  useEffect(() => {
    if (!dirty && !busy) {
      setPending(null);
      return;
    }
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const link = (e: MouseEvent) => {
      const element =
        e.target instanceof Element
          ? e.target.closest<HTMLElement>("a,button[data-navigate]")
          : null;
      if (
        !element ||
        bypass.current ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        (element instanceof HTMLAnchorElement && element.target === "_blank")
      )
        return;
      if (
        element instanceof HTMLAnchorElement &&
        new URL(element.href, window.location.href).href ===
          window.location.href
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      setPending(element);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", link, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", link, true);
    };
  }, [dirty, busy]);
  return (
    <Dialog
      title={busy ? "Operação em andamento" : "Sair sem enviar a mensagem?"}
      description={
        busy
          ? "Aguarde a confirmação antes de sair desta tela. Uma operação em andamento já pode ter sido recebida pelo servidor."
          : "O rascunho desta conversa ainda não foi enviado e será descartado."
      }
      open={!!pending}
      onOpenChange={(v) => {
        if (!v) setPending(null);
      }}
    >
      <div className="form-actions">
        <Button autoFocus variant="outline" onClick={() => setPending(null)}>
          Continuar escrevendo
        </Button>
        {!busy && (
          <Button
            onClick={() => {
              const destination = pending!;
              onDiscard();
              setPending(null);
              bypass.current = true;
              destination.click();
              bypass.current = false;
            }}
          >
            Descartar e sair
          </Button>
        )}
      </div>
    </Dialog>
  );
}
