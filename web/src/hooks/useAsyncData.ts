import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/** Minimal fetch-on-mount hook with abort cleanup and manual reload. */
export function useAsyncData<T>(load: (signal: AbortSignal) => Promise<T>, deps: DependencyList) {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState((previous) => ({ data: previous.data, loading: true, error: null }));
    loadRef
      .current(controller.signal)
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setState((previous) => ({
          data: previous.data,
          loading: false,
          error: error instanceof Error ? error : new Error("加载失败"),
        }));
      });
    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { ...state, reload };
}
