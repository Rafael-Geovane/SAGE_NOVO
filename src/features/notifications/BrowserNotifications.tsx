import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { pendingFalls } from "./api";
import { Button } from "../../components/ui/Button";

export function BrowserNotifications({
  userId,
  controls = false,
}: {
  userId: string;
  controls?: boolean;
}) {
  const supported =
    typeof Notification !== "undefined" && window.isSecureContext;
  const key = `sage-browser-alerts:${userId}`;
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem(key) === "true",
  );
  const [permission, setPermission] = useState(() =>
    supported ? Notification.permission : "denied",
  );
  const [error, setError] = useState("");
  useEffect(() => {
    const sync = () => {
      setEnabled(localStorage.getItem(key) === "true");
      if (supported) setPermission(Notification.permission);
    };
    window.addEventListener("storage", sync);
    window.addEventListener("sage-notification-preference", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("sage-notification-preference", sync);
      window.removeEventListener("focus", sync);
    };
  }, [key, supported]);
  const q = useQuery({
    queryKey: ["notifications", userId, 0],
    queryFn: ({ signal }) => pendingFalls(0, signal),
    refetchInterval: 15000,
    gcTime: 0,
  });
  useEffect(() => {
    if (
      controls ||
      !supported ||
      !enabled ||
      permission !== "granted" ||
      !q.data
    )
      return;
    let active = true;
    async function deliver() {
      for (const row of q.data!.rows) {
        if (!active) return;
        const seenKey = `sage-notified:${userId}`;
        let seen: string[] = [];
        try {
          seen = JSON.parse(localStorage.getItem(seenKey) || "[]");
        } catch {
          /* reset malformed preference */
        }
        if (!Array.isArray(seen)) seen = [];
        if (seen.includes(row.id)) continue;
        const options = {
          body:
            row.source === "simulated"
              ? "Possível queda simulada. Abra o SAGE para verificar."
              : "Um colete autorizado reportou possível queda. Abra o SAGE para verificar.",
          tag: `sage-fall-${row.id}`,
        };
        try {
          if ("serviceWorker" in navigator) {
            const registration = await navigator.serviceWorker.register(
              "/notifications-sw.js",
            );
            await navigator.serviceWorker.ready;
            if (!active) return;
            await registration.showNotification(
              "SAGE · Possível queda",
              options,
            );
          } else {
            const notice = new Notification("SAGE · Possível queda", options);
            notice.onclick = () => {
              window.focus();
              window.location.assign("/dashboard");
              notice.close();
            };
          }
          localStorage.setItem(
            seenKey,
            JSON.stringify([...seen, row.id].slice(-500)),
          );
        } catch {
          if (active)
            setError(
              "O navegador não conseguiu exibir o aviso. Confira as permissões do site e do sistema.",
            );
        }
      }
    }
    if (navigator.locks)
      void navigator.locks.request(`sage-notifications:${userId}`, deliver);
    else void deliver();
    return () => {
      active = false;
    };
  }, [enabled, permission, supported, q.data, userId, controls]);
  if (!controls) return null;
  return (
    <div className="panel">
      <h3>Avisos do navegador</h3>
      <p>
        Receba avisos de possível queda enquanto o SAGE estiver aberto,
        inclusive em outra aba. Com o site fechado, a entrega não está
        disponível.
      </p>
      {!supported ? (
        <p>Use um navegador compatível em HTTPS ou localhost.</p>
      ) : (
        <Button
          variant="outline"
          onClick={async () => {
            setError("");
            if (enabled) {
              setEnabled(false);
              localStorage.setItem(key, "false");
              window.dispatchEvent(new Event("sage-notification-preference"));
              return;
            }
            try {
              const result = await Notification.requestPermission();
              setPermission(result);
              if (result === "granted") {
                localStorage.setItem(key, "true");
                setEnabled(true);
                window.dispatchEvent(new Event("sage-notification-preference"));
              } else
                setError(
                  "Permissão não concedida. Você pode habilitá-la nas configurações deste site no navegador.",
                );
            } catch {
              setError("Não foi possível solicitar permissão neste navegador.");
            }
          }}
        >
          {enabled && permission === "granted"
            ? "Desativar avisos do navegador"
            : "Ativar avisos do navegador"}
        </Button>
      )}
      {error && <p role="status">{error}</p>}
    </div>
  );
}
