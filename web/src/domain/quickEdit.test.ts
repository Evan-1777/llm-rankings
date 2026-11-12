import { test } from "node:test";
import assert from "node:assert/strict";
import { collectQuickEdit, commitQuickEdit, createQuickEdit } from "./quickEdit.ts";
import type { RankingDimension, RankingModel } from "../api/types.ts";

const dimensions: RankingDimension[] = [
  { id: 2, name: "Coding", weight: 30, groupName: "", baselineMax: null, effectiveBaselineMax: null, skipMedian: 0 },
  { id: 1, name: "Reasoning", weight: 50, groupName: "", baselineMax: null, effectiveBaselineMax: null, skipMedian: 0 },
  { id: 3, name: "Writing", weight: 20, groupName: "", baselineMax: null, effectiveBaselineMax: null, skipMedian: 0 },
];

function model(slug: string, scores: Record<string, number>, skips: number[] = []): RankingModel {
  return { slug, name: slug, vendor: "", hidden: false, score: 8, rank: 1, scoredCount: 3, scores, skips };
}

test("draft prefills one decimal, the skip keyword and empty cells", () => {
  const state = createQuickEdit([model("b", { "1": 9, "2": 0 }, [3])], dimensions);
  assert.equal(state.draft.b["1"], "9.0");
  assert.equal(state.draft.b["2"], "0.0");
  assert.equal(state.draft.b["3"], "skip");
  assert.deepEqual(state.baseline.b, {
    "1": { value: 9, skip: false },
    "2": { value: 0, skip: false },
    "3": { value: null, skip: true },
  });
});

test("edits classify as add, change, clear, unchanged and invalid", () => {
  const state = createQuickEdit([model("m", { "1": 9, "2": 0 })], dimensions);
  const draft = {
    m: { "1": "9.0", "2": "", "3": "7.55" },
  };
  const plan = collectQuickEdit(draft, state.baseline, dimensions);
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.pendingCount, 2);
  assert.deepEqual(plan.changes, [
    { slug: "m", dimensionId: 2, actions: [{ kind: "deleteScore" }], value: null, skip: false },
    { slug: "m", dimensionId: 3, actions: [{ kind: "score", value: 7.6 }], value: 7.6, skip: false },
  ]);

  const unchanged = collectQuickEdit({ m: { "1": "9", "2": "0.0", "3": "" } }, state.baseline, dimensions);
  assert.deepEqual(unchanged, { changes: [], errors: [], pendingCount: 0 });

  const invalid = collectQuickEdit({ m: { "1": "-2", "2": "0.0", "3": "" } }, state.baseline, dimensions);
  assert.equal(invalid.changes.length, 0);
  assert.equal(invalid.errors.length, 1);
  assert.equal(invalid.errors[0].dimensionId, 1);
  assert.equal(invalid.pendingCount, 1);
});

test("zero is a real value rather than an empty cell", () => {
  const state = createQuickEdit([model("m", { "1": 9 })], dimensions);
  const plan = collectQuickEdit({ m: { "1": "9.0", "2": "0", "3": "" } }, state.baseline, dimensions);
  assert.deepEqual(plan.changes, [
    { slug: "m", dimensionId: 2, actions: [{ kind: "score", value: 0 }], value: 0, skip: false },
  ]);
});

test("skipping keeps the stored rating and clearing it restores the cell", () => {
  const state = createQuickEdit([model("m", { "1": 9, "2": 7 })], dimensions);
  const skipped = collectQuickEdit({ m: { "1": "9", "2": "Skip", "3": "" } }, state.baseline, dimensions);
  assert.deepEqual(skipped.changes, [
    { slug: "m", dimensionId: 2, actions: [{ kind: "skip" }], value: 7, skip: true },
  ]);

  const advanced = commitQuickEdit(state.baseline, "m", 2, 7, true);
  const restored = collectQuickEdit({ m: { "1": "9", "2": "7", "3": "" } }, advanced, dimensions);
  assert.deepEqual(restored.changes, [
    { slug: "m", dimensionId: 2, actions: [{ kind: "unskip" }], value: 7, skip: false },
  ]);
  const emptied = collectQuickEdit({ m: { "1": "9", "2": "", "3": "" } }, advanced, dimensions);
  assert.deepEqual(emptied.changes, [
    { slug: "m", dimensionId: 2, actions: [{ kind: "unskip" }, { kind: "deleteScore" }], value: null, skip: false },
  ]);
});

test("changes stay in slug then dimension order regardless of input order", () => {
  const state = createQuickEdit([model("zeta", { "1": 8 }), model("alpha", { "1": 8 })], dimensions);
  const draft = {
    zeta: { "1": "9", "2": "1", "3": "2" },
    alpha: { "1": "9", "2": "1", "3": "2" },
  };
  const plan = collectQuickEdit(draft, state.baseline, dimensions);
  assert.deepEqual(
    plan.changes.map((change) => [change.slug, change.dimensionId]),
    [
      ["alpha", 1],
      ["alpha", 2],
      ["alpha", 3],
      ["zeta", 1],
      ["zeta", 2],
      ["zeta", 3],
    ],
  );
});

test("committing one cell leaves only the remaining cells dirty", () => {
  const state = createQuickEdit([model("m", { "1": 8, "2": 8 })], dimensions);
  const draft = { m: { "1": "9", "2": "7", "3": "" } };
  const first = collectQuickEdit(draft, state.baseline, dimensions);
  assert.equal(first.changes.length, 2);

  const advanced = commitQuickEdit(state.baseline, "m", first.changes[0].dimensionId, first.changes[0].value, first.changes[0].skip);
  const second = collectQuickEdit(draft, advanced, dimensions);
  assert.deepEqual(second.changes, [
    { slug: "m", dimensionId: 2, actions: [{ kind: "score", value: 7 }], value: 7, skip: false },
  ]);
  assert.deepEqual(state.baseline.m["1"], { value: 8, skip: false });
});
