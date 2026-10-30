import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { Spinner } from './Loader.jsx';

/**
 * Gate for signed-in-only pages (spec §4D "protected routes for account pages").
 *
 * It waits for the session restore so a hard refresh on /account does not briefly think
 * nobody is logged in and bounce the user to /login. When it does redirect, it records
 * the attempted path in location.state so /login can send them back afterwards.
 *
 * NOTE: this is a UX guard, not a security boundary. The API re-checks the JWT + role on
 * every protected request; hiding a client route proves nothing on its own.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <Spinner label="Checking your session…" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}
