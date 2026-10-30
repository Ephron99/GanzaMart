import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import { Spinner } from '../components/Loader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { useCart } from '../hooks/useCart.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { api } from '../services/api.js';
import { formatMoney, resolveImageUrl, readableError } from '../utils/format.js';

// Checkout (spec §4C). The shopper picks a saved address, an optional coupon and a
// payment method, then places the order. This page NEVER computes the total it acts
// on: the coupon preview and the final figures come from the API. The numbers shown
// here are for confirmation only — `POST /api/orders` re-derives every one of them
// from the database inside its transaction, so editing them client-side achieves nothing.
const FREE_SHIPPING_THRESHOLD = 200000;
const SHIPPING_FEE = 2000;

export default function Checkout() {
  useDocumentTitle('Checkout');
  const navigate = useNavigate();
  const { lines, subtotal, itemCount, canCheckout, loading: cartLoading, reload: reloadCart } = useCart();

  const [addresses, setAddresses] = useState([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [addressId, setAddressId] = useState(null);

  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState(null);        // server preview once applied
  const [couponStatus, setCouponStatus] = useState({ type: '', message: '' });
  const [couponBusy, setCouponBusy] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const env = await api.addresses.list();
        if (!alive) return;
        setAddresses(env.data);
        const preferred = env.data.find((a) => a.isDefault) ?? env.data[0];
        if (preferred) setAddressId(preferred.id);
      } finally {
        if (alive) setAddressesLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Estimated delivery for display before the order is placed (the server confirms it).
  const estShipping = useMemo(() => (subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE), [subtotal]);
  const discount = coupon?.discount ?? 0;
  const estTotal = Math.max(0, subtotal - discount + estShipping);

  async function applyCoupon() {
    setCouponBusy(true);
    setCouponStatus({ type: '', message: '' });
    try {
      const env = await api.coupons.validate(couponCode.trim());
      setCoupon(env.data);
      setCouponStatus({ type: 'success', message: `Coupon applied — you save ${formatMoney(env.data.discount)}.` });
    } catch (err) {
      setCoupon(null);
      setCouponStatus({ type: 'error', message: readableError(err) });
    } finally {
      setCouponBusy(false);
    }
  }

  function clearCoupon() {
    setCoupon(null);
    setCouponStatus({ type: '', message: '' });
  }

  async function handlePlaceOrder() {
    if (!addressId || !canCheckout) return;
    setPlacing(true);
    setPlaceError(null);
    try {
      const env = await api.orders.place({
        addressId,
        paymentMethod,
        couponCode: coupon ? coupon.code : undefined,
      });
      // The server emptied the cart as part of the order; refresh the badge to match.
      await reloadCart();
      navigate(`/account/orders/${env.data.id}`, { state: { justPlaced: true } });
    } catch (err) {
      setPlaceError(readableError(err));
      setPlacing(false);
    }
  }

  if (cartLoading && lines.length === 0) return <Spinner label="Loading checkout…" />;
  if (lines.length === 0) {
    return (
      <>
        <h1 className="page-title">Checkout</h1>
        <p className="page-intro">Your cart is empty, so there is nothing to check out yet.</p>
        <Link className="btn btn--primary" to="/products">Browse products</Link>
      </>
    );
  }

  const blocked = !canCheckout;

  return (
    <>
      <h1 className="page-title">Checkout</h1>
      <p className="page-intro">Confirm your delivery address and how you'd like to pay.</p>

      <div className="checkout">
        <div className="checkout__main">
          {/* ── Delivery address ── */}
          <section className="panel checkout__section">
            <h2>1. Delivery address</h2>
            {addressesLoading ? <Spinner label="Loading addresses…" small />
              : addresses.length === 0 ? (
              <div className="checkout__empty-inline">
                <p>You have no saved addresses. Add one to your address book, then return here.</p>
                <Link className="btn btn--teal btn--sm" to="/account/addresses">Add an address</Link>
              </div>
            ) : (
              <div className="checkout__addresses">
                {addresses.map((a) => (
                  <label key={a.id} className={`checkout__addr ${addressId === a.id ? 'checkout__addr--selected' : ''}`}>
                    <input type="radio" name="address" value={a.id}
                      checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                    <span>
                      <strong>{a.label}</strong>{a.isDefault && <Badge variant="verified">Default</Badge>}<br />
                      {a.recipient} · {a.phone}<br />
                      {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}{a.province ? `, ${a.province}` : ''}, {a.country}
                    </span>
                  </label>
                ))}
                <Link className="text-sm" to="/account/addresses">Manage addresses</Link>
              </div>
            )}
          </section>

          {/* ── Payment ── */}
          <section className="panel checkout__section">
            <h2>2. Payment method</h2>
            <div className="checkout__pays">
              <label className={`checkout__pay ${paymentMethod === 'cod' ? 'checkout__pay--selected' : ''}`}>
                <input type="radio" name="pay" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} />
                <span><strong>Cash on delivery</strong><br />Pay the courier when your parcel arrives.</span>
              </label>
              <label className={`checkout__pay ${paymentMethod === 'mock' ? 'checkout__pay--selected' : ''}`}>
                <input type="radio" name="pay" checked={paymentMethod === 'mock'} onChange={() => setPaymentMethod('mock')} />
                <span><strong>Pay now (demo)</strong><br />A simulated payment — no real card is charged and none is stored.</span>
              </label>
            </div>
          </section>

          {/* ── Coupon ── */}
          <section className="panel checkout__section">
            <h2>3. Coupon code</h2>
            {coupon ? (
              <div className="checkout__coupon-applied">
                <span><Badge variant="sale">{coupon.code}</Badge> — {formatMoney(coupon.discount)} off</span>
                <button type="button" className="btn btn--sm btn--outline" onClick={clearCoupon}>Remove</button>
              </div>
            ) : (
              <div className="checkout__coupon-form">
                <input className="input" placeholder="e.g. WELCOME10" value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)} disabled={couponBusy} />
                <button type="button" className="btn btn--teal" onClick={applyCoupon}
                  disabled={couponBusy || couponCode.trim().length < 3}>
                  {couponBusy ? 'Checking…' : 'Apply'}
                </button>
              </div>
            )}
            {couponStatus.message && (
              <p className={`checkout__coupon-msg text-sm text-${couponStatus.type}`}>{couponStatus.message}</p>
            )}
          </section>
        </div>

        {/* ── Summary ── */}
        <aside className="panel checkout__summary">
          <h2>Order summary</h2>
          <ul className="checkout__items">
            {lines.map((line) => (
              <li key={line.id}>
                <img src={resolveImageUrl(line.imageUrl)} alt="" width="44" height="44" />
                <span className="checkout__item-name">{line.name}<br />
                  <span className="muted text-xs">× {line.quantity}</span></span>
                <span>{formatMoney(line.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <dl className="dl">
            <div className="dl__row"><dt>Items</dt><dd>{itemCount}</dd></div>
            <div className="dl__row"><dt>Subtotal</dt><dd>{formatMoney(subtotal)}</dd></div>
            {discount > 0 && <div className="dl__row"><dt>Discount</dt><dd>−{formatMoney(discount)}</dd></div>}
            <div className="dl__row"><dt>Delivery</dt><dd>{estShipping === 0 ? 'Free' : formatMoney(estShipping)}</dd></div>
          </dl>

          <div className="checkout__total">
            <span>Total</span>
            <strong>{formatMoney(estTotal)}</strong>
          </div>

          {blocked ? (
            <div className="checkout__blocked">
              <p className="cart-line__warn">Some items are out of stock or exceed available quantity. Adjust your cart to continue.</p>
              <Link className="btn btn--outline btn--block" to="/cart">Review cart</Link>
            </div>
          ) : (
            <>
              {placeError && <div className="alert alert--error" role="alert">{placeError}</div>}
              <button type="button" className="btn btn--primary btn--block"
                onClick={handlePlaceOrder} disabled={!addressId || placing}>
                {placing ? 'Placing order…' : `Place order — ${formatMoney(estTotal)}`}
              </button>
            </>
          )}
          <p className="text-xs muted" style={{ marginTop: 'var(--space-3)' }}>
            Final prices are confirmed by the server when you place the order.
          </p>
        </aside>
      </div>
    </>
  );
}
