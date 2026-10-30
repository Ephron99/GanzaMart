import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Browsers keep the scroll position when you navigate, so a new page can open
// half-way down. Reset to the top on every path change — but not on hash links,
// which should jump to their anchor untouched.
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash]);

  return null;
}
