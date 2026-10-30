import { useCallback, useEffect, useRef, useState } from 'react';
import { readableError } from '../utils/format.js';

/**
 * Load-async-into-state, done once instead of fourteen times.
 *
 * Every page needs the same three states — loading, error, data — and the same two
 * behaviours: refetch when the inputs change, and IGNORE a response that arrives
 * after a newer request started. Without that guard, typing "ph" in the search box
 * can show results for "p" because the first (slower) request won the race.
 *
 * @param {() => Promise<any>} loader  async function; re-runs whenever `deps` change
 * @param {any[]} deps                 what to watch (query params, ids, page…)
 */
export function useAsyncData(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = requestId.current + 1;
    requestId.current = id;

    // Keep the previous data on screen while reloading: a filter change should not
    // flash an empty grid for 200 ms.
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const data = await loader();
      if (requestId.current === id) setState({ data, loading: false, error: null });
    } catch (err) {
      if (requestId.current === id) setState({ data: null, loading: false, error: readableError(err) });
    }
    // `loader` closes over the current values; `deps` says when to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
