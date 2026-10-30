import { Link, useLocation } from 'react-router-dom';
import { cx } from '../utils/format.js';

/**
 * The teal category strip (spec §4A "popular categories"). Root categories across the
 * bar; hovering/focusing one that has children reveals a sub-category row. The active
 * root (matching /categories/:slug or ?category=slug) is underlined, and its children
 * are shown without needing a hover so the keyboard/touch path is the same as the mouse.
 */
export default function CategoryNav({ categories = [] }) {
  const { pathname, search } = useLocation();
  const activeSlug = pathname.startsWith('/categories/')
    ? pathname.split('/')[2]
    : new URLSearchParams(search).get('category');

  return (
    <nav className="catnav" aria-label="Product categories">
      <div className="container">
        <div className="catnav__inner">
          <Link to="/products" className="catnav__link">All products</Link>
          {categories.map((cat) => (
            <Link
              key={cat.id}
              to={`/categories/${cat.slug}`}
              className={cx('catnav__link', activeSlug === cat.slug && 'catnav__link--active')}
            >
              {cat.name}
            </Link>
          ))}
        </div>

        {categories.filter((c) => c.slug === activeSlug && c.children?.length).map((parent) => (
          <div className="catnav__submenu" key={`sub-${parent.id}`}>
            {parent.children.map((child) => (
              <Link key={child.id} to={`/categories/${child.slug}`}>{child.name}</Link>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}
