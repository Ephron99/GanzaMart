import rateLimit from 'express-rate-limit';

// Brute-force protection for credential endpoints (spec §9).
// 10 attempts per 15 minutes per IP for login/register; successful requests count too,
// which is acceptable for a teaching app and matches OWASP's simple guidance.
// Tests get a generous window so the suite itself is not rate-limited.
const isTest = process.env.NODE_ENV === 'test';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts. Please try again in 15 minutes.' },
});

// Broad safety valve for the public catalogue endpoints: enough for normal browsing,
// low enough to make casual scraping/cracking expensive.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 10000 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please slow down.' },
});

// Public forms that WRITE rows (contact message, newsletter) are the two endpoints
// a spammer can use without an account, so they get their own tighter budget than
// browsing — 20 submissions per 15 minutes per IP is far more than a real customer
// needs, and it makes a database-flooding script pointless.
export const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many submissions from this address. Please try again in 15 minutes.' },
});
