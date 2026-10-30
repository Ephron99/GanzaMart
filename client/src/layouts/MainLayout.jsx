import { Outlet, useLocation } from 'react-router-dom';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

/**
 * The shared shell. Header + category nav on top, the routed page in the middle
 * (<Outlet/>), footer below. Because it renders once and only the <Outlet/> swaps, the
 * header's category fetch and the cart badge survive every navigation.
 *
 * #root is a flex column (base.css), so `main { flex: 1 }` pins the footer to the
 * bottom even on short pages like the 404.
 */
export default function MainLayout() {
  const location = useLocation();
  return (
    <>
      <Header />
      <main className="main" id="main">
        <div className="container">
          {/* One unexpected render error in a page should not blank the whole storefront:
              the boundary keeps header/footer/cart alive and offers a retry. Keying it to
              the pathname means navigating away auto-resets a caught error. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
      <Footer />
    </>
  );
}
