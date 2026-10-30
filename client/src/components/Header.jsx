import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import SearchBar from './SearchBar.jsx';
import AccountMenu from './AccountMenu.jsx';
import CategoryNav from './CategoryNav.jsx';
import { useCart } from '../hooks/useCart.js';
import { useAsyncData } from '../hooks/useAsyncData.js';
import { api } from '../services/api.js';

// The storefront chrome (spec §4A). Categories are fetched once here — the header is
// mounted a single time for the whole session, so every page gets the navigation strip
// without each page re-requesting the tree.
export default function Header() {
  const { itemCount } = useCart();
  const { data } = useAsyncData(() => api.categories.tree(), []);
  const categories = data?.data ?? [];

  return (
    <header className="header-root">
      <div className="topbar">
        <div className="container topbar__inner">
          <span className="topbar__tagline">Flat 2,000 RWF delivery nationwide — free from 200,000 RWF</span>
          <nav className="topbar__links" aria-label="Utility">
            <Link to="/about">About</Link>
            <Link to="/faq">Help &amp; FAQ</Link>
            <Link to="/contact">Contact</Link>
          </nav>
        </div>
      </div>

      <div className="header">
        <div className="container header__inner">
          <Link className="logo" to="/" aria-label="Ganza Mart home">
            <span className="logo__mark" aria-hidden="true">GM</span>
            <span>Ganza&nbsp;<span className="logo__suffix">Mart</span></span>
          </Link>

          <SearchBar />

          <div className="header__actions">
            <Link className="btn btn--outline btn--sm cart-btn" to="/cart" aria-label={`Cart, ${itemCount} item(s)`}>
              <ShoppingCart size={16} aria-hidden="true" />
              <span>Cart</span>
              {itemCount > 0 && <span className="cart-count">{itemCount}</span>}
            </Link>
            <AccountMenu />
          </div>
        </div>
      </div>

      <CategoryNav categories={categories} />
    </header>
  );
}
