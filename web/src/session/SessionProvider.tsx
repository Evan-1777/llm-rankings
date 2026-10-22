import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api/client";
import type { Bootstrap, Dimension } from "../api/types";

interface SessionValue {
  authenticated: boolean;
  loading: boolean;
  counts: Bootstrap["counts"];
  dimensions: Dimension[];
  totalWeight: number;
  now: string;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const emptyCounts = { models: 0, scoredModels: 0, dimensions: 0 };

const SessionContext = createContext<SessionValue>({
  authenticated: false,
  loading: true,
  counts: emptyCounts,
  dimensions: [],
  totalWeight: 0,
  now: "",
  refresh: async () => {},
  logout: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState(emptyCounts);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [totalWeight, setTotalWeight] = useState(0);
  const [now, setNow] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await api.bootstrap();
      setAuthenticated(data.authenticated);
      setCounts(data.counts);
      setDimensions(data.dimensions);
      setTotalWeight(data.totalWeight);
      setNow(data.now);
    } catch {
      // Keep the last known session on transient failures; the page error state covers reads.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => {
      setAuthenticated(false);
    };
    window.addEventListener("llmrank:unauthorized", onUnauthorized);
    return () => window.removeEventListener("llmrank:unauthorized", onUnauthorized);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    await refresh();
  }, [refresh]);

  const value = useMemo<SessionValue>(
    () => ({ authenticated, loading, counts, dimensions, totalWeight, now, refresh, logout }),
    [authenticated, loading, counts, dimensions, totalWeight, now, refresh, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}
