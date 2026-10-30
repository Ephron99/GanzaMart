import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

// The account-section sidebar shared by Profile, Orders and Addresses pages. `active`
// marks which item is current. NavLink adds the active class automatically from the
// route, and the plain spans keep the visual rhythm for links that gate on role.
export default function AccountNav({ active }) {
  const { isAdmin } = useAuth();
  const cls = (name) => `account__nav-item${active === name ? ' account__nav-item--active' : ''}`;

  return (
    <nav className="account__nav" aria-label="Account sections">
      <NavLink to="/account" end className={() => cls('profile')}>Profile</NavLink>
      <NavLink to="/account/orders" className={() => cls('orders')}>Orders</NavLink>
      <NavLink to="/account/addresses" className={() => cls('addresses')}>Addresses</NavLink>
      <NavLink to="/cart" className={() => cls('cart')}>My cart</NavLink>
      {isAdmin && <NavLink to="/admin" className={() => cls('admin')}>Admin dashboard</NavLink>}
    </nav>
  );
}
