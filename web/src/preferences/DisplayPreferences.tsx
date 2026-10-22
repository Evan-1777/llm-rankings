import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useToast } from "../components/Toast";
import {
  browserStorage,
  readDimensionScoreEmphasis,
  readScorePercentageMode,
  writeDimensionScoreEmphasis,
  writeScorePercentageMode,
} from "./preferenceStorage";

interface DisplayPreferencesValue {
  dimensionScoreEmphasis: boolean;
  setDimensionScoreEmphasis: (value: boolean) => void;
  scorePercentageMode: boolean;
  setScorePercentageMode: (value: boolean) => void;
}

const DisplayPreferencesContext = createContext<DisplayPreferencesValue>({
  dimensionScoreEmphasis: true,
  setDimensionScoreEmphasis: () => {},
  scorePercentageMode: false,
  setScorePercentageMode: () => {},
});

export function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [dimensionScoreEmphasis, setEmphasis] = useState(() => readDimensionScoreEmphasis(browserStorage()));
  const [scorePercentageMode, setPercentage] = useState(() => readScorePercentageMode(browserStorage()));

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
    (value: boolean) => {
      setPercentage(value);
      if (!writeScorePercentageMode(browserStorage(), value)) {
        toast("显示设置仅在本次会话生效", "error");
      }
    },
    [toast],
  );

  const contextValue = useMemo(
    () => ({ dimensionScoreEmphasis, setDimensionScoreEmphasis, scorePercentageMode, setScorePercentageMode }),
    [dimensionScoreEmphasis, setDimensionScoreEmphasis, scorePercentageMode, setScorePercentageMode],
  );

  return <DisplayPreferencesContext.Provider value={contextValue}>{children}</DisplayPreferencesContext.Provider>;
}

export function useDisplayPreferences(): DisplayPreferencesValue {
  return useContext(DisplayPreferencesContext);
}
