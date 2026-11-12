export interface ParsedScore {
  value: number | null;
  /** True when the cell holds the skip keyword instead of a rating. */
  skip: boolean;
  error: string | null;
}

export const SCORE_INPUT_ERROR = "请输入不小于 0 的有限数";

/** The cell keyword that marks a dimension as skipped; case-insensitive. */
export const SKIP_KEYWORD = "skip";

/**
 * Shared editing contract: an empty string clears the score, "skip" marks the
 * dimension as skipped, otherwise the value must be finite and non-negative and
 * is rounded to one decimal.
 */
export function parseScoreInput(raw: string): ParsedScore {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null, skip: false, error: null };
  if (trimmed.toLowerCase() === SKIP_KEYWORD) return { value: null, skip: true, error: null };
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return { value: null, skip: false, error: SCORE_INPUT_ERROR };
  }
  return { value: Math.round(numeric * 10) / 10, skip: false, error: null };
}
