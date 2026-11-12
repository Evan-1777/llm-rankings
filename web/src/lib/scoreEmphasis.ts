import {
  barWidth,
  boardColumns,
  dimensionMax,
  formatScore,
  groupValue,
  snapshotBaselines,
  type Dimension,
  type RankRow,
} from "../domain/ranking.ts";

export interface ScoreRow {
  scores: Record<string, number>;
  /** Dimensions this model does not use; they stay out of the colour range. */
  skips?: number[];
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

/** Highest valid score in one comparison set; 0 when the set has no non-negative finite value. */
export function scoreMax(values: Iterable<number | null | undefined>): number {
  let max = 0;
  for (const value of values) {
    if (value == null || !Number.isFinite(value) || value < 0) continue;
    if (value > max) max = value;
  }
  return max;
}

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
    const rated = rows.filter((row) => !row.skips?.includes(id));
    const range = scoreRange(rated.map((row) => row.scores[String(id)]));
    if (range) ranges.set(id, range);
  }
  return ranges;
}

/** Display range and maximum of one board column; the tone and both percentage modes read both. */
export interface ColumnDisplay {
  range: ScoreRange | null;
  max: number;
}

export interface BoardDisplays {
  compositeRange: ScoreRange | null;
  compositeMax: number;
  /** Per dimension id; every dimension has an entry, even without a range. */
  dimensions: Map<number, ColumnDisplay>;
  /** Per group name. */
  groups: Map<string, ColumnDisplay>;
}

/**
 * Display range and maximum of every board column in one snapshot. The board and
 * its PNG export read this single definition, so the tone colours and percentages
 * of an exported image always match the rankings page that produced it.
 */
export function boardDisplays(dimensions: Dimension[], models: RankRow[]): BoardDisplays {
  const baselines = snapshotBaselines(dimensions);
  const ranges = dimensionScoreRanges(models, dimensions.map((dimension) => dimension.id));
  const groups = new Map<string, ColumnDisplay>();
  for (const group of boardColumns(dimensions).groups) {
    // A group column reads like a dimension column, so its range comes from the
    // group values the board actually shows.
    const values = models.map((model) => groupValue(group, model.scores, baselines, model.skips));
    groups.set(group.name, { range: scoreRange(values), max: scoreMax(values) });
  }
  return {
    compositeRange: scoreRange(models.map((model) => model.score)),
    compositeMax: scoreMax(models.map((model) => model.score)),
    dimensions: new Map(
      dimensions.map((dimension) => [
        dimension.id,
        { range: ranges.get(dimension.id) ?? null, max: dimensionMax(models, dimension.id) },
      ]),
    ),
    groups,
  };
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

/** Share of the highest score in the same comparison set; zero is a real value, an absent maximum is undefined. */
export function maxSharePercent(value: number | null | undefined, max: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  if (max == null || !Number.isFinite(max) || max <= 0) return null;
  const percent = (value / max) * 100;
  if (!Number.isFinite(percent)) return null;
  return Math.min(100, Math.max(0, percent));
}

/** Formats the max share with one decimal; only a real zero renders as 0% and only the true maximum as 100%. */
export function formatMaxSharePercent(value: number | null | undefined, max: number | null | undefined): string {
  const percent = maxSharePercent(value, max);
  if (percent == null) return "—";
  const best = value === max;
  let rounded = Math.round(percent * 10) / 10;
  if (!best && rounded >= 100) rounded = 99.9;
  if (!best && value !== 0 && rounded <= 0) rounded = 0.1;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

export interface ScoreDisplayMode {
  percentage: boolean;
  maxShare: boolean;
}

/** Chooses the active display formula once; pages must not nest the two mode flags. Actual values default to the two-decimal composite format; dimension cells pass formatDimension. */
export function formatDisplayScore(
  value: number | null | undefined,
  mode: ScoreDisplayMode,
  range: ScoreRange | null | undefined,
  max: number | null | undefined,
  actual: (value: number | null | undefined) => string = formatScore,
): string {
  if (!mode.percentage) return actual(value);
  return mode.maxShare ? formatMaxSharePercent(value, max) : formatStrengthPercentile(value, range);
}

/** Chooses the label that matches the active percentage mode. */
export function displayScoreLabel(
  mode: ScoreDisplayMode,
  actual: string,
  strength: string,
  maxShare: string,
): string {
  if (!mode.percentage) return actual;
  return mode.maxShare ? maxShare : strength;
}

/**
 * Fill of the bar drawn beside a score: the strength percentile in 分差 mode, the
 * share of the highest score otherwise, so the bar and the number agree.
 */
export function barPercent(
  value: number | null | undefined,
  mode: ScoreDisplayMode,
  range: ScoreRange | null | undefined,
  max: number | null | undefined,
): number {
  if (mode.percentage && !mode.maxShare) return strengthPercentile(value, range) ?? 0;
  return barWidth(value, max ?? 0);
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
