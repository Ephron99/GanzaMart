import { useId } from 'react';

// A labelled input with an inline error line — the shape every form field in the app
// shares (login, register, contact, account). `error` both colours the border and prints
// the message, and is wired to aria-describedby so a screen reader announces it.
export default function Field({ label, type = 'text', name, value, onChange, error, hint, required, autoComplete, placeholder }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`input${error ? ' input--invalid' : ''}`}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      {hint && !error && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error" id={`${id}-err`}>{error}</span>}
    </div>
  );
}
