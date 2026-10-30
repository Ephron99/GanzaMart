import { useState, useId } from 'react';
import { Link } from 'react-router-dom';
import Field from '../components/Field.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { api } from '../services/api.js';
import { readableError } from '../utils/format.js';

// Contact page (spec §4). Posts to /api/contact, which is rate-limited and refuses
// unknown fields — so a visitor cannot mark their own ticket as handled or spam the
// queue faster than the limiter allows. A successful submit shows the ticket number the
// API assigned.
export default function Contact() {
  useDocumentTitle('Contact us');
  const bodyId = useId();

  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function validate() {
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Please tell us your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid e-mail address.';
    if (form.phone && !/^[+()0-9\s-]{7,20}$/.test(form.phone)) next.phone = 'Phone may contain digits, spaces and + ( ) -.';
    if (form.subject.trim().length < 3) next.subject = 'Add a short subject.';
    if (form.message.trim().length < 10) next.message = 'Your message should be at least 10 characters.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setResult(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const res = await api.contact.send({
        name: form.name.trim(),
        email: form.email.trim(),
        subject: form.subject.trim(),
        message: form.message.trim(),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      });
      setResult(res.data);
      setForm({ name: '', email: '', phone: '', subject: '', message: '' });
      setErrors({});
    } catch (err) {
      setResult({ error: readableError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="page-title">Contact us</h1>
      <p className="page-intro">Questions about an order, a product or delivery? Send us a
        message and our team will reply — usually within one working day.</p>

      <div className="contact">
        <div className="panel">
          {result && !result.error && (
            <div className="alert alert--success" role="status" style={{ marginBottom: 'var(--space-4)' }}>
              Thanks! Your message was received. Reference <strong>{result.ticket}</strong>. We'll reply to your e-mail shortly.
            </div>
          )}
          {result && result.error && (
            <div className="alert alert--error" role="alert" style={{ marginBottom: 'var(--space-4)' }}>{result.error}</div>
          )}

          <form className="auth__form" onSubmit={handleSubmit} noValidate>
            <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
              <Field label="Name" name="name" value={form.name} onChange={set('name')} error={errors.name} required />
              <Field label="Email" type="email" name="email" value={form.email} onChange={set('email')} error={errors.email} required />
              <Field label="Phone (optional)" type="tel" name="phone" value={form.phone} onChange={set('phone')} error={errors.phone} />
              <Field label="Subject" name="subject" value={form.subject} onChange={set('subject')} error={errors.subject} required />
            </div>

            <div className="field">
              <label htmlFor={bodyId}>Message</label>
              <textarea
                id={bodyId}
                className={`textarea${errors.message ? ' input--invalid' : ''}`}
                name="message"
                value={form.message}
                onChange={set('message')}
                required
              />
              {errors.message && <span className="field__error">{errors.message}</span>}
            </div>

            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send message'}
            </button>
          </form>
        </div>

        <aside className="contact__aside">
          <div className="prop"><span className="prop__icon" aria-hidden="true">📍</span><div><h4>Visit</h4><p>KG 123 St, Kigali, Rwanda</p></div></div>
          <div className="prop"><span className="prop__icon" aria-hidden="true">📞</span><div><h4>Call</h4><p><a href="tel:+250780000000">+250 780 000 000</a></p></div></div>
          <div className="prop"><span className="prop__icon" aria-hidden="true">✉️</span><div><h4>Email</h4><p><a href="mailto:hello@ganzamart.rw">hello@ganzamart.rw</a></p></div></div>
          <div className="prop"><span className="prop__icon" aria-hidden="true">🕑</span><div><h4>Hours</h4><p>Mon–Sat, 8:00–18:00</p></div></div>
          <p className="text-sm muted">Prefer to self-serve? Check the <Link to="/faq">help &amp; FAQ</Link>.</p>
        </aside>
      </div>
    </>
  );
}
