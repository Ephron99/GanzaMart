import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

// Help & FAQ (spec §4). Rendered as native <details> accordions — no JavaScript, works
// before the bundle loads, and the open/close state is free.
const FAQS = [
  { q: 'How long does delivery take?', a: 'Inside Kigali we deliver the same or next working day. Upcountry districts take 2–3 working days. You will get tracking by SMS and WhatsApp once your order ships.' },
  { q: 'Which payment methods can I use?', a: 'MTN Mobile Money, Airtel Money, Visa/Mastercard and cash on delivery. Every option is confirmed on the server before your order is placed.' },
  { q: 'Are the products genuine?', a: 'Yes. Every item is sourced through official channels and carries the manufacturer’s warranty. If a product is not as described, you can return it.' },
  { q: 'Can I return something?', a: 'You have 7 days to return an unused item in its original packaging for a refund or exchange. Read the full detail on our returns policy.' },
  { q: 'How do I track my order?', a: 'Sign in and open My account → Orders. Each order shows its current status and tracking reference as soon as it is dispatched.' },
  { q: 'Do I need an account to order?', a: 'You can browse everything as a guest, but you’ll need an account to check out, track orders and save addresses.' },
];

export default function FAQ() {
  useDocumentTitle('Help & FAQ');
  return (
    <>
      <h1 className="page-title">Help &amp; FAQ</h1>
      <p className="page-intro">Quick answers about ordering, delivery, payment and returns.
        Still stuck? <Link to="/contact">Contact our team</Link>.</p>

      <div className="faq">
        {FAQS.map((item) => (
          <details className="faq__item" key={item.q}>
            <summary>{item.q}</summary>
            <div className="faq__body">{item.a}</div>
          </details>
        ))}
      </div>
    </>
  );
}
