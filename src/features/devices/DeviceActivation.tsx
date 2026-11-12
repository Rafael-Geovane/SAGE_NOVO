import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PasswordField } from "../../components/ui/Field";
import { State } from "../../components/ui/State";
import { dateTime } from "../../domain/connectivity";
import { issueDeviceActivation } from "./pairing";
import type { Device } from "./api";

export function DeviceActivation({
  device,
  disabled,
}: {
  device: Device;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const [activation, setActivation] = useState<Awaited<
    ReturnType<typeof issueDeviceActivation>
  > | null>(null);
  const [copied, setCopied] = useState(false);
  const ready = device.enabled && !!device.people?.consent_recorded_at;
  async function issue() {
    if (busy || disabled || !ready) return;
    setBusy(true);
    setFailure("");
    setCopied(false);
    setActivation(null);
    try {
      setActivation(await issueDeviceActivation(device.id));
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o código de ativação.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!activation) return;
    try {
      await navigator.clipboard.writeText(activation.activationCode);
      setCopied(true);
      setFailure("");
    } catch {
      setFailure(
        "Não foi possível copiar. Você pode selecionar o código de ativação.",
      );
    }
  }
  return (
    <section aria-label="Ativação do cliente">
      <h3>Ativação do cliente</h3>
      <Button
        variant="outline"
        onClick={() => void issue()}
        disabled={busy || disabled || !ready}
        aria-busy={busy}
      >
        <KeyRound size={17} />
        {busy ? "Gerando..." : "Gerar código de ativação"}
      </Button>
      {(!ready || disabled) && (
        <p className="status-note">
          Salve o colete habilitado com uma pessoa e consentimento registrado.
        </p>
      )}
      {failure && <State tone="error" title={failure} />}
      {activation && (
        <>
          <PasswordField
            label="Código de ativação"
            value={activation.activationCode}
            readOnly
            autoComplete="off"
            onFocus={(event) => event.target.select()}
          />
          <Button variant="outline" size="sm" onClick={() => void copy()}>
            <Copy size={16} />
            Copiar código
          </Button>
          {copied && <p role="status">Código copiado.</p>}
          <p className="status-note">
            {activation.code} · Uso único · Válido até{" "}
            {dateTime(activation.expiresAt)}. Um novo código substitui o
            anterior.
          </p>
        </>
      )}
    </section>
  );
}
