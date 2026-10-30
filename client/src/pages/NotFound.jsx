import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

// 404 (spec §4). Kept cheerful and useful — point the visitor back to the two places
// they most likely wanted, instead of a dead end.
export default function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <div className="notfound">
      <div className="notfound__code" aria-hidden="true">404</div>
      <h1>We couldn't find that page</h1>
      <p>The link may be broken, or the page may have moved. Let's get you back to shopping.</p>
      <div className="hero__actions" style={{ justifyContent: 'center' }}>
        <Link className="btn btn--primary" to="/">Go to home</Link>
        <Link className="btn btn--outline" to="/products">Browse products</Link>
      </div>
    </div>
  );
}
