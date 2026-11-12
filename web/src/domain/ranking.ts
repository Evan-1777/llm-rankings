// Pure ranking, sorting and group rules shared with the Go implementation.
export interface Dimension {
  id: number;
  name: string;
  weight: number;
  /** Dimensions sharing a name form one board column; empty means no group. */
  groupName?: string | null;
  /** Fixed percentage baseline; null means the snapshot maximum. */
  baselineMax?: number | null;
  /** Converted value a skip contributes to the composite. */
  skipMedian?: number | null;
  /** Baseline the current snapshot resolved for this dimension. */
  effectiveBaselineMax?: number | null;
}

/** Effective baselines carried by a board snapshot, keyed by dimension. */
export function snapshotBaselines(dimensions: Dimension[]): Map<number, number> {
  const baselines = new Map<number, number>();
  for (const dimension of dimensions) {
    const baseline = dimension.effectiveBaselineMax;
    if (baseline != null && Number.isFinite(baseline)) baselines.set(dimension.id, baseline);
  }
  return baselines;
}

export interface RankRow {
  slug: string;
  name: string;
  vendor: string;
  /** Hidden models sort after every visible model and never receive a rank. */
  hidden?: boolean;
  score: number | null;
  rank: number | null;
  scores: Record<string, number>;
  /** Dimensions this model does not use. */
  skips?: number[];
  /** Rated dimensions with a positive weight; drives the workbench default sort. */
  scoredCount?: number;
}

export type SortDir = "asc" | "desc";

export interface Composite {
  score: number | null;
  scoredCount: number;
}

export function formatScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  // Nudge away binary noise such as 8.694999999999999 before choosing the digit.
  return (Math.round(value * 100 + 1e-9) / 100).toFixed(2);
}

export function formatDimension(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return (Math.round(value * 10 + 1e-9) / 10).toFixed(1);
}

/**
 * Resolves the baseline of every dimension: the configured value wins,
 * otherwise the highest valid score across the provided score sets is used.
 * A fallback (the detail snapshot) only lifts an automatic baseline, which
 * keeps the preview aligned when a hidden model holds the maximum.
 */
export function resolveBaselines(
  dimensions: Dimension[],
  scoreSets: Record<string, number>[],
  fallback?: Record<number, number | null>,
): Map<number, number> {
  const baselines = new Map<number, number>();
  for (const dimension of dimensions) {
    if (dimension.baselineMax != null && Number.isFinite(dimension.baselineMax) && dimension.baselineMax > 0) {
      baselines.set(dimension.id, dimension.baselineMax);
      continue;
    }
    let max = 0;
    let scored = false;
    for (const scores of scoreSets) {
      const value = scores[String(dimension.id)];
      if (value == null || !Number.isFinite(value) || value < 0) continue;
      if (!scored || value > max) max = value;
      scored = true;
    }
    const floor = fallback?.[dimension.id];
    if (floor != null && Number.isFinite(floor) && floor >= 0) {
      max = scored ? Math.max(max, floor) : floor;
      scored = true;
    }
    if (scored) baselines.set(dimension.id, max);
  }
  return baselines;
}

/** Converts a raw score to the percentage scale; a missing or zero baseline counts as 0. */
export function convertScore(value: number, baseline: number | undefined): number {
  if (baseline == null || !Number.isFinite(baseline) || baseline <= 0) return 0;
  return (value / baseline) * 100;
}

export function skipSet(skips: Iterable<number> | undefined): Set<number> {
  return new Set(skips ?? []);
}

/**
 * The value one dimension column contributes to the composite, on the converted
 * scale: the imputed median when skipped, the converted rating when rated, and
 * nothing when the model neither rated nor skipped the dimension.
 */
export function columnValue(
  dimension: Dimension,
  scores: Record<string, number>,
  baselines: Map<number, number>,
  skips?: Iterable<number>,
): number | null {
  if (skipSet(skips).has(dimension.id)) return dimension.skipMedian ?? 0;
  const value = scores[String(dimension.id)];
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return convertScore(value, baselines.get(dimension.id));
}

export function composite(
  dimensions: Dimension[],
  scores: Record<string, number>,
  baselines: Map<number, number>,
  skips?: Iterable<number>,
): Composite {
  const skipped = skipSet(skips);
  // Accumulate in stable id order so the display order never changes the
  // floating-point result.
  const ordered = [...dimensions].sort((a, b) => a.id - b.id);
  let totalWeight = 0;
  for (const dimension of ordered) {
    if (dimension.weight > 0) totalWeight += dimension.weight;
  }
  if (totalWeight === 0) {
    return { score: null, scoredCount: 0 };
  }
  let scoredWeight = 0;
  let weighted = 0;
  let scoredCount = 0;
  for (const dimension of ordered) {
    if (dimension.weight <= 0) continue;
    const isSkipped = skipped.has(dimension.id);
    const value = scores[String(dimension.id)];
    const rated = value != null && Number.isFinite(value) && value >= 0;
    if (!rated && !isSkipped) continue;
    scoredWeight += dimension.weight;
    // A skipped dimension keeps its weight but drops out of the rated count.
    if (!isSkipped) scoredCount += 1;
    const converted = isSkipped
      ? dimension.skipMedian ?? 0
      : convertScore(value ?? 0, baselines.get(dimension.id));
    weighted += (dimension.weight / totalWeight) * converted;
  }
  if (scoredWeight === 0) {
    return { score: null, scoredCount: 0 };
  }
  return { score: weighted / (scoredWeight / totalWeight), scoredCount };
}

/* ---------------------------------------------------------------- 维度组 --- */

/** Stable group palette; the slot follows the group's order on the board. */
export const GROUP_COLORS = ["#2F6B4F", "#1F5C8B", "#8A5A16", "#6B4A8B", "#8B3A52", "#3F6B6B"] as const;

export interface DimensionGroup<T extends Dimension = Dimension> {
  name: string;
  color: string;
  /** Member dimensions in board order (each keeps its own weight). */
  dimensions: T[];
  /** Sum of the member weights, including dimensions without a rating. */
  weight: number;
}

/** One board column: a merged group or a single dimension. */
export type BoardColumn<T extends Dimension = Dimension> =
  | { kind: "group"; group: DimensionGroup<T> }
  | { kind: "dimension"; dimension: T };

export interface BoardColumns<T extends Dimension = Dimension> {
  /** The board's columns in render order: a group sits where its first member sits. */
  columns: BoardColumn<T>[];
  /** The group bundles alone, for consumers that render grouped blocks. */
  groups: DimensionGroup<T>[];
  ungrouped: T[];
}

/**
 * Splits the numeric dimensions into group and single-dimension columns. A group
 * is only a display bundle: text and zero-weight dimensions never join one, and
 * its column keeps the board position of its first member.
 */
export function boardColumns<T extends Dimension>(dimensions: T[]): BoardColumns<T> {
  const groups = new Map<string, DimensionGroup<T>>();
  const columns: BoardColumn<T>[] = [];
  const ungrouped: T[] = [];
  for (const dimension of dimensions) {
    const name = (dimension.groupName ?? "").trim();
    if (!name || dimension.weight <= 0) {
      ungrouped.push(dimension);
      columns.push({ kind: "dimension", dimension });
      continue;
    }
    let group = groups.get(name);
    if (!group) {
      group = { name, color: GROUP_COLORS[groups.size % GROUP_COLORS.length], dimensions: [], weight: 0 };
      groups.set(name, group);
      columns.push({ kind: "group", group });
    }
    group.dimensions.push(dimension);
    group.weight += dimension.weight;
  }
  return { columns, groups: [...groups.values()], ungrouped };
}

export function groupKey(name: string): string {
  return `group-${name}`;
}

/**
 * Group value = Σ(weight × converted) ÷ Σ(weight) over the members the model
 * rated or skipped, matching the composite denominator so the two can be
 * reconciled. A group without participating members has no value.
 */
export function groupValue(
  group: DimensionGroup,
  scores: Record<string, number>,
  baselines: Map<number, number>,
  skips?: Iterable<number>,
): number | null {
  const skipped = skipSet(skips);
  let weight = 0;
  let sum = 0;
  for (const dimension of group.dimensions) {
    if (dimension.weight <= 0) continue;
    const converted = columnValue(dimension, scores, baselines, skipped);
    if (converted == null) continue;
    weight += dimension.weight;
    sum += dimension.weight * converted;
  }
  return weight > 0 ? sum / weight : null;
}

/* ------------------------------------------------------------------ 排序 --- */

export function dimensionKey(id: number): string {
  return `dim-${id}`;
}

function dimensionIdFromKey(key: string): number | null {
  if (!key.startsWith("dim-")) return null;
  const id = Number(key.slice(4));
  return Number.isInteger(id) ? id : null;
}

function rowValue(
  row: RankRow,
  key: string,
  groups: DimensionGroup[],
  baselines: Map<number, number>,
): number | null {
  if (key === "score") return row.score;
  if (key === "rank") return row.rank;
  if (key === "scored") return row.scoredCount ?? 0;
  if (key.startsWith("group-")) {
    const group = groups.find((item) => groupKey(item.name) === key);
    return group ? groupValue(group, row.scores, baselines, row.skips) : null;
  }
  const id = dimensionIdFromKey(key);
  if (id == null) return null;
  const value = row.scores[String(id)];
  return value == null ? null : value;
}

function compareNames(a: RankRow, b: RankRow): number {
  // Match the Go ordering (lowercased UTF-8 byte order, then slug) instead of
  // Chinese locale collation, or the preview rank can differ from the saved one.
  const an = a.name.toLowerCase();
  const bn = b.name.toLowerCase();
  if (an !== bn) return an < bn ? -1 : 1;
  if (a.slug === b.slug) return 0;
  return a.slug < b.slug ? -1 : 1;
}

export interface SortOptions {
  /** Workbench view: rows without a composite lead in either direction, except under the model key. */
  unscoredFirst?: boolean;
  /** Group metadata for the group-<name> sort keys. */
  groups?: DimensionGroup[];
  /** Converted baselines for the group-<name> sort keys. */
  baselines?: Map<number, number>;
}

/**
 * Sorts a copy for the view layer. Official rank is never recomputed and rows
 * without a composite score stay last regardless of direction unless the
 * options explicitly let them participate.
 */
export function sortRows<T extends RankRow>(rows: T[], key: string, dir: SortDir, options: SortOptions = {}): T[] {
  const visible = rows.filter((row) => !row.hidden);
  const hidden = rows.filter((row) => row.hidden);
  return [...sortGroup(visible, key, dir, options), ...sortGroup(hidden, key, dir, options)];
}

function sortGroup<T extends RankRow>(rows: T[], key: string, dir: SortDir, options: SortOptions): T[] {
  const unscored = (row: T) => row.score == null;
  // The workbench leads with unrated rows, the board keeps them last, and the
  // model key always orders by name so unrated rows stay in place.
  const lead = key === "model" ? null : options.unscoredFirst === true;
  const groups = options.groups ?? [];
  const baselines = options.baselines ?? new Map<number, number>();
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (lead !== null && unscored(a) !== unscored(b)) {
      return unscored(a) === lead ? -1 : 1;
    }

    if (key === "model") {
      const names = compareNames(a, b);
      return dir === "asc" ? names : -names;
    }

    const av = rowValue(a, key, groups, baselines);
    const bv = rowValue(b, key, groups, baselines);
    if (av == null || bv == null) {
      if (av == null && bv == null) return compareOfficial(a, b);
      return av == null ? 1 : -1;
    }
    if (av !== bv) return dir === "asc" ? av - bv : bv - av;
    return compareOfficial(a, b);
  });
  return sorted;
}

/** Workbench view sort: unscored rows lead, while hidden rows stay last. */
export function sortWorkbenchRows<T extends RankRow>(rows: T[], key: string, dir: SortDir): T[] {
  return sortRows(rows, key, dir, { unscoredFirst: true });
}

function compareOfficial(a: RankRow, b: RankRow): number {
  if (a.rank == null || b.rank == null) {
    if (a.rank == null && b.rank == null) return compareNames(a, b);
    return a.rank == null ? 1 : -1;
  }
  if (a.rank !== b.rank) return a.rank - b.rank;
  return compareNames(a, b);
}

export interface Preview {
  score: number | null;
  rank: number | null;
  scoredCount: number;
}

/** Recomputes one model's preview and its live rank without touching stored data. */
export function previewRanking(
  rows: RankRow[],
  dimensions: Dimension[],
  slug: string,
  values: Record<number, number | null>,
  fallback?: Record<number, number | null>,
  skips: number[] = [],
): Preview {
  const drafts = new Map<string, Record<string, number>>();
  const skipDrafts = new Map<string, number[]>();
  for (const row of rows) {
    const scores: Record<string, number> = { ...row.scores };
    let rowSkips = row.skips ?? [];
    if (row.slug === slug) {
      rowSkips = skips;
      for (const dimension of dimensions) {
        const value = values[dimension.id];
        if (value == null || !Number.isFinite(value) || value < 0) delete scores[String(dimension.id)];
        else scores[String(dimension.id)] = value;
      }
    }
    drafts.set(row.slug, scores);
    skipDrafts.set(row.slug, rowSkips);
  }

  // Resolve baselines after merging the draft so raising the top score lifts
  // the automatic baseline exactly like the saved snapshot will.
  const baselines = resolveBaselines(dimensions, [...drafts.values()], fallback);
  const computed = rows.map((row) => ({
    row,
    result: composite(dimensions, drafts.get(row.slug) ?? {}, baselines, skipDrafts.get(row.slug)),
  }));
  computed.sort((a, b) => {
    if (Boolean(a.row.hidden) !== Boolean(b.row.hidden)) return a.row.hidden ? 1 : -1;
    if ((a.result.score == null) !== (b.result.score == null)) return a.result.score == null ? 1 : -1;
    if (a.result.score != null && b.result.score != null && a.result.score !== b.result.score) {
      return b.result.score - a.result.score;
    }
    return compareNames(a.row, b.row);
  });

  let rank = 0;
  for (const item of computed) {
    if (item.result.score == null || item.row.hidden) continue;
    rank += 1;
    if (item.row.slug === slug) {
      return { ...item.result, rank };
    }
  }
  const target = computed.find((item) => item.row.slug === slug);
  return { score: target?.result.score ?? null, rank: null, scoredCount: target?.result.scoredCount ?? 0 };
}

/** Highest score for a dimension across the models that rated it. */
export function dimensionMax(rows: RankRow[], dimensionId: number): number {
  let max = 0;
  for (const row of rows) {
    if (skipSet(row.skips).has(dimensionId)) continue;
    const value = row.scores[String(dimensionId)];
    if (value != null && Number.isFinite(value) && value >= 0 && value > max) max = value;
  }
  return max;
}

export function barWidth(value: number | null | undefined, max: number): number {
  if (value == null || !Number.isFinite(value) || max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

/**
 * Ordinal rank of every model that rated a dimension, using the same
 * value/name/slug order as the official ranking. Skipped and unscored models
 * are omitted.
 */
export function dimensionRanks(rows: RankRow[], dimensionIds: Iterable<number>): Map<number, Map<string, number>> {
  const ranks = new Map<number, Map<string, number>>();
  for (const id of dimensionIds) {
    const key = String(id);
    const scored = rows.filter((row) => !skipSet(row.skips).has(id) && row.scores[key] != null);
    scored.sort((a, b) => b.scores[key] - a.scores[key] || compareNames(a, b));
    const bySlug = new Map<string, number>();
    scored.forEach((row, index) => bySlug.set(row.slug, index + 1));
    ranks.set(id, bySlug);
  }
  return ranks;
}
