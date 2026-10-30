import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Field from '../components/Field.jsx';
import Badge from '../components/Badge.jsx';
import AccountNav from '../components/AccountNav.jsx';
import { Spinner } from '../components/Loader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { api } from '../services/api.js';
import { readableError } from '../utils/format.js';

// The customer address book (spec §4E "delivery addresses"). One form doubles as
// create and edit; every call goes through the ownership-scoped /api/addresses
// endpoints, so a customer only ever sees and changes their own rows.
const BLANK = {
  label: 'Home', recipient: '', phone: '', line1: '', line2: '',
  city: '', province: '', postalCode: '', country: 'Rwanda', isDefault: false,
};

export default function Addresses() {
  useDocumentTitle('My addresses');
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);   // null = creating a new address
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ type: '', message: '' });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const env = await api.addresses.list();
      setAddresses(env.data);
    } catch (err) {
      setLoadError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  function validate() {
    const next = {};
    if (!form.recipient.trim()) next.recipient = 'Recipient name is required.';
    if (!/^[+()0-9\s-]{7,20}$/.test(form.phone.trim())) next.phone = 'Enter a valid phone number.';
    if (form.line1.trim().length < 3) next.line1 = 'Street address is required (3+ characters).';
    if (!form.city.trim()) next.city = 'City is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function startEdit(a) {
    setEditingId(a.id);
    setStatus({ type: '', message: '' });
    setForm({
      label: a.label ?? '', recipient: a.recipient, phone: a.phone, line1: a.line1,
      line2: a.line2 ?? '', city: a.city, province: a.province ?? '',
      postalCode: a.postalCode ?? '', country: a.country ?? 'Rwanda', isDefault: a.isDefault,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setEditingId(null);
    setForm(BLANK);
    setErrors({});
    setStatus({ type: '', message: '' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus({ type: '', message: '' });
    if (!validate()) return;
    setBusy(true);
    try {
      const payload = { ...form, label: form.label || 'Home' };
      if (editingId) await api.addresses.update(editingId, payload);
      else await api.addresses.create(payload);
      await refresh();
      resetForm();
      setStatus({ type: 'success', message: 'Address saved.' });
    } catch (err) {
      setStatus({ type: 'error', message: readableError(err) });
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(id) {
    try { await api.addresses.makeDefault(id); await refresh(); }
    catch (err) { setStatus({ type: 'error', message: readableError(err) }); }
  }

  async function remove(id) {
    if (!window.confirm('Delete this address?')) return;
    try { await api.addresses.remove(id); await refresh(); }
    catch (err) { setStatus({ type: 'error', message: readableError(err) }); }
  }

  return (
    <>
      <h1 className="page-title">My addresses</h1>
      <p className="page-intro">
        Save the places you order to. Your default address is pre-filled at checkout. <Link to="/account">Back to account</Link>
      </p>

      <div className="account">
        <AccountNav active="addresses" />

        <div className="stack">
          {status.message && (
            <div className={`alert alert--${status.type}`} role="alert">{status.message}</div>
          )}

          <section className="panel">
            <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)' }}>
              {editingId ? 'Edit address' : 'Add a new address'}
            </h2>
            <form className="auth__form addresses__form" onSubmit={handleSubmit} noValidate>
              <Field label="Label" name="label" value={form.label} onChange={set('label')} placeholder="Home, Office…" hint="A short nickname to recognise this address." />
              <Field label="Recipient" name="recipient" value={form.recipient} onChange={set('recipient')} error={errors.recipient} required />
              <Field label="Phone" name="phone" value={form.phone} onChange={set('phone')} error={errors.phone} required autoComplete="tel" />
              <Field label="Address line 1" name="line1" value={form.line1} onChange={set('line1')} error={errors.line1} required autoComplete="address-line1" />
              <Field label="Address line 2" name="line2" value={form.line2} onChange={set('line2')} hint="Apartment, building, landmark (optional)." autoComplete="address-line2" />
              <div className="addresses__row">
                <Field label="City" name="city" value={form.city} onChange={set('city')} error={errors.city} required />
                <Field label="Province" name="province" value={form.province} onChange={set('province')} />
              </div>
              <div className="addresses__row">
                <Field label="Postal code" name="postalCode" value={form.postalCode} onChange={set('postalCode')} />
                <Field label="Country" name="country" value={form.country} onChange={set('country')} />
              </div>
              <label className="field field--check">
                <input type="checkbox" name="isDefault" checked={form.isDefault} onChange={set('isDefault')} />
                <span>Make this my default delivery address</span>
              </label>
              <div className="addresses__actions">
                <button type="submit" className="btn btn--teal" disabled={busy}>
                  {busy ? 'Saving…' : editingId ? 'Update address' : 'Add address'}
                </button>
                {editingId && <button type="button" className="btn btn--outline" onClick={resetForm}>Cancel</button>}
              </div>
            </form>
          </section>

          <section className="panel">
            <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)' }}>Saved addresses</h2>
            {loading ? <Spinner label="Loading addresses…" />
              : loadError ? <ErrorState message={loadError} onRetry={refresh} />
              : addresses.length === 0 ? <p className="muted text-sm">You have no saved addresses yet.</p>
              : (
                <ul className="addresses__list">
                  {addresses.map((a) => (
                    <li key={a.id} className="addresses__item">
                      <div className="addresses__body">
                        <div className="addresses__title">
                          <strong>{a.label}</strong>{' '}{a.isDefault && <Badge variant="verified">Default</Badge>}
                        </div>
                        <address>
                          {a.recipient} · {a.phone}<br />
                          {a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />
                          {a.city}{a.province ? `, ${a.province}` : ''}{a.postalCode ? ` ${a.postalCode}` : ''}, {a.country}
                        </address>
                      </div>
                      <div className="addresses__controls">
                        <button type="button" className="btn btn--sm btn--outline" onClick={() => startEdit(a)}>Edit</button>
                        {!a.isDefault && <button type="button" className="btn btn--sm" onClick={() => makeDefault(a.id)}>Make default</button>}
                        <button type="button" className="btn btn--sm link-danger" onClick={() => remove(a.id)}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        </div>
      </div>
    </>
  );
}
