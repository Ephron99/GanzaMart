import { useState } from 'react';
import { api } from '../services/api.js';
import { readableError } from '../utils/format.js';

/**
 * Newsletter signup (spec §4A). Self-contained: owns its input, its submit state and
 * the server's reply. The API is rate-limited and answers 422 on a bad email, so both
 * are surfaced here rather than assumed away. `alreadySubscribed` still reads as a
 * success — the shopper's goal ("keep me posted") is met either way.
 */
export default function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | ok | error
  const [message, setMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('sending');
    setMessage('');
    try {
      const res = await api.newsletter.subscribe(email.trim());
      setStatus('ok');
      setMessage(res.data?.message || 'You are subscribed — watch your inbox for offers.');
      setEmail('');
    } catch (err) {
      setStatus('error');
      setMessage(readableError(err));
    }
  }

  return (
    <div>
      <form className="newsletter__form" onSubmit={handleSubmit}>
        <label className="visually-hidden" htmlFor="nl-email">
          Email address
        </label>
        <input
          id="nl-email"
          className="input"
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'sending'}
        />
        <button type="submit" className="btn btn--primary" disabled={status === 'sending'}>
          {status === 'sending' ? 'Subscribing…' : 'Subscribe'}
        </button>
      </form>
      {status === 'ok' && <p className="text-sm" style={{ color: 'var(--color-success)', marginTop: 'var(--space-2)' }}>{message}</p>}
      {status === 'error' && <p className="text-sm" style={{ color: 'var(--color-danger)', marginTop: 'var(--space-2)' }}>{message}</p>}
    </div>
  );
}
