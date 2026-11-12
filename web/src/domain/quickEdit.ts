import type { RankingDimension, RankingModel } from "../api/types";
import { formatDimension } from "./ranking.ts";
import { parseScoreInput, SKIP_KEYWORD } from "./scoreInput.ts";

export type QuickEditDraft = Record<string, Record<string, string>>;

/** One cell's stored state, used to decide which writes a draft still needs. */
export interface QuickEditCell {
  value: number | null;
  skip: boolean;
}

export type QuickEditBaseline = Record<string, Record<string, QuickEditCell>>;

export type QuickEditAction =
  | { kind: "score"; value: number }
  | { kind: "deleteScore" }
  | { kind: "skip" }
  | { kind: "unskip" };

export interface QuickEditChange {
  slug: string;
  dimensionId: number;
  /** Ordered writes that move the cell to its drafted state. */
  actions: QuickEditAction[];
  /** Cell state after the writes land, used to advance the baseline. */
  value: number | null;
  skip: boolean;
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

/** Seeds the draft with one-decimal text (or the skip keyword) and keeps the server values as the baseline. */
export function createQuickEdit(models: RankingModel[], dimensions: RankingDimension[]): QuickEditState {
  const draft: QuickEditDraft = {};
  const baseline: QuickEditBaseline = {};
  for (const model of models) {
    const cells: Record<string, string> = {};
    const base: Record<string, QuickEditCell> = {};
    for (const dimension of dimensions) {
      const value = model.scores[String(dimension.id)] ?? null;
      const skip = model.skips.includes(dimension.id);
      cells[String(dimension.id)] = skip ? SKIP_KEYWORD : value == null ? "" : formatDimension(value);
      base[String(dimension.id)] = { value, skip };
    }
    draft[model.slug] = cells;
    baseline[model.slug] = base;
  }
  return { draft, baseline };
}

/**
 * Derives the save plan in a stable slug + dimension order, independent of the
 * table's current view sort. Skipping never deletes the stored rating, so a
 * skip only ever adds the skip write.
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
      const base = baseline[slug]?.[key] ?? { value: null, skip: false };
      const actions: QuickEditAction[] = [];
      if (parsed.skip) {
        if (!base.skip) actions.push({ kind: "skip" });
      } else {
        if (base.skip) actions.push({ kind: "unskip" });
        if (parsed.value == null) {
          if (base.value != null) actions.push({ kind: "deleteScore" });
        } else if (parsed.value !== base.value) {
          actions.push({ kind: "score", value: parsed.value });
        }
      }
      if (actions.length > 0) {
        // Skipping never deletes the stored rating, so the cell keeps its value.
        changes.push({
          slug,
          dimensionId: dimension.id,
          actions,
          value: parsed.skip ? base.value : parsed.value,
          skip: parsed.skip,
        });
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
  skip: boolean,
): QuickEditBaseline {
  return {
    ...baseline,
    [slug]: { ...baseline[slug], [String(dimensionId)]: { value, skip } },
  };
}
