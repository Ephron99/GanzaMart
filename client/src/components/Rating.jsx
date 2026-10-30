import { cx, pluralise } from '../utils/format.js';

/**
 * Star rating with fractional fill.
 *
 * Five hollow stars are drawn, then a clipped orange layer is width-set to the score
 * percentage. This is why a 4.3 shows four full stars and a third of the fifth, instead
 * of rounding to "4" or "5" and lying to the shopper. The accessible label carries the
 * exact number so screen readers never depend on the pixels.
 */
export default function Rating({ rating, reviewCount = 0, size = 'sm', showCount = true }) {
  const value = rating == null ? 0 : Number(rating);
  const pct = `${(value / 5) * 100}%`;
  const stars = '★★★★★';

  return (
    <span
      className={cx('rating', size === 'lg' && 'rating--lg')}
      title={rating == null ? 'No reviews yet' : `${value} out of 5`}
      aria-label={rating == null ? 'No reviews yet' : `Rated ${value} out of 5 from ${pluralise(reviewCount, 'review')}`}
    >
      <span className="rating__stars" aria-hidden="true">
        <span className="rating__stars-empty">{stars}</span>
        <span className="rating__stars-fill" style={{ width: pct }}>{stars}</span>
      </span>
      <span className="rating__value">
        {rating == null ? 'No reviews yet' : value.toFixed(1)}
        {rating != null && showCount ? ` (${reviewCount})` : ''}
      </span>
    </span>
  );
}
