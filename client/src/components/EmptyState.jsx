import { Link } from 'react-router-dom';

/**
 * The "nothing here" screen — used for an empty search, an out-of-stock filter, etc.
 * `action` lets the page offer the single obvious next step (clear filters, browse all)
 * rather than stranding the shopper on a blank grid.
 */
export default function EmptyState({ icon = '🔍', title, children, action }) {
  return (
    <div className="state">
      {icon && <div className="state__icon" aria-hidden="true">{icon}</div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && (
        <Link className="btn btn--teal" to={action.to}>{action.label}</Link>
      )}
    </div>
  );
}
