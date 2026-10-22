export interface ParsedScore {
  value: number | null;
  error: string | null;
}

export const SCORE_INPUT_ERROR = "请输入不小于 0 的有限数";

/**
 * Shared editing contract: an empty string clears the score, otherwise the
 * value must be finite and non-negative and is rounded to one decimal.
 */
export function parseScoreInput(raw: string): ParsedScore {
  if (raw.trim() === "") return { value: null, error: null };
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return { value: null, error: SCORE_INPUT_ERROR };
  }
  return { value: Math.round(numeric * 10) / 10, error: null };
}
