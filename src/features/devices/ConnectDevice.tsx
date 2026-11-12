import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Plus } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, PasswordField, focusFirst } from "../../components/ui/Field";
import { State } from "../../components/ui/State";
import { connectDevice, pairingInput } from "./pairing";
import { addDeviceByCode } from "./registration";
import { ElderProfileForm } from "../people/ElderProfileForm";
import { lookupConnectedDevice, type DeviceConnection } from "./managed";

type Connection = DeviceConnection;
export function ConnectDevice({
  onConnected,
  mode = "pair",
  trigger,
}: {
  onConnected: (
    connection: Connection,
    profileComplete?: boolean,
  ) => Promise<void>;
  mode?: "register" | "pair";
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value);
          if (!value) setConnection(null);
        }
      }}
      title={connection ? "Dados do idoso" : "Adicionar colete"}
      description={
        connection
          ? "Colete adicionado. Complete o cadastro da pessoa acompanhada."
          : mode === "register"
            ? "Cadastro pelo código do colete."
            : "Vincule o colete à sua conta de acompanhamento."
      }
      trigger={
        trigger ?? (
          <Button>
            <Plus size={17} />
            Adicionar colete
          </Button>
        )
      }
    >
      {open &&
        (connection ? (
          <ElderProfileForm
            deviceId={connection.deviceId}
            setBusy={setBusy}
            onSaved={async () => {
              await onConnected(connection, true);
              setConnection(null);
              setOpen(false);
            }}
          />
        ) : (
          <ConnectionForm
            mode={mode}
            busy={busy}
            setBusy={setBusy}
            onConnected={async (connection) => {
              await onConnected(
                connection,
                !(mode === "register" || connection.configureProfile),
              );
              if (mode === "register" || connection.configureProfile)
                setConnection(connection);
              else setOpen(false);
            }}
          />
        ))}
    </Dialog>
  );
}

function ConnectionForm({
  mode,
  busy,
  setBusy,
  onConnected,
}: {
  mode: "register" | "pair";
  busy: boolean;
  setBusy: (value: boolean) => void;
  onConnected: (connection: Connection) => Promise<void>;
}) {
  const [code, setCode] = useState(""),
    [activationCode, setActivationCode] = useState("");
  const [needsActivation, setNeedsActivation] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [failure, setFailure] = useState("");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const schema =
      mode === "register" || !needsActivation
        ? pairingInput.pick({ code: true })
        : pairingInput;
    const parsed = schema.safeParse({ code, activationCode });
    setFailure("");
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      focusFirst(event.currentTarget, next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      let connection: Connection | null;
      if (mode === "register")
        connection = await addDeviceByCode(parsed.data.code);
      else {
        connection = await lookupConnectedDevice(parsed.data.code);
        if (!connection) {
          if (!needsActivation) {
            setNeedsActivation(true);
            setErrors({
              activationCode: "Informe o código de ativação completo.",
            });
            requestAnimationFrame(() =>
              form
                .querySelector<HTMLInputElement>('[name="activationCode"]')
                ?.focus(),
            );
            return;
          }
          connection = await connectDevice({ code, activationCode });
        }
      }
      if (mounted.current) await onConnected(connection);
    } catch (error) {
      if (mounted.current)
        setFailure(
          error instanceof Error
            ? error.message
            : "Não foi possível conectar o colete. Tente novamente.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form noValidate onSubmit={submit}>
      <Field
        label="Código do colete"
        name="code"
        placeholder="SGE-000"
        value={code}
        onChange={(event) => {
          setCode(event.target.value);
          setNeedsActivation(false);
          setActivationCode("");
        }}
        error={errors.code}
        autoComplete="off"
        autoCapitalize="characters"
        maxLength={20}
        disabled={busy}
      />
      {mode === "pair" && needsActivation && (
        <PasswordField
          label="Código de ativação"
          name="activationCode"
          value={activationCode}
          onChange={(event) => setActivationCode(event.target.value)}
          error={errors.activationCode}
          autoComplete="off"
          spellCheck={false}
          maxLength={64}
          disabled={busy}
        />
      )}
      {failure && <State tone="error" title={failure} />}
      <Button type="submit" disabled={busy} aria-busy={busy}>
        <Plus size={17} />
        {busy ? "Adicionando..." : "Adicionar colete"}
      </Button>
    </form>
  );
}
