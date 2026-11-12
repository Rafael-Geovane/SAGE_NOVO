import { useState, type FormEvent } from "react";
import { db } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { saveDevice, type Device, type Person } from "./api";
import { EntityPicker } from "./EntityPicker";
import { Button } from "../../components/ui/Button";
import { Field, focusFirst } from "../../components/ui/Field";
import { State } from "../../components/ui/State";
import { DeviceActivation } from "./DeviceActivation";
export function DeviceForm({
  device,
  onSaved,
}: {
  device?: Device;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(device?.code ?? ""),
    [person, setPerson] = useState(device?.person_id ?? ""),
    [firmware, setFirmware] = useState(device?.firmware_version ?? ""),
    [enabled, setEnabled] = useState(device?.enabled ?? true),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [failure, setFailure] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const errs: Record<string, string> = {};
    if (!/^SGE-\d{3}$/.test(code)) errs.code = "Use o formato SGE-001.";
    if (device && !confirmed)
      errs.confirmed = "Confirme a alteração do dispositivo e de seu vínculo.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      focusFirst(e.currentTarget, errs);
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      await saveDevice(device?.id ?? null, {
        code,
        person_id: person || null,
        enabled,
        firmware_version: firmware.trim() || null,
      });
      onSaved();
    } catch {
      setFailure(
        "Não foi possível salvar. Verifique se o código já existe e se seu acesso permite a alteração.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form noValidate onSubmit={submit}>
        <Field
          name="code"
          label="Código do colete"
          placeholder="SGE-001"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          error={errors.code}
        />
        <EntityPicker
          table="people"
          label="Pessoa acompanhada (opcional)"
          value={person}
          onChange={setPerson}
        />
        <Field
          label="Versão do firmware (se conhecida)"
          value={firmware}
          onChange={(e) => setFirmware(e.target.value)}
          maxLength={80}
        />
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />{" "}
          Dispositivo habilitado para enviar dados
        </label>
        {device && (
          <div className="checkbox-field">
            <label>
              <input
                name="confirmed"
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                aria-invalid={!!errors.confirmed}
                aria-describedby="device-confirm"
              />
              Confirmo a alteração de {device.code}. Mudar a pessoa vinculada
              altera os dados que os cuidadores autorizados podem visualizar.
            </label>
            <p id="device-confirm" className="error-text">
              {errors.confirmed}
            </p>
          </div>
        )}
        {failure && <State title={failure} tone="error" />}
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Salvando…" : "Salvar colete"}
        </Button>
        <p className="status-note">
          O token individual é provisionado por processo administrativo seguro,
          fora do navegador.
        </p>
      </form>
      {device && (
        <DeviceActivation
          device={device}
          disabled={
            busy ||
            code !== device.code ||
            person !== (device.person_id ?? "") ||
            enabled !== device.enabled
          }
        />
      )}
    </>
  );
}
export function PersonForm({
  person,
  onSaved,
}: {
  person?: Person;
  onSaved: () => void;
}) {
  const a = useAuth(),
    [name, setName] = useState(person?.display_name ?? ""),
    [consent, setConsent] = useState(!!person?.consent_recorded_at),
    [note, setNote] = useState(""),
    [contact, setContact] = useState(person?.contact_name ?? ""),
    [phone, setPhone] = useState(person?.contact_phone ?? ""),
    [confirmed, setConfirmed] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Informe o nome de exibição.";
    if (phone && !/^\+?[0-9 ()-]{8,25}$/.test(phone))
      errs.phone =
        "Informe um telefone com DDD, somente números e sinais de formatação.";
    if (consent && !person?.consent_recorded_at && !note.trim())
      errs.note =
        "Registre a referência do consentimento obtido, sem dados clínicos.";
    if (person && !confirmed)
      errs.confirmed = "Confirme a atualização desta pessoa.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      focusFirst(e.currentTarget, errs);
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      const values = {
        display_name: name.trim(),
        contact_name: contact.trim() || null,
        contact_phone: phone.trim() || null,
        ...(!person || consent !== !!person.consent_recorded_at
          ? {
              consent_recorded_at: consent ? new Date().toISOString() : null,
              consent_recorded_by: consent ? a.profile!.id : null,
              consent_note: consent ? note.trim() : null,
            }
          : {}),
      };
      const { error } = person
        ? await db().from("people").update(values).eq("id", person.id)
        : await db().from("people").insert(values);
      if (error) throw error;
      onSaved();
    } catch {
      setFailure(
        "Não foi possível salvar a pessoa. Confira sua conexão e suas permissões.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form noValidate onSubmit={submit}>
      <Field
        name="name"
        label="Nome de exibição"
        value={name}
        maxLength={120}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
      />
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />{" "}
        Consentimento obtido para acompanhamento autorizado
      </label>
      {consent && !person?.consent_recorded_at && (
        <Field
          name="note"
          label="Referência do consentimento"
          hint="Ex.: registro interno e data. Não inclua informações clínicas."
          value={note}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
          error={errors.note}
        />
      )}
      <Field
        label="Nome do contato autorizado (opcional)"
        value={contact}
        maxLength={120}
        onChange={(e) => setContact(e.target.value)}
      />
      <Field
        name="phone"
        type="tel"
        label="Telefone do contato (opcional)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
      />
      {person && (
        <div className="checkbox-field">
          <label>
            <input
              name="confirmed"
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              aria-invalid={!!errors.confirmed}
              aria-describedby="person-confirm"
            />
            Confirmo a atualização de {person.display_name}. Retirar
            consentimento impede novas consultas dos cuidadores.
          </label>
          <p id="person-confirm" className="error-text">
            {errors.confirmed}
          </p>
        </div>
      )}
      {failure && <State title={failure} tone="error" />}
      <Button type="submit" disabled={busy}>
        {busy ? "Salvando…" : "Salvar pessoa"}
      </Button>
    </form>
  );
}
export function LinkForm({ onSaved }: { onSaved: () => void }) {
  const [caregiver, setCaregiver] = useState(""),
    [device, setDevice] = useState(""),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const errors: Record<string, string> = {};
    if (!caregiver) errors.profiles = "Selecione o cuidador autorizado.";
    if (!device) errors.devices = "Selecione o colete.";
    if (!confirm) errors.confirm = "Confirme a concessão de acesso.";
    setErrors(errors);
    if (Object.keys(errors).length) {
      focusFirst(e.currentTarget, errors);
      return;
    }
    setBusy(true);
    try {
      const { error } = await db()
        .from("caregiver_device_links")
        .insert({ caregiver_id: caregiver, device_id: device });
      if (error) throw error;
      onSaved();
    } catch {
      setFailure(
        "Não foi possível conceder acesso. Verifique consentimento da pessoa, vínculo existente e permissões.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form noValidate onSubmit={submit}>
      <EntityPicker
        table="profiles"
        caregivers
        label="Cuidador autorizado"
        value={caregiver}
        onChange={setCaregiver}
        error={errors.profiles}
      />
      <EntityPicker
        table="devices"
        label="Colete"
        value={device}
        onChange={setDevice}
        error={errors.devices}
      />
      <label className="checkbox-field">
        <input
          name="confirm"
          aria-invalid={!!errors.confirm}
          aria-describedby={errors.confirm ? "link-confirm-error" : undefined}
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
        />
        Confirmo a autorização. Este cuidador poderá consultar histórico e
        eventos do colete selecionado.
      </label>
      {errors.confirm && (
        <p id="link-confirm-error" className="error-text">
          {errors.confirm}
        </p>
      )}
      {failure && <State title={failure} tone="error" />}
      <Button type="submit" disabled={busy}>
        {busy ? "Concedendo…" : "Conceder acesso"}
      </Button>
    </form>
  );
}
