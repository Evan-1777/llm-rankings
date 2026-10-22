export const DIMENSION_SCORE_EMPHASIS_KEY = "llmrank:dimension-score-emphasis";
export const SCORE_PERCENTAGE_MODE_KEY = "llmrank:score-percentage-mode";

/** Only the literal strings "true" and "false" are stored; anything else falls back to the default. */
export function readDimensionScoreEmphasis(storage: Pick<Storage, "getItem"> | null): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(DIMENSION_SCORE_EMPHASIS_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeDimensionScoreEmphasis(storage: Pick<Storage, "setItem"> | null, value: boolean): boolean {
  if (!storage) return false;
  try {
    storage.setItem(DIMENSION_SCORE_EMPHASIS_KEY, value ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

/** Percentage mode is opt-in, so only the literal string "true" enables it. */
export function readScorePercentageMode(storage: Pick<Storage, "getItem"> | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(SCORE_PERCENTAGE_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeScorePercentageMode(storage: Pick<Storage, "setItem"> | null, value: boolean): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SCORE_PERCENTAGE_MODE_KEY, value ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
