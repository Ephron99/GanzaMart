# Ganza Mart — System Architecture & Database Design (Phase 1)

## 1. Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT  (React 18 + Vite)            http://localhost:5173 │
│  Pages · Components · Context (auth/cart) · Router          │
│  api.js — single centralized REST service (fetch/axios)     │
└──────────────────────────┬──────────────────────────────────┘
                           │  JSON over REST  (Authorization: Bearer <JWT>)
┌──────────────────────────▼──────────────────────────────────┐
│  SERVER  (Node.js + Express)          http://localhost:5000 │
│  Routes → Controllers → Services → Models                   │
│  Middleware: authenticate · authorize(role) · validators ·  │
│  rate-limit · error handler · CORS (restricted to CLIENT_URL)│
└──────────────────────────┬──────────────────────────────────┘
                           │  mysql2 connection pool, parameterized queries
┌──────────────────────────▼──────────────────────────────────┐
│  DATABASE  (MySQL Server)             localhost:3006*       │
│  GanzaMart_db — InnoDB, DECIMAL money, FK integrity,        │
│  indexes, timestamps, transactions for orders/inventory     │
└─────────────────────────────────────────────────────────────┘
```

\* **Note:** 3006 is *not* MySQL's default port (3306 is). Phase 3 verifies the actual
listening port before the backend connects. MySQL **Workbench is only a desktop admin
client** — the backend connects to the MySQL *Server service*, never to Workbench.

### Request lifecycle example (place an order)
1. React `CheckoutPage` → `api.createOrder(payload)` → `POST /api/orders` with JWT.
2. `authenticate` middleware verifies JWT → attaches `req.user`.
3. `validateCheckout` validator checks required fields (never trusts client prices).
4. `orderController.create` → `orderService.placeOrder` runs **one DB transaction**:
   lock stock rows (`SELECT ... FOR UPDATE`) → verify quantities → compute totals from
   DB prices → insert `orders`, `order_items`, `payments`, `shipments`,
   `order_status_history` → decrement `products.stock` → clear cart → commit.
5. Server returns the authoritative order summary; React shows the confirmation page.

## 2. Technology Choices & Why

| Concern | Choice | Reason |
|---|---|---|
| Frontend build | Vite + React 18 | Fast dev server, serves on :5173 as required |
| Routing | React Router v6 | Protected/admin routes |
| State | Context API + hooks | Auth + cart state without extra library |
| HTTP | axios with interceptors | Centralized base URL, JWT attachment, error normalization |
| Server | Express 5 | Standard REST layer (5.x forwards rejected async handlers to error middleware natively) |
| DB driver | mysql2 (pool, prepared statements) | Required; parameterized queries prevent SQL injection |
| Passwords | bcrypt (12 rounds) | Never plaintext |
| Tokens | JWT (`jsonwebtoken`), 1-day expiry | Stateless auth; secret only in `server/.env` |
| Security | helmet, express-rate-limit, restricted CORS | Requirement §9 |
| Validation | express-validator (server) + form validators (client) | Server-side is authoritative |
| Testing | Vitest + React Testing Library (client), Vitest + Supertest (server) | Requirement §12; one runner on both sides |
| Payments | COD + mock payment adapter | No card data ever stored |

## 3. Visual Identity

Spec §5 palette (used verbatim as CSS custom properties in `client/src/index.css`):

```css
:root {
  --color-primary:      #087F86;  /* teal   */
  --color-primary-dark: #075E63;
  --color-accent:       #FF6B1A;  /* orange */
  --color-charcoal:     #20292B;  /* text   */
  --color-white:        #FFFFFF;
  --color-background:   #F2F5F4;
  --color-border:       #D9E1DF;
}
```

Classic commerce layout: top utility bar → logo/search/cart navbar → category strip →
hero → product grids → testimonials → newsletter → multi-column footer.
Mobile-first, Flexbox + CSS Grid, breakpoints at 640 / 900 / 1200 px.

## 4. Entity–Relationship Design (19 tables)

### 4.1 Relationship map (crow's-foot notation in text)

```
users (1) ───< (0..*) addresses
users (1) ───< (0..*) carts            [1 persistent cart per user]
users (1) ───< (0..*) orders
users (1) ───< (0..*) reviews
users (1) ───< (0..*) wishlists
users (1) ───< (0..*) coupon_redemptions
categories (1) ──< (0..*) categories        [self-referencing parent_id]
categories (1) ──< (0..*) products
products (1) ──< (0..*) product_images
products (1) ──< (0..*) cart_items
products (1) ──< (0..*) order_items
products (1) ──< (0..*) reviews
products (1) ──< (0..*) wishlist_items
carts (1) ──< (0..*) cart_items
orders (1) ──< (0..*) order_items
orders (1) ──< (1..*) payments
orders (1) ──< (1..*) shipments
orders (1) ──< (0..*) order_status_history
coupons (1) ──< (0..*) coupon_redemptions
newsletter_subscribers / contact_messages — standalone (public forms)
```

### 4.2 Table-by-table purpose

| # | Table | Purpose | Key design decisions |
|---|---|---|---|
| 1 | `users` | Customers + admins | `email` UNIQUE; `password_hash` bcrypt only; `role ENUM('customer','admin')`; `is_active` for soft deactivation; `anonymous_id` support via carts |
| 2 | `addresses` | Delivery addresses | FK→users, `is_default`; soft `deleted_at` so orders keep history intact |
| 3 | `categories` | Product categories | Self-referencing `parent_id` for sub-categories; `slug` UNIQUE |
| 4 | `products` | Catalog + inventory | `price`/`discount_price` DECIMAL(10,2); `stock` INT with CHECK ≥0; `is_archived` soft delete; FULLTEXT-friendly `name/description`; indexed `category_id`, `price`, `is_featured`, `created_at` |
| 5 | `product_images` | Gallery images | `is_primary` flag; FK→products CASCADE |
| 6 | `carts` | Persistent carts | One per user (`user_id` UNIQUE) or one per anonymous session (`session_token` UNIQUE) → enables **cart merge at login** |
| 7 | `cart_items` | Cart lines | `UNIQUE(cart_id, product_id)`; qty CHECK ≥1; **no price stored** — always computed from products at read/checkout |
| 8 | `orders` | Order header | **Snapshot columns**: `subtotal, discount_amount, shipping_fee, total_amount` DECIMAL; `status ENUM('pending','confirmed','processing','shipped','delivered','cancelled','refunded')`; address snapshot JSON-free columns so later address edits don't alter history |
| 9 | `order_items` | Historical lines | **Stores `price_at_purchase`, `quantity`, line total** — survives product price/stock changes (rule §6) |
| 10 | `payments` | Payment records | `method ENUM('cod','mock')`, `status ENUM('pending','paid','failed','refunded')`, `provider_ref` — **no card data, ever** |
| 11 | `shipments` | Tracking | carrier, tracking number, shipped/delivered timestamps |
| 12 | `reviews` | Ratings | `UNIQUE(product_id, user_id)` + must have purchased (validated in service layer); rating TINYINT 1–5 |
| 13 | `coupons` | Discount codes | `code` UNIQUE; `type ENUM('percent','fixed')`; `valid_from/valid_until`; `min_order`; `max_uses`, `used_count` |
| 14 | `coupon_redemptions` | Usage audit | `UNIQUE(coupon_id, user_id)` optional one-per-customer enforcement |
| 15 | `wishlists` | Saved items | One per user (`user_id` UNIQUE) |
| 16 | `wishlist_items` | Saved products | `UNIQUE(wishlist_id, product_id)` |
| 17 | `newsletter_subscribers` | Footer signup | `email` UNIQUE, idempotent subscribe |
| 18 | `contact_messages` | Contact form | name/email/message + `is_handled` flag for admin |
| 19 | `order_status_history` | Audit trail | Every status transition appended with note + changed_by + timestamp |

### 4.3 Database rules honored (from spec §6)
- InnoDB + utf8mb4 everywhere (transactional).
- `DECIMAL(10,2)` money — never FLOAT.
- FKs: `ON DELETE CASCADE` for owned data (cart items, images), `RESTRICT`/soft-delete for referenced data (categories, products in orders).
- `created_at DEFAULT CURRENT_TIMESTAMP`, `updated_at ON UPDATE CURRENT_TIMESTAMP` on all mutable tables.
- Soft delete/archive: `products.is_archived`, `addresses.deleted_at`, `orders` never deleted.
- Transactions + `SELECT ... FOR UPDATE` row locks for order placement → prevents overselling under concurrency (test §12).

## 5. Order Status Workflow

```
                 ┌──────────► cancelled (from pending|confirmed, restores stock)
pending ─► confirmed ─► processing ─► shipped ─► delivered ─► refunded (separate transition)
```
- Only transitions in the allowed table are accepted by `PATCH /api/admin/orders/:id/status`.
- Cancellation before `shipped` **restores inventory in the same transaction**.
- Refund marks payment `refunded` and records history; retained for audit.

## 6. API Surface (summary — full table in docs/API.md, Phase 11)

| Resource | Public | Customer (JWT) | Admin (JWT+role) |
|---|---|---|---|
| auth | register, login | me, logout | — |
| products | list, detail (filter/sort/paginate) | — | create, update, archive |
| categories | list, detail | — | create, update, delete (guarded) |
| cart | get/modify via anonymous session | full + merge on login | — |
| orders | — | create, my-orders, detail (ownership check) | list, search, status, shipping |
| reviews | read | create (if purchased) | delete |
| coupons | validate | applied server-side at checkout | CRUD |
| wishes, addresses | — | CRUD (ownership) | — |
| dashboard, users | — | — | stats, list, activate/deactivate |
| newsletter, contact | POST | — | list/handle messages |

Security posture (spec §9): server-side validation everywhere; prices/totals/coupons
computed only on server; ownership checks on every private resource; bcrypt; JWT secret
only in `server/.env`; rate limit on auth endpoints; helmet headers; CORS locked to
`CLIENT_URL`; parameterized SQL.

## 7. Installation Prerequisites

| Tool | Version | Check command |
|---|---|---|
| Node.js | ≥ 18 LTS | `node -v` |
| npm | ≥ 9 (ships with Node) | `npm -v` |
| MySQL Server | 8.x on **port 3006** (verify!) | `Get-Service *mysql*` / Workbench → Server → Users/Connections |
| MySQL Workbench | 8.x (admin client only) | — |
| VS Code | any | — |

Port verification (spec §7 explicitly warns): in Workbench run
`SHOW VARIABLES LIKE 'port';` — if it reports 3306, either reconfigure MySQL to 3006 or
set `DB_PORT=3306` in `server/.env`. The app must match the *server*, not the doc.

## 8. Phase Plan → Folder Mapping

Folders created now (populated phase by phase):
- `client/src/{components,pages,layouts,context,hooks,services,utils,assets}` — Phases 6–9
- `server/src/{config,middleware,models,services,controllers,routes,validators,utils}` — Phases 3–5, 7–9
- `server/uploads` — product image files (validated uploads only)
- `database/{schema.sql,seed.sql,README.md}` — Phase 2
- `docs/` — API reference, troubleshooting, security checklist (Phase 11)
