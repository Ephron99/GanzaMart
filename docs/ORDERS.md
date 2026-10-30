# Phase 8 — Checkout, Orders, Coupons & Payments

The cart's `canCheckout` finally goes somewhere. This phase turns a basket of live
cart lines into a **persisted order**: stock is locked and decremented, the address
is snapshotted, the coupon is redeemed, payment and shipment records are opened and
the status timeline starts — all inside one MySQL transaction that either fully
happens or fully doesn't (spec §6 & §12). Customers get a Checkout page, an order
history and a cancellable order detail; admins get a status machine and shipment
console behind `/api/admin/orders`.

## File map

| Layer | File | Responsibility |
|---|---|---|
| Utility | `src/utils/pricing.js` | The single source of truth: `SHIPPING_FEE = 2000`, `FREE_SHIPPING_THRESHOLD = 200000`, `computeShipping()`, `evaluateCoupon()` |
| Controller | `src/controllers/orderController.js` | Customer checkout/list/detail/cancel — identity comes from the token only |
| Controller | `src/controllers/adminOrderController.js` | Admin list/detail/status/shipment |
| Controller | `src/controllers/couponController.js` | `POST /api/coupons/validate` preview |
| Validator | `src/validators/orderValidators.js` | Whitelisted order payload (forged totals → 422), status/shipment rules |
| Service | `src/services/orderService.js` | The checkout transaction, status machine, cancellation refunds |
| Service | `src/services/couponService.js` | Read-only discount preview against the live cart |
| Model | `src/models/orderModel.js` | All SQL for `orders`, `order_items`, `payments`, `shipments`, `status_history` incl. `FOR UPDATE` locks |
| Model | `src/models/couponModel.js` | `coupons` + `coupon_redemptions` lookups |
| Client | `src/pages/Checkout.jsx` | Address picker, payment method, coupon apply, server-priced summary |
| Client | `src/pages/MyOrders.jsx` + `OrderDetail.jsx` | Paginated history; full detail with timeline and cancel |
| Client | `src/components/OrderStatusBadge.jsx` | One status → colour + label map shared by list and detail |

## Endpoints

| Method | URL | Auth | Purpose |
|---|---|---|---|
| POST | `/api/orders` | required | Checkout: `{ addressId, paymentMethod, couponCode?, notes? }` → the authoritative order |
| GET | `/api/orders` | required | My orders, newest first (`page`/`limit` coerced server-side) |
| GET | `/api/orders/:id` | required | One order I own (someone else's id reads as 404) |
| POST | `/api/orders/:id/cancel` | required | Only from `pending`/`confirmed`; stock returned |
| POST | `/api/coupons/validate` | required | Preview `{ code }` against the live cart subtotal — mutates nothing |
| GET | `/api/admin/orders` | admin | Every order, filterable by `status`/`search` |
| GET | `/api/admin/orders/:id` | admin | Full detail regardless of owner |
| PATCH | `/api/admin/orders/:id/status` | admin | `{ toStatus, note? }` through the transition table |
| PATCH | `/api/admin/orders/:id/shipment` | admin | `{ carrier, trackingNumber }` |

## The status machine

```
pending → confirmed → processing → shipped → delivered → refunded
   ╲          ╲           ╲
    ╲           ╲            ╲→ cancelled   (cancelled and refunded are terminals)
```

`ALLOWED_TRANSITIONS` in `orderService.js` is the only map forward. Anything else is
a 409, so a typo in the admin UI (or a malicious PATCH) can never teleport an order
to `delivered` or resurrect a cancelled one. Side effects ride along inside the same
transaction: `cancelled` returns every unit to stock and refunds a prepaid (mock)
payment; `shipped` stamps `shipped_at`; `delivered` stamps `delivered_at` and — for
COD only — marks the payment `paid` at the door.

## The decisions that matter

**1. The client never computes a number the server trusts.** The Checkout page shows
figures for confirmation only; `POST /api/orders` re-derives price
(`discount_price ?? price`), stock, subtotal, shipping and coupon discount from the
database. A forged `total` or `unitPrice` in the payload fails the validator (422) —
the happy-path test suite proves prices changing mid-checkout are picked up.

**2. Lock first, read second, write third.** `placeOrder` runs on ONE connection:
`SELECT … FOR UPDATE` on the cart's product rows (so a second concurrent checkout of
the same product blocks until commit — no overselling), then `lockAddressForCheckout`,
then `findCouponByCode({ forUpdate: true })`. Line-level stock decrements are
conditional (`stock >= qty` in the UPDATE); a zero-rows-affected result means it sold
out mid-flight → 409 + full rollback.

**3. Everything an order needs is a snapshot.** Line items store
`price_at_purchase`; the delivery address is copied onto the order row. Later product
re-pricing or address edits never rewrite history — order GM…49 will still say
49,000 RWF for the blender after the blender's price changes.

**4. Coupons are per-person, enforced by the database.** A UNIQUE index on
`coupon_redemptions (coupon_id, user_id)` makes double redemption impossible even
under races; `evaluateCoupon` checks expiry window, `min_order`, `max_uses` and prior
redemption with one shared message set used by both the preview and checkout. The
seed's Alice already redeemed `WELCOME10` — the live walkthrough saw
"You have already used that coupon." from the real API.

**5. Payments stay honest about being a demo.** `cod` creates a `pending` payment
settled on delivery; `mock` writes `paid` instantly with a `MOCK-<orderNumber>`
provider ref. No card data exists anywhere (spec §9).

## One bug worth remembering

- **String query params into `LIMIT ?`.** The browser sends `?page=1&limit=10` as
  *strings*; the service passed them straight to `pool.query('… LIMIT ? OFFSET ?')`,
  which inlines `'10'` as a quoted literal → SQL syntax error → 500 on every real
  `/api/orders` call. The in-process tests missed it because they used the numeric
  defaults. Fix: coerce exactly like the other list services
  (`Math.trunc(Number(limit))`, clamped) — and a regression test now calls the
  endpoint with explicit string params. Rule: **req.query is always strings; never
  let one reach a SQL numeric position uncoerced.**

## Client wiring

`Cart.jsx`'s checkout button opens for real (disabled only when `!canCheckout`).
`Checkout.jsx` pre-selects the default address, offers COD / Pay-now (demo), applies
coupons via the preview endpoint (the applied chip can be removed and re-tried), and
shows Subtotal / Discount / Delivery / Total plus a "final prices are confirmed by
the server" note. Placing the order reloads the cart (now empty, badge → 0) and
navigates to the new order detail with a "Thank you — your order has been placed!"
banner. `MyOrders` paginates; `OrderDetail` renders the historical line prices,
delivery snapshot, payment/shipment panels, the full status timeline, and a Cancel
button while the order is `pending`/`confirmed`. Marketing copy now matches the
implementation everywhere: the Policies shipping section and the header topbar both
state the flat 2,000 RWF fee with free delivery from 200,000 RWF — the same constants
`pricing.js` uses.

## Tests

`server/tests/phase8-orders.test.js` — 18 tests against the real seeded MySQL:
auth gate, forged-price 422, empty cart 409, foreign address 404, happy-path order
totals (items, shipping, payments, shipment, history rows all verified in the DB),
coupon preview + expiry/min-order/double-redemption rejections, sold-out 409 with
stock intact, list pagination (incl. the string-param regression), ownership 404s,
customer cancel returning stock exactly once, admin 403 for customers, the admin
walk through legal transitions with an illegal-jump 409, and shipment updates.

```powershell
cd server ; npm test            # 129 tests, all green
```

## Live verification (browser walkthrough)

Full checkout as Alice on the running app: login → cart cleared of stale lines →
added blender (49,000) + football (24,000) → checkout listed Home as default-selected
→ `WELCOME10` rejected ("You have already used that coupon.") → `FRESHIP5K` applied
(−5,000; delivery 2,000; **total 70,000 RWF**) → place order → redirected to
`GM000000000049` with the success banner, pending timeline and Cancel button →
cart badge 0 → My orders shows the new order above the seeded one. The first pass
surfaced the LIMIT 500 and the stale "free over 50,000" topbar claim; both fixed and
re-verified on a cold reload with zero console errors.

**Next phase:** Phase 9 — admin dashboard: order console UI, stats, and coupon
management on top of the APIs this phase delivered.
