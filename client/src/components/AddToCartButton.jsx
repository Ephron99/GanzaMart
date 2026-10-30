import { useEffect, useRef, useState } from 'react';
import { useCart } from '../hooks/useCart.js';
import { cx } from '../utils/format.js';

// Turn an API product into the small snapshot the cart stores. Keeping the mapping
// here (one place) guarantees the card, the detail page and the "related" rail all
// add the exact same line shape.
export function toCartLine(product) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    imageUrl: product.imageUrl,
    unitPrice: Number(product.effectivePrice ?? product.discountPrice ?? product.price),
    currency: product.currency ?? 'RWF',
    stock: Number(product.stock) || 0,
    categorySlug: product.category?.slug ?? null,
  };
}

/**
 * The one implementation of "Add to cart" (spec §4B/§4C). Every card and the detail
 * page use this, so the button state, the out-of-stock guard and the brief "Added ✓"
 * confirmation can never drift out of sync between pages.
 */
export default function AddToCartButton({ product, quantity = 1, block = false, size = 'sm' }) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const outOfStock = Number(product.stock) <= 0;

  // Clear the pending "Added" reset if the unmounts/remounts (e.g. it navigated away).
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setAdded(false); setFailed(false); }, 1500);
  };

  // The cart is server-backed now, so adding is awaited: the API may reject (the item
  // sold out since the page loaded), and the button must reflect that, not assume success.
  const handleClick = async () => {
    if (outOfStock || busy) return;
    setBusy(true);
    try {
      await addItem(toCartLine(product), quantity);
      setAdded(true);
      flash();
    } catch {
      setFailed(true);
      flash();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={cx('btn', 'btn--primary', block && 'btn--block', size === 'sm' ? 'btn--sm' : '')}
      onClick={handleClick}
      disabled={outOfStock || busy}
      aria-label={outOfStock ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
    >
      {outOfStock ? 'Out of stock' : busy ? 'Adding…' : failed ? 'Unavailable' : added ? 'Added ✓' : 'Add to cart'}
    </button>
  );
}
