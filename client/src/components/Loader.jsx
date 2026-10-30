// A single spinner + a grid of skeleton cards. Pages show these while the first
// request is in flight (there is no previous data to keep on screen yet).
export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="loader-block" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="muted text-sm">{label}</span>
    </div>
  );
}

// Count matches the CSS grid so the skeleton fills the same space the cards will.
export function SkeletonGrid({ count = 8 }) {
  return (
    <div className="product-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-card__media shimmer" />
          <div className="skeleton-card__line shimmer" style={{ width: '60%' }} />
          <div className="skeleton-card__line shimmer" />
          <div className="skeleton-card__line skeleton-card__line--short shimmer" />
        </div>
      ))}
    </div>
  );
}
