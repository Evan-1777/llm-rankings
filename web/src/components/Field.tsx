import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import ui from "./ui.module.css";

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error ? <p className={ui.hint}>{hint}</p> : null}
      {error ? (
        <p className={ui.error} id={`${htmlFor}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({ id, label, error, hint, ...rest }: TextFieldProps) {
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <input
        id={id}
        className={ui.input}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...rest}
      />
    </Field>
  );
}

interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

export function TextAreaField({ id, label, error, hint, ...rest }: TextAreaFieldProps) {
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <textarea
        id={id}
        className={ui.textarea}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...rest}
      />
    </Field>
  );
}
