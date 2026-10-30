import ProductCard from './ProductCard.jsx';
import { SkeletonGrid } from './Loader.jsx';
import ErrorState from './ErrorState.jsx';
import EmptyState from './EmptyState.jsx';

/**
 * Grid wrapper that owns the three non-happy states every product listing hits, so no
 * page has to repeat the loading/error/empty branch. Pass the raw useAsyncData result
 * fields and it picks what to render.
 */
export default function ProductGrid({
  products,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = 'No products found',
  emptyHint,
  emptyAction,
  skeleton = 8,
}) {
  if (loading && !products) return <SkeletonGrid count={skeleton} />;

  if (error && !products) return <ErrorState message={error} onRetry={onRetry} />;

  if (!products || products.length === 0) {
    return <EmptyState icon="🧺" title={emptyTitle} action={emptyAction}>{emptyHint}</EmptyState>;
  }

  return (
    <>
      {loading && (
        <p className="muted text-sm" aria-live="polite" style={{ marginBottom: 'var(--space-3)' }}>
          Updating…
        </p>
      )}
      <div className="product-grid">
        {products.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </>
  );
}
