// Express application assembly. Kept separate from server.js so tests can import
// the app without opening a network port (Supertest uses exactly this export).
import './config/load-env.js';   // must be first: fills process.env
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { UPLOAD_DIR, UPLOAD_URL_PREFIX } from './config/paths.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import { apiLimiter } from './middleware/rateLimit.js';
import healthRoutes from './routes/healthRoutes.js';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import productRoutes from './routes/productRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import newsletterRoutes from './routes/newsletterRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import addressRoutes from './routes/addressRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import couponRoutes from './routes/couponRoutes.js';

const app = express();

// ── Security & parsing ─────────────────────────────────────────────
// helmet sets safe HTTP headers (CSP, X-Content-Type-Options, HSTS, ...).
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS is RESTRICTED to the React dev server — never '*' (spec §9).
app.use(cors({
  origin: process.env.CLIENT_URL.split(',').map((s) => s.trim()),
  credentials: true,                      // allows HttpOnly auth cookies if we use them
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Cart-Session'],
}));

// Body size limits blunt JSON payload-abuse attacks.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Product images uploaded by admins are served from /uploads (never executable code).
app.use(UPLOAD_URL_PREFIX, express.static(UPLOAD_DIR, { index: false, dotfiles: 'ignore' }));

// ── API routes ─────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({
  name: 'Ganza Mart API',
  version: '1.0.0',
  endpoints: {
    health: 'GET /api/health',
    auth: 'POST /api/auth/register | POST /api/auth/login | GET /api/auth/me | POST /api/auth/logout',
    products: 'GET /api/products | GET /api/products/:id | GET /api/products/:id/related | GET /api/products/:id/reviews | POST|PUT|DELETE /api/products[/:id] (admin)',
    categories: 'GET /api/categories | GET /api/categories/:idOrSlug | POST|PUT|DELETE (admin)',
    admin: 'GET /api/admin/users | /api/admin/products | /api/admin/categories',
    newsletter: 'POST /api/newsletter',
    contact: 'POST /api/contact',
    cart: 'GET|POST|PUT|DELETE /api/cart[/items] | POST /api/cart/merge',
    addresses: 'GET|POST /api/addresses | PUT|DELETE /api/addresses/:id | PATCH /api/addresses/:id/default',
    orders: 'POST|GET /api/orders | GET /api/orders/:id | POST /api/orders/:id/cancel',
    coupons: 'POST /api/coupons/validate',
    adminOrders: 'GET /api/admin/orders | GET /api/admin/orders/:id | PATCH /api/admin/orders/:id/status|/shipment',
  },
}));

app.use('/api', apiLimiter);
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);
// The admin order console lives under /api/admin (mounted above) alongside the
// customer's own /api/orders routes.

// ── Fallbacks (order matters: 404 first, then the error handler) ───
app.use(notFound);
app.use(errorHandler);

export default app;
