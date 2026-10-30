import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import SectionHead from '../components/SectionHead.jsx';
import HeroSlider from '../components/HeroSlider.jsx';
import ProductCard from '../components/ProductCard.jsx';
import NewsletterForm from '../components/NewsletterForm.jsx';
import { SkeletonGrid } from '../components/Loader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { useAsyncData } from '../hooks/useAsyncData.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { api } from '../services/api.js';
import { cx } from '../utils/format.js';

/**
 * Home page (spec §4A). It composes several independent data rails — featured, popular
 * categories, best-selling, new arrivals — each fetched on its own so one slow rail
 * can't blank the whole page. The "hero" slider and trust tiles are static marketing
 * copy that never depends on the API.
 */
function Rail({ title, linkTo, loader, skeleton = 4 }) {
  const { data, loading, error, reload } = useAsyncData(loader, []);
  const products = data?.data;

  return (
    <section className="section--tight">
      <SectionHead title={title} linkTo={linkTo} />
      {error && !products
        ? <ErrorState message={error} onRetry={reload} />
        : loading && !products
          ? <SkeletonGrid count={skeleton} />
          : (
            <div className={cx('product-grid', 'product-grid--rails')}>
              {(products ?? []).slice(0, skeleton).map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
    </section>
  );
}

export default function Home() {
  useDocumentTitle('Quality goods, delivered');
  const cats = useAsyncData(() => api.categories.tree(), []);

  return (
    <>
      {/* ── Hero slider ──────────────────────────────────────────────────── */}
      <HeroSlider />

      {/* ── Trust props ──────────────────────────────────────────────────── */}
      <section className="section--tight">
        <div className="props">
          <div className="prop"><span className="prop__icon" aria-hidden="true"><Truck size={20} /></span><div><h4>Fast delivery</h4><p>Same-day in Kigali, 2–3 days upcountry.</p></div></div>
          <div className="prop"><span className="prop__icon" aria-hidden="true"><ShieldCheck size={20} /></span><div><h4>Secure payment</h4><p>MoMo, card and cash on delivery.</p></div></div>
          <div className="prop"><span className="prop__icon" aria-hidden="true"><BadgeCheck size={20} /></span><div><h4>Genuine products</h4><p>Every item sourced with a warranty.</p></div></div>
          <div className="prop"><span className="prop__icon" aria-hidden="true"><RotateCcw size={20} /></span><div><h4>Easy returns</h4><p>7-day returns on unused items.</p></div></div>
        </div>
      </section>

      {/* ── Popular categories ───────────────────────────────────────────── */}
      <section className="section--tight">
        <SectionHead title="Shop by category" linkTo="/products" linkLabel="Browse all" />
        {cats.error
          ? <ErrorState message={cats.error} onRetry={cats.reload} />
          : (
            <div className="tile-grid">
              {(cats.data?.data ?? []).slice(0, 8).map((c) => (
                <Link className="tile" key={c.id} to={`/categories/${c.slug}`}>
                  <div className="tile__name">{c.name}</div>
                  <div className="tile__count">{c.totalProductCount} items</div>
                </Link>
              ))}
            </div>
          )}
      </section>

      <Rail title="Featured products" linkTo="/products?featured=true" loader={() => api.products.list({ featured: 'true', limit: 4 })} />

      {/* ── Promo banners ────────────────────────────────────────────────── */}
      <section className="section--tight">
        <div className="banner-grid">
          <Link className="banner banner--teal" to="/categories/electronics"><div><h3>Phone &amp; laptop week</h3><p>Up to 15% off selected tech</p></div><ArrowRight size={22} aria-hidden="true" /></Link>
          <Link className="banner banner--orange" to="/categories/fashion"><div><h3>New Ankara collection</h3><p>Handmade Rwandan fashion</p></div><ArrowRight size={22} aria-hidden="true" /></Link>
          <Link className="banner banner--charcoal" to="/products?newArrivals=true"><div><h3>Fresh arrivals</h3><p>See what just landed</p></div><ArrowRight size={22} aria-hidden="true" /></Link>
        </div>
      </section>

      <Rail title="Best selling" linkTo="/products?sort=best-selling" loader={() => api.products.list({ sort: 'best-selling', limit: 4 })} />
      <Rail title="New arrivals" linkTo="/products?newArrivals=true" loader={() => api.products.list({ newArrivals: 'true', limit: 4 })} />

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section className="section--tight">
        <SectionHead title="What shoppers say" />
        <div className="quotes">
          <blockquote className="quote"><p>"Ordered a blender on Monday, delivered to my office on Tuesday. Genuine product, sealed box."</p><footer><strong>Aline N.</strong> · Kigali</footer></blockquote>
          <blockquote className="quote"><p>"The Ankara dress is even nicer in person. Great quality fabric and the fit is perfect."</p><footer><strong>Eric M.</strong> · Musanze</footer></blockquote>
          <blockquote className="quote"><p>"Paid with MoMo, got an SMS receipt, tracking worked the whole way. Very reliable."</p><footer><strong>Fauziya K.</strong> · Rubavu</footer></blockquote>
        </div>
      </section>

      {/* ── Newsletter band ──────────────────────────────────────────────── */}
      <section className="section--tight">
        <div className="newsletter">
          <div>
            <h3>Get deals before everyone else</h3>
            <p>Join the newsletter for offers, new arrivals and exclusive discounts.</p>
          </div>
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}
