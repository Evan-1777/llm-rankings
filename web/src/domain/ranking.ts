// Pure ranking, coverage and sorting rules shared with the Go implementation.
export interface Dimension {
  id: number;
  name: string;
  weight: number;
}

export interface RankRow {
  slug: string;
  name: string;
  vendor: string;
  /** Hidden models sort after every visible model and never receive a rank. */
  hidden?: boolean;
  score: number | null;
  coverage: number;
  provisional: boolean;
  rank: number | null;
  scores: Record<string, number>;
}

export type SortDir = "asc" | "desc";

export interface Composite {
  score: number | null;
  coverage: number;
  provisional: boolean;
  scoredCount: number;
}

export const PROVISIONAL_THRESHOLD = 0.8;

/** Floor coverage to one decimal percent, so 79.9% never renders as 80%. */
export function truncatePercent(coverage: number): number {
  if (!Number.isFinite(coverage) || coverage <= 0) return 0;
  return Math.floor(coverage * 1000 + 1e-9) / 10;
}

export function formatPercent(coverage: number): string {
  const value = truncatePercent(coverage);
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
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

export function composite(dimensions: Dimension[], scores: Record<string, number>): Composite {
  // Accumulate in stable id order so the display order never changes the
  // floating-point result.
  const ordered = [...dimensions].sort((a, b) => a.id - b.id);
  let totalWeight = 0;
  for (const dimension of ordered) {
    if (dimension.weight > 0) totalWeight += dimension.weight;
  }
  if (totalWeight === 0) {
    return { score: null, coverage: 0, provisional: false, scoredCount: 0 };
  }
  let scoredWeight = 0;
  let weighted = 0;
  let scoredCount = 0;
  for (const dimension of ordered) {
    if (dimension.weight <= 0) continue;
    const value = scores[String(dimension.id)];
    if (value == null || !Number.isFinite(value) || value < 0) continue;
    scoredWeight += dimension.weight;
    scoredCount += 1;
    weighted += (dimension.weight / totalWeight) * value;
  }
  if (scoredWeight === 0) {
    return { score: null, coverage: 0, provisional: false, scoredCount: 0 };
  }
  const coverage = scoredWeight / totalWeight;
  return {
    score: weighted / (scoredWeight / totalWeight),
    coverage,
    provisional: coverage < PROVISIONAL_THRESHOLD,
    scoredCount,
  };
}

export function dimensionKey(id: number): string {
  return `dim-${id}`;
}

function dimensionIdFromKey(key: string): number | null {
  if (!key.startsWith("dim-")) return null;
  const id = Number(key.slice(4));
  return Number.isInteger(id) ? id : null;
}

function rowValue(row: RankRow, key: string): number | null {
  if (key === "score") return row.score;
  if (key === "rank") return row.rank;
  if (key === "coverage") return row.coverage;
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
  /** Lets unscored rows participate for the model and coverage keys instead of forcing them last. */
  keepUnscored?: boolean;
}

/**
 * Sorts a copy for the view layer. Official rank is never recomputed and rows
 * without a composite score stay last regardless of direction unless the key
 * and options explicitly let them participate.
 */
export function sortRows<T extends RankRow>(rows: T[], key: string, dir: SortDir, options: SortOptions = {}): T[] {
  const visible = rows.filter((row) => !row.hidden);
  const hidden = rows.filter((row) => row.hidden);
  return [...sortGroup(visible, key, dir, options), ...sortGroup(hidden, key, dir, options)];
}

function sortGroup<T extends RankRow>(rows: T[], key: string, dir: SortDir, options: SortOptions): T[] {
  const keepUnscored = options.keepUnscored === true && (key === "model" || key === "coverage");
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (!keepUnscored && (a.score == null) !== (b.score == null)) return a.score == null ? 1 : -1;

    if (key === "model") {
      const names = compareNames(a, b);
      return dir === "asc" ? names : -names;
    }

    const av = rowValue(a, key);
    const bv = rowValue(b, key);
    if (av == null || bv == null) {
      if (av == null && bv == null) return compareOfficial(a, b);
      return av == null ? 1 : -1;
    }
    if (av !== bv) return dir === "asc" ? av - bv : bv - av;
    return compareOfficial(a, b);
  });
  return sorted;
}

/** Workbench view sort: requests unscored participation; sortRows keeps it to the model and coverage keys. */
export function sortWorkbenchRows<T extends RankRow>(rows: T[], key: string, dir: SortDir): T[] {
  return sortRows(rows, key, dir, { keepUnscored: true });
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
  coverage: number;
  provisional: boolean;
  rank: number | null;
  scoredCount: number;
}

/** Recomputes one model's preview and its live rank without touching stored data. */
export function previewRanking(
  rows: RankRow[],
  dimensions: Dimension[],
  slug: string,
  values: Record<number, number | null>,
): Preview {
  const drafts = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const scores: Record<string, number> = { ...row.scores };
    if (row.slug === slug) {
      for (const dimension of dimensions) {
        const value = values[dimension.id];
        if (value == null || !Number.isFinite(value) || value < 0) delete scores[String(dimension.id)];
        else scores[String(dimension.id)] = value;
      }
    }
    drafts.set(row.slug, scores);
  }

  const computed = rows.map((row) => ({
    row,
    result: composite(dimensions, drafts.get(row.slug) ?? {}),
  }));
  computed.sort((a, b) => {
    if (Boolean(a.row.hidden) !== Boolean(b.row.hidden)) return a.row.hidden ? 1 : -1;
    if ((a.result.score == null) !== (b.result.score == null)) return a.result.score == null ? 1 : -1;
    if (a.result.score != null && b.result.score != null) {
      if (a.result.score !== b.result.score) return b.result.score - a.result.score;
      if (a.result.coverage !== b.result.coverage) return b.result.coverage - a.result.coverage;
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
  return {
    score: target?.result.score ?? null,
    coverage: target?.result.coverage ?? 0,
    provisional: target?.result.provisional ?? false,
    rank: null,
    scoredCount: target?.result.scoredCount ?? 0,
  };
}

/** Highest score for a dimension across all models. */
export function dimensionMax(rows: RankRow[], dimensionId: number): number {
  let max = 0;
  for (const row of rows) {
    const value = row.scores[String(dimensionId)];
    if (value != null && Number.isFinite(value) && value > max) max = value;
  }
  return max;
}

export function barWidth(value: number | null | undefined, max: number): number {
  if (value == null || !Number.isFinite(value) || max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

/**
 * Ordinal rank of every scored model within each dimension, using the same
 * value/name/slug order as the official ranking. Unscored models are omitted.
 */
export function dimensionRanks(rows: RankRow[], dimensionIds: Iterable<number>): Map<number, Map<string, number>> {
  const ranks = new Map<number, Map<string, number>>();
  for (const id of dimensionIds) {
    const key = String(id);
    const scored = rows.filter((row) => row.scores[key] != null);
    scored.sort((a, b) => b.scores[key] - a.scores[key] || compareNames(a, b));
    const bySlug = new Map<string, number>();
    scored.forEach((row, index) => bySlug.set(row.slug, index + 1));
    ranks.set(id, bySlug);
  }
  return ranks;
}
