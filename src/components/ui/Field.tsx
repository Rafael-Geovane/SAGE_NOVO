import { useId, useState, type ComponentProps, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
export function Field({
  label,
  error,
  hint,
  ...props
}: ComponentProps<"input"> & { label: string; error?: string; hint?: string }) {
  const uid = useId(),
    id = props.id ?? uid;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        {...props}
        id={id}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${id}-error` : hint ? `${id}-hint` : undefined
        }
      />
      <div className="field-help">
        {error ? (
          <span id={`${id}-error`} className="error-text">
            {error}
          </span>
        ) : hint ? (
          <span id={`${id}-hint`}>{hint}</span>
        ) : null}
      </div>
    </div>
  );
}
export function PasswordField({
  label = "Senha",
  ...props
}: ComponentProps<"input"> & { label?: string; error?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-field">
      <Field {...props} label={label} type={show ? "text" : "password"} />
      <button
        className="reveal"
        type="button"
        onClick={() => setShow(!show)}
        aria-label={
          show
            ? `Ocultar ${label.toLowerCase()}`
            : `Mostrar ${label.toLowerCase()}`
        }
        aria-pressed={show}
      >
        {show ? <EyeOff size={19} /> : <Eye size={19} />}
      </button>
    </div>
  );
}
export function TextAreaField({
  label,
  error,
  hint,
  ...props
}: ComponentProps<"textarea"> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const uid = useId(),
    id = props.id ?? uid;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        {...props}
        className={["resize-none", props.className].filter(Boolean).join(" ")}
        id={id}
        rows={props.rows ?? 3}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${id}-error` : hint ? `${id}-hint` : undefined
        }
        onInput={(event) => {
          event.currentTarget.style.height = "auto";
          event.currentTarget.style.height =
            Math.min(event.currentTarget.scrollHeight, 480) + "px";
          props.onInput?.(event);
        }}
        style={{ resize: "none", maxHeight: 480, ...props.style }}
      />
      <div className="field-help">
        {error ? (
          <span id={`${id}-error`} className="error-text">
            {error}
          </span>
        ) : hint ? (
          <span id={`${id}-hint`}>{hint}</span>
        ) : null}
      </div>
    </div>
  );
}
export function focusFirst(
  form: HTMLFormElement,
  errors: Record<string, string>,
) {
  const key = Object.keys(errors)[0];
  if (key)
    requestAnimationFrame(() =>
      form.querySelector<HTMLElement>(`[name="${key}"]`)?.focus(),
    );
}
