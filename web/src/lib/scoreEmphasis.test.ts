import { test } from "node:test";
import assert from "node:assert/strict";
import { dimensionScoreRanges, scoreEmphasisAlpha, MAX_EMPHASIS_ALPHA, MIN_EMPHASIS_ALPHA, type ScoreRow } from "./scoreEmphasis.ts";

function close(actual: number | null, expected: number) {
  assert.ok(actual != null);
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
}

test("maps low, middle and high scores to the ink alpha range", () => {
  const range = { min: 0, max: 10 };
  close(scoreEmphasisAlpha(0, range), 0.06);
  close(scoreEmphasisAlpha(5, range), 0.12);
  close(scoreEmphasisAlpha(10, range), 0.18);
  close(scoreEmphasisAlpha(12.5, { min: 0, max: 25 }), 0.12);
});

test("keeps alpha finite and inside range for extreme finite scores", () => {
  const range = { min: 0, max: Number.MAX_VALUE };
  const low = scoreEmphasisAlpha(1, range);
  const high = scoreEmphasisAlpha(Number.MAX_VALUE, range);
  for (const alpha of [low, high]) {
    assert.ok(alpha != null && Number.isFinite(alpha));
    assert.ok(alpha >= MIN_EMPHASIS_ALPHA && alpha <= MAX_EMPHASIS_ALPHA);
  }
  close(high, MAX_EMPHASIS_ALPHA);
});

test("dimension ranges ignore missing, negative and non-finite values", () => {
  const rows: ScoreRow[] = [
    { scores: { "1": 0 } },
    { scores: { "1": 10 } },
    { scores: {} },
    { scores: { "1": -3 } },
    { scores: { "1": Number.POSITIVE_INFINITY } },
  ];
  const ranges = dimensionScoreRanges(rows, [1]);
  assert.deepEqual(ranges.get(1), { min: 0, max: 10 });
});

test("zero is a real value while a single or tied value stays neutral", () => {
  const single = dimensionScoreRanges([{ scores: { "1": 0 } }, { scores: {} }], [1]);
  assert.equal(single.has(1), false);
  const tied = dimensionScoreRanges([{ scores: { "1": 5 } }, { scores: { "1": 5 } }], [1]);
  assert.equal(tied.has(1), false);
  assert.equal(scoreEmphasisAlpha(5, tied.get(1)), null);
  assert.equal(scoreEmphasisAlpha(null, { min: 0, max: 10 }), null);
  close(scoreEmphasisAlpha(0, { min: 0, max: 10 }), 0.06);
});

test("equal scores share the same alpha and dimension order does not matter", () => {
  const rows = [
    { scores: { "1": 2, "2": 9 } },
    { scores: { "1": 8, "2": 3 } },
    { scores: { "1": 2, "2": 6 } },
  ];
  const natural = dimensionScoreRanges(rows, [1, 2]);
  const reordered = dimensionScoreRanges(rows, [2, 1]);
  assert.deepEqual([...natural.entries()].sort(), [...reordered.entries()].sort());
  const low = scoreEmphasisAlpha(2, natural.get(1));
  assert.ok(low != null);
  assert.equal(low, scoreEmphasisAlpha(2, natural.get(1)));
  assert.notEqual(low, scoreEmphasisAlpha(8, natural.get(1)));
});

test("only requested dimensions are computed and the input stays untouched", () => {
  const rows = [
    { scores: { "1": 1, "2": 9 } },
    { scores: { "1": 4, "2": 4 } },
  ];
  const snapshot = JSON.stringify(rows);
  const ranges = dimensionScoreRanges(rows, [1]);
  assert.deepEqual([...ranges.keys()], [1]);
  assert.equal(JSON.stringify(rows), snapshot);
});
