# Phase 5 — Product & Category APIs

Everything the shop front needs to browse, and everything the admin needs to manage
the catalogue. No cart, no orders yet — those come in Phases 7–8.

## File map

| Layer | File | Responsibility |
|---|---|---|
| Route | `src/routes/productRoutes.js` | URL + HTTP method + who may call it |
| Route | `src/routes/categoryRoutes.js` | Same for categories |
| Validator | `src/validators/catalogValidators.js` | Shape of the request (types, ranges, unknown fields) |
| Middleware | `src/middleware/uploadImages.js` | Multer: accept ≤6 real images, name them ourselves |
| Controller | `src/controllers/productController.js` | Translate HTTP ⇄ service calls, nothing else |
| Service | `src/services/productService.js` | Business rules: slugs, archive policy, price precedence |
| Service | `src/services/categoryService.js` | Tree building, roll-up counts, cycle & delete guards |
| Model | `src/models/productModel.js` | All SQL for `products` + `product_images` |
| Model | `src/models/categoryModel.js` | All SQL for `categories` |
| Util | `src/utils/slugify.js` | `Cotton Oxford Shirt` → `cotton-oxford-shirt` (+ `-2` on collision) |
| Util | `src/utils/files.js` | Deleting uploaded bytes safely |
| Config | `src/config/paths.js` | One definition of where uploads live |

**Why three layers?** A controller never contains SQL, a model never contains
`res.json`. When Phase 6 needs `GET /api/products/:id/related` to return five items
instead of four, only a service constant changes — no route or SQL edits.

## Public endpoints

| Method | URL | Purpose |
|---|---|---|
| GET | `/api/products` | Paginated, filterable, sortable catalogue |
| GET | `/api/products/:id` | One product + gallery + related items |
| GET | `/api/products/:id/related` | Just the "you may also like" rail |
| GET | `/api/categories` | Nested tree (`?flat=true` for a `<select>`) |
| GET | `/api/categories/:idOrSlug` | One category + its products |

## Admin endpoints (JWT with `role=admin`)

`POST /api/products` · `PUT /api/products/:id` · `DELETE /api/products/:id` ·
`POST /api/products/:id/restore` · `PATCH /api/products/:id/stock` ·
`DELETE /api/products/:id/images/:imageId` · `GET /api/admin/products` ·
`POST|PUT|DELETE /api/categories[/:id]`

The public list and the admin list run the **same SQL**. The admin answer merely
carries three extra internal fields (`isArchived`, `lowStockThreshold`, `isLowStock`);
`soldCount` is public, because "12 sold" belongs on a shop card. One query, two
shapes — so a shopper can never see an operational field, and an admin can never be
shown a different number than the shop sees.

## Query parameters (the catalogue filter bar)

`page` `limit` (≤100) · `search` (name, SKU *or* description) · `category` (slug) ·
`categoryId` · `minPrice` `maxPrice` (tested against the **discounted** price) ·
`inStock` · `featured` · `newArrivals` · `sort` · `archived` (admin only).

`sort` accepts only a whitelist: `newest`, `oldest`, `price-asc`, `price-desc`,
`name-asc`, `name-desc`, `best-selling`, `rating-desc`. An unknown key falls back to
`newest`; a garbage value can never reach `ORDER BY`, which is the one place SQL
cannot be parameterized with `?`.

A parent slug includes its children: `?category=electronics` returns phones,
laptops and TVs, because `categoryIdsWithChildren()` expands the id set in one
indexed query. That is what shoppers expect from a department store nav bar.

## Four rules worth knowing

**1. Archived, not deleted.** `DELETE /api/products/:id` sets `is_archived = 1`.
The row keeps its id, so `order_items` still resolve and last year's invoice still
prints. `?mode=permanent` physically removes the row **only** when no order
references it — otherwise `409`. A typo in `mode` cannot destroy data: only the
exact word `permanent` takes the irreversible branch.

**2. Rating and units sold are computed, never stored.** MySQL 8 rejects subqueries
in generated columns (error 3102), so `products` has no `rating_avg`. Both values
come from two `LEFT JOIN (SELECT … GROUP BY …)` derived tables. They are shared as
`DERIVED_COLUMNS` / `DERIVED_JOINS` in `productModel.js` and used by *every* product
query, because a product that reads "4.8 ★" on a card and "no reviews" on its detail
page is a bug a shopper will notice.

**3. Uploads are additive.** `PUT /api/products/:id` with new files appends them to
the gallery. The card image changes only when the request sends an explicit
`imageUrl`, or when the product still shows the placeholder. An edit must never be
able to blank a product's picture by forgetting to re-send it.

**4. Deleting a row also deletes the bytes.** A permanent product delete removes its
uploaded files too, but only files under `/uploads/` (`isUploadedUrl`), only after
`countImageReferences()` confirms no other product still points at that URL, and
with `path.basename()` applied first so a stored value can't traverse out of the
folder. Bundled `/images/*.svg` artwork belongs to the frontend and is never touched.

## Money

Prices arrive from MySQL as **strings** (`decimalNumbers: false` in the pool) and are
converted with `money()` at the edge. `price` and `discountPrice` are sent separately
plus `effectivePrice`, resolved server-side as `discount_price ?? price`. The UI
displays `effectivePrice` and never compares two numbers to guess the sale price —
one rule, one implementation.

## Errors you will see

| Status | When |
|---|---|
| 401 | No/invalid token on an admin route |
| 403 | Logged in as `customer`, calling an admin route |
| 404 | Unknown product id, or an image id that belongs to another product |
| 409 | Permanent delete blocked by order history; category still has products/children |
| 413 | Uploaded image over 2 MB |
| 422 | Validation failed — `details[]` names the field |

## Try it yourself

```powershell
# automated suite (76 tests, includes uploads + failure cases)
cd server ; npx vitest run

# live walkthrough against a running API — run this in a second window
npm run dev
.\tools\smoke-catalog.ps1
```

```powershell
curl.exe "http://localhost:5000/api/products?category=electronics&sort=price-asc&limit=3"
```

Two environment gotchas recorded the hard way:

* **Express 5 has no inline route regex.** `/:id(\d+)` now *throws* while registering
  the router, killing boot. Ids are plain `:id` and constrained by validators, so a
  non-numeric id is a clean `422` instead of a `500` or a route miss.
* **PowerShell swallows `$id?`** inside a double-quoted string:
  `"$base/api/products/$id?mode=permanent"` is sent as `/api/products/=permanent`.
  Write `${id}?mode=permanent`. (`.` and `-` are fine; `?` is not.)

## Known limitations (deliberate, for this teaching build)

* Search is `LIKE '%term%'`, not `MATCH … AGAINST`: shoppers type fragments like
  "gal", and FULLTEXT indexes match whole words with a minimum token length. The
  `ft_products_search` index exists in the schema if you want to switch.
* Category roll-up walks one level deep. A third level would still be *filtered*
  correctly, but its products would not appear in the grandparent's badge count.
* `soldCount` ignores cancelled orders but is computed per request; at a few thousand
  orders you would cache it or maintain a summary table.

**Next:** Phase 6 — the React layout, routing and catalogue pages that consume exactly
these endpoints.
