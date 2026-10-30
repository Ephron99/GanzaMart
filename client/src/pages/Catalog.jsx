import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Breadcrumb from '../components/Breadcrumb.jsx';
import ProductGrid from '../components/ProductGrid.jsx';
import Pagination from '../components/Pagination.jsx';
import { useAsyncData } from '../hooks/useAsyncData.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { api } from '../services/api.js';
import { formatMoney } from '../utils/format.js';

// The catalogue (spec §4B): search + category + price + availability filters, sorting
// and pagination — all reflected in the URL. That is the key design choice: the URL is
// the state, so results are linkable, survive refresh, and the browser back button undoes
// a filter change. Changing any control rewrites the query string; the data hook watches
// it and refetches.

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'best-selling', label: 'Best selling' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'rating-desc', label: 'Top rated' },
  { value: 'name-asc', label: 'Name: A–Z' },
];

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const { slug: pathSlug } = useParams();
  const navigate = useNavigate();

  // Normalise the /categories/:slug route into the ?category= filter the API expects,
  // so both entry points render through one component with one data path.
  const category = pathSlug ?? params.get('category') ?? '';
  const search = params.get('search') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const inStock = params.get('inStock') === 'true';
  const minPrice = params.get('minPrice') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';
  const featured = params.get('featured') === 'true';
  const newArrivals = params.get('newArrivals') === 'true';
  const page = Math.max(parseInt(params.get('page'), 10) || 1, 1);

  const query = useMemo(() => {
    const q = { page, limit: 12, sort };
    if (search) q.search = search;
    if (category) q.category = category;
    if (inStock) q.inStock = 'true';
    if (featured) q.featured = 'true';
    if (newArrivals) q.newArrivals = 'true';
    if (minPrice) q.minPrice = minPrice;
    if (maxPrice) q.maxPrice = maxPrice;
    return q;
  }, [page, sort, search, category, inStock, featured, newArrivals, minPrice, maxPrice]);

  const { data, loading, error, reload } = useAsyncData(() => api.products.list(query), [query]);
  const cats = useAsyncData(() => api.categories.tree(), []);

  useDocumentTitle(category ? `${category} — Shop` : 'Shop all products');

  // Every control funnels through this: write a param (or delete it for empty/false) and
  // always reset to page 1, because a new filter on page 4 showing nothing is confusing.
  function update(next) {
    const merged = { ...Object.fromEntries(params.entries()), ...next };
    if (!('page' in next)) delete merged.page;
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v === '' || v === null || v === undefined || v === false) continue;
      sp.set(k, String(v));
    }
    // On /categories/:slug, moving away from that category must leave the path route.
    if (('category' in next || 'search' in next || 'sort' in next || 'featured' in next || 'newArrivals' in next) && pathSlug) {
      navigate(`/products?${sp.toString()}`);
      return;
    }
    setParams(sp, { replace: true });
  }

  const setParam = (key, value) => update({ [key]: value });

  // Sidebar search box keeps its own text and commits (debounced) to the URL.
  const [term, setTerm] = useState(search);
  const settled = useDebouncedValue(term, 400);
  // Commit the settled text into the URL once it differs from the current query value.
  useEffect(() => {
    if (settled !== search) setParam('search', settled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  const [minDraft, setMinDraft] = useState(minPrice);
  const [maxDraft, setMaxDraft] = useState(maxPrice);

  const pagination = data?.pagination ?? { page, pages: 1, total: 0, limit: 12 };
  const products = data?.data ?? [];
  const flatCats = useMemo(() => flatten(cats.data?.data ?? []), [cats.data]);

  const activeChips = [
    search && { key: 'search', label: `“${search}”` },
    category && { key: 'category', label: catName(flatCats, category) },
    featured && { key: 'featured', label: 'Featured' },
    newArrivals && { key: 'newArrivals', label: 'New arrivals' },
    inStock && { key: 'inStock', label: 'In stock only' },
    minPrice && { key: 'minPrice', label: `≥ ${formatMoney(minPrice)}` },
    maxPrice && { key: 'maxPrice', label: `≤ ${formatMoney(maxPrice)}` },
  ].filter(Boolean);

  const title = category ? catName(flatCats, category) : search ? `Results for “${search}”` : 'All products';

  return (
    <>
      <Breadcrumb items={[{ label: 'Products', to: '/products' }, ...(category ? [{ label: title }] : [])]} />
      <h1 className="page-title">{title}</h1>

      <div className="catalog">
        {/* ── Filters ────────────────────────────────────────────────────── */}
        <aside className="catalog__sidebar">
          <form className="filters" onSubmit={(e) => e.preventDefault()}>
            <div className="filters__group">
              <div className="filters__title">Search</div>
              <input className="input" type="search" placeholder="Search products…" value={term} onChange={(e) => setTerm(e.target.value)} />
            </div>

            <div className="filters__group">
              <div className="filters__title">Category</div>
              <div className="filters__list">
                {(cats.data?.data ?? []).map((root) => (
                  <div key={root.id}>
                    <label className="filters__option">
                      <input type="radio" name="cat" checked={category === root.slug} onChange={() => setParam('category', category === root.slug ? '' : root.slug)} />
                      <span>{root.name}</span><span className="count">{root.totalProductCount}</span>
                    </label>
                    {(root.children ?? []).map((child) => (
                      <label className="filters__option filters__sub" key={child.id}>
                        <input type="radio" name="cat" checked={category === child.slug} onChange={() => setParam('category', category === child.slug ? '' : child.slug)} />
                        <span>{child.name}</span><span className="count">{child.totalProductCount}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="filters__group">
              <div className="filters__title">Price (RWF)</div>
              <div className="filters__price">
                <input className="input" type="number" min="0" placeholder="Min" value={minDraft} onChange={(e) => setMinDraft(e.target.value)} />
                <span>–</span>
                <input className="input" type="number" min="0" placeholder="Max" value={maxDraft} onChange={(e) => setMaxDraft(e.target.value)} />
              </div>
              <div style={{ marginTop: 'var(--space-2)', display: 'flex', gap: 'var(--space-2)' }}>
                <button type="button" className="btn btn--teal btn--sm" onClick={() => update({ minPrice: minDraft, maxPrice: maxDraft })}>Apply</button>
                {(minPrice || maxPrice) && (
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => { setMinDraft(''); setMaxDraft(''); update({ minPrice: '', maxPrice: '' }); }}>Clear</button>
                )}
              </div>
            </div>

            <div className="filters__group">
              <label className="filters__check">
                <input type="checkbox" checked={inStock} onChange={(e) => setParam('inStock', e.target.checked ? 'true' : '')} />
                <span>In stock only</span>
              </label>
            </div>
          </form>
        </aside>

        {/* ── Results ────────────────────────────────────────────────────── */}
        <div className="catalog__main">
          <div className="catalog__toolbar">
            <span className="catalog__count" aria-live="polite">
              {loading && !products.length ? 'Loading…' : `${pagination.total} product(s)`}
            </span>
            <label className="catalog__sort">
              Sort
              <select className="select" value={sort} onChange={(e) => setParam('sort', e.target.value)}>
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>

          {activeChips.length > 0 && (
            <div className="active-filters">
              {activeChips.map((chip) => (
                <span className="chip" key={chip.key}>
                  {chip.label}
                  <button type="button" aria-label={`Remove ${chip.label}`} onClick={() => removeChip(setParam, chip.key, navigate, pathSlug)}>×</button>
                </span>
              ))}
              <button type="button" className="btn btn--outline btn--sm" onClick={() => (pathSlug ? navigate('/products') : setParams({}, { replace: true }))}>Clear all</button>
            </div>
          )}

          <ProductGrid
            products={products}
            loading={loading}
            error={error}
            onRetry={reload}
            emptyTitle="No products match your filters"
            emptyHint="Try removing a filter or searching for something else."
            emptyAction={{ to: '/products', label: 'View all products' }}
          />

          <Pagination
            page={pagination.page}
            pages={pagination.pages}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={(p) => setParam('page', p)}
          />
        </div>
      </div>
    </>
  );
}

function flatten(nodes, out = []) {
  for (const n of nodes) { out.push(n); flatten(n.children ?? [], out); }
  return out;
}
function catName(flat, slug) {
  return flat.find((c) => c.slug === slug)?.name ?? slug;
}
function removeChip(setParam, key, navigate, pathSlug) {
  if (key === 'category' && pathSlug) { navigate('/products'); return; }
  setParam(key, key === 'inStock' || key === 'featured' || key === 'newArrivals' ? '' : '');
}
