import { cx } from '../utils/format.js';

/**
 * Page buttons. Rather than dump every page number (impossible with hundreds of
 * products), show first/last, the current page ±1, and collapse the rest behind an
 * ellipsis. The Prev/Next buttons disable at the ends so you can never jump to page 0.
 */
function pageList(page, pages) {
  const set = new Set([1, pages, page - 1, page, page + 1]);
  const shown = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of shown) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

export default function Pagination({ page, pages, total, limit, onPageChange }) {
  if (!pages || pages <= 1) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const go = (next) => {
    if (next < 1 || next > pages || next === page) return;
    onPageChange(next);
  };

  return (
    <nav className="pagination-wrap" aria-label="Pagination">
      <div className="pagination">
        <button className="pagination__btn" onClick={() => go(page - 1)} disabled={page <= 1}>‹ Prev</button>
        {pageList(page, pages).map((p, i) =>
          p === '…'
            ? <span key={`e${i}`} className="pagination__ellipsis">…</span>
            : (
              <button
                key={p}
                className={cx('pagination__btn', p === page && 'pagination__btn--current')}
                onClick={() => go(p)}
                aria-current={p === page ? 'page' : undefined}
              >
                {p}
              </button>
            )
        )}
        <button className="pagination__btn" onClick={() => go(page + 1)} disabled={page >= pages}>Next ›</button>
      </div>
      <p className="pagination__summary">
        Showing {from}–{to} of {total}
      </p>
    </nav>
  );
}
