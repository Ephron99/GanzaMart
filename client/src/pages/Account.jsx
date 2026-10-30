import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PasswordField from '../components/PasswordField.jsx';
import Badge from '../components/Badge.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { api } from '../services/api.js';
import { readableError, formatDate } from '../utils/format.js';

// Account home (spec §4E). Shows the profile the API returned and a change-password
// form. The address book lives at /account/addresses and order history at
// /account/orders, both reachable from the sidebar.
export default function Account() {
  useDocumentTitle('My account');
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ type: '', message: '' });
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function validate() {
    const next = {};
    if (!form.currentPassword) next.currentPassword = 'Enter your current password.';
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(form.newPassword)) {
      next.newPassword = 'New password needs at least 8 characters and a number.';
    }
    if (form.confirm !== form.newPassword) next.confirm = 'Passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus({ type: '', message: '' });
    if (!validate()) return;
    setBusy(true);
    try {
      await api.auth.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      // The server revokes every existing token when the password changes, so this
      // session is already dead. Send the user to re-authenticate with the new password.
      await logout();
      navigate('/login', { state: { from: '/account' } });
    } catch (err) {
      setStatus({ type: 'error', message: readableError(err) });
    } finally {
      setBusy(false);
    }
  }

  const initials = user.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <>
      <h1 className="page-title">My account</h1>

      <div className="account">
        <nav className="account__nav" aria-label="Account sections">
          <span className="account__nav-item account__nav-item--active">Profile</span>
          <Link className="account__nav-item" to="/cart">My cart</Link>
          <Link className="account__nav-item" to="/account/orders">Orders</Link>
          <Link className="account__nav-item" to="/account/addresses">Addresses</Link>
          {isAdmin && <Link className="account__nav-item" to="/admin">Admin dashboard</Link>}
        </nav>

        <div className="stack">
          <section className="panel">
            <div className="account__profile">
              <span className="avatar" aria-hidden="true">{initials}</span>
              <div>
                <h2 style={{ fontSize: 'var(--text-xl)' }}>{user.fullName}{' '}
                  {isAdmin && <Badge variant="new">Admin</Badge>}
                </h2>
                <p className="muted text-sm">{user.email}</p>
              </div>
            </div>
            <dl className="dl">
              <div className="dl__row"><dt>Phone</dt><dd>{user.phone || 'Not provided'}</dd></div>
              <div className="dl__row"><dt>Account type</dt><dd>{user.role}</dd></div>
              <div className="dl__row"><dt>Member since</dt><dd>{formatDate(user.createdAt)}</dd></div>
            </dl>
          </section>

          <section className="panel">
            <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)' }}>Change password</h2>
            {status.message && <div className={`alert alert--${status.type}`} role="alert" style={{ marginBottom: 'var(--space-4)' }}>{status.message}</div>}
            <form className="auth__form" onSubmit={handleSubmit} noValidate>
              <PasswordField label="Current password" name="currentPassword" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} error={errors.currentPassword} required />
              <PasswordField label="New password" name="newPassword" autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} error={errors.newPassword} required />
              <PasswordField label="Confirm new password" name="confirm" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} required />
              <div>
                <button type="submit" className="btn btn--teal" disabled={busy}>
                  {busy ? 'Updating…' : 'Update password'}
                </button>
              </div>
              <p className="field__hint">Changing your password signs you out on every device; you will sign in again with the new one.</p>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
