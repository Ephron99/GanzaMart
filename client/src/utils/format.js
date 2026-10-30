// Display helpers shared by every page. Keeping them here means a price is written
// the same way in the hero, on a card, in the cart and on the invoice.

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'decimal',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

/**
 * 19000 → "19,000 RWF". Rounded to the franc: Rwanda does not use sub-unit change
 * online, and showing "19000.00" on every card is the single most common giveaway
 * of an unfinished shop.
 */
export function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${moneyFormatter.format(Math.round(Number(value)))} RWF`;
}

/** "2026-03-14 09:12:00" (what the API sends) → "14 March 2026". */
export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

/** Percentage saved against the original price, e.g. 20 (for "-20%"). */
export function discountPercent(price, discountPrice) {
  if (!discountPrice || !price || Number(discountPrice) >= Number(price)) return null;
  return Math.round((1 - Number(discountPrice) / Number(price)) * 100);
}

/**
 * The API stores two kinds of image path and the browser must resolve them
 * differently:
 *   /images/…      → shipped inside this React bundle (client/public)
 *   /uploads/…     → a file an admin uploaded, served by the API on port 5000
 *   https://…      → already absolute, use as-is
 * Everything else (empty, malformed) falls back to the placeholder so an <img>
 * never renders the broken-image icon.
 */
export function resolveImageUrl(url) {
  const fallback = '/images/products/placeholder.svg';
  if (typeof url !== 'string' || url.trim() === '') return fallback;
  if (/^https?:\/\//i.test(url)) return url;

  if (url.startsWith('/uploads/')) {
    const origin = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:5000';
    return `${origin}${url}`;
  }
  return url.startsWith('/') ? url : `/${url}`;
}

/** cx('btn', isActive && 'btn--primary') → "btn btn--primary" */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function pluralise(count, singular, plural = `${singular}s`) {
  return `${moneyFormatter.format(count)} ${count === 1 ? singular : plural}`;
}

/**
 * Turn an axios/supertest failure into one sentence a human can act on.
 * The API always answers { success:false, error, details[] }, so prefer that text
 * over "Request failed with status code 422", which teaches the visitor nothing.
 */
export function readableError(err) {
  if (!err) return 'Something went wrong. Please try again.';
  const payload = err.response?.data;
  if (payload?.error) return payload.error;
  if (Array.isArray(payload?.details) && payload.details.length) {
    return payload.details.map((d) => d.message).join(' ');
  }
  if (err.code === 'ERR_NETWORK') return 'Cannot reach the server. Is the API running on port 5000?';
  return err.message || 'Something went wrong. Please try again.';
}
