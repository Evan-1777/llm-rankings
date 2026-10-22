export const MIN_EMPHASIS_ALPHA = 0.06;
export const MAX_EMPHASIS_ALPHA = 0.18;

export interface ScoreRow {
  scores: Record<string, number>;
}

export interface ScoreRange {
  min: number;
  max: number;
}

/**
 * Full-board range per dimension, used only for display. Dimensions without at
 * least two distinct valid values are omitted so equal scores stay neutral.
 */
export function dimensionScoreRanges(rows: readonly ScoreRow[], dimensionIds: readonly number[]): Map<number, ScoreRange> {
  const ranges = new Map<number, ScoreRange>();
  for (const id of dimensionIds) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of rows) {
      const value = row.scores[String(id)];
      if (value == null || !Number.isFinite(value) || value < 0) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (max > min) ranges.set(id, { min, max });
  }
  return ranges;
}

/** Maps a score to the ink background alpha, or null when the score is not emphasisable. */
export function scoreEmphasisAlpha(value: number | null | undefined, range: ScoreRange | undefined): number | null {
  if (range == null || value == null || !Number.isFinite(value) || value < 0) return null;
  const span = range.max - range.min;
  if (!(span > 0)) return null;
  const position = Math.min(1, Math.max(0, (value - range.min) / span));
  const alpha = MIN_EMPHASIS_ALPHA + (MAX_EMPHASIS_ALPHA - MIN_EMPHASIS_ALPHA) * position;
  if (!Number.isFinite(alpha)) return null;
  return Math.min(MAX_EMPHASIS_ALPHA, Math.max(MIN_EMPHASIS_ALPHA, alpha));
}
