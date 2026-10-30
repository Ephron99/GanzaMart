# Phase 7 — Server-Side Cart & Address Book

The cart stops being a browser bookmark and becomes real data. Before this phase the
basket lived in `localStorage` and only existed on one device; now **MySQL owns the
cart** — anonymous shoppers get a session cart, signed-in customers get an account
cart, and signing in folds one into the other without losing a click. Alongside it we
add the customer **address book** (the shipping addresses checkout will use in
Phase 8). Checkout itself is *not* in this phase — the cart page's checkout button is
deliberately disabled until orders exist.

## File map

| Layer | File | Responsibility |
|---|---|---|
| Route | `src/routes/cartRoutes.js` | Which cart endpoints allow anonymous callers |
| Route | `src/routes/addressRoutes.js` | `router.use(authenticate)` — the book is strictly private |
| Validator | `src/validators/cartValidators.js` | `X-Cart-Session` header shape, product ids, quantities |
| Validator | `src/validators/addressValidators.js` | Required fields, phone/postal patterns |
| Controller | `src/controllers/cartController.js` | Resolve "whose cart is this?", call service, return rebuilt cart |
| Controller | `src/controllers/addressController.js` | Thin HTTP ⇄ service translation |
| Service | `src/services/cartService.js` | Live pricing, stock clamping, totals, merge transaction |
| Service | `src/services/addressService.js` | Default-address rules, ownership on every call |
| Model | `src/models/cartModel.js` | All SQL for `carts` + `cart_items` incl. the merge queries |
| Model | `src/models/addressModel.js` | All SQL for `addresses`, every statement scoped by `user_id` |
| Client | `src/context/CartContext.jsx` | Rewritten: same API surface, but every number comes from the server |
| Client | `src/pages/Addresses.jsx` | New address-book page (create / edit / make-default / delete) |

## Cart endpoints

| Method | URL | Auth | Purpose |
|---|---|---|---|
| GET | `/api/cart` | optional | Read the current cart |
| POST | `/api/cart/items` | optional | Add `{ productId, quantity? }` |
| PUT | `/api/cart/items/:productId` | optional | Set absolute `{ quantity }` |
| DELETE | `/api/cart/items/:productId` | optional | Remove one line |
| DELETE | `/api/cart` | optional | Empty the cart |
| POST | `/api/cart/merge` | **required** | Fold `{ sessionToken }` basket into the account cart |

## Address endpoints (all require a bearer token)

| Method | URL | Purpose |
|---|---|---|
| GET | `/api/addresses` | List my addresses (default first, no `user_id` leaked) |
| POST | `/api/addresses` | Create (first address ever becomes the default automatically) |
| GET | `/api/addresses/:id` | One address — 404 if it isn't yours |
| PUT | `/api/addresses/:id` | Full update |
| PATCH | `/api/addresses/:id/default` | Make it the default |
| DELETE | `/api/addresses/:id` | Soft delete (`deleted_at`), promotes a fallback default, `204` |

Every cart response — read *or* mutate — is the **full rebuilt cart**:

```json
{ "items": [ { "productId": 12, "name": "Digital Air Fryer 5.5L",
    "unitPrice": 92000, "listPrice": 110000, "onSale": true, "currency": "RWF",
    "quantity": 2, "stock": 8, "inStock": true, "exceedsStock": false,
    "lineTotal": 184000 } ],
  "itemCount": 2, "subtotal": 184000, "canCheckout": true }
```

## The five decisions that matter

**1. Two identities, one `carts` table.** `carts.user_id` and `carts.session_token`
are each `UNIQUE`. `resolveCart()` prefers the signed-in user; anonymous browsers send
a self-generated UUID in the `X-Cart-Session` header (added to the CORS
`allowedHeaders` in `app.js` because preflight would otherwise block a custom header).
No token ever reaches the database that isn't shaped `/^[A-Za-z0-9-]{8,64}$/`.

**2. `cart_items` stores no price.** A snapshot would go stale the moment an admin
edits a product. Every read re-derives `unitPrice = discount_price ?? price` with a
JOIN onto `products`, and clamps the line to live stock (`exceedsStock` tells the UI to
warn). The client is display-only: it cannot forge a subtotal because it never
computes one.

**3. Mutations return the rebuilt cart.** One round-trip per click keeps the header
badge, the cart page and the subtotal in sync without a second `GET`. Simpler and less
race-prone than client-side arithmetic.

**4. Merge is a transaction, and order matters.** `POST /api/cart/merge` runs on one
connection: `UPDATE … JOIN` tops up quantities for products already in the account
cart, *then* an `INSERT … SELECT … WHERE NOT IN` copies only the genuinely new
products, *then* the session cart is deleted. Getting this order wrong (INSERT first)
double-counted every shared line — the test suite caught it (itemCount 6 instead of 3).

**5. Ownership lives in the SQL.** Every address statement carries `WHERE user_id = ?`.
A forged `:id` doesn't 403 — it 404s, because to the query, it doesn't exist. Never
rely on "check the owner in the service, then update by id"; close the window between
check and write by making the scope part of the statement.

## Two bugs worth remembering

- **InnoDB gap-lock deadlock.** The address service's transaction runs
  `clearDefaults` on its connection, which takes a gap lock on the `user_id` index.
  When the following `INSERT` ran on a *different* pooled connection, MySQL deadlocked
  and five tests hung for 15 s each. Rule: **inside a transaction, every statement —
  including "unrelated" inserts — must use the same `conn`.** The model writers take an
  optional `conn = pool` parameter so they work in and out of transactions.
- **`express-validator`'s "falsy" trap.** `.optional({ values: 'falsy' })` treats
  `quantity: 0` as *absent* and skips the `min:1` check, so 0 slipped through. Use
  `values: 'null'` when only `null`/omission should count as absent.

## Client wiring

`CartContext` kept its exact consumer surface (`lines / itemCount / subtotal /
addItem / setQuantity / removeItem / clearCart`) so the header badge and product pages
didn't need rewriting — but internally it now fetches `GET /api/cart` on mount and
calls the API on every mutation. The session UUID is created once in `api.js` and
persisted under `ganza_mart_cart_session`; the stale Phase-6 `ganza_mart_cart` mirror
is removed on mount. Merge-on-login fires from an effect keyed on `user?.id` and
guarded by a ref so it runs once per sign-in; it's idempotent anyway because the
server empties the session cart. `AddToCartButton` is now async with
`busy → Added ✓ / Unavailable` states so a slow or rejected server edit is visible,
and the Cart page renders server truth (sale strikes, stock warnings) with checkout
disabled until Phase 8.

## Tests

`server/tests/phase7-cart-address.test.js` — 19 tests against the real seeded MySQL:
guest add/quantities/remove/clear, clamp-to-stock, archived-product 409, merge keeps
account lines and empties the session, merge requires auth and a valid token, address
CRUD, exactly-one-default invariants, fallback promotion after deleting the default,
and cross-user access attempts (Bob reading/patching Alice's address → 404).

```powershell
cd server ; npm test            # 111 tests, all green
```

## Live verification (browser walkthrough, all 9 steps PASS)

Anonymous add → badge 0→1 → cart shows live price/line total → survives F5 (server
persistence proven with a direct `GET /api/cart` + session header) → quantity changes
re-price instantly → second product added (Items 4, Subtotal 197,000 RWF) → login as
Alice → `POST /api/cart/merge 200`, both lines intact on the account cart → address
book lists Home + Office with one default → create "Testing" as default demotes Home
→ edit persists across reload → delete promotes fallback default back → logout shows
an empty fresh session cart. Zero console errors.

**Next phase:** Phase 8 — checkout, orders, coupons and payments: the cart's
`canCheckout` finally goes somewhere.
