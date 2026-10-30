import { useEffect, useState } from 'react';

/**
 * Value that settles `delay` ms after the last keystroke.
 * A search box wired directly to the API would fire a request per character —
 * six requests for "galaxy". Debounced, it fires one.
 */
export function useDebouncedValue(value, delay = 350) {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);      // the next keystroke cancels this one
  }, [value, delay]);

  return settled;
}
