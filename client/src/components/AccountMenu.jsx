import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';

/**
 * The header account control. A guest sees "Sign in"; a shopper sees their name and a
 * menu; an admin additionally sees the Dashboard link. Rendering is driven purely by the
 * role the API returned at login — this component never guesses a permission, and the
 * server re-checks every admin route regardless of what is shown here.
 */
export default function AccountMenu() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  // Dismiss when clicking outside the menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!isAuthenticated) {
    return (
      <div className="account-menu">
        <Link className="account-menu__toggle" to="/login">
          <UserRound size={16} aria-hidden="true" />
          <span>Sign in</span>
        </Link>
      </div>
    );
  }

  async function handleLogout() {
    setOpen(false);
    await logout();
    navigate('/');
  }

  const initials = user.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className="account-menu__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="account-menu__avatar" aria-hidden="true">{initials}</span>
        <span className="account-menu__name">{user.fullName.split(' ')[0]}</span>
      </button>

      {open && (
        <div className="account-menu__list" role="menu">
          <div className="account-menu__header">
            <strong>{user.fullName}</strong>
            {user.email}
          </div>
          <Link role="menuitem" className="account-menu__item" to="/account" onClick={() => setOpen(false)}>My account</Link>
          <Link role="menuitem" className="account-menu__item" to="/cart" onClick={() => setOpen(false)}>Cart</Link>
          {isAdmin && <Link role="menuitem" className="account-menu__item" to="/admin" onClick={() => setOpen(false)}>Admin dashboard</Link>}
          <button role="menuitem" className="account-menu__item" onClick={handleLogout}>Sign out</button>
        </div>
      )}
    </div>
  );
}
