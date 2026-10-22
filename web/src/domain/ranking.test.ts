import { test } from "node:test";
import assert from "node:assert/strict";
import {
  barWidth,
  composite,
  dimensionMax,
  dimensionRanks,
  formatDimension,
  formatPercent,
  formatScore,
  previewRanking,
  sortRows,
  truncatePercent,
  type RankRow,
} from "./ranking.ts";

const dimensions = [
  { id: 1, name: "Reasoning", weight: 50 },
  { id: 2, name: "Coding", weight: 30 },
  { id: 3, name: "Writing", weight: 20 },
  { id: 4, name: "Idle", weight: 0 },
];

function row(slug: string, score: number | null, coverage: number, rank: number | null, scores: Record<string, number>): RankRow {
  return { slug, name: slug, vendor: "", score, coverage, provisional: coverage < 0.8, rank, scores };
}

test("coverage truncates instead of rounding", () => {
  assert.equal(truncatePercent(0.799), 79.9);
  assert.equal(formatPercent(0.799), "79.9%");
  assert.equal(formatPercent(0.8), "80%");
  assert.equal(formatPercent(1), "100%");
  assert.equal(formatPercent(0.5800000000000001), "58%");
});

test("composite normalizes weights and ignores zero-weight dimensions", () => {
  const result = composite(dimensions, { "1": 12.5, "2": 8, "3": 0, "4": 100 });
  assert.ok(result.score !== null);
  assert.equal(result.score.toFixed(2), "8.65");
  assert.equal(result.coverage, 1);
  assert.equal(result.scoredCount, 3);
});

test("partial coverage is provisional and below 80% only", () => {
  const below = composite(dimensions, { "1": 9, "2": 8 });
  assert.equal(below.coverage, 0.8);
  assert.equal(below.provisional, false);
  const partial = composite(dimensions, { "1": 9 });
  assert.equal(partial.provisional, true);
});

test("no weights yields no score", () => {
  const result = composite([{ id: 9, name: "Idle", weight: 0 }], { "9": 10 });
  assert.equal(result.score, null);
  assert.equal(result.coverage, 0);
});

test("unscored rows stay last in both directions", () => {
  const rows = [
    row("unscored", null, 0, null, {}),
    row("low", 8, 1, 2, { "1": 8 }),
    row("high", 9, 1, 1, { "1": 9 }),
  ];
  assert.deepEqual(sortRows(rows, "coverage", "asc").map((r) => r.slug), ["high", "low", "unscored"]);
  assert.deepEqual(sortRows(rows, "score", "desc").map((r) => r.slug), ["high", "low", "unscored"]);
});

test("dimension sorting keeps missing values last and official rank unchanged", () => {
  const rows = [
    row("a", 9, 1, 1, { "1": 9 }),
    row("b", 8, 1, 2, {}),
    row("c", 7, 1, 3, { "1": 7 }),
  ];
  const sorted = sortRows(rows, "dim-1", "asc");
  assert.deepEqual(sorted.map((r) => r.slug), ["c", "a", "b"]);
  assert.deepEqual(sorted.map((r) => r.rank), [3, 1, 2]);
});

test("model sorting reverses and is stable by official rank", () => {
  const rows = [
    row("a", 9, 1, 1, { "1": 9 }),
    row("b", 9, 1, 2, { "1": 9 }),
  ];
  assert.deepEqual(sortRows(rows, "model", "asc").map((r) => r.slug), ["a", "b"]);
  assert.deepEqual(sortRows(rows, "model", "desc").map((r) => r.slug), ["b", "a"]);
});

test("tie-break matches the Go byte order for Chinese names", () => {
  const named = (slug: string, name: string): RankRow => ({ ...row(slug, 9, 1, null, { "1": 9 }), name });
  const rows = [named("li", "李"), named("zhang", "张")];
  const preview = previewRanking(rows, [{ id: 1, name: "d", weight: 50 }], "li", { 1: 9 });
  assert.equal(preview.rank, 2);
  assert.deepEqual(sortRows(rows, "model", "asc").map((r) => r.slug), ["zhang", "li"]);
});

test("preview updates composite and rank without touching stored rows", () => {
  const rows = [
    row("a", 9, 1, 1, { "1": 9, "2": 9, "3": 9 }),
    row("b", 8, 0.8, 2, { "1": 8, "2": 8 }),
  ];
  const preview = previewRanking(rows, dimensions, "b", { 1: 8, 2: 8, 3: 10 });
  assert.equal(preview.score?.toFixed(2), "8.40");
  assert.equal(preview.coverage, 1);
  assert.equal(preview.rank, 2);
  assert.equal(rows[1].scores["3"], undefined);
});

test("score formatting keeps one decimal dimension values and two decimals totals", () => {
  assert.equal(formatScore(12.5), "12.50");
  assert.equal(formatScore(100), "100.00");
  assert.equal(formatScore(8.694999999999999), "8.70");
  assert.equal(formatDimension(12.5), "12.5");
  assert.equal(formatDimension(100), "100.0");
  assert.equal(formatScore(null), "—");
});

test("relative bars reach full width at the dimension max", () => {
  assert.equal(dimensionMax([row("a", 9, 1, 1, { "1": 12.5 })], 1), 12.5);
  assert.equal(dimensionMax([row("b", 9, 1, 1, { "1": 8 })], 1), 8);
  const tied = [row("a", 9, 1, 1, { "1": 7.5 }), row("b", 9, 1, 2, { "1": 7.5 })];
  assert.equal(dimensionMax(tied, 1), 7.5);
  assert.equal(barWidth(7.5, dimensionMax(tied, 1)), 100);
  assert.equal(barWidth(8, 10), 80);
  assert.equal(barWidth(0, 0), 0);
  assert.equal(barWidth(null, 10), 0);
});

test("dimension ranks count scored models with a stable tie-break", () => {
  const rows = [
    row("a", 9, 1, 1, { "1": 9 }),
    row("b", 8, 1, 2, { "1": 9 }),
    row("c", 7, 1, 3, { "1": 7 }),
    row("unscored", null, 0, null, {}),
  ];
  const ranks = dimensionRanks(rows, [1, 2]);
  const dim1 = ranks.get(1);
  assert.ok(dim1);
  assert.equal(dim1.get("a"), 1);
  assert.equal(dim1.get("b"), 2);
  assert.equal(dim1.get("c"), 3);
  assert.equal(dim1.size, 3);
  assert.equal(dim1.has("unscored"), false);
  assert.equal(ranks.get(2)?.size, 0);
  assert.deepEqual(dimensionRanks([...rows].reverse(), [1]).get(1), dim1);
  assert.deepEqual(rows.map((r) => r.slug), ["a", "b", "c", "unscored"]);
});
test("composite and preview stay stable across display order", () => {
  const natural = [
    { id: 1, name: "A", weight: 1 },
    { id: 2, name: "B", weight: 1 },
    { id: 3, name: "C", weight: 1 },
  ];
  const swapped = [natural[0], natural[2], natural[1]];
  const alphaScores: Record<string, number> = { "1": 0.1, "2": 0.1, "3": 0.4 };
  const raw = (order: typeof natural) =>
    order.reduce((sum, dimension) => sum + (dimension.weight / 3) * (alphaScores[String(dimension.id)] ?? 0), 0);
  assert.notEqual(raw(natural), raw(swapped));

  const a = composite(natural, alphaScores);
  const b = composite(swapped, alphaScores);
  assert.equal(a.score, b.score);
  assert.equal(a.score, 0.2);
  assert.deepEqual([natural[0].id, natural[1].id, natural[2].id], [1, 2, 3]);
  assert.deepEqual([swapped[0].id, swapped[1].id, swapped[2].id], [1, 3, 2]);

  const rows = [
    row("alpha", 0.2, 1, 1, alphaScores),
    row("zeta", 0.2, 1, 2, { "1": 0.2, "2": 0.2, "3": 0.2 }),
  ];
  const alpha = previewRanking(rows, swapped, "alpha", { 1: 0.1, 2: 0.1, 3: 0.4 });
  const zeta = previewRanking(rows, swapped, "zeta", { 1: 0.2, 2: 0.2, 3: 0.2 });
  assert.equal(alpha.score, zeta.score);
  assert.equal(alpha.rank, 1);
  assert.equal(zeta.rank, 2);
});