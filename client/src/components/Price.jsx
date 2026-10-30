import { formatMoney, discountPercent, cx } from '../utils/format.js';

/**
 * The two-price display the spec asks for everywhere a product appears: the effective
 * price, and — when discounted — the struck-out original plus the "-N%".
 *
 * Passing the resolved numbers (price/discountPrice) rather than a whole product keeps
 * this dumb and reusable: the card, the detail page and the cart line all render it the
 * same way from whatever shape they hold.
 */
export default function Price({ price, discountPrice, size = 'md', className }) {
  const effective = discountPrice != null && Number(discountPrice) < Number(price)
    ? Number(discountPrice)
    : Number(price);
  const pct = discountPercent(price, discountPrice);

  return (
    <span className={cx('card__price', size === 'lg' && 'pdp__price', className)}>
      <span className="price-now">{formatMoney(effective)}</span>
      {pct != null && (
        <span className="price-was">{formatMoney(price)}</span>
      )}
      {pct != null && size === 'lg' && (
        <span className="pdp__save">Save {pct}%</span>
      )}
    </span>
  );
}
