import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dimensionScoreRanges,
  formatGapPercentile,
  gapPercentile,
  scoreEmphasisTone,
  scorePercentile,
  scoreRange,
  type ScoreRow,
} from "./scoreEmphasis.ts";

function close(actual: number | null | undefined, expected: number) {
  assert.ok(actual != null);
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

test("scoreRange keeps only finite non-negative values and needs two distinct ones", () => {
  assert.deepEqual(scoreRange([0, 10, null, undefined, -3, Number.POSITIVE_INFINITY, Number.NaN]), { min: 0, max: 10 });
  assert.equal(scoreRange([5, 5]), null);
  assert.equal(scoreRange([7]), null);
  assert.equal(scoreRange([]), null);
  assert.deepEqual(scoreRange([0, 0.5]), { min: 0, max: 0.5 });
});

test("dimension ranges ignore missing, negative and non-finite values", () => {
  const rows: ScoreRow[] = [
    { scores: { "1": 0 } },
    { scores: { "1": 10 } },
    { scores: {} },
    { scores: { "1": -3 } },
    { scores: { "1": Number.POSITIVE_INFINITY } },
  ];
  assert.deepEqual(dimensionScoreRanges(rows, [1]).get(1), { min: 0, max: 10 });
});

test("zero is a real value while a single or tied value stays neutral", () => {
  const single = dimensionScoreRanges([{ scores: { "1": 0 } }, { scores: {} }], [1]);
  assert.equal(single.has(1), false);
  const tied = dimensionScoreRanges([{ scores: { "1": 5 } }, { scores: { "1": 5 } }], [1]);
  assert.equal(tied.has(1), false);
  assert.equal(gapPercentile(5, tied.get(1)), null);
  assert.equal(formatGapPercentile(5, tied.get(1)), "—");
  close(gapPercentile(0, { min: 0, max: 10 }), 100);
});

test("gap percentile maps the best score to 1 and the worst to 100", () => {
  const range = { min: 0, max: 10 };
  close(gapPercentile(10, range), 1);
  close(gapPercentile(0, range), 100);
  close(gapPercentile(5, range), 50.5);
  close(gapPercentile(12.5, { min: 0, max: 25 }), 50.5);
  assert.equal(formatGapPercentile(10, range), "1%");
  assert.equal(formatGapPercentile(0, range), "100%");
});

test("score percentile puts the weakest at 0 and the strongest at 100", () => {
  const range = { min: 0, max: 10 };
  assert.equal(scorePercentile(0, range), 0);
  assert.equal(scorePercentile(10, range), 100);
  close(scorePercentile(5, range), 50);
  close(scorePercentile(2, { min: 2, max: 8 }), 0);
  close(scorePercentile(4, { min: 2, max: 8 }), 100 / 3);
  assert.equal(scorePercentile(null, range), null);
  assert.equal(scorePercentile(-1, range), null);
  assert.equal(scorePercentile(Number.NaN, range), null);
  assert.equal(scorePercentile(5, null), null);
  assert.equal(scorePercentile(5, { min: 5, max: 5 }), null);
});

test("a 1-point gap and a 3-point gap produce different percentages", () => {
  const range = { min: 0, max: 10 };
  const small = gapPercentile(9, range);
  const large = gapPercentile(7, range);
  close(small, 10.9);
  close(large, 30.7);
  assert.ok(small != null && large != null && large - small > 19);
});

test("extreme finite values stay inside 1-100", () => {
  const range = { min: 2, max: 8 };
  close(gapPercentile(2, range), 100);
  close(gapPercentile(8, range), 1);
  const huge = { min: 0, max: Number.MAX_VALUE };
  const value = gapPercentile(1, huge);
  assert.ok(value != null && Number.isFinite(value));
  assert.ok(value >= 1 && value <= 100);
  close(gapPercentile(Number.MAX_VALUE, huge), 1);
});

test("gap percentile rejects missing, negative, non-finite and zero-span inputs", () => {
  assert.equal(gapPercentile(null, { min: 0, max: 10 }), null);
  assert.equal(gapPercentile(5, null), null);
  assert.equal(gapPercentile(5, undefined), null);
  assert.equal(gapPercentile(-1, { min: 0, max: 10 }), null);
  assert.equal(gapPercentile(Number.NaN, { min: 0, max: 10 }), null);
  assert.equal(gapPercentile(5, { min: 5, max: 5 }), null);
  assert.equal(formatGapPercentile(Number.POSITIVE_INFINITY, { min: 0, max: 10 }), "—");
});

test("rounding never disguises a non-extreme score as 1% or 100%", () => {
  assert.equal(formatGapPercentile(9.99, { min: 0, max: 10 }), "1.1%");
  assert.equal(formatGapPercentile(0.01, { min: 0, max: 10 }), "99.9%");
  assert.equal(formatGapPercentile(9.9, { min: 0, max: 10 }), "2%");
  assert.equal(formatGapPercentile(5, { min: 0, max: 10 }), "50.5%");
  assert.equal(formatGapPercentile(10, { min: 0, max: 10 }), "1%");
  assert.equal(formatGapPercentile(0, { min: 0, max: 10 }), "100%");
});

test("tone follows the real score position, not the gap percentile", () => {
  const range = { min: 0, max: 10 };
  assert.deepEqual(scoreEmphasisTone(0, range), { direction: "low", strength: 1 });
  assert.deepEqual(scoreEmphasisTone(10, range), { direction: "high", strength: 1 });
  assert.equal(scoreEmphasisTone(5, range), null);
  assert.equal(scoreEmphasisTone(4.9, range), null);
  assert.equal(scoreEmphasisTone(5.1, range), null);
  const low = scoreEmphasisTone(3, range);
  const high = scoreEmphasisTone(7, range);
  assert.equal(low?.direction, "low");
  assert.equal(high?.direction, "high");
  close(low?.strength, 0.508);
  close(high?.strength, 0.508);
  assert.ok((low?.strength ?? 0) > 0.18 && (low?.strength ?? 0) < 1);
});

test("tone rejects the same inputs as the gap percentile", () => {
  assert.equal(scoreEmphasisTone(null, { min: 0, max: 10 }), null);
  assert.equal(scoreEmphasisTone(5, null), null);
  assert.equal(scoreEmphasisTone(-2, { min: 0, max: 10 }), null);
  assert.equal(scoreEmphasisTone(Number.NaN, { min: 0, max: 10 }), null);
  assert.equal(scoreEmphasisTone(4, { min: 4, max: 4 }), null);
});

test("dimension order does not change ranges and the input stays untouched", () => {
  const rows = [
    { scores: { "1": 2, "2": 9 } },
    { scores: { "1": 8, "2": 3 } },
    { scores: { "1": 2, "2": 6 } },
  ];
  const snapshot = JSON.stringify(rows);
  const natural = dimensionScoreRanges(rows, [1, 2]);
  const reordered = dimensionScoreRanges(rows, [2, 1]);
  assert.deepEqual([...natural.entries()].sort(), [...reordered.entries()].sort());
  assert.deepEqual(natural.get(1), { min: 2, max: 8 });
  assert.equal(formatGapPercentile(2, natural.get(1)), formatGapPercentile(2, natural.get(1)));
  assert.notEqual(formatGapPercentile(2, natural.get(1)), formatGapPercentile(8, natural.get(1)));
  assert.equal(JSON.stringify(rows), snapshot);
  assert.deepEqual([...dimensionScoreRanges(rows, [1]).keys()], [1]);
});
