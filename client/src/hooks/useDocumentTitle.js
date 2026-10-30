import { useEffect } from 'react';

// Set the browser tab title per page. Cheap, but it is what makes the back/forward
// history and open tabs legible, and the store name keeps branding on every screen.
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Ganza Mart` : 'Ganza Mart — Quality goods, delivered';
    return () => { document.title = 'Ganza Mart — Quality goods, delivered'; };
  }, [title]);
}

export default useDocumentTitle;
