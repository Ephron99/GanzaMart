import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Field from '../components/Field.jsx';
import PasswordField from '../components/PasswordField.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { readableError } from '../utils/format.js';

// Create account (spec §4D). The client mirrors the server's rules (see
// server/src/validators/authValidators.js) so the user gets instant feedback, but the
// server remains the authority — a duplicate email or a rejected password is surfaced
// from the 422/409 it returns, not from a guess here. Role is never sent: registration
// always makes a customer.
export default function Register() {
  useDocumentTitle('Create account');
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (isAuthenticated) return <Navigate to="/account" replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function validate() {
    const next = {};
    if (form.fullName.trim().length < 2) next.fullName = 'Enter your full name (at least 2 characters).';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid e-mail address.';
    if (form.phone && !/^\+?[0-9\s-]{7,20}$/.test(form.phone)) next.phone = 'Phone must be 7–20 digits (optional leading +).';
    // Same shape the API enforces: ≥8 chars, a letter and a number.
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(form.password)) {
      next.password = 'Password needs at least 8 characters and must include a number.';
    }
    if (form.confirm !== form.password) next.confirm = 'Passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;
    setBusy(true);
    try {
      const payload = { fullName: form.fullName.trim(), email: form.email.trim(), password: form.password };
      if (form.phone.trim()) payload.phone = form.phone.trim();
      await register(payload);
      navigate('/account', { replace: true });
    } catch (err) {
      setFormError(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <h1>Create your account</h1>
        <p className="auth__intro">Join Ganza Mart to track orders and save your details.</p>

        {formError && <div className="alert alert--error" role="alert">{formError}</div>}

        <form className="auth__form" onSubmit={handleSubmit} noValidate>
          <Field label="Full name" name="fullName" autoComplete="name" value={form.fullName} onChange={set('fullName')} error={errors.fullName} required />
          <Field label="Email" type="email" name="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} required />
          <Field label="Phone (optional)" type="tel" name="phone" autoComplete="tel" value={form.phone} onChange={set('phone')} error={errors.phone} hint="e.g. +250780000000" />
          <PasswordField label="Password" name="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} required />
          <PasswordField label="Confirm password" name="confirm" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} required />
          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth__switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
