import { Link, useParams } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

// Policy pages (spec §4 "policies"). One component, content keyed by the /policies/:topic
// route, so the four documents share layout and navigation instead of being four copies of
// the same page shell. An unknown topic shows a short "not found here" block that links the
// real topics rather than the generic 404.
const POLICIES = {
  shipping: {
    title: 'Shipping policy',
    updated: '2026-01-05',
    body: [
      ['Delivery areas', 'We deliver to all 30 districts of Rwanda. Kigali City orders are dispatched the same working day when placed before 15:00.'],
      ['Timelines', 'Kigali: same/next working day. Upcountry: 2–3 working days. You receive tracking by SMS and WhatsApp once your parcel ships.'],
      ['Fees', 'A flat delivery fee of 2,000 RWF applies anywhere in Rwanda, and delivery is free on orders of 200,000 RWF or more. The exact fee is shown at checkout before you place your order.'],
      ['Undeliverable orders', 'If nobody is available to receive a parcel twice, we hold it at the nearest pickup point and contact you to arrange a convenient time.'],
    ],
  },
  returns: {
    title: 'Returns & refunds',
    updated: '2026-01-05',
    body: [
      ['7-day window', 'Return any unused item in its original packaging within 7 days of delivery for a refund or exchange — no reason needed for change of mind.'],
      ['Faulty items', 'Faulty or wrongly supplied products are replaced or fully refunded, including delivery. Report them as soon as you notice the issue.'],
      ['How to return', 'Contact us with your order reference, we arrange pickup or you drop the item at any Ganza Mart shop. Refunds are processed to the original payment method within 5–7 working days of receipt.'],
      ['Not returnable', 'For hygiene reasons opened cosmetics, and personalised items, cannot be returned unless faulty.'],
    ],
  },
  privacy: {
    title: 'Privacy policy',
    updated: '2026-01-05',
    body: [
      ['What we collect', 'Your name, e-mail, phone and delivery address, plus your order history. We never ask for card numbers — payments are handled by our licensed payment providers.'],
      ['How we use it', 'To process and deliver your orders, to provide support, and — only if you subscribe — to send offers you can unsubscribe from at any time.'],
      ['We do not sell data', 'Your personal data is never sold or shared with advertisers. Passwords are stored only as strong one-way hashes.'],
      ['Your rights', 'You can view and update your details in My account, or contact us to access, correct or delete your data.'],
    ],
  },
  terms: {
    title: 'Terms of use',
    updated: '2026-01-05',
    body: [
      ['Prices & availability', 'All prices are in Rwanda Francs (RWF) and include applicable taxes. Stock and prices can change until an order is confirmed and paid.'],
      ['Your account', 'Keep your password confidential and provide accurate contact details. You are responsible for activity on your account.'],
      ['Orders', 'An order is a request to buy. We confirm every order by e-mail/SMS; rare stock issues after ordering are resolved with a full refund.'],
      ['Liability', 'We are liable for foreseeable loss caused by our breach of these terms, but not for indirect losses. Nothing limits liability for fraud or death or personal injury.'],
    ],
  },
};

export default function Policies() {
  const { topic } = useParams();
  const policy = POLICIES[topic];

  useDocumentTitle(policy ? policy.title : 'Policy');

  if (!policy) {
    return (
      <>
        <h1 className="page-title">Policy not found</h1>
        <p className="page-intro">We don't have a policy under that name. Our policies are:</p>
        <ul className="footer__list">
          {Object.entries(POLICIES).map(([key, p]) => (
            <li key={key}><Link to={`/policies/${key}`}>{p.title}</Link></li>
          ))}
        </ul>
      </>
    );
  }

  const navKeys = Object.keys(POLICIES);

  return (
    <>
      <h1 className="page-title">{policy.title}</h1>
      <p className="text-sm muted">Last updated {policy.updated}</p>

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', margin: 'var(--space-4) 0' }}>
        {navKeys.map((key) => (
          <Link key={key} className={key === topic ? 'chip' : 'btn btn--outline btn--sm'} to={`/policies/${key}`}>
            {POLICIES[key].title}
          </Link>
        ))}
      </div>

      <div className="prose">
        {policy.body.map(([heading, text]) => (
          <section key={heading}>
            <h2>{heading}</h2>
            <p>{text}</p>
          </section>
        ))}
        <p style={{ marginTop: 'var(--space-5)' }}>
          Still have a question? <Link to="/contact">Contact us</Link>.
        </p>
      </div>
    </>
  );
}
