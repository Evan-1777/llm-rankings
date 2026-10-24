import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, api, errorMessage } from "../api/client";
import type { DisplaySettings } from "../api/types";
import { useToast } from "../components/Toast";
import {
  browserStorage,
  readDimensionScoreEmphasis,
  writeDimensionScoreEmphasis,
} from "./preferenceStorage";

interface SaveSettingsResult {
  ok: boolean;
  fields?: Record<string, string>;
}

interface DisplayPreferencesValue {
  dimensionScoreEmphasis: boolean;
  setDimensionScoreEmphasis: (value: boolean) => void;
  /** Site-wide setting: every visitor of this deployment reads the same value. */
  scorePercentageMode: boolean;
  /** Site-wide setting: percentages are relative to the highest score instead of the min-max spread. */
  scorePercentageMaxMode: boolean;
  /** Site-wide setting: anonymous visitors only see the maintenance page. */
  maintenanceMode: boolean;
  /** Site-wide Markdown notes shown below the rankings; empty when unset. */
  rankingNotes: string;
  setScorePercentageMode: (value: boolean) => Promise<void>;
  setScorePercentageMaxMode: (value: boolean) => Promise<void>;
  setMaintenanceMode: (value: boolean) => Promise<void>;
  saveRankingNotes: (notes: string) => Promise<SaveSettingsResult>;
  /** Initial read failed; site writes stay disabled until a retry succeeds. */
  readError: Error | null;
  retrying: boolean;
  retryRead: () => void;
  loading: boolean;
  saving: boolean;
}

const DisplayPreferencesContext = createContext<DisplayPreferencesValue>({
  dimensionScoreEmphasis: true,
  setDimensionScoreEmphasis: () => {},
  scorePercentageMode: false,
  scorePercentageMaxMode: false,
  maintenanceMode: false,
  rankingNotes: "",
  setScorePercentageMode: async () => {},
  setScorePercentageMaxMode: async () => {},
  setMaintenanceMode: async () => {},
  saveRankingNotes: async () => ({ ok: false }),
  readError: null,
  retrying: false,
  retryRead: () => {},
  loading: false,
  saving: false,
});

export function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [dimensionScoreEmphasis, setEmphasis] = useState(() => readDimensionScoreEmphasis(browserStorage()));
  const [scorePercentageMode, setPercentage] = useState(false);
  const [scorePercentageMaxMode, setPercentageMax] = useState(false);
  const [maintenanceMode, setMaintenance] = useState(false);
  const [rankingNotes, setRankingNotes] = useState("");
  const [readError, setReadError] = useState<Error | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const applySettings = useCallback((settings: DisplaySettings) => {
    setPercentage(settings.scorePercentageMode);
    setPercentageMax(settings.scorePercentageMaxMode);
    setMaintenance(settings.maintenanceMode);
    setRankingNotes(settings.rankingNotes);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api
      .displaySettings(controller.signal)
      .then((settings) => {
        applySettings(settings);
        setReadError(null);
      })
      // A read failure keeps the default absolute scores and must not block the page.
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setReadError(error instanceof Error ? error : new Error("加载失败"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applySettings]);

  const retryRead = useCallback(() => {
    if (retrying) return;
    setRetrying(true);
    api
      .displaySettings()
      .then((settings) => {
        applySettings(settings);
        setReadError(null);
      })
      .catch((error: unknown) => {
        setReadError(error instanceof Error ? error : new Error("加载失败"));
      })
      .finally(() => setRetrying(false));
  }, [applySettings, retrying]);

  const setDimensionScoreEmphasis = useCallback(
    (value: boolean) => {
      setEmphasis(value);
      if (!writeDimensionScoreEmphasis(browserStorage(), value)) {
        toast("显示设置仅在本次会话生效", "error");
      }
    },
    [toast],
  );

  const saveSiteSettings = useCallback(
    async (next: DisplaySettings): Promise<SaveSettingsResult> => {
      const previous = { scorePercentageMode, scorePercentageMaxMode, maintenanceMode, rankingNotes };
      applySettings(next);
      setSaving(true);
      try {
        const saved = await api.updateDisplaySettings(next);
        applySettings(saved);
        return { ok: true };
      } catch (error) {
        applySettings(previous);
        // Field errors belong to the form that produced them; everything else surfaces as a toast.
        if (error instanceof ApiError && error.fields) return { ok: false, fields: error.fields };
        toast(errorMessage(error), "error");
        return { ok: false };
      } finally {
        setSaving(false);
      }
    },
    [applySettings, scorePercentageMode, scorePercentageMaxMode, maintenanceMode, rankingNotes, toast],
  );

  const setScorePercentageMode = useCallback(
    (value: boolean) =>
      saveSiteSettings({ scorePercentageMode: value, scorePercentageMaxMode, maintenanceMode, rankingNotes }).then(
        () => undefined,
      ),
    [saveSiteSettings, scorePercentageMaxMode, maintenanceMode, rankingNotes],
  );

  const setScorePercentageMaxMode = useCallback(
    (value: boolean) =>
      saveSiteSettings({ scorePercentageMode, scorePercentageMaxMode: value, maintenanceMode, rankingNotes }).then(
        () => undefined,
      ),
    [saveSiteSettings, scorePercentageMode, maintenanceMode, rankingNotes],
  );

  const setMaintenanceMode = useCallback(
    (value: boolean) =>
      saveSiteSettings({ scorePercentageMode, scorePercentageMaxMode, maintenanceMode: value, rankingNotes }).then(
        () => undefined,
      ),
    [saveSiteSettings, scorePercentageMode, scorePercentageMaxMode, rankingNotes],
  );

  const saveRankingNotes = useCallback(
    (notes: string) => saveSiteSettings({ scorePercentageMode, scorePercentageMaxMode, maintenanceMode, rankingNotes: notes }),
    [saveSiteSettings, scorePercentageMode, scorePercentageMaxMode, maintenanceMode],
  );

  const contextValue = useMemo(
    () => ({
      dimensionScoreEmphasis,
      setDimensionScoreEmphasis,
      scorePercentageMode,
      scorePercentageMaxMode,
      maintenanceMode,
      rankingNotes,
      setScorePercentageMode,
      setScorePercentageMaxMode,
      setMaintenanceMode,
      saveRankingNotes,
      readError,
      retrying,
      retryRead,
      loading,
      saving,
    }),
    [
      dimensionScoreEmphasis,
      setDimensionScoreEmphasis,
      scorePercentageMode,
      scorePercentageMaxMode,
      maintenanceMode,
      rankingNotes,
      setScorePercentageMode,
      setScorePercentageMaxMode,
      setMaintenanceMode,
      saveRankingNotes,
      readError,
      retrying,
      retryRead,
      loading,
      saving,
    ],
  );

  return <DisplayPreferencesContext.Provider value={contextValue}>{children}</DisplayPreferencesContext.Provider>;
}

export function useDisplayPreferences(): DisplayPreferencesValue {
  return useContext(DisplayPreferencesContext);
}
