import Rating from './Rating.jsx';
import Badge from './Badge.jsx';
import { Spinner } from './Loader.jsx';
import ErrorState from './ErrorState.jsx';
import { formatDate, pluralise } from '../utils/format.js';

/**
 * Read-only reviews panel for the product detail page (spec §3C: "product rating and
 * reviews"). The star summary, the 5→1 histogram bars and the individual reviews all
 * come from the ONE /api/products/:id/reviews response, so the headline average, the
 * bars and the list can never contradict each other.
 *
 * Posting a review is deliberately absent: per the spec a review may only come from a
 * customer with a real order, and that write path arrives with orders in a later phase.
 */
export default function ReviewList({ data, loading, error, onRetry, hasMore, onLoadMore }) {
  if (loading && !data) return <Spinner label="Loading reviews…" />;
  if (error && !data) return <ErrorState message={error} onRetry={onRetry} />;
  if (!data) return null;

  const { average, total, breakdown, reviews } = data;
  const maxCount = Math.max(1, ...breakdown.map((b) => b.count));

  if (total === 0) {
    return <p className="muted text-sm">No reviews yet — be the first to buy and review this product.</p>;
  }

  return (
    <div>
      <div className="review-summary">
        <div className="review-summary__score">
          <div className="review-summary__number">{Number(average).toFixed(1)}</div>
          <Rating rating={Number(average)} showCount={false} size="lg" />
          <div className="text-sm muted">{pluralise(total, 'review')}</div>
        </div>
        <div className="review-bars">
          {breakdown.map((b) => (
            <div className="review-bar" key={b.rating}>
              <span>{b.rating} ★</span>
              <span className="review-bar__track">
                <span className="review-bar__fill" style={{ width: `${(b.count / maxCount) * 100}%` }} />
              </span>
              <span>{b.count}</span>
            </div>
          ))}
        </div>
      </div>

      <ul className="review-list">
        {reviews.map((r) => (
          <li className="review" key={r.id}>
            <div className="review__head">
              <span>
                <span className="review__author">{r.author}</span>{' '}
                {r.verifiedPurchase && <Badge variant="verified">Verified buyer</Badge>}
              </span>
              <Rating rating={r.rating} showCount={false} />
            </div>
            {r.title && <div className="review__title">{r.title}</div>}
            <p className="review__body">{r.comment}</p>
            <div className="review__foot">Reviewed {formatDate(r.createdAt)}</div>
          </li>
        ))}
      </ul>

      {hasMore && (
        <button type="button" className="btn btn--outline btn--sm" style={{ marginTop: 'var(--space-4)' }} onClick={onLoadMore}>
          Show more reviews
        </button>
      )}
    </div>
  );
}
