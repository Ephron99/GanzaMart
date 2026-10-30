import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import AccountNav from '../components/AccountNav.jsx';
import OrderStatusBadge from '../components/OrderStatusBadge.jsx';
import { Spinner } from '../components/Loader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { api } from '../services/api.js';
import { formatMoney, formatDate, resolveImageUrl, readableError } from '../utils/format.js';

// One order in full: the historical line prices locked in at purchase, the delivery
// snapshot, the payment/shipment records and the status timeline. The customer may
// still cancel while the order is pending or confirmed — the server reverses stock.
const CANCELLABLE = ['pending', 'confirmed'];

export default function OrderDetail() {
  const { id } = useParams();
  const location = useLocation();
  useDocumentTitle('Order details');

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [canceling, setCanceling] = useState(false);
  const [banner, setBanner] = useState(location.state?.justPlaced
    ? { type: 'success', message: 'Thank you — your order has been placed!' } : null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const env = await api.orders.detail(id);
      setOrder(env.data);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleCancel() {
    if (!window.confirm('Cancel this order? Stock will be returned and the order closed.')) return;
    setCanceling(true);
    try {
      const env = await api.orders.cancel(id, 'Cancelled from order details');
      setOrder(env.data);
      setBanner({ type: 'info', message: 'Your order has been cancelled.' });
    } catch (err) {
      setBanner({ type: 'error', message: readableError(err) });
    } finally {
      setCanceling(false);
    }
  }

  if (loading) return <Spinner label="Loading your order…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!order) return null;

  const canCancel = CANCELLABLE.includes(order.status);

  return (
    <>
      <h1 className="page-title">Order {order.orderNumber}</h1>
      <p className="page-intro">
        Placed {formatDate(order.createdAt)} · <OrderStatusBadge status={order.status} />
      </p>

      <div className="account">
        <AccountNav active="orders" />

        <div className="stack">
          {banner && (
            <div className={`alert alert--${banner.type === 'info' ? 'success' : banner.type}`} role="alert">
              {banner.message}
            </div>
          )}

          <section className="panel">
            <h2 style={{ marginBottom: 'var(--space-4)' }}>Items</h2>
            <ul className="order-detail__items">
              {order.items.map((it) => (
                <li key={it.productId}>
                  <img src={resolveImageUrl(it.imageUrl)} alt="" width="48" height="48" />
                  <span>
                    {it.name}<br />
                    <span className="muted text-xs">{formatMoney(it.unitPrice)} × {it.quantity}</span>
                  </span>
                  <strong>{formatMoney(it.lineTotal)}</strong>
                </li>
              ))}
            </ul>

            <dl className="dl order-detail__totals">
              <div className="dl__row"><dt>Subtotal</dt><dd>{formatMoney(order.subtotal)}</dd></div>
              {order.discountAmount > 0 && (
                <div className="dl__row"><dt>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</dt><dd>−{formatMoney(order.discountAmount)}</dd></div>
              )}
              <div className="dl__row"><dt>Delivery</dt><dd>{order.shippingFee === 0 ? 'Free' : formatMoney(order.shippingFee)}</dd></div>
              <div className="dl__row dl__row--total"><dt>Total</dt><dd>{formatMoney(order.totalAmount)}</dd></div>
            </dl>
          </section>

          <div className="order-detail__grid">
            <section className="panel">
              <h2>Delivery address</h2>
              <address className="text-sm">
                {order.delivery.recipient}<br />
                {order.delivery.contactPhone}<br />
                {order.delivery.addressLine1}{order.delivery.addressLine2 ? `, ${order.delivery.addressLine2}` : ''}<br />
                {order.delivery.city}{order.delivery.province ? `, ${order.delivery.province}` : ''}<br />
                {order.delivery.country}
              </address>
            </section>

            <section className="panel">
              <h2>Payment &amp; shipping</h2>
              <dl className="dl">
                <div className="dl__row"><dt>Method</dt><dd>{order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Paid (demo)'}</dd></div>
                <div className="dl__row"><dt>Payment status</dt><dd>{order.payment?.status ?? '—'}</dd></div>
                <div className="dl__row"><dt>Carrier</dt><dd>{order.shipment?.carrier || '—'}</dd></div>
                <div className="dl__row"><dt>Tracking</dt><dd>{order.shipment?.trackingNumber || '—'}</dd></div>
              </dl>
            </section>
          </div>

          <section className="panel">
            <h2 style={{ marginBottom: 'var(--space-4)' }}>Progress</h2>
            <ol className="timeline">
              {order.history.map((h, i) => (
                <li key={i} className="timeline__item">
                  <span className="timeline__dot" aria-hidden="true" />
                  <div>
                    <strong>{h.toStatus}</strong>
                    {h.note && <span className="muted text-sm"> — {h.note}</span>}
                    <div className="muted text-xs">{formatDate(h.createdAt)}{h.changedByName ? ` · ${h.changedByName}` : ''}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="order-detail__actions">
            <Link className="btn btn--outline" to="/account/orders">Back to orders</Link>
            {canCancel && (
              <button type="button" className="btn link-danger" onClick={handleCancel} disabled={canceling}>
                {canceling ? 'Cancelling…' : 'Cancel order'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
