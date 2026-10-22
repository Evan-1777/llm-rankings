import type { RankingDimension, RankingModel } from "../api/types";
import { formatDimension } from "./ranking.ts";
import { parseScoreInput } from "./scoreInput.ts";

export type QuickEditDraft = Record<string, Record<string, string>>;
export type QuickEditBaseline = Record<string, Record<string, number | null>>;

export interface QuickEditChange {
  slug: string;
  dimensionId: number;
  /** null deletes the stored score. */
  value: number | null;
}

export interface QuickEditError {
  slug: string;
  dimensionId: number;
  message: string;
}

export interface QuickEditPlan {
  changes: QuickEditChange[];
  errors: QuickEditError[];
  /** Cells that would need saving, including invalid ones. */
  pendingCount: number;
}

export interface QuickEditState {
  draft: QuickEditDraft;
  baseline: QuickEditBaseline;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Seeds the draft with one-decimal text and keeps the server values as the baseline. */
export function createQuickEdit(models: RankingModel[], dimensions: RankingDimension[]): QuickEditState {
  const draft: QuickEditDraft = {};
  const baseline: QuickEditBaseline = {};
  for (const model of models) {
    const cells: Record<string, string> = {};
    const base: Record<string, number | null> = {};
    for (const dimension of dimensions) {
      const value = model.scores[String(dimension.id)] ?? null;
      cells[String(dimension.id)] = value == null ? "" : formatDimension(value);
      base[String(dimension.id)] = value;
    }
    draft[model.slug] = cells;
    baseline[model.slug] = base;
  }
  return { draft, baseline };
}

/**
 * Derives the save plan in a stable slug + dimension order, independent of the
 * table's current view sort.
 */
export function collectQuickEdit(
  draft: QuickEditDraft,
  baseline: QuickEditBaseline,
  dimensions: RankingDimension[],
): QuickEditPlan {
  const changes: QuickEditChange[] = [];
  const errors: QuickEditError[] = [];
  const orderedDimensions = [...dimensions].sort((a, b) => a.id - b.id);
  const slugs = Object.keys(baseline).sort(compareText);

  for (const slug of slugs) {
    for (const dimension of orderedDimensions) {
      const key = String(dimension.id);
      const parsed = parseScoreInput(draft[slug]?.[key] ?? "");
      if (parsed.error) {
        errors.push({ slug, dimensionId: dimension.id, message: parsed.error });
        continue;
      }
      const base = baseline[slug]?.[key] ?? null;
      if (parsed.value == null) {
        if (base != null) changes.push({ slug, dimensionId: dimension.id, value: null });
      } else if (parsed.value !== base) {
        changes.push({ slug, dimensionId: dimension.id, value: parsed.value });
      }
    }
  }

  return { changes, errors, pendingCount: changes.length + errors.length };
}

/** Advances one cell's baseline so a successful submission stops being dirty. */
export function commitQuickEdit(
  baseline: QuickEditBaseline,
  slug: string,
  dimensionId: number,
  value: number | null,
): QuickEditBaseline {
  return {
    ...baseline,
    [slug]: { ...baseline[slug], [String(dimensionId)]: value },
  };
}
