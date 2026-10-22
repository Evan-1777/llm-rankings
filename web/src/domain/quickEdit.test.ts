import { test } from "node:test";
import assert from "node:assert/strict";
import { collectQuickEdit, commitQuickEdit, createQuickEdit } from "./quickEdit.ts";
import type { RankingDimension, RankingModel } from "../api/types.ts";

const dimensions: RankingDimension[] = [
  { id: 2, name: "Coding", weight: 30 },
  { id: 1, name: "Reasoning", weight: 50 },
  { id: 3, name: "Writing", weight: 20 },
];

function model(slug: string, scores: Record<string, number>): RankingModel {
  return { slug, name: slug, vendor: "", hidden: false, score: 8, coverage: 1, provisional: false, rank: 1, scores };
}

test("draft prefills one decimal and keeps missing cells empty", () => {
  const state = createQuickEdit([model("b", { "1": 9, "2": 0 })], dimensions);
  assert.equal(state.draft.b["1"], "9.0");
  assert.equal(state.draft.b["2"], "0.0");
  assert.equal(state.draft.b["3"], "");
  assert.deepEqual(state.baseline.b, { "1": 9, "2": 0, "3": null });
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
    { slug: "m", dimensionId: 2, value: null },
    { slug: "m", dimensionId: 3, value: 7.6 },
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
  assert.deepEqual(plan.changes, [{ slug: "m", dimensionId: 2, value: 0 }]);
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

  const advanced = commitQuickEdit(state.baseline, "m", first.changes[0].dimensionId, first.changes[0].value);
  const second = collectQuickEdit(draft, advanced, dimensions);
  assert.deepEqual(second.changes, [{ slug: "m", dimensionId: 2, value: 7 }]);
  assert.equal(state.baseline.m["1"], 8);
});
