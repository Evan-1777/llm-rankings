import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDimension } from "../domain/ranking.ts";
import {
  dimensionScoreRanges,
  displayScoreLabel,
  formatDisplayScore,
  formatMaxSharePercent,
  formatStrengthPercentile,
  maxSharePercent,
  scoreEmphasisTone,
  scoreMax,
  scoreRange,
  strengthPercentile,
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
  assert.equal(strengthPercentile(5, tied.get(1)), null);
  assert.equal(formatStrengthPercentile(5, tied.get(1)), "—");
  close(strengthPercentile(0, { min: 0, max: 10 }), 1);
});

test("strength percentile maps the best score to 100 and the worst to 1", () => {
  const range = { min: 0, max: 10 };
  close(strengthPercentile(10, range), 100);
  close(strengthPercentile(0, range), 1);
  close(strengthPercentile(5, range), 50.5);
  close(strengthPercentile(12.5, { min: 0, max: 25 }), 50.5);
  assert.equal(formatStrengthPercentile(10, range), "100%");
  assert.equal(formatStrengthPercentile(0, range), "1%");
});

test("a 1-point gap and a 3-point gap produce different percentages", () => {
  const range = { min: 0, max: 10 };
  const small = strengthPercentile(7, range);
  const large = strengthPercentile(9, range);
  close(small, 70.3);
  close(large, 90.1);
  assert.ok(small != null && large != null && large - small > 19);
});

test("extreme finite values stay inside 1-100", () => {
  const range = { min: 2, max: 8 };
  close(strengthPercentile(2, range), 1);
  close(strengthPercentile(8, range), 100);
  const huge = { min: 0, max: Number.MAX_VALUE };
  const value = strengthPercentile(1, huge);
  assert.ok(value != null && Number.isFinite(value));
  assert.ok(value >= 1 && value <= 100);
  close(strengthPercentile(Number.MAX_VALUE, huge), 100);
});

test("strength percentile rejects missing, negative, non-finite and zero-span inputs", () => {
  assert.equal(strengthPercentile(null, { min: 0, max: 10 }), null);
  assert.equal(strengthPercentile(5, null), null);
  assert.equal(strengthPercentile(5, undefined), null);
  assert.equal(strengthPercentile(-1, { min: 0, max: 10 }), null);
  assert.equal(strengthPercentile(Number.NaN, { min: 0, max: 10 }), null);
  assert.equal(strengthPercentile(5, { min: 5, max: 5 }), null);
  assert.equal(formatStrengthPercentile(Number.POSITIVE_INFINITY, { min: 0, max: 10 }), "—");
});

test("rounding never disguises a non-extreme score as 1% or 100%", () => {
  assert.equal(formatStrengthPercentile(9.99, { min: 0, max: 10 }), "99.9%");
  assert.equal(formatStrengthPercentile(0.01, { min: 0, max: 10 }), "1.1%");
  assert.equal(formatStrengthPercentile(9.9, { min: 0, max: 10 }), "99%");
  assert.equal(formatStrengthPercentile(5, { min: 0, max: 10 }), "50.5%");
  assert.equal(formatStrengthPercentile(10, { min: 0, max: 10 }), "100%");
  assert.equal(formatStrengthPercentile(0, { min: 0, max: 10 }), "1%");
});

test("display score switches between actual, strength and max share once", () => {
  const range = { min: 0, max: 10 };
  assert.equal(formatDisplayScore(8.5, { percentage: false, maxShare: false }, range, 10), "8.50");
  assert.equal(formatDisplayScore(5, { percentage: true, maxShare: false }, range, 10), "50.5%");
  assert.equal(formatDisplayScore(5, { percentage: true, maxShare: true }, range, 10), "50%");
  assert.equal(formatDisplayScore(8.5, { percentage: false, maxShare: false }, range, 10, formatDimension), "8.5");
  assert.equal(displayScoreLabel({ percentage: false, maxShare: false }, "综合分", "综合强度", "综合占比"), "综合分");
  assert.equal(displayScoreLabel({ percentage: true, maxShare: false }, "综合分", "综合强度", "综合占比"), "综合强度");
  assert.equal(displayScoreLabel({ percentage: true, maxShare: true }, "综合分", "综合强度", "综合占比"), "综合占比");
});

test("scoreMax keeps the highest valid value and treats an empty set as zero", () => {
  assert.equal(scoreMax([null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY, 0, 9, 12.5]), 12.5);
  assert.equal(scoreMax([]), 0);
  assert.equal(scoreMax([0, 0]), 0);
});

test("max share maps the highest score to 100 and keeps a real zero", () => {
  close(maxSharePercent(9, 10), 90);
  close(maxSharePercent(0, 10), 0);
  close(maxSharePercent(7.5, 7.5), 100);
  close(maxSharePercent(12.5, 25), 50);
  assert.equal(maxSharePercent(5, 0), null);
  assert.equal(maxSharePercent(5, null), null);
  assert.equal(maxSharePercent(-1, 10), null);
  assert.equal(maxSharePercent(Number.NaN, 10), null);
  assert.equal(formatMaxSharePercent(9, 10), "90%");
  assert.equal(formatMaxSharePercent(0, 10), "0%");
  assert.equal(formatMaxSharePercent(7.5, 7.5), "100%");
  assert.equal(formatMaxSharePercent(5, 0), "—");
});

test("max share rounding keeps non-extremes off the endpoints", () => {
  assert.equal(formatMaxSharePercent(9.99, 10), "99.9%");
  assert.equal(formatMaxSharePercent(0.01, 10), "0.1%");
  assert.equal(formatMaxSharePercent(8.75, 10), "87.5%");
  assert.equal(formatMaxSharePercent(Number.MAX_VALUE, Number.MAX_VALUE), "100%");
  assert.equal(formatMaxSharePercent(1, Number.MAX_VALUE), "0.1%");
});

test("tone follows the real score position, not the strength percentile", () => {
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

test("tone rejects the same inputs as the strength percentile", () => {
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
  assert.equal(formatStrengthPercentile(2, natural.get(1)), formatStrengthPercentile(2, natural.get(1)));
  assert.notEqual(formatStrengthPercentile(2, natural.get(1)), formatStrengthPercentile(8, natural.get(1)));
  assert.equal(JSON.stringify(rows), snapshot);
  assert.deepEqual([...dimensionScoreRanges(rows, [1]).keys()], [1]);
});
