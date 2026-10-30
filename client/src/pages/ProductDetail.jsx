import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Breadcrumb from '../components/Breadcrumb.jsx';
import Price from '../components/Price.jsx';
import Rating from '../components/Rating.jsx';
import Badge from '../components/Badge.jsx';
import QuantityStepper from '../components/QuantityStepper.jsx';
import AddToCartButton from '../components/AddToCartButton.jsx';
import ProductCard from '../components/ProductCard.jsx';
import ReviewList from '../components/ReviewList.jsx';
import { Spinner } from '../components/Loader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { useAsyncData } from '../hooks/useAsyncData.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { api } from '../services/api.js';
import { resolveImageUrl, cx, formatMoney } from '../utils/format.js';

// Product detail (spec §4C): gallery, price + discount, stock, quantity selector that
// cannot exceed stock, category, rating + reviews, add-to-cart and related products.
// The single /api/products/:id call returns the product, its gallery and a related rail
// in one round-trip; reviews load separately so a slow reviews query never blocks the buy
// controls.
export default function ProductDetail() {
  const { id } = useParams();
  const { data, loading, error, reload } = useAsyncData(() => api.products.detail(id), [id]);

  const product = data?.data?.product;
  const images = data?.data?.images ?? [];
  const related = data?.data?.related ?? [];

  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);

  // A new product must reset the gallery/quantity selection, or you'd open product B
  // still showing product A's thumbnail index and leftover quantity.
  useEffect(() => { setActiveImg(0); setQty(1); }, [id]);

  // Reviews load in one request (up to the API's 50-row page cap). The seed carries only
  // a handful per product, so paging is unnecessary here and would only complicate the
  // read-only panel; the write path arrives with orders in a later phase.
  const reviews = useAsyncData(() => api.products.reviews(id, { page: 1, limit: 50 }), [id]);

  useDocumentTitle(product ? product.name : 'Product');

  if (loading && !product) return <Spinner label="Loading product…" />;
  if (error && !product) return <ErrorState message={error} onRetry={reload} />;
  if (!product) return null;

  const stock = Number(product.stock);
  const saveAmount = product.discountPrice != null ? Number(product.price) - Number(product.discountPrice) : 0;

  return (
    <>
      <Breadcrumb
        items={[
          { label: 'Products', to: '/products' },
          { label: product.category?.name ?? 'Category', to: `/categories/${product.category?.slug ?? ''}` },
          { label: product.name },
        ]}
      />

      <div className="pdp">
        {/* ── Gallery ────────────────────────────────────────────────────── */}
        <div className="pdp__gallery">
          <div className="pdp__stage">
            <img
              src={resolveImageUrl(images[activeImg]?.url ?? product.imageUrl)}
              alt={images[activeImg]?.altText ?? product.name}
              width="600"
              height="600"
            />
          </div>
          {images.length > 1 && (
            <div className="pdp__thumbs">
              {images.map((img, i) => (
                <button
                  key={img.id ?? `main-${i}`}
                  type="button"
                  className={cx('pdp__thumb', i === activeImg && 'pdp__thumb--active')}
                  onClick={() => setActiveImg(i)}
                  aria-label={`View image ${i + 1}`}
                >
                  <img src={resolveImageUrl(img.url)} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Buy box ────────────────────────────────────────────────────── */}
        <div className="pdp__info">
          <div>
            <Link to={`/categories/${product.category?.slug ?? ''}`} className="card__category">
              {product.category?.name}
            </Link>
            <h1 className="pdp__name">{product.name}</h1>
          </div>

          <div className="pdp__flags">
            {product.isFeatured && <Badge variant="sale">Featured</Badge>}{' '}
            {product.isNewArrival && <Badge variant="new">New</Badge>}
          </div>

          <Rating rating={product.rating} reviewCount={product.reviewCount} size="lg" />

          <div>
            <Price price={product.price} discountPrice={product.discountPrice} size="lg" />
            {saveAmount > 0 && <div className="pdp__save">You save {formatMoney(saveAmount)}</div>}
          </div>

          <StockLine stock={stock} />

          <p className="pdp__desc">{product.description}</p>

          {/* Quantity + add-to-cart. The stepper's max is the live stock, so the UI
              physically cannot ask for more units than exist (spec §4C). AddToCartButton
              is the one shared implementation, so the confirmation and disabled state
              match every card in the store. */}
          <div className="pdp__buy">
            <QuantityStepper value={qty} onChange={setQty} max={Math.max(stock, 1)} disabled={stock === 0} />
            <AddToCartButton product={product} quantity={qty} size="md" block />
          </div>

          <div className="pdp__meta">
            <div>SKU: <strong>{product.sku ?? '—'}</strong></div>
            <div>Availability: <strong>{stock > 0 ? `${stock} in stock` : 'Out of stock'}</strong></div>
            <div>Category: <Link to={`/categories/${product.category?.slug ?? ''}`}>{product.category?.name}</Link></div>
          </div>
        </div>
      </div>

      {/* ── Reviews ──────────────────────────────────────────────────────── */}
      <section className="section">
        <div className="section-head"><h2>Ratings &amp; reviews</h2></div>
        <ReviewList
          data={reviews.data}
          loading={reviews.loading}
          error={reviews.error}
          onRetry={reviews.reload}
        />
      </section>

      {/* ── Related ──────────────────────────────────────────────────────── */}
      {related.length > 0 && (
        <section className="section--tight">
          <div className="section-head"><h2>You may also like</h2></div>
          <div className="product-grid product-grid--rails">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </>
  );
}

function StockLine({ stock }) {
  if (stock === 0) return <p className="pdp__stock pdp__stock--out">Currently out of stock.</p>;
  if (stock <= 5) return <p className="pdp__stock pdp__stock--low">Hurry — only {stock} left in stock.</p>;
  return <p className="pdp__stock pdp__stock--in">In stock and ready to ship.</p>;
}
