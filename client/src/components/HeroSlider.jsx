import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from '../utils/format.js';

// The home hero is now a small carousel: brand promise → the two live promos that
// already exist further down the page → back again. Slides only ever link to real
// storefront routes, and every slide image is a genuine seeded product SVG.
// Autoplay pauses on hover/focus (a reader is a reader), and an OS "reduce motion"
// preference stops the rotation entirely — the arrows and dots still work.
const SLIDES = [
  {
    key: 'brand',
    eyebrow: 'Kigali · Since 2019',
    title: 'Everything you need, from one trusted store.',
    text: 'Genuine electronics, fashion, home essentials and more — honest prices, real stock, and delivery to every district in Rwanda.',
    actions: [
      { to: '/products', label: 'Shop all products', style: 'btn--primary' },
      { to: '/products?featured=true', label: "Today's deals", style: 'btn--outline' },
    ],
    stats: [
      { value: '20+', label: 'Products' },
      { value: '12', label: 'Categories' },
      { value: '48h', label: 'Kigali delivery' },
    ],
    art: '/images/products/galaxy-a55.svg',
  },
  {
    key: 'tech',
    eyebrow: 'This week only',
    title: 'Phone & laptop week.',
    text: 'Up to 15% off selected tech — phones, laptops and audio, sealed boxes with a real warranty.',
    actions: [
      { to: '/categories/electronics', label: 'Shop the offer', style: 'btn--primary' },
      { to: '/products?sort=best-selling', label: 'Best sellers', style: 'btn--outline' },
    ],
    art: '/images/products/hp-pavilion.svg',
  },
  {
    key: 'fashion',
    eyebrow: 'Just landed',
    title: 'New Ankara collection.',
    text: 'Handmade Rwandan fashion, cut and sewn by local tailors. Sizes made to order, photographed in our Kigali studio.',
    actions: [
      { to: '/categories/fashion', label: 'Explore fashion', style: 'btn--primary' },
      { to: '/products?newArrivals=true', label: 'Fresh arrivals', style: 'btn--outline' },
    ],
    art: '/images/products/ankara-dress.svg',
  },
];

const AUTOPLAY_MS = 6000;

export default function HeroSlider() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef(null);

  const goTo = useCallback((next) => {
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }, []);

  // Respect the OS motion preference: no auto-advance for reduced-motion users.
  const prefersReducedMotion = useRef(
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );

  useEffect(() => {
    if (paused || prefersReducedMotion.current) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [paused]);

  return (
    <section
      className="hero hero--slider"
      aria-roledescription="carousel"
      aria-label="Featured promotions"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="hero__viewport">
        <div
          ref={trackRef}
          className="hero__track"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {SLIDES.map((s, i) => (
            <div
              key={s.key}
              className="hero__slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${SLIDES.length}`}
              // React 18 needs the empty-string form; `inert` removes off-screen
              // slides from the tab order so hidden CTAs are unreachable.
              inert={i === index ? undefined : ''}
            >
              <div className="container hero__inner">
                <div>
                  <p className="hero__eyebrow">{s.eyebrow}</p>
                  <h1>{s.title}</h1>
                  <p>{s.text}</p>
                  <div className="hero__actions">
                    {s.actions.map((a) => (
                      <Link key={a.to} className={cx('btn', a.style)} to={a.to}>{a.label}</Link>
                    ))}
                  </div>
                  {s.stats && (
                    <div className="hero__stats">
                      {s.stats.map((st) => (
                        <div className="hero__stat" key={st.label}>
                          <strong>{st.value}</strong><span>{st.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="hero__art" aria-hidden="true">
                  {/* loading="lazy" keeps off-screen slides from competing for bandwidth. */}
                  <img src={s.art} alt="" width="340" height="340" loading="lazy" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button type="button" className="hero__arrow hero__arrow--prev"
        onClick={() => goTo(index - 1)} aria-label="Previous slide">
        <ChevronLeft size={22} aria-hidden="true" />
      </button>
      <button type="button" className="hero__arrow hero__arrow--next"
        onClick={() => goTo(index + 1)} aria-label="Next slide">
        <ChevronRight size={22} aria-hidden="true" />
      </button>

      <div className="hero__dots" role="tablist" aria-label="Choose a slide">
        {SLIDES.map((s, i) => (
          <button key={s.key} type="button" role="tab"
            className={cx('hero__dot', i === index && 'hero__dot--active')}
            aria-selected={i === index} aria-label={`Go to slide ${i + 1}`}
            onClick={() => goTo(i)} />
        ))}
      </div>
    </section>
  );
}
