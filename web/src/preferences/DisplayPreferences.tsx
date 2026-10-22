import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useToast } from "../components/Toast";
import { browserStorage, readDimensionScoreEmphasis, writeDimensionScoreEmphasis } from "./preferenceStorage";

interface DisplayPreferencesValue {
  dimensionScoreEmphasis: boolean;
  setDimensionScoreEmphasis: (value: boolean) => void;
}

const DisplayPreferencesContext = createContext<DisplayPreferencesValue>({
  dimensionScoreEmphasis: true,
  setDimensionScoreEmphasis: () => {},
});

export function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [dimensionScoreEmphasis, setValue] = useState(() => readDimensionScoreEmphasis(browserStorage()));

  const setDimensionScoreEmphasis = useCallback(
    (value: boolean) => {
      setValue(value);
      if (!writeDimensionScoreEmphasis(browserStorage(), value)) {
        toast("显示设置仅在本次会话生效", "error");
      }
    },
    [toast],
  );

  const contextValue = useMemo(
    () => ({ dimensionScoreEmphasis, setDimensionScoreEmphasis }),
    [dimensionScoreEmphasis, setDimensionScoreEmphasis],
  );

  return <DisplayPreferencesContext.Provider value={contextValue}>{children}</DisplayPreferencesContext.Provider>;
}

export function useDisplayPreferences(): DisplayPreferencesValue {
  return useContext(DisplayPreferencesContext);
}
