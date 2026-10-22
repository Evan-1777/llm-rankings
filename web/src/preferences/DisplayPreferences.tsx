import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, errorMessage } from "../api/client";
import { useToast } from "../components/Toast";
import {
  browserStorage,
  readDimensionScoreEmphasis,
  writeDimensionScoreEmphasis,
} from "./preferenceStorage";

interface DisplayPreferencesValue {
  dimensionScoreEmphasis: boolean;
  setDimensionScoreEmphasis: (value: boolean) => void;
  /** Site-wide setting: every visitor of this deployment reads the same value. */
  scorePercentageMode: boolean;
  setScorePercentageMode: (value: boolean) => Promise<void>;
  loading: boolean;
  saving: boolean;
}

const DisplayPreferencesContext = createContext<DisplayPreferencesValue>({
  dimensionScoreEmphasis: true,
  setDimensionScoreEmphasis: () => {},
  scorePercentageMode: false,
  setScorePercentageMode: async () => {},
  loading: false,
  saving: false,
});

export function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [dimensionScoreEmphasis, setEmphasis] = useState(() => readDimensionScoreEmphasis(browserStorage()));
  const [scorePercentageMode, setPercentage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .displaySettings(controller.signal)
      .then((settings) => setPercentage(settings.scorePercentageMode))
      // A read failure keeps the default absolute scores and must not block the page.
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const setDimensionScoreEmphasis = useCallback(
    (value: boolean) => {
      setEmphasis(value);
      if (!writeDimensionScoreEmphasis(browserStorage(), value)) {
        toast("显示设置仅在本次会话生效", "error");
      }
    },
    [toast],
  );

  const setScorePercentageMode = useCallback(
    async (value: boolean) => {
      const previous = scorePercentageMode;
      setPercentage(value);
      setSaving(true);
      try {
        const saved = await api.updateDisplaySettings({ scorePercentageMode: value });
        setPercentage(saved.scorePercentageMode);
      } catch (error) {
        setPercentage(previous);
        toast(errorMessage(error), "error");
      } finally {
        setSaving(false);
      }
    },
    [scorePercentageMode, toast],
  );

  const contextValue = useMemo(
    () => ({
      dimensionScoreEmphasis,
      setDimensionScoreEmphasis,
      scorePercentageMode,
      setScorePercentageMode,
      loading,
      saving,
    }),
    [dimensionScoreEmphasis, setDimensionScoreEmphasis, scorePercentageMode, setScorePercentageMode, loading, saving],
  );

  return <DisplayPreferencesContext.Provider value={contextValue}>{children}</DisplayPreferencesContext.Provider>;
}

export function useDisplayPreferences(): DisplayPreferencesValue {
  return useContext(DisplayPreferencesContext);
}
