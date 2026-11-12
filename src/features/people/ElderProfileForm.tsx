import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../../components/ui/Button";
import { Field, TextAreaField, focusFirst } from "../../components/ui/Field";
import { State } from "../../components/ui/State";
import {
  loadProfileDevice,
  profileInput,
  saveElderProfile,
  type ProfileDevice,
} from "./profile";

export function ElderProfileForm({
  deviceId,
  onSaved,
  setBusy,
}: {
  deviceId: string;
  onSaved: () => Promise<void>;
  setBusy: (value: boolean) => void;
}) {
  const a = useAuth();
  // Modal draft lives only in memory. Scope is loaded from the authorized device.
  const q = useQuery({
    queryKey: ["profile-editor", a.profile!.id, deviceId],
    queryFn: ({ signal }) => loadProfileDevice(deviceId, signal),
    gcTime: 0,
    staleTime: 0,
  });
  return q.isPending ? (
    <State tone="loading" title="Carregando cadastro do idoso" />
  ) : q.isError ? (
    <State
      tone="error"
      title="Não foi possível carregar o cadastro"
      retry={() => void q.refetch()}
    />
  ) : (
    <ProfileFields
      key={q.data.assignment_id}
      device={q.data}
      onSaved={onSaved}
      setBusy={setBusy}
    />
  );
}
function ProfileFields({
  device,
  onSaved,
  setBusy,
}: {
  device: ProfileDevice;
  onSaved: () => Promise<void>;
  setBusy: (v: boolean) => void;
}) {
  const cache = useQueryClient(),
    p = device.people;
  const [values, setValues] = useState({
    display_name: p?.display_name ?? "",
    address: p?.address ?? "",
    allergy_status: p?.allergy_status ?? "unknown",
    allergies: p?.allergies ?? "",
    health_conditions: p?.health_conditions ?? "",
    contact_name: p?.contact_name ?? "",
    contact_phone: p?.contact_phone ?? "",
    consent_note: p?.consent_note ?? "",
    consent_confirmed: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [failure, setFailure] = useState(""),
    [saving, setSaving] = useState(false);
  const update = (name: string, value: string | boolean) =>
    setValues((v) => ({ ...v, [name]: value }));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const parsed = profileInput.safeParse(values),
      next: Record<string, string> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        next[String(issue.path[0])] ??= issue.message;
    if (!p?.consent_recorded_at && !values.consent_note.trim())
      next.consent_note = "Informe como a autorização foi obtida.";
    setErrors(next);
    setFailure("");
    if (Object.keys(next).length) {
      focusFirst(e.currentTarget, next);
      return;
    }
    setSaving(true);
    setBusy(true);
    try {
      await saveElderProfile(device.id, device.assignment_id, values);
      await cache.invalidateQueries({ queryKey: ["devices"] });
      await cache.invalidateQueries({ queryKey: ["elder-profile"] });
      await onSaved();
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o cadastro.",
      );
    } finally {
      setSaving(false);
      setBusy(false);
    }
  }
  return (
    <form noValidate onSubmit={submit}>
      <p className="status-note">
        Informe somente dados autorizados pela pessoa ou responsável. Campos
        opcionais podem ficar em branco.
      </p>
      <Field
        label="Nome do idoso"
        autoFocus
        name="display_name"
        value={values.display_name}
        maxLength={120}
        disabled={saving}
        onChange={(e) => update("display_name", e.target.value)}
        error={errors.display_name}
        autoComplete="off"
      />
      <TextAreaField
        label="Endereço (opcional)"
        name="address"
        value={values.address}
        maxLength={1000}
        disabled={saving}
        onChange={(e) => update("address", e.target.value)}
        error={errors.address}
        autoComplete="off"
      />
      <div className="field">
        <label htmlFor="allergy-status">Alergias</label>
        <select
          id="allergy-status"
          name="allergy_status"
          value={values.allergy_status}
          disabled={saving}
          onChange={(e) =>
            setValues((v) => ({
              ...v,
              allergy_status: e.target.value as typeof v.allergy_status,
              allergies: e.target.value === "reported" ? v.allergies : "",
            }))
          }
        >
          <option value="unknown">Não informado</option>
          <option value="none">Nenhuma alergia informada</option>
          <option value="reported">Possui alergias informadas</option>
        </select>
      </div>
      {values.allergy_status === "reported" && (
        <TextAreaField
          label="Quais alergias?"
          name="allergies"
          value={values.allergies}
          maxLength={1000}
          disabled={saving}
          onChange={(e) => update("allergies", e.target.value)}
          error={errors.allergies}
        />
      )}
      <TextAreaField
        label="Doenças e condições informadas (opcional)"
        name="health_conditions"
        value={values.health_conditions}
        maxLength={3000}
        disabled={saving}
        onChange={(e) => update("health_conditions", e.target.value)}
        error={errors.health_conditions}
        hint="Relato da pessoa ou responsável; não constitui diagnóstico do SAGE."
      />
      <Field
        label="Nome do contato (opcional)"
        name="contact_name"
        value={values.contact_name}
        maxLength={120}
        disabled={saving}
        onChange={(e) => update("contact_name", e.target.value)}
        error={errors.contact_name}
      />
      <Field
        label="Telefone do contato (opcional)"
        name="contact_phone"
        type="tel"
        value={values.contact_phone}
        maxLength={25}
        disabled={saving}
        onChange={(e) => update("contact_phone", e.target.value)}
        error={errors.contact_phone}
      />
      {!p?.consent_recorded_at && (
        <TextAreaField
          label="Registro da autorização"
          name="consent_note"
          value={values.consent_note}
          maxLength={1000}
          disabled={saving}
          onChange={(e) => update("consent_note", e.target.value)}
          error={errors.consent_note}
          hint="Descreva a autorização obtida, sem anexar documentos ou senhas."
        />
      )}
      <div className="field checkbox-field">
        <label>
          <input
            type="checkbox"
            name="consent_confirmed"
            checked={values.consent_confirmed}
            disabled={saving}
            onChange={(e) => update("consent_confirmed", e.target.checked)}
            aria-invalid={!!errors.consent_confirmed}
            aria-describedby={
              errors.consent_confirmed ? "consent-error" : undefined
            }
          />{" "}
          Confirmo que tenho autorização para registrar esses dados.
        </label>
        {errors.consent_confirmed && (
          <span id="consent-error" className="error-text">
            {errors.consent_confirmed}
          </span>
        )}
      </div>
      {failure && <State title={failure} tone="error" />}
      <Button type="submit" disabled={saving} aria-busy={saving}>
        {saving ? "Salvando cadastro..." : "Salvar dados do idoso"}
      </Button>
    </form>
  );
}
