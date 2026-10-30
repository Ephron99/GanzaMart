import { Link } from 'react-router-dom';
import Badge from './Badge.jsx';
import Price from './Price.jsx';
import Rating from './Rating.jsx';
import AddToCartButton from './AddToCartButton.jsx';
import { resolveImageUrl, discountPercent, cx } from '../utils/format.js';

/**
 * The product card — the single most-reused component in the storefront (home rails,
 * catalogue grid, related products). It renders exactly the fields the spec lists for a
 * catalogue item: image, name, price + discounted price, category, stock status, rating,
 * "View details" and "Add to cart".
 *
 * `to` is built from the numeric id because that is what /api/products/:id accepts; the
 * slug is carried in the link's title for a readable hover, not the URL.
 */
export default function ProductCard({ product, className }) {
  const pct = discountPercent(product.price, product.discountPrice);
  const lowStock = product.stock > 0 && product.stock <= 5;

  return (
    <article className={cx('card', className)}>
      <div className="card__flags">
        {pct != null && <Badge variant="sale">-{pct}%</Badge>}
        {product.isNewArrival && <Badge variant="new">New</Badge>}
        {product.stock === 0 && <Badge variant="out">Sold out</Badge>}
        {lowStock && <Badge variant="low">Only {product.stock} left</Badge>}
      </div>

      <Link className="card__media" to={`/product/${product.id}`} aria-label={product.name}>
        <img
          src={resolveImageUrl(product.imageUrl)}
          alt={product.name}
          loading="lazy"
          width="600"
          height="600"
        />
      </Link>

      <div className="card__body">
        <Link className="card__category" to={`/categories/${product.category?.slug ?? ''}`}>
          {product.category?.name ?? 'Uncategorised'}
        </Link>
        <h3 className="card__title" title={product.name}>
          <Link to={`/product/${product.id}`}>{product.name}</Link>
        </h3>

        <Rating rating={product.rating} reviewCount={product.reviewCount} />

        <Price price={product.price} discountPrice={product.discountPrice} />

        <div className="card__meta">
          <span>{product.inStock ? 'In stock' : 'Out of stock'}</span>
          <span>{product.soldCount > 0 ? `${product.soldCount} sold` : ''}</span>
        </div>

        <div className="card__actions">
          <Link className="btn btn--outline btn--sm" to={`/product/${product.id}`}>View details</Link>
          <AddToCartButton product={product} />
        </div>
      </div>
    </article>
  );
}
