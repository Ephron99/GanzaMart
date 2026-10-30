import { useEffect, useState } from 'react';

/**
 * − [ n ] + control. The `max` prop is the whole point: the product detail page passes
 * the live stock value, so the plus button stops at what actually exists (spec §4C).
 *
 * The input is editable (typing "12" is faster than twelve clicks), so the committed
 * value is clamped on every path — increment, decrement and typed — and never allowed to
 * go below 1 or above `max`.
 */
export default function QuantityStepper({ value, onChange, min = 1, max = 1, disabled = false }) {
  const clamp = (n) => Math.max(min, Math.min(Number(n) || min, max));
  const [draft, setDraft] = useState(String(value));

  // Keep the visible field in sync when the parent changes value (e.g. cart edit).
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = (n) => onChange(clamp(n));

  return (
    <span className="stepper" aria-label="Quantity">
      <button type="button" onClick={() => commit(value - 1)} disabled={disabled || value <= min} aria-label="Decrease quantity">−</button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        disabled={disabled}
        aria-label="Quantity"
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value);
        }}
        onBlur={(e) => { setDraft(String(clamp(e.target.value))); commit(e.target.value); }}
      />
      <button type="button" onClick={() => commit(value + 1)} disabled={disabled || value >= max} aria-label="Increase quantity">+</button>
    </span>
  );
}
