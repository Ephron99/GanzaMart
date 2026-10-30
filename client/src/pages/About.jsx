import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

export default function About() {
  useDocumentTitle('About us');
  return (
    <>
      <h1 className="page-title">About Ganza Mart</h1>
      <div className="prose">
        <p className="page-intro">Ganza Mart is a Rwandan online store built on a simple idea:
          genuine products, honest prices, and delivery you can rely on — from Kigali to every
          district in the country.</p>

        <h2>Our story</h2>
        <p>We started in 2019 with a single shop in Kigali and a handful of phones and laptops.
          Customers kept asking us to deliver, so we did. Then they asked us to carry more than
          electronics, so we added fashion, home and kitchen, beauty and sports. Today Ganza Mart
          is one trusted storefront for the things everyday Rwandan households actually need.</p>

        <h2>What we stand for</h2>
        <ul>
          <li><strong>Genuine stock only.</strong> Every item is sourced through official channels and carries a warranty.</li>
          <li><strong>Real prices.</strong> The number you see is the number you pay — no surprise fees at checkout.</li>
          <li><strong>Local delivery.</strong> Same-day in Kigali, two to three days upcountry, with MoMo, card or cash on delivery.</li>
          <li><strong>Support that answers.</strong> A real person reads every message — see our <Link to="/contact">contact page</Link>.</li>
        </ul>

        <h2>Shop with confidence</h2>
        <p>Questions about how orders, delivery or returns work? The <Link to="/faq">help &amp; FAQ</Link>
          covers the details, and our <Link to="/policies/shipping">shipping</Link> and
          <Link to="/policies/returns"> returns</Link> policies are written in plain language.</p>

        <p style={{ marginTop: 'var(--space-5)' }}>
          <Link className="btn btn--primary" to="/products">Browse the catalogue</Link>
        </p>
      </div>
    </>
  );
}
