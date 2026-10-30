import { Link } from 'react-router-dom';
import QuantityStepper from '../components/QuantityStepper.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { Spinner } from '../components/Loader.jsx';
import { useCart } from '../hooks/useCart.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { formatMoney, resolveImageUrl } from '../utils/format.js';

// The cart page is a thin view over the SERVER-backed cart: prices and totals come
// from the API (re-derived from the database on every read), and each mutation
// (quantity, remove, clear) posts to the server and re-renders from its rebuilt cart.
// A line whose requested quantity has outgrown live stock is flagged, not silently
// allowed, because checkout (Phase 8) will refuse it.
export default function Cart() {
  useDocumentTitle('Your cart');
  const { lines, subtotal, itemCount, canCheckout, loading, error, setQuantity, removeItem, clearCart, reload } = useCart();

  if (loading && lines.length === 0) return <Spinner label="Loading your cart…" />;
  if (error && lines.length === 0) return <ErrorState message={error} onRetry={reload} />;

  if (lines.length === 0) {
    return (
      <>
        <h1 className="page-title">Your cart</h1>
        <EmptyState icon="🛒" title="Your cart is empty" action={{ to: '/products', label: 'Start shopping' }}>
          Nothing here yet — browse the catalogue and add something you like.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">Your cart</h1>
      <p className="page-intro">{itemCount} item(s) ready to check out.</p>

      <div className="cart-layout">
        <div className="cart-lines">
          <ul className="cart-list">
            {lines.map((line) => (
              <li className="cart-line" key={line.id}>
                <Link className="cart-line__media" to={`/product/${line.id}`}>
                  <img src={resolveImageUrl(line.imageUrl)} alt={line.name} width="80" height="80" />
                </Link>

                <div className="cart-line__info">
                  <Link to={`/product/${line.id}`} className="cart-line__name">{line.name}</Link>
                  <div className="text-sm muted">
                    {formatMoney(line.unitPrice)} each
                    {line.onSale && <> <s className="muted">{formatMoney(line.listPrice)}</s></>}
                  </div>
                  {!line.inStock && <div className="cart-line__warn">No longer in stock.</div>}
                  {line.inStock && line.exceedsStock && (
                    <div className="cart-line__warn">Only {line.stock} left — reduce the quantity to continue.</div>
                  )}
                  <button type="button" className="cart-line__remove" onClick={() => removeItem(line.id)}>Remove</button>
                </div>

                <div className="cart-line__qty">
                  <QuantityStepper
                    value={line.quantity}
                    max={Math.max(line.stock, 1)}
                    disabled={!line.inStock}
                    onChange={(q) => setQuantity(line.id, q)}
                  />
                  <span className="text-xs muted">Max {line.stock}</span>
                </div>

                <div className="cart-line__total">{formatMoney(line.lineTotal)}</div>
              </li>
            ))}
          </ul>

          <div className="cart-line-actions">
            <Link className="btn btn--outline btn--sm" to="/products">Continue shopping</Link>
            <button type="button" className="btn btn--sm" onClick={clearCart}>Clear cart</button>
          </div>
        </div>

        <aside className="cart-summary panel">
          <h2>Order summary</h2>
          <dl className="dl">
            <div className="dl__row"><dt>Items</dt><dd>{itemCount}</dd></div>
            <div className="dl__row"><dt>Subtotal</dt><dd>{formatMoney(subtotal)}</dd></div>
            <div className="dl__row"><dt>Delivery</dt><dd>Calculated at checkout</dd></div>
          </dl>
          <div className="cart-summary__total">
            <span>Subtotal</span>
            <strong>{formatMoney(subtotal)}</strong>
          </div>
          {/* Checkout lives at /checkout (signed-in only). A guest is routed through
              /login first, where the merge folds this anonymous basket into their account. */}
          {canCheckout ? (
            <Link className="btn btn--primary btn--block" to="/checkout">Proceed to checkout</Link>
          ) : (
            <button type="button" className="btn btn--primary btn--block" disabled>Checkout unavailable</button>
          )}
          <p className="text-xs muted" style={{ marginTop: 'var(--space-3)' }}>
            These prices come from the server and are confirmed again when you check out.
          </p>
        </aside>
      </div>
    </>
  );
}
