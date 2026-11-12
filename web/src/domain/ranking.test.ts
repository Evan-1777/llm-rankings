import { test } from "node:test";
import assert from "node:assert/strict";
import {
  barWidth,
  boardColumns,
  columnValue,
  composite,
  dimensionKey,
  dimensionMax,
  dimensionRanks,
  formatDimension,
  formatScore,
  GROUP_COLORS,
  groupKey,
  groupValue,
  previewRanking,
  resolveBaselines,
  sortRows,
  sortWorkbenchRows,
  type Dimension,
  type RankRow,
} from "./ranking.ts";

const dimensions = [
  { id: 1, name: "Reasoning", weight: 50, baselineMax: 10 },
  { id: 2, name: "Coding", weight: 30, baselineMax: 10 },
  { id: 3, name: "Writing", weight: 20, baselineMax: 10 },
  { id: 4, name: "Idle", weight: 0, baselineMax: 10 },
];

function row(slug: string, score: number | null, rank: number | null, scores: Record<string, number>): RankRow {
  return { slug, name: slug, vendor: "", score, rank, scores };
}

test("composite normalizes weights and ignores zero-weight dimensions", () => {
  const scores = { "1": 12.5, "2": 8, "3": 0, "4": 100 };
  const result = composite(dimensions, scores, resolveBaselines(dimensions, [scores]));
  assert.ok(result.score !== null);
  assert.equal(result.score.toFixed(2), "86.50");
  assert.equal(result.scoredCount, 3);
});

test("partial ratings keep the composite on the rated weights only", () => {
  const full = { "1": 9, "2": 8 };
  const both = composite(dimensions, full, resolveBaselines(dimensions, [full]));
  assert.equal(both.scoredCount, 2);
  assert.equal(both.score?.toFixed(2), "86.25");
  const partialScores = { "1": 9 };
  const partial = composite(dimensions, partialScores, resolveBaselines(dimensions, [partialScores]));
  assert.equal(partial.score, 90);
  assert.equal(partial.scoredCount, 1);
});

test("no weights yields no score", () => {
  const dims = [{ id: 9, name: "Idle", weight: 0 }];
  const scores = { "9": 10 };
  const result = composite(dims, scores, resolveBaselines(dims, [scores]));
  assert.equal(result.score, null);
});

test("unscored rows stay last in both directions", () => {
  const rows = [
    row("unscored", null, null, {}),
    row("low", 8, 2, { "1": 8 }),
    row("high", 9, 1, { "1": 9 }),
  ];
  assert.deepEqual(sortRows(rows, "score", "desc").map((r) => r.slug), ["high", "low", "unscored"]);
  assert.deepEqual(sortRows(rows, "score", "asc").map((r) => r.slug), ["low", "high", "unscored"]);
});

test("rank sorting starts from first place and keeps unscored rows last", () => {
  const rows = [
    row("unscored", null, null, {}),
    row("second", 8, 2, { "1": 8 }),
    row("first", 9, 1, { "1": 9 }),
  ];
  assert.deepEqual(sortRows(rows, "rank", "asc").map((r) => r.slug), ["first", "second", "unscored"]);
  assert.deepEqual(sortRows(rows, "rank", "desc").map((r) => r.slug), ["second", "first", "unscored"]);
});

test("workbench scored sort keeps unrated rows first in both directions", () => {
  const rows = [
    { ...row("scored-full", 9, 1, { "1": 9 }), scoredCount: 3 },
    { ...row("unscored", null, null, {}), scoredCount: 0 },
    { ...row("scored-partial", 8, 2, { "1": 8 }), scoredCount: 1 },
  ];
  assert.deepEqual(
    sortWorkbenchRows(rows, "scored", "asc").map((r) => r.slug),
    ["unscored", "scored-partial", "scored-full"],
  );
  assert.deepEqual(
    sortWorkbenchRows(rows, "scored", "desc").map((r) => r.slug),
    ["unscored", "scored-full", "scored-partial"],
  );
});

test("workbench model sort includes unscored rows by name", () => {
  const rows = [
    row("bravo", 8, 2, { "1": 8 }),
    row("alpha", null, null, {}),
  ];
  assert.deepEqual(sortWorkbenchRows(rows, "model", "asc").map((r) => r.slug), ["alpha", "bravo"]);
  assert.deepEqual(sortWorkbenchRows(rows, "model", "desc").map((r) => r.slug), ["bravo", "alpha"]);
});

test("workbench value sorts lead with unrated rows and keep missing values last", () => {
  const rows = [
    row("unscored", null, null, {}),
    row("missing", 8, 2, {}),
    row("scored", 7, 3, { "1": 7 }),
  ];
  assert.deepEqual(sortWorkbenchRows(rows, "dim-1", "desc").map((r) => r.slug), ["unscored", "scored", "missing"]);
  assert.deepEqual(sortWorkbenchRows(rows, "score", "desc").map((r) => r.slug), ["unscored", "missing", "scored"]);
});

test("workbench ties fall back to official rank", () => {
  const rows = [
    { ...row("b", 8, 2, { "1": 8 }), scoredCount: 2 },
    { ...row("a", 9, 1, { "1": 9 }), scoredCount: 2 },
  ];
  assert.deepEqual(sortWorkbenchRows(rows, "scored", "asc").map((r) => r.slug), ["a", "b"]);
});

test("dimension sorting keeps missing values last and official rank unchanged", () => {
  const rows = [
    row("a", 9, 1, { "1": 9 }),
    row("b", 8, 2, {}),
    row("c", 7, 3, { "1": 7 }),
  ];
  const sorted = sortRows(rows, "dim-1", "asc");
  assert.deepEqual(sorted.map((r) => r.slug), ["c", "a", "b"]);
  assert.deepEqual(sorted.map((r) => r.rank), [3, 1, 2]);
});

test("model sorting reverses and is stable by official rank", () => {
  const rows = [
    row("a", 9, 1, { "1": 9 }),
    row("b", 9, 2, { "1": 9 }),
  ];
  assert.deepEqual(sortRows(rows, "model", "asc").map((r) => r.slug), ["a", "b"]);
  assert.deepEqual(sortRows(rows, "model", "desc").map((r) => r.slug), ["b", "a"]);
});

test("tie-break matches the Go byte order for Chinese names", () => {
  const named = (slug: string, name: string): RankRow => ({ ...row(slug, 9, null, { "1": 9 }), name });
  const rows = [named("li", "李"), named("zhang", "张")];
  const preview = previewRanking(rows, [{ id: 1, name: "d", weight: 50 }], "li", { 1: 9 });
  assert.equal(preview.rank, 2);
  assert.deepEqual(sortRows(rows, "model", "asc").map((r) => r.slug), ["zhang", "li"]);
});

test("preview updates composite and rank without touching stored rows", () => {
  const rows = [
    row("a", 90, 1, { "1": 9, "2": 9, "3": 9 }),
    row("b", 80, 2, { "1": 8, "2": 8 }),
  ];
  const preview = previewRanking(rows, dimensions, "b", { 1: 8, 2: 8, 3: 10 });
  assert.equal(preview.score?.toFixed(2), "84.00");
  assert.equal(preview.scoredCount, 3);
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
  assert.equal(dimensionMax([row("a", 9, 1, { "1": 12.5 })], 1), 12.5);
  assert.equal(dimensionMax([row("b", 9, 1, { "1": 8 })], 1), 8);
  const tied = [row("a", 9, 1, { "1": 7.5 }), row("b", 9, 2, { "1": 7.5 })];
  assert.equal(dimensionMax(tied, 1), 7.5);
  assert.equal(barWidth(7.5, dimensionMax(tied, 1)), 100);
  assert.equal(barWidth(8, 10), 80);
  assert.equal(barWidth(0, 0), 0);
  assert.equal(barWidth(null, 10), 0);
});

test("dimension ranks count scored models with a stable tie-break", () => {
  const rows = [
    row("a", 9, 1, { "1": 9 }),
    row("b", 8, 2, { "1": 9 }),
    row("c", 7, 3, { "1": 7 }),
    row("unscored", null, null, {}),
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
    { id: 1, name: "A", weight: 1, baselineMax: 10 },
    { id: 2, name: "B", weight: 1, baselineMax: 10 },
    { id: 3, name: "C", weight: 1, baselineMax: 10 },
  ];
  const swapped = [natural[0], natural[2], natural[1]];
  const alphaScores: Record<string, number> = { "1": 1, "2": 1, "3": 4 };
  const raw = (order: typeof natural) =>
    order.reduce((sum, dimension) => sum + (dimension.weight / 3) * (alphaScores[String(dimension.id)] ?? 0), 0);
  assert.notEqual(raw(natural), raw(swapped));

  const baselines = resolveBaselines(natural, [alphaScores]);
  const a = composite(natural, alphaScores, baselines);
  const b = composite(swapped, alphaScores, resolveBaselines(swapped, [alphaScores]));
  assert.equal(a.score, b.score);
  assert.equal(a.score, 20);
  assert.deepEqual([natural[0].id, natural[1].id, natural[2].id], [1, 2, 3]);
  assert.deepEqual([swapped[0].id, swapped[1].id, swapped[2].id], [1, 3, 2]);

  const rows = [
    row("alpha", 20, 1, alphaScores),
    row("zeta", 20, 2, alphaScores),
  ];
  const alpha = previewRanking(rows, swapped, "alpha", { 1: 1, 2: 1, 3: 4 });
  const zeta = previewRanking(rows, swapped, "zeta", { 1: 1, 2: 1, 3: 4 });
  assert.equal(alpha.score, zeta.score);
  assert.equal(alpha.rank, 1);
  assert.equal(zeta.rank, 2);
});
test("hidden rows stay last in every sort and never take a rank", () => {
  const rows: RankRow[] = [
    { ...row("hidden", 10, null, { "1": 10 }), hidden: true },
    row("a", 9, 1, { "1": 9 }),
    row("b", 8, 2, { "1": 8 }),
  ];
  assert.deepEqual(sortRows(rows, "score", "desc").map((r) => r.slug), ["a", "b", "hidden"]);
  assert.deepEqual(sortRows(rows, "score", "asc").map((r) => r.slug), ["b", "a", "hidden"]);
  assert.deepEqual(sortRows(rows, "model", "asc").map((r) => r.slug), ["a", "b", "hidden"]);
  assert.deepEqual(sortWorkbenchRows(rows, "model", "desc").map((r) => r.slug), ["b", "a", "hidden"]);
});

test("preview keeps ranks contiguous for visible rows and empty for hidden", () => {
  const dims = [{ id: 1, name: "d", weight: 50 }];
  const rows: RankRow[] = [
    { ...row("hidden", 10, null, { "1": 10 }), hidden: true },
    row("a", 9, 1, { "1": 9 }),
    row("b", 8, 2, { "1": 8 }),
  ];
  const first = previewRanking(rows, dims, "a", { 1: 9 });
  const second = previewRanking(rows, dims, "b", { 1: 8 });
  const hidden = previewRanking(rows, dims, "hidden", { 1: 10 });
  assert.equal(first.rank, 1);
  assert.equal(second.rank, 2);
  assert.equal(hidden.rank, null);
  assert.equal(hidden.score, 100);

  const merged = previewRanking([...rows, { ...row("new", null, null, {}), hidden: true }], dims, "new", { 1: 7 });
  assert.equal(merged.rank, null);
  assert.equal(merged.score, 70);
});

test("resolveBaselines prefers fixed values and omits unscored dimensions", () => {
  const dims = [
    { id: 1, name: "Fixed", weight: 50, baselineMax: 4 },
    { id: 2, name: "Auto", weight: 50 },
    { id: 3, name: "Idle", weight: 0 },
  ];
  const baselines = resolveBaselines(dims, [{ "1": 9, "2": 3 }, { "2": 7 }]);
  assert.equal(baselines.get(1), 4);
  assert.equal(baselines.get(2), 7);
  assert.equal(baselines.has(3), false);
});

test("automatic baselines follow the highest score and fixed ones ignore it", () => {
  const auto = [{ id: 1, name: "d", weight: 100 }];
  const before = resolveBaselines(auto, [{ "1": 8 }, { "1": 10 }]);
  const after = resolveBaselines(auto, [{ "1": 8 }, { "1": 16 }]);
  assert.equal(before.get(1), 10);
  assert.equal(after.get(1), 16);
  const fixed = [{ id: 1, name: "d", weight: 100, baselineMax: 10 }];
  assert.equal(resolveBaselines(fixed, [{ "1": 50 }]).get(1), 10);
});

test("all-zero scores keep a zero baseline and a zero composite", () => {
  const dims = [{ id: 1, name: "d", weight: 100 }];
  const scores = { "1": 0 };
  const baselines = resolveBaselines(dims, [scores]);
  assert.equal(baselines.get(1), 0);
  assert.equal(composite(dims, scores, baselines).score, 0);
});

test("scores above the baseline exceed one hundred", () => {
  const dims = [{ id: 1, name: "d", weight: 100, baselineMax: 5 }];
  const scores = { "1": 8 };
  assert.equal(composite(dims, scores, resolveBaselines(dims, [scores])).score, 160);
});

test("fallback baseline only lifts an automatic one", () => {
  const dims = [{ id: 1, name: "d", weight: 100 }];
  const rows = [row("a", 100, 1, { "1": 8 })];
  assert.equal(previewRanking(rows, dims, "a", { 1: 8 }).score, 100);
  assert.equal(previewRanking(rows, dims, "a", { 1: 8 }, { 1: 10 }).score, 80);
  assert.equal(previewRanking(rows, dims, "a", { 1: 8 }, { 1: 6 }).score, 100);
});

test("conversion matches the Go domain fixture", () => {
  // Same fixture as TestComputeWeightedAverage: four dimensions at
  // 8/9/10/7 with a fixed baseline of 10 -> 85.00.
  const dims = [
    { id: 1, name: "d", weight: 25, baselineMax: 10 },
    { id: 2, name: "d", weight: 25, baselineMax: 10 },
    { id: 3, name: "d", weight: 25, baselineMax: 10 },
    { id: 4, name: "d", weight: 25, baselineMax: 10 },
  ];
  const scores = { "1": 8, "2": 9, "3": 10, "4": 7 };
  assert.equal(composite(dims, scores, resolveBaselines(dims, [scores])).score?.toFixed(2), "85.00");
});

test("preview with the complete snapshot matches the saved ranking", () => {
  const dims = [{ id: 1, name: "d", weight: 100 }];
  const publicRows = [row("a", 80, 1, { "1": 8 })];
  const fullRows = [row("a", 80, 1, { "1": 8 }), { ...row("h", 100, null, { "1": 10 }), hidden: true }];
  const draft = { 1: 10 };
  const preview = previewRanking(fullRows, dims, "a", draft);
  const saved = composite(dims, { "1": 10 }, resolveBaselines(dims, [draft, { "1": 10 }]));
  assert.equal(preview.score, saved.score);
  assert.equal(preview.rank, 1);
  assert.equal(publicRows[0].scores["1"], 8);
});

/* ------------------------------------------- 维度组与跳过共享夹具（TASK-006） --- */
// The same hand table as internal/domain/ranking_test.go: four fixed-baseline
// dimensions — 1 Reasoning (40) + 2 Coding (20) form the "Core" group, 3 Writing
// (30) is "Craft" and 4 Speed (10) stays ungrouped — plus the models
// alpha/bravo/charlie/delta/echo (echo hidden). The server sends the 60% skip
// medians 80/60/90/70, so the composites are charlie 79 (4 rated), delta 78
// (every dimension skipped), alpha 67 (d2 skipped inside Core), bravo 63 (d1
// skipped while holding its highest rating) and echo 87.
const skipDimensions: Dimension[] = [
  { id: 1, name: "Reasoning", weight: 40, groupName: "Core", baselineMax: 10, skipMedian: 80 },
  { id: 2, name: "Coding", weight: 20, groupName: "Core", baselineMax: 10, skipMedian: 60 },
  { id: 3, name: "Writing", weight: 30, groupName: "Craft", baselineMax: 10, skipMedian: 90 },
  { id: 4, name: "Speed", weight: 10, groupName: null, baselineMax: 10, skipMedian: 70 },
];

const skipRows: RankRow[] = [
  { ...row("alpha", 67, 3, { "1": 6, "2": 5, "3": 9, "4": 4 }), skips: [2] },
  { ...row("bravo", 63, 4, { "1": 10, "2": 4, "3": 6, "4": 5 }), skips: [1] },
  { ...row("charlie", 79, 1, { "1": 9, "2": 6, "3": 8, "4": 7 }) },
  { ...row("delta", 78, 2, { "1": 7, "2": 3, "3": 5, "4": 2 }), skips: [1, 2, 3, 4] },
  { ...row("echo", 87, null, { "1": 8, "2": 8, "3": 10, "4": 9 }), hidden: true },
];

const skipBaselines = resolveBaselines(
  skipDimensions,
  skipRows.map((item) => item.scores),
);

function findSkipRow(slug: string): RankRow {
  const item = skipRows.find((candidate) => candidate.slug === slug);
  assert.ok(item, `missing row ${slug}`);
  return item;
}

test("skip fixture composites match the shared hand table", () => {
  const table: [string, string, number][] = [
    ["charlie", "79.00", 4],
    ["delta", "78.00", 0], // every dimension skipped
    ["alpha", "67.00", 3], // d2 skipped inside the Core group
    ["bravo", "63.00", 3], // d1 skipped
    ["echo", "87.00", 4],
  ];
  assert.equal(skipBaselines.get(1), 10); // the fixed baseline wins over the ratings
  for (const [slug, score, scoredCount] of table) {
    const item = findSkipRow(slug);
    const result = composite(skipDimensions, item.scores, skipBaselines, item.skips);
    assert.equal(result.score?.toFixed(2), score, slug);
    assert.equal(result.scoredCount, scoredCount, slug);
  }
});

test("skipping inside a group imputes the median and drops one rated dimension", () => {
  const alpha = findSkipRow("alpha");
  const rated = composite(skipDimensions, alpha.scores, skipBaselines, []);
  const skipped = composite(skipDimensions, alpha.scores, skipBaselines, alpha.skips);
  assert.equal(rated.score?.toFixed(2), "65.00");
  assert.equal(rated.scoredCount, 4);
  assert.equal(skipped.score?.toFixed(2), "67.00");
  assert.equal(skipped.scoredCount, 3);
});

test("a skipped dimension ignores its stored rating, even the highest one", () => {
  const bravo = findSkipRow("bravo");
  assert.equal(bravo.scores["1"], 10);
  assert.equal(columnValue(skipDimensions[0], bravo.scores, skipBaselines, bravo.skips), 80);
  assert.equal(composite(skipDimensions, bravo.scores, skipBaselines, []).score?.toFixed(2), "71.00");
});

test("group columns derive from groupName and reconcile the composite", () => {
  const board = boardColumns(skipDimensions);
  assert.deepEqual(board.groups.map((group) => group.name), ["Core", "Craft"]);
  assert.deepEqual(board.groups.map((group) => group.weight), [60, 30]);
  assert.deepEqual(board.groups.map((group) => group.color), [GROUP_COLORS[0], GROUP_COLORS[1]]);
  assert.deepEqual(board.ungrouped.map((dimension) => dimension.id), [4]);

  const core: Record<string, string> = { alpha: "60.00", bravo: "66.67", charlie: "80.00", delta: "73.33", echo: "80.00" };
  const craft: Record<string, string> = { alpha: "90.00", bravo: "60.00", charlie: "80.00", delta: "90.00", echo: "100.00" };
  for (const item of skipRows) {
    assert.equal(
      groupValue(board.groups[0], item.scores, skipBaselines, item.skips)?.toFixed(2),
      core[item.slug],
      `${item.slug} Core`,
    );
    assert.equal(
      groupValue(board.groups[1], item.scores, skipBaselines, item.skips)?.toFixed(2),
      craft[item.slug],
      `${item.slug} Craft`,
    );

    // Σ(column participation weight × column value) ÷ Σ participation weight
    // must reproduce the composite of the same hand table.
    const columns = [
      ...board.groups.map((group) => ({
        weight: group.dimensions.reduce(
          (sum, dimension) =>
            columnValue(dimension, item.scores, skipBaselines, item.skips) == null ? sum : sum + dimension.weight,
          0,
        ),
        value: groupValue(group, item.scores, skipBaselines, item.skips),
      })),
      ...board.ungrouped.map((dimension) => ({
        weight: dimension.weight,
        value: columnValue(dimension, item.scores, skipBaselines, item.skips),
      })),
    ];
    const weight = columns.reduce((sum, column) => (column.value == null ? sum : sum + column.weight), 0);
    const total = columns.reduce((sum, column) => (column.value == null ? sum : sum + column.weight * column.value), 0);
    assert.equal(
      (total / weight).toFixed(2),
      composite(skipDimensions, item.scores, skipBaselines, item.skips).score?.toFixed(2),
      `${item.slug} reconciliation`,
    );
  }
});

test("group sort keys order by group value and keep hidden rows last", () => {
  const board = boardColumns(skipDimensions);
  const options = { groups: board.groups, baselines: skipBaselines };
  assert.deepEqual(
    sortRows(skipRows, groupKey("Core"), "desc", options).map((item) => item.slug),
    ["charlie", "delta", "bravo", "alpha", "echo"],
  );
  assert.deepEqual(
    sortRows(skipRows, groupKey("Core"), "asc", options).map((item) => item.slug),
    ["alpha", "bravo", "delta", "charlie", "echo"],
  );
  // The ungrouped column key still sorts on the stored rating.
  assert.deepEqual(
    sortRows(skipRows, dimensionKey(3), "desc", options).map((item) => item.slug),
    ["alpha", "charlie", "bravo", "delta", "echo"],
  );
});

