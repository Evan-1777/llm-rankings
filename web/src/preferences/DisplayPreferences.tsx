import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, errorMessage } from "../api/client";
import type { DisplaySettings } from "../api/types";
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
  /** Site-wide setting: anonymous visitors only see the maintenance page. */
  maintenanceMode: boolean;
  setScorePercentageMode: (value: boolean) => Promise<void>;
  setMaintenanceMode: (value: boolean) => Promise<void>;
  loading: boolean;
  saving: boolean;
}

const DisplayPreferencesContext = createContext<DisplayPreferencesValue>({
  dimensionScoreEmphasis: true,
  setDimensionScoreEmphasis: () => {},
  scorePercentageMode: false,
  maintenanceMode: false,
  setScorePercentageMode: async () => {},
  setMaintenanceMode: async () => {},
  loading: false,
  saving: false,
});

export function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [dimensionScoreEmphasis, setEmphasis] = useState(() => readDimensionScoreEmphasis(browserStorage()));
  const [scorePercentageMode, setPercentage] = useState(false);
  const [maintenanceMode, setMaintenance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .displaySettings(controller.signal)
      .then((settings) => {
        setPercentage(settings.scorePercentageMode);
        setMaintenance(settings.maintenanceMode);
      })
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

  const saveSiteSettings = useCallback(
    async (next: DisplaySettings) => {
      const previous = { scorePercentageMode, maintenanceMode };
      setPercentage(next.scorePercentageMode);
      setMaintenance(next.maintenanceMode);
      setSaving(true);
      try {
        const saved = await api.updateDisplaySettings(next);
        setPercentage(saved.scorePercentageMode);
        setMaintenance(saved.maintenanceMode);
      } catch (error) {
        setPercentage(previous.scorePercentageMode);
        setMaintenance(previous.maintenanceMode);
        toast(errorMessage(error), "error");
      } finally {
        setSaving(false);
      }
    },
    [scorePercentageMode, maintenanceMode, toast],
  );

  const setScorePercentageMode = useCallback(
    (value: boolean) => saveSiteSettings({ scorePercentageMode: value, maintenanceMode }),
    [saveSiteSettings, maintenanceMode],
  );

  const setMaintenanceMode = useCallback(
    (value: boolean) => saveSiteSettings({ scorePercentageMode, maintenanceMode: value }),
    [saveSiteSettings, scorePercentageMode],
  );

  const contextValue = useMemo(
    () => ({
      dimensionScoreEmphasis,
      setDimensionScoreEmphasis,
      scorePercentageMode,
      maintenanceMode,
      setScorePercentageMode,
      setMaintenanceMode,
      loading,
      saving,
    }),
    [
      dimensionScoreEmphasis,
      setDimensionScoreEmphasis,
      scorePercentageMode,
      maintenanceMode,
      setScorePercentageMode,
      setMaintenanceMode,
      loading,
      saving,
    ],
  );

  return <DisplayPreferencesContext.Provider value={contextValue}>{children}</DisplayPreferencesContext.Provider>;
}

export function useDisplayPreferences(): DisplayPreferencesValue {
  return useContext(DisplayPreferencesContext);
}
