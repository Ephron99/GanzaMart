/**
 * The failure screen. Shows the human-readable message that useAsyncData already
 * extracted (readableError), and — when a `onRetry` is passed — a button to try again,
 * because the most common cause (the API was still booting) is transient.
 */
export default function ErrorState({ message, onRetry }) {
  return (
    <div className="state" role="alert">
      <div className="state__icon" aria-hidden="true">⚠️</div>
      <h3>Something went wrong</h3>
      <p>{message || 'We could not load this content.'}</p>
      {onRetry && (
        <button type="button" className="btn btn--outline" onClick={onRetry}>Try again</button>
      )}
    </div>
  );
}
