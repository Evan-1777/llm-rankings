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
  /** Site-wide setting: percentages are relative to the highest score instead of the min-max spread. */
  scorePercentageMaxMode: boolean;
  /** Site-wide setting: anonymous visitors only see the maintenance page. */
  maintenanceMode: boolean;
  setScorePercentageMode: (value: boolean) => Promise<void>;
  setScorePercentageMaxMode: (value: boolean) => Promise<void>;
  setMaintenanceMode: (value: boolean) => Promise<void>;
  loading: boolean;
  saving: boolean;
}

const DisplayPreferencesContext = createContext<DisplayPreferencesValue>({
  dimensionScoreEmphasis: true,
  setDimensionScoreEmphasis: () => {},
  scorePercentageMode: false,
  scorePercentageMaxMode: false,
  maintenanceMode: false,
  setScorePercentageMode: async () => {},
  setScorePercentageMaxMode: async () => {},
  setMaintenanceMode: async () => {},
  loading: false,
  saving: false,
});

export function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [dimensionScoreEmphasis, setEmphasis] = useState(() => readDimensionScoreEmphasis(browserStorage()));
  const [scorePercentageMode, setPercentage] = useState(false);
  const [scorePercentageMaxMode, setPercentageMax] = useState(false);
  const [maintenanceMode, setMaintenance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .displaySettings(controller.signal)
      .then((settings) => {
        setPercentage(settings.scorePercentageMode);
        setPercentageMax(settings.scorePercentageMaxMode);
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
      const previous = { scorePercentageMode, scorePercentageMaxMode, maintenanceMode };
      setPercentage(next.scorePercentageMode);
      setPercentageMax(next.scorePercentageMaxMode);
      setMaintenance(next.maintenanceMode);
      setSaving(true);
      try {
        const saved = await api.updateDisplaySettings(next);
        setPercentage(saved.scorePercentageMode);
        setPercentageMax(saved.scorePercentageMaxMode);
        setMaintenance(saved.maintenanceMode);
      } catch (error) {
        setPercentage(previous.scorePercentageMode);
        setPercentageMax(previous.scorePercentageMaxMode);
        setMaintenance(previous.maintenanceMode);
        toast(errorMessage(error), "error");
      } finally {
        setSaving(false);
      }
    },
    [scorePercentageMode, scorePercentageMaxMode, maintenanceMode, toast],
  );

  const setScorePercentageMode = useCallback(
    (value: boolean) => saveSiteSettings({ scorePercentageMode: value, scorePercentageMaxMode, maintenanceMode }),
    [saveSiteSettings, scorePercentageMaxMode, maintenanceMode],
  );

  const setScorePercentageMaxMode = useCallback(
    (value: boolean) => saveSiteSettings({ scorePercentageMode, scorePercentageMaxMode: value, maintenanceMode }),
    [saveSiteSettings, scorePercentageMode, maintenanceMode],
  );

  const setMaintenanceMode = useCallback(
    (value: boolean) => saveSiteSettings({ scorePercentageMode, scorePercentageMaxMode, maintenanceMode: value }),
    [saveSiteSettings, scorePercentageMode, scorePercentageMaxMode],
  );

  const contextValue = useMemo(
    () => ({
      dimensionScoreEmphasis,
      setDimensionScoreEmphasis,
      scorePercentageMode,
      scorePercentageMaxMode,
      maintenanceMode,
      setScorePercentageMode,
      setScorePercentageMaxMode,
      setMaintenanceMode,
      loading,
      saving,
    }),
    [
      dimensionScoreEmphasis,
      setDimensionScoreEmphasis,
      scorePercentageMode,
      scorePercentageMaxMode,
      maintenanceMode,
      setScorePercentageMode,
      setScorePercentageMaxMode,
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
