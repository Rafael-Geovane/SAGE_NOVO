import type { CareSettings } from "./careSettings";
export const emptyCare = {
  birth_date: "",
  weight_kg: 0,
  height_cm: 0,
  medications: "",
  professional_reference: "",
  heart_rate_bpm: null,
  spo2_percent: null,
  temperature_c: null,
} satisfies CareSettings;
export function CareFields({
  value,
  onChange,
  disabled,
}: {
  value: CareSettings;
  onChange: (v: CareSettings) => void;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend>Configuração obrigatória do idoso</legend>
      <p>
        Registre idade, medidas e medicamentos para contextualizar o
        acompanhamento. Doenças e medidas não geram limites automaticamente.
      </p>
      <label>
        Data de nascimento
        <input
          type="date"
          required
          max={new Date().toISOString().slice(0, 10)}
          value={value.birth_date}
          onChange={(e) => onChange({ ...value, birth_date: e.target.value })}
        />
      </label>
      <label>
        Peso (kg)
        <input
          type="number"
          required
          min="20"
          max="400"
          step="0.1"
          value={value.weight_kg || ""}
          onChange={(e) =>
            onChange({ ...value, weight_kg: Number(e.target.value) })
          }
        />
      </label>
      <label>
        Altura (cm)
        <input
          type="number"
          required
          min="80"
          max="250"
          step="0.1"
          value={value.height_cm || ""}
          onChange={(e) =>
            onChange({ ...value, height_cm: Number(e.target.value) })
          }
        />
      </label>
      <label>
        Medicamentos em uso
        <textarea
          required
          maxLength={2000}
          value={value.medications}
          onChange={(e) => onChange({ ...value, medications: e.target.value })}
          placeholder="Informe os medicamentos ou Nenhum informado"
        />
      </label>
      <h3>Faixas individuais orientadas por profissional</h3>
      <p>
        Preencha somente as faixas prescritas para esta pessoa. Sem orientação,
        deixe em branco: o painel exibirá “Sem faixa individual”. Não copie
        metas de outra pessoa com a mesma doença.
      </p>
      {(
        [
          ["heart_rate_bpm", "Batimentos (bpm)"],
          ["spo2_percent", "Oxigênio no sangue (%)"],
          ["temperature_c", "Temperatura (°C)"],
        ] as const
      ).map(([key, label]) => (
        <div key={key}>
          <label>
            <input
              type="checkbox"
              checked={!!value[key]}
              onChange={(e) =>
                onChange({
                  ...value,
                  [key]: e.target.checked ? { min: 0, max: 0 } : null,
                })
              }
            />{" "}
            Configurar {label}
          </label>
          {value[key] && (
            <div className="care-range-fields">
              {(["min", "max"] as const).map((side) => (
                <label key={side}>
                  {side === "min" ? "Mínimo" : "Máximo"} — {label}
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={value[key]![side]}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        [key]: {
                          ...value[key]!,
                          [side]: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
      <label>
        Referência da orientação profissional
        <textarea
          value={value.professional_reference}
          maxLength={500}
          onChange={(e) =>
            onChange({ ...value, professional_reference: e.target.value })
          }
          placeholder="Profissional, data e contexto da orientação; não inclua documentos"
        />
      </label>
    </fieldset>
  );
}
