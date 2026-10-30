import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Field from '../components/Field.jsx';
import PasswordField from '../components/PasswordField.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { readableError } from '../utils/format.js';

// Sign in (spec §4D). Client-side checks exist for instant feedback, but the real answer
// comes from the server: wrong credentials, a deactivated account and rate limiting are
// all surfaced from the API error, never guessed at here.
export default function Login() {
  useDocumentTitle('Sign in');
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Where to go after a successful login: the page a protected route bounced us from,
  // or the account area for a direct visit.
  const redirectTo = location.state?.from ?? '/account';

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (isAuthenticated) return <Navigate to={redirectTo} replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function validate() {
    const next = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid e-mail address.';
    if (!form.password) next.password = 'Enter your password.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;
    setBusy(true);
    try {
      await login({ email: form.email.trim(), password: form.password });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setFormError(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <h1>Welcome back</h1>
        <p className="auth__intro">Sign in to see your orders and checkout faster.</p>

        {formError && <div className="alert alert--error" role="alert">{formError}</div>}

        <form className="auth__form" onSubmit={handleSubmit} noValidate>
          <Field label="Email" type="email" name="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} required />
          <PasswordField label="Password" name="password" autoComplete="current-password" value={form.password} onChange={set('password')} error={errors.password} required />
          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth__switch">
          New to Ganza Mart? <Link to="/register">Create an account</Link>
        </p>

        <div className="auth__demo">
          <strong>Demo accounts</strong><br />
          Shopper: <code>alice@example.com</code> / <code>Alice@123</code><br />
          Admin: <code>admin@ganza.com</code> / <code>Admin@123</code>
        </div>
      </div>
    </div>
  );
}
