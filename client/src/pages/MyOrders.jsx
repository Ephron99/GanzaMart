import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AccountNav from '../components/AccountNav.jsx';
import OrderStatusBadge from '../components/OrderStatusBadge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { Spinner } from '../components/Loader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { api } from '../services/api.js';
import { formatMoney, formatDate, readableError } from '../utils/format.js';

// The customer's order history (spec §4E). Read-only list; tapping a row opens the
// detail with items, payment, shipment and the status timeline. Ownership is enforced
// server-side — this endpoint only ever returns the signed-in user's own orders.
export default function MyOrders() {
  useDocumentTitle('My orders');
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (targetPage) => {
    setLoading(true);
    setError(null);
    try {
      const env = await api.orders.list({ page: targetPage, limit: 10 });
      setOrders(env.data);
      setPagination(env.pagination);
      setPage(targetPage);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  return (
    <>
      <h1 className="page-title">My orders</h1>
      <p className="page-intro">Every order you've placed, newest first.</p>

      <div className="account">
        <AccountNav active="orders" />

        <div className="stack">
          <section className="panel">
            {loading ? <Spinner label="Loading your orders…" />
              : error ? <ErrorState message={error} onRetry={() => load(page)} />
              : orders.length === 0 ? (
              <EmptyState icon="📦" title="No orders yet" action={{ to: '/products', label: 'Start shopping' }}>
                When you place an order it will appear here.
              </EmptyState>
            ) : (
              <>
                <ul className="orders__list">
                  {orders.map((o) => (
                    <li key={o.id} className="orders__item">
                      <div className="orders__item-head">
                        <Link to={`/account/orders/${o.id}`} className="orders__number">{o.orderNumber}</Link>
                        <OrderStatusBadge status={o.status} />
                      </div>
                      <div className="orders__item-meta muted text-sm">
                        <span>{formatDate(o.createdAt)}</span>
                        <span>{o.itemCount ?? 0} item(s)</span>
                        <strong>{formatMoney(o.totalAmount)}</strong>
                      </div>
                      <Link className="btn btn--sm btn--outline" to={`/account/orders/${o.id}`}>View details</Link>
                    </li>
                  ))}
                </ul>

                {pagination && pagination.pages > 1 && (
                  <div className="orders__pager">
                    <button type="button" className="btn btn--sm btn--outline"
                      disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button>
                    <span className="text-sm muted">Page {pagination.page} of {pagination.pages}</span>
                    <button type="button" className="btn btn--sm btn--outline"
                      disabled={page >= pagination.pages} onClick={() => load(page + 1)}>Next</button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
