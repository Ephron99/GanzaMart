// The ONE place the storefront talks HTTP.
// Pages never call axios directly: they import `api` and get a promise that either
// resolves with the API envelope ({ success, data, pagination, … }) or rejects with
// an Error whose message is safe to show to a customer.
import axios from 'axios';

const TOKEN_KEY = 'ganza_mart_token';

// localStorage throws in some private-mode browsers; a shop must not white-screen
// because of that, so every access is guarded.
export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* storage unavailable */ }
}
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
}

// The anonymous cart is keyed by a client-generated id we persist so a shopper's
// basket survives a refresh before they ever sign in. On login it is merged into the
// account cart server-side. localStorage can throw in private mode, so fall back to
// a per-tab in-memory token rather than losing the cart entirely.
const CART_SESSION_KEY = 'ganza_mart_cart_session';
let memoryCartSession = null;
const newCartSession = () =>
  (globalThis.crypto?.randomUUID?.() ?? `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

export function getCartSession() {
  try {
    let token = localStorage.getItem(CART_SESSION_KEY);
    if (!token || !/^[A-Za-z0-9-]{8,64}$/.test(token)) {
      token = newCartSession();
      localStorage.setItem(CART_SESSION_KEY, token);
    }
    return token;
  } catch {
    if (!memoryCartSession) memoryCartSession = newCartSession();
    return memoryCartSession;
  }
}

const http = axios.create({
  // Fallback keeps `npm run dev` working before anyone copies .env.example.
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Every request carries the bearer token when we have one (spec §9: the API decides
// the role, the client only presents the claim).
http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// An expired or revoked token must not leave the app in a half-logged-in state:
// the session is dropped here, once, instead of in fourteen different components.
let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && getToken()) {
      clearToken();
      onUnauthorized();
    }
    return Promise.reject(error);
  }
);

const body = (promise) => promise.then((res) => res.data);

// Cart requests always carry the anonymous session id; the bearer token (added by the
// interceptor when signed in) makes the server prefer the account cart over this one.
const cartHeaders = () => ({ headers: { 'X-Cart-Session': getCartSession() } });

export const api = {
  health: () => body(http.get('/health')),

  products: {
    // params: { search, category, minPrice, maxPrice, inStock, featured, newArrivals,
    //           sort, page, limit } — all optional, exactly as the API defines them.
    list: (params = {}) => body(http.get('/products', { params })),
    detail: (idOrSlug) => body(http.get(`/products/${idOrSlug}`)),
    related: (id) => body(http.get(`/products/${id}/related`)),
    // The reviews endpoint answers { data: [reviews], summary: {average,total,breakdown},
    // pagination }. Flatten that into the single object the review panel renders, so no
    // page has to know about the envelope split — this file owns it.
    reviews: async (id, params = {}) => {
      const res = await http.get(`/products/${id}/reviews`, { params });
      const env = res.data;
      return {
        average: env.summary?.average ?? null,
        total: env.summary?.total ?? 0,
        breakdown: env.summary?.breakdown ?? [],
        reviews: env.data ?? [],
        pagination: env.pagination,
      };
    },
  },

  categories: {
    tree: () => body(http.get('/categories')),
    flat: () => body(http.get('/categories', { params: { flat: 'true' } })),
    detail: (idOrSlug, params = {}) => body(http.get(`/categories/${idOrSlug}`, { params })),
  },

  auth: {
    register: (payload) => body(http.post('/auth/register', payload)),
    login: (payload) => body(http.post('/auth/login', payload)),
    me: () => body(http.get('/auth/me')),
    logout: () => body(http.post('/auth/logout')),
    changePassword: (payload) => body(http.post('/auth/change-password', payload)),
  },

  newsletter: { subscribe: (email) => body(http.post('/newsletter', { email })) },

  contact: { send: (payload) => body(http.post('/contact', payload)) },

  // The cart is the server's truth: every mutator returns the FULL rebuilt cart, so
  // the badge and cart page stay authoritative without a second round-trip. The
  // anonymous session id rides along as a header; a bearer token (when present) makes
  // the server use the account cart instead.
  cart: {
    get: () => body(http.get('/cart', cartHeaders())),
    add: (productId, quantity = 1) => body(http.post('/cart/items', { productId, quantity }, cartHeaders())),
    setQuantity: (productId, quantity) => body(http.put(`/cart/items/${productId}`, { quantity }, cartHeaders())),
    remove: (productId) => body(http.delete(`/cart/items/${productId}`, cartHeaders())),
    clear: () => body(http.delete('/cart', cartHeaders())),
    // Authenticated: fold this browser's anonymous basket into the account cart.
    merge: (sessionToken) => body(http.post('/cart/merge', { sessionToken })),
  },

  addresses: {
    list: () => body(http.get('/addresses')),
    create: (payload) => body(http.post('/addresses', payload)),
    update: (id, payload) => body(http.put(`/addresses/${id}`, payload)),
    makeDefault: (id) => body(http.patch(`/addresses/${id}/default`)),
    remove: (id) => http.delete(`/addresses/${id}`).then((res) => res.data),
  },

  // Checkout and order history — all authenticated. `place` returns the full created
  // order; the client sends only an address id, a payment method and an optional
  // coupon code, never prices or totals (the server is the authority).
  orders: {
    place: (payload) => body(http.post('/orders', payload)),
    list: (params = {}) => body(http.get('/orders', { params })),
    detail: (id) => body(http.get(`/orders/${id}`)),
    cancel: (id, reason) => body(http.post(`/orders/${id}/cancel`, reason ? { reason } : {})),
  },

  coupons: {
    // Read-only discount preview priced against the shopper's live cart.
    validate: (code) => body(http.post('/coupons/validate', { code })),
  },
};

export { http };
