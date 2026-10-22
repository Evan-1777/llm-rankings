export interface ScoreRow {
  scores: Record<string, number>;
}

export interface ScoreRange {
  min: number;
  max: number;
}

export interface ScoreTone {
  direction: "low" | "high";
  strength: number;
}

/** Band around the midpoint that stays neutral, so middle scores keep the paper background. */
const NEUTRAL_BAND = 0.04;

/** Lowest visible tone strength; off-centre scores never fade back into the paper. */
const MIN_TONE_STRENGTH = 0.18;

/** Full-board range of one comparison set, used only for display. Fewer than two distinct valid values have no range. */
export function scoreRange(values: Iterable<number | null | undefined>): ScoreRange | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value == null || !Number.isFinite(value) || value < 0) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return max > min ? { min, max } : null;
}

/** Full-board range per dimension, used only for display. Dimensions without at least two distinct valid values are omitted so equal scores stay neutral. */
export function dimensionScoreRanges(rows: readonly ScoreRow[], dimensionIds: readonly number[]): Map<number, ScoreRange> {
  const ranges = new Map<number, ScoreRange>();
  for (const id of dimensionIds) {
    const range = scoreRange(rows.map((row) => row.scores[String(id)]));
    if (range) ranges.set(id, range);
  }
  return ranges;
}

/** Relative strength inside the range, where the highest score is 100% and the lowest is 1%. */
export function strengthPercentile(value: number | null | undefined, range: ScoreRange | null | undefined): number | null {
  if (range == null || value == null || !Number.isFinite(value) || value < 0) return null;
  const span = range.max - range.min;
  if (!(span > 0)) return null;
  // Divide before multiplying so scores near Number.MAX_VALUE cannot overflow.
  const strength = 1 + 99 * ((value - range.min) / span);
  if (!Number.isFinite(strength)) return null;
  return Math.min(100, Math.max(1, strength));
}

/** Formats the strength percentile with one decimal; only real extremes may render as 1% or 100%. */
export function formatStrengthPercentile(value: number | null | undefined, range: ScoreRange | null | undefined): string {
  const strength = strengthPercentile(value, range);
  if (strength == null || range == null) return "—";
  const best = value === range.max;
  const worst = value === range.min;
  let rounded = Math.round(strength * 10) / 10;
  if (!best && rounded >= 100) rounded = 99.9;
  if (!worst && rounded <= 1) rounded = 1.1;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

/** Tone of a score inside its range: warm red when low, cool blue when high, nothing near the middle. */
export function scoreEmphasisTone(value: number | null | undefined, range: ScoreRange | null | undefined): ScoreTone | null {
  if (range == null || value == null || !Number.isFinite(value) || value < 0) return null;
  const span = range.max - range.min;
  if (!(span > 0)) return null;
  const position = Math.min(1, Math.max(0, (value - range.min) / span));
  if (Math.abs(position - 0.5) < NEUTRAL_BAND) return null;
  return {
    direction: position < 0.5 ? "low" : "high",
    strength: MIN_TONE_STRENGTH + (1 - MIN_TONE_STRENGTH) * Math.abs(position * 2 - 1),
  };
}
