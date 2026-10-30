# Phase 6 — React Layout, Routing & Catalogue Storefront

The customer-facing shop front. It consumes **exactly** the endpoints built in Phases
4–5 (`/api/auth/*`, `/api/products`, `/api/products/:id`, `/api/products/:id/reviews`,
`/api/categories`) and adds nothing to the server. This is the browse-and-basket half of
the store: Home, Catalogue, Product detail, Cart, Auth and the account/static pages.
Checkout, orders and the admin dashboard are Phases 7–10.

Stack: Vite 8 · React 18 · react-router-dom 7 · axios. State is Context API only — no
Redux. All styling is hand-written CSS3 (Flexbox + Grid) across four files, with a fixed
design-token palette; there is no CSS framework.

## File map (`client/src/`)

| Area | Files | Responsibility |
|---|---|---|
| Entry | `main.jsx` | Mounts React, wraps `AuthProvider` + `CartProvider`, loads the 4 CSS files in order |
| Routing | `App.jsx` | The whole URL → page table; nests everything under `MainLayout` |
| Layout | `layouts/MainLayout.jsx` | Header + `<main>` + Footer shell; wraps routed content in `ErrorBoundary` |
| HTTP boundary | `services/api.js` | The ONE place that talks HTTP: axios instance, token interceptors, grouped `api` |
| Auth state | `context/AuthContext.jsx` | Session from `GET /api/auth/me`, login/register/logout, 401 auto-signout |
| Cart state | `context/CartContext.jsx` | Reducer + localStorage persistence; stock-clamped quantities; display totals |
| Hooks | `hooks/useAsyncData.js` `useDebouncedValue.js` `useAuth.js` `useCart.js` `useDocumentTitle.js` | Data-fetch with race guard, search settling, context accessors, `<title>` |
| Pages | `pages/*.jsx` (11) | Home, Catalog, ProductDetail, Cart, Login, Register, Account, About, Contact, FAQ, Policies, NotFound |
| Components | `components/*.jsx` (24) | Header, SearchBar, ProductCard/Grid, Rating, Price, Badge, ReviewList, Pagination, QuantityStepper, AddToCartButton, Field/PasswordField, ErrorBoundary, etc. |
| Styles | `styles/{base,layout,components,pages}.css` | Tokens + reset → shell → reusable UI → page-specific |
| Utils | `utils/format.js` | `formatMoney`, `resolveImageUrl`, `formatDate`, `pluralise`, `cx`, `discountPercent` |
| Assets | `public/images/products/*.svg`, `public/favicon.svg` | 23 product glyphs + placeholder, generated (see below) |

**Why one `api.js`?** Pages never `import axios`. They call `api.products.list(params)`
and get back either the envelope or an `Error` whose message is safe to show a customer.
The bearer token, the 15s timeout and the "token expired → sign out everywhere" rule all
live in that one file, so fourteen components can't drift into fourteen different fetch
strategies.

## Routing

Routes mirror the site map, nested under `MainLayout` so the header/footer and the cart
badge never re-mount between pages — only the `<Outlet/>` swaps.

```
/                    Home                    /login          Login
/products            Catalog (all)           /register       Register
/categories/:slug    Catalog (filtered)      /account        Account (ProtectedRoute)
/search              Catalog (query)         /about /contact /faq /policies/:topic
/product/:id         ProductDetail           *               NotFound (404)
/cart                Cart
```

`ProtectedRoute` reads the auth context and bounces a guest to `/login`, remembering the
attempted path in `location.state.from` so a successful sign-in returns them there. The
`Catalog` component powers three URLs (`/products`, `/categories/:slug`, `/search`) from
one code path — the path slug and the query string both feed a single query object.

## URL is the source of truth (the catalogue)

`Catalog` keeps every filter in the address bar via `useSearchParams`, so a filtered,
sorted, paginated view is shareable and survives a refresh or the back button. Changing
the search box, a category checkbox, a price range, `inStock`, sort or page all rewrite
the query and reset `page` to 1. Typing in the sidebar search is run through
`useDebouncedValue` so one search term fires one request once the shopper stops typing,
not one per keystroke. `sort` is limited to the same whitelist the server accepts
(`newest`, `price-asc`, `best-selling`, `rating-desc`, …) so the dropdown can never send
a value the API would reject.

## Data fetching & the reviews shape

`useAsyncData` guards against out-of-order responses with a `requestId` ref and keeps the
previous data during a reload, so switching pages never flashes an empty grid.

The product-detail page loads the product bundle (`/api/products/:id` returns product +
gallery + related in one round-trip) and the reviews separately, so a slow reviews query
never blocks the buy controls. The reviews endpoint answers
`{ data: [reviews], summary: { average, total, breakdown }, pagination }`. Rather than
make the page know about that split, **`api.products.reviews` flattens the envelope at
the boundary** into the single `{ average, total, breakdown, reviews, pagination }` object
the `ReviewList` panel renders. This was the Phase-6 bug: passing the raw envelope to a
component that destructured `{ breakdown }` threw on `breakdown.map()` and blanked the
whole page.

## Cart is display-only, the server is the authority

`CartContext` persists to `localStorage` (guarded — private-mode browsers throw) and
clamps every quantity to the product's live stock on `add`/`setQuantity`. The subtotal
shown in the header badge and on `/cart` is **for display only**; when checkout arrives in
Phase 7 the server re-prices every line from the database. The client can lie about its
own totals; the API never trusts them.

## Defensive rendering

An `ErrorBoundary` (a class component — React has no hook for boundaries) wraps the routed
content and is keyed to the current pathname, so one unexpected render error shows a
recoverable "Try again" panel instead of unmounting the entire app to a white page, and
navigating away auto-clears it. Every async panel also has its own `Loader` / `ErrorState`
/ `EmptyState`, so loading, failure and "no results" each look intentional.

## Assets

The 23 products in `seed.sql` each reference an SVG (e.g. `images/products/phone-galaxy.svg`)
that did not exist on disk. `client/tools/generate-product-art.mjs` writes them (plus
`placeholder.svg` and the favicon): a gradient panel, a category glyph, a name banner. They
are committed under `public/`, so the catalogue renders with real artwork and zero broken
images. Rerun with `node tools/generate-product-art.mjs` (idempotent).

## Design tokens

All colour is a CSS variable in `base.css` `:root`; no hex literals appear anywhere else.

```
--color-primary:#087F86   --color-primary-dark:#075E63   --color-accent:#FF6B1A
--color-charcoal:#20292B  --color-background:#F2F5F4      --color-border:#D9E1DF
```

Mobile-first; layout breakpoints at 640 / 900 / 1200px. The catalogue sidebar is a sticky
side rail only at ≥900px — below that it is a full-width panel that scrolls away rather
than sticking on top of the grid.

## Try it yourself

```powershell
# one terminal: the API (from an earlier phase)
cd server ; npm run dev            # http://localhost:5000

# second terminal: the storefront
cd client ; npm run dev            # http://localhost:5173

# production build check (what CI would run)
cd client ; npm run build          # → dist/, 130 modules, ~304 kB JS / 31 kB CSS
```

The dev server deliberately binds `localhost:5173` with `strictPort`; the API's CORS is
already configured for `CLIENT_URL=http://localhost:5173`. Sign in with the seeded demo
account (see `database/seed.sql`) to exercise the protected `/account` route.

## Verification performed (end of phase)

* `npm run build` — clean, 130 modules, no errors.
* Live browser walkthrough of Home, Catalogue (search / category / price / sort / page),
  Login, Register, Account (protected), Cart, About / Contact / FAQ / Policies, 404 —
  all render against the running `:5000` API.
* **Product detail re-check after the reviews fix**: `/product/1` and a second product
  (`/product/9`) both render fully — gallery + thumbnails, price with struck-through
  discount and "You save", stock line, quantity stepper capped at live stock, working
  "Add to cart" (header badge increments), the "Ratings & reviews" panel with histogram,
  and the "You may also like" rail. **Browser console: 0 errors, 0 warnings.**

## Known limitations (deliberate, for this teaching build)

* Add-to-cart is fully functional; **checkout is not** — the cart only proves state. The
  server re-prices at checkout in Phase 7, when cart contents should move server-side.
* The reviews panel is **read-only**: per the spec a review may only come from a customer
  with a real order, so the write path arrives with orders.
* Cart lives in `localStorage`. Two tabs share it; a logged-in user's cart does not yet
  survive a device switch (that needs a server-side cart, Phase 7+).
* Auth "session" is the JWT in `localStorage` re-validated by `GET /api/auth/me` on boot;
  there is no silent refresh token rotation in this phase.

**Next:** Phase 7 — Cart & checkout: a server-side cart, address handling, order creation
and the `/api/checkout` endpoint that turns a basket into a real order.
