import { Link } from 'react-router-dom';
import NewsletterForm from './NewsletterForm.jsx';

// The classic department-store footer: brand blurb + link columns + contact, then a
// bottom bar. Links point at the routes that actually exist (404 otherwise), and the
// policy links use the /policies/:topic pattern the router registers.
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__top">
          <div className="footer__brand">
            <h4>Ganza Mart</h4>
            <p>Rwanda's classic online store — genuine products, honest prices and
              delivery to every district, from Kigali to Rubavu.</p>
            <div style={{ marginTop: 'var(--space-4)' }}>
              <h4>Stay in the loop</h4>
              <NewsletterForm />
            </div>
          </div>

          <div>
            <h4>Shop</h4>
            <ul className="footer__list">
              <li><Link to="/products">All products</Link></li>
              <li><Link to="/products?newArrivals=true">New arrivals</Link></li>
              <li><Link to="/products?sort=best-selling">Best sellers</Link></li>
              <li><Link to="/products?featured=true">Featured deals</Link></li>
              <li><Link to="/cart">Your cart</Link></li>
            </ul>
          </div>

          <div>
            <h4>Company</h4>
            <ul className="footer__list">
              <li><Link to="/about">About us</Link></li>
              <li><Link to="/contact">Contact</Link></li>
              <li><Link to="/faq">Help &amp; FAQ</Link></li>
              <li><Link to="/account">My account</Link></li>
            </ul>
          </div>

          <div>
            <h4>Policies</h4>
            <ul className="footer__list">
              <li><Link to="/policies/shipping">Shipping</Link></li>
              <li><Link to="/policies/returns">Returns &amp; refunds</Link></li>
              <li><Link to="/policies/privacy">Privacy</Link></li>
              <li><Link to="/policies/terms">Terms of use</Link></li>
            </ul>
            <address className="footer__contact" style={{ marginTop: 'var(--space-4)' }}>
              <span>KG 123 St, Kigali, Rwanda</span>
              <a href="tel:+250780000000">+250 780 000 000</a>
              <a href="mailto:hello@ganzamart.rw">hello@ganzamart.rw</a>
            </address>
          </div>
        </div>

        <div className="footer__bottom">
          <span>© {year} Ganza Mart. All rights reserved.</span>
          <div className="footer__payment" aria-label="Payment methods">
            <span>MTN MoMo</span>
            <span>Airtel Money</span>
            <span>Visa</span>
            <span>Mastercard</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
