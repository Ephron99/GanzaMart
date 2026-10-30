// The route table. One place that answers "which page renders at which URL".
//
// Nesting under MainLayout gives every storefront page the shared header/footer and
// means those never re-mount between navigations. Protected routes are wrapped in
// <ProtectedRoute> so the auth decision lives in the router, not scattered across
// each page. The full path list mirrors the site map in docs/ARCHITECTURE.md.
import { Navigate, Route, Routes } from 'react-router-dom';
import ScrollToTop from './components/ScrollToTop.jsx';
import MainLayout from './layouts/MainLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

import Home from './pages/Home.jsx';
import Catalog from './pages/Catalog.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import Cart from './pages/Cart.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Account from './pages/Account.jsx';
import Addresses from './pages/Addresses.jsx';
import Checkout from './pages/Checkout.jsx';
import MyOrders from './pages/MyOrders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import About from './pages/About.jsx';
import Contact from './pages/Contact.jsx';
import FAQ from './pages/FAQ.jsx';
import Policies from './pages/Policies.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<Home />} />
          {/* /categories/:slug is a filter view, kept beside /products for the nav links */}
          <Route path="products" element={<Catalog />} />
          <Route path="categories/:slug" element={<Catalog />} />
          <Route path="search" element={<Catalog />} />
          <Route path="product/:id" element={<ProductDetail />} />
          <Route path="cart" element={<Cart />} />

          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />

          {/* Anything under /account needs a session; ProtectedRoute bounces a
              guest to /login and remembers where they were headed. */}
          <Route path="account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
          <Route path="account/addresses" element={<ProtectedRoute><Addresses /></ProtectedRoute>} />
          <Route path="account/orders" element={<ProtectedRoute><MyOrders /></ProtectedRoute>} />
          <Route path="account/orders/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />

          {/* Checkout is signed-in only: a guest is bounced to /login and, once back,
              the login merge has already folded their anonymous basket into the account. */}
          <Route path="checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />

          <Route path="about" element={<About />} />
          <Route path="contact" element={<Contact />} />
          <Route path="faq" element={<FAQ />} />
          <Route path="policies/:topic" element={<Policies />} />
          <Route path="policies" element={<Navigate to="/policies/shipping" replace />} />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
