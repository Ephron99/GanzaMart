import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// A search box that submits to the catalogue route (?search=…) instead of talking to a
// server itself — the URL stays the single source of truth, so results are shareable and
// the back button works. Enter or the button submits; both do the same thing.
export default function SearchBar({ initial = '', autoFocus = false }) {
  const [term, setTerm] = useState(initial);
  const navigate = useNavigate();

  function submit(e) {
    e.preventDefault();
    const q = term.trim();
    navigate(q ? `/products?search=${encodeURIComponent(q)}` : '/products');
  }

  return (
    <div className="searchbar">
      <form role="search" onSubmit={submit}>
        <input
          className="searchbar__input"
          type="search"
          name="search"
          placeholder="Search phones, fashion, appliances…"
          aria-label="Search products"
          value={term}
          autoFocus={autoFocus}
          onChange={(e) => setTerm(e.target.value)}
        />
        <button type="submit" className="searchbar__submit">Search</button>
      </form>
    </div>
  );
}
