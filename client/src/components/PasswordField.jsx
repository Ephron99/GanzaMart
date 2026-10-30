import { useState, useId } from 'react';

/**
 * Password input with the show/hide toggle the spec requires (§4D). The visible text is
 * local to this component and never leaves it; toggling only changes the input's `type`.
 * The toggle is a real button (keyboard focusable, aria-pressed) rather than a clickable
 * eye image, so it works the same for everyone.
 */
export default function PasswordField({ label = 'Password', name, value, onChange, error, autoComplete = 'current-password', required }) {
  const [show, setShow] = useState(false);
  const id = useId();

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password">
        <input
          id={id}
          className={`input${error ? ' input--invalid' : ''}`}
          type={show ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          required={required}
        />
        <button
          type="button"
          className="password__toggle"
          onClick={() => setShow((s) => !s)}
          aria-pressed={show}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && <span className="field__error">{error}</span>}
    </div>
  );
}
