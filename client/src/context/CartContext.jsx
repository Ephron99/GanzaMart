// The shopping cart, now backed by the SERVER (Phase 7). The old localStorage version
// was a display-only convenience; this one keeps the SAME consumer surface
// (lines / itemCount / subtotal / addItem / setQuantity / removeItem / clearCart) so
// the header badge, product cards and the cart page did not need rewriting — but every
// number now comes from the API, which re-derives prices and clamps quantities to real
// stock. The client can no longer be the authority on its own total.
//
// Identity: an anonymous shopper gets a session cart (keyed by the id in api.js); a
// signed-in customer gets their persistent account cart. When authentication flips on,
// the anonymous basket is merged into the account cart so nothing typed before sign-in
// is lost.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getCartSession } from '../services/api.js';
import { useAuth } from './AuthContext.jsx';

const CartContext = createContext(null);

// Map the server's cart line to the shape the whole UI already renders against.
const toLine = (item) => ({
  id: item.productId,
  productId: item.productId,
  name: item.name,
  slug: item.slug,
  imageUrl: item.imageUrl,
  categorySlug: item.categorySlug,
  unitPrice: item.unitPrice,
  listPrice: item.listPrice,
  onSale: item.onSale,
  currency: item.currency,
  quantity: item.quantity,
  stock: item.stock,
  inStock: item.inStock,
  exceedsStock: item.exceedsStock,
  lineTotal: item.lineTotal,
});

const EMPTY = { items: [], itemCount: 0, subtotal: 0, canCheckout: false };

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Apply a server cart envelope to local state.
  const applyCart = useCallback((data) => {
    setCart({
      ...EMPTY,
      ...data,
      items: (data?.items ?? []).map(toLine),
    });
  }, []);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const env = await api.cart.get();
      applyCart(env.data);
    } catch (err) {
      setError(err.response?.data?.error ?? err.message ?? 'Could not load your cart.');
    } finally {
      setLoading(false);
    }
  }, [applyCart]);

  // Load once when the provider mounts (this already returns the account cart if a
  // bearer token is present, thanks to the api interceptor).
  useEffect(() => {
    // Phase 6 kept the whole cart in localStorage under this key; the server is the
    // authority now, so drop the stale mirror so nobody debugs against dead data.
    try { localStorage.removeItem('ganza_mart_cart'); } catch { /* private mode etc. */ }
    reload();
  }, [reload]);

  // When the shopper signs in (user id goes from none → some), merge the anonymous
  // basket and reload. A ref makes this fire exactly per sign-in, not on every render.
  const lastMergedFor = useRef(null);
  useEffect(() => {
    const uid = user?.id ?? null;
    if (uid && lastMergedFor.current !== uid) {
      lastMergedFor.current = uid;
      (async () => {
        try {
          const env = await api.cart.merge(getCartSession());
          applyCart(env.data);
        } catch {
          // A failed merge must not strand the shopper — just show their account cart.
          reload();
        }
      })();
    } else if (!uid) {
      // Signed out: reset so the next sign-in re-merges, and show the (now empty)
      // anonymous session cart again.
      lastMergedFor.current = null;
      reload();
    }
  }, [user?.id, applyCart, reload]);

  // Mutators return the rebuilt cart, so they refresh state directly. They rethrow on
  // failure so the caller (e.g. the Add-to-cart button) can surface the reason.
  const run = useCallback(async (promise) => {
    const env = await promise;
    applyCart(env.data);
    return env.data;
  }, [applyCart]);

  const addItem = useCallback(
    (line, qty = 1) => run(api.cart.add(line.id ?? line.productId, qty)),
    [run],
  );
  const setQuantity = useCallback(
    (id, quantity) => run(api.cart.setQuantity(id, quantity)),
    [run],
  );
  const removeItem = useCallback((id) => run(api.cart.remove(id)), [run]);
  const clearCart = useCallback(() => run(api.cart.clear()), [run]);

  const value = useMemo(() => ({
    lines: cart.items,
    itemCount: cart.itemCount,
    subtotal: cart.subtotal,
    canCheckout: cart.canCheckout,
    loading,
    error,
    addItem,
    setQuantity,
    removeItem,
    clearCart,
    reload,
  }), [cart, loading, error, addItem, setQuantity, removeItem, clearCart, reload]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart() must be used inside <CartProvider>.');
  return ctx;
}
