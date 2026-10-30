# Ganza Mart — Authentication & Authorization (Phase 4)

**What it does.** Lets a visitor create an account, sign in, see who they are,
sign out, change their password, and restricts `/api/admin/*` to administrators.

**Why it is needed.** An online shop holds personal data (addresses, order history).
Without authentication there is no "my orders", no cart persistence, and no admin
dashboard. Without *authorization* any logged-in customer could manage the catalogue.

## 1. Which files implement it

| Layer | File | Responsibility |
|---|---|---|
| Routes | `server/src/routes/authRoutes.js` | URL ↔ middleware ↔ controller wiring |
| Routes | `server/src/routes/adminRoutes.js` | `router.use(authenticate, authorize('admin'))` for the whole admin namespace |
| Validation | `server/src/validators/authValidators.js` | express-validator rules; the single source of truth |
| Middleware | `server/src/middleware/authMiddleware.js` | `authenticate`, `authorize(...roles)`, `optionalAuth` |
| Middleware | `server/src/middleware/rateLimit.js` | brute-force limiter on credential endpoints |
| Controller | `server/src/controllers/authController.js` | HTTP ⇄ service translation (no logic) |
| Service | `server/src/services/authService.js` | bcrypt hashing, login rules, revocation |
| Model | `server/src/models/userModel.js` | all `users` SQL, parameterized |
| Utility | `server/src/utils/jwt.js` | sign/verify, `issuer` pinned |
| Test | `server/tests/phase4-auth.test.js` | 25 automated cases incl. failure cases |

## 2. Token design: Bearer JWT + DB revocation

```
Login ──► JWT { sub: userId, role, tv: token_version } signed with JWT_SECRET (HS256, 1d)
Request ──► Authorization: Bearer <jwt>
Server  ──► verify signature + expiry  ──► load user from MySQL
                                        ├─ user missing?          → 401
                                        ├─ is_active = 0?         → 403
                                        └─ db.tv ≠ token.tv?      → 401 (signed out)
```

A pure JWT cannot be revoked — it is valid until it expires. Spec §8 requires a real
`POST /api/auth/logout`, so `users.token_version` was added: logout increments the
number in MySQL, making every previously issued token fail the `tv` comparison. The same
mechanism covers password change, admin deactivation and role changes — all take effect
immediately instead of "when the token expires".

**Why the middleware reads MySQL on every request:** the token is a *claim*, not a fact.
Roles and account status can change after it is signed. The lookup is a primary-key read
(`WHERE id = ?`), so the cost is one indexed row.

**Why no cookies:** the token travels in the `Authorization` header, which browsers never
attach automatically. That removes the CSRF class of attacks entirely (spec §8 only
requires CSRF defences "if using JWT cookies"), so no CSRF token machinery is needed.
The trade-off is that the React app stores the token in `localStorage`, which is readable
by XSS — hence helmet's CSP/X-Frame-Options headers, React's automatic output escaping,
and strict input validation, which are the defence against XSS.

## 3. Security decisions, feature by feature

| Rule | Implementation | Where |
|---|---|---|
| No plaintext passwords | `bcrypt.hash(password, 12)`; stored column is `VARCHAR(60)` | `authService.js` |
| Never leak the hash | SQL selects an explicit `PUBLIC_COLUMNS` list without `password_hash`; `toPublicUser()` maps snake_case → camelCase | `userModel.js` |
| No user enumeration | One generic `Invalid e-mail or password.` for wrong password *and* unknown account; a dummy bcrypt compare burns equal time | `authService.js` |
| No privilege escalation | `body('role').not().exists()` — sending `role`, `is_active` or `token_version` is a 422; service hard-codes `role: 'customer'` | `authValidators.js` |
| Brute-force resistance | `authLimiter`: 10 attempts / IP / 15 min on register + login | `rateLimit.js` |
| Server-side validation | all rules in `authValidators.js`; client rules mirror them and are UX only | validators |
| SQL injection safety | every query uses `?` placeholders (prepared statements) | `userModel.js` |
| Deactivated accounts | `is_active` checked at login (403) and on every authenticated request | middleware + service |
| Safe error output | `{ success:false, error }`; stack traces only when `NODE_ENV=development` | `errorMiddleware.js` |

## 4. Endpoint reference (auth)

| Method | URL | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | none | `fullName*`, `email*`, `password*`, `phone` | 201 `{user, token}` | 409 duplicate · 422 validation · 429 rate limit |
| POST | `/api/auth/login` | none | `email*`, `password*` | 200 `{user, token}` | 401 credentials · 403 deactivated · 422 · 429 |
| GET | `/api/auth/me` | Bearer | — | 200 `{user}` | 401 missing/expired/revoked · 403 deactivated |
| POST | `/api/auth/logout` | Bearer | — | 200 message | 401 |
| POST | `/api/auth/change-password` | Bearer | `currentPassword*`, `newPassword*` | 200 message (token revoked) | 401 wrong current · 422 weak/new=same |
| GET | `/api/admin/users` | Bearer + admin | query `search, role, page, limit` | 200 `[users] + pagination` | 401 anonymous · 403 not admin · 422 bad query |

Response envelope is uniform: success `{ success: true, data, pagination? }`,
failure `{ success: false, error, details? }`.

## 5. How to test it

```powershell
cd server
npx vitest run                       # 25 auth cases, incl. every failure path above
npm run dev                          # terminal 1
powershell -File tools/smoke-auth.ps1  # terminal 2 — live HTTP walkthrough
```

Manual check with curl (PowerShell: `curl.exe`):
```bash
curl -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Alice@123"}'
curl http://localhost:5000/api/admin/users -H "Authorization: Bearer <token>"   # → 403 for a customer
```

## 6. Known limitations (documented, not hidden)

- `localStorage` token storage trades XSS exposure for CSRF immunity (see §2).
- bcrypt cost 12 ≈ 60–100 ms per login on this machine — intentional, but it means the
  test suite takes ~12 s; production would raise the cost and add a CDN/HSTS layer.
- Rate limiting keys on IP; behind a reverse proxy set `app.set('trust proxy', 1)` and
  configure `ipKeyGenerator`, otherwise every request looks like it comes from the proxy.
- No e-mail verification or password-reset e-mail flow: sending mail needs an SMTP
  provider (external dependency), so it is out of scope for the local demo.
