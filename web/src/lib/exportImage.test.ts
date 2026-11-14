import assert from "node:assert/strict";
import { test } from "node:test";
import type { RankingDimension, Rankings } from "../api/types.ts";
import { planExportLayout, renderExportCanvas, toneFill, type ExportDisplay } from "./exportImage.ts";

/** Default board display settings: actual values, no tone. */
const ACTUAL: ExportDisplay = { percentage: false, maxShare: false, emphasis: false };

function dimension(id: number, weight: number, groupName = ""): RankingDimension {
  return { id, name: `维度 ${id}`, weight, groupName, baselineMax: null, effectiveBaselineMax: null, skipMedian: 0 };
}

test("layout keeps every enabled column in board order", () => {
  const layout = planExportLayout([
    dimension(1, 20),
    dimension(2, 40, "通用"),
    dimension(3, 30, "通用"),
    dimension(4, 0, "通用"),
  ]);
  assert.deepEqual(
    layout.columns.map((column) => column.label),
    ["综合排名", "模型", "综合分", "维度 1", "通用", "维度 4"],
  );
  // Neighbouring columns never overlap and stay inside the canvas.
  for (let index = 1; index < layout.columns.length; index += 1) {
    const previous = layout.columns[index - 1];
    assert.ok(layout.columns[index].x >= previous.x + previous.width);
  }
  const last = layout.columns[layout.columns.length - 1];
  assert.ok(last.x + last.width <= layout.width);
});

test("layout stretches the rating columns over the leftover width", () => {
  const layout = planExportLayout([dimension(1, 40, "通用"), dimension(2, 30)], 1200);
  assert.equal(layout.width, 1200);
  const last = layout.columns[layout.columns.length - 1];
  assert.ok(last.x + last.width > 1100, `content ends at ${last.x + last.width}`);
  assert.ok(last.x + last.width <= layout.width);
});

/** Records the drawn text and rectangles so anchors, tone fills and underlines can be checked. */
function recorder() {
  const drawn: { text: string; x: number; fill: string }[] = [];
  const rects: { x: number; y: number; width: number; height: number; fill: string }[] = [];
  const state = { fill: "" };
  const width = (text: string) => text.length * 6;
  const context = {
    get fillStyle() {
      return state.fill;
    },
    set fillStyle(value: string) {
      state.fill = value;
    },
    setTransform() {},
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, width: w, height: h, fill: state.fill });
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fillText(text: string, x: number) {
      drawn.push({ text, x, fill: state.fill });
    },
    measureText: (text: string) => ({ width: width(text) }),
  };
  const canvas = { width: 0, height: 0, style: {}, getContext: () => context } as unknown as HTMLCanvasElement;
  return { canvas, drawn, rects, width };
}

test("numeric columns draw header, values and Skip on one right anchor", () => {
  const dimensions = [dimension(1, 40), dimension(2, 30)];
  const rankings: Rankings = {
    totalWeight: 70,
    updatedAt: null,
    dimensions,
    models: [
      { slug: "a", name: "Alpha", vendor: "Vendor", hidden: false, score: 50, rank: 1, scoredCount: 1, scores: { "1": 9.5 }, skips: [2] },
    ],
  };
  const { canvas, drawn, width } = recorder();
  renderExportCanvas(canvas, rankings, ACTUAL, new Date("2026-11-12T00:00:00Z"));
  const layout = planExportLayout(dimensions);
  const right = (column: { x: number; width: number }) => column.x + column.width - 8;
  const anchor = (text: string) => {
    const call = drawn.find((item) => item.text === text);
    assert.ok(call, `missing draw call for ${text}`);
    return call.x + width(call.text);
  };

  // Composite, group and dimension columns share one right anchor per column.
  const score = layout.columns.find((column) => column.kind === "score");
  const skipped = layout.columns.find((column) => column.kind === "dimension" && column.dimension?.id === 2);
  const rated = layout.columns.find((column) => column.kind === "dimension" && column.dimension?.id === 1);
  assert.ok(score && skipped && rated);
  assert.equal(anchor(score.label), right(score));
  assert.equal(anchor("50.00"), right(score));
  assert.equal(anchor(rated.label), right(rated));
  assert.equal(anchor("9.5"), right(rated));
  assert.equal(anchor(skipped.label), right(skipped));
  assert.equal(anchor("Skip"), right(skipped));

  // Rank and model stay left aligned on the column edge.
  assert.equal(drawn.find((item) => item.text === "综合排名")?.x, layout.columns[0].x);
  assert.equal(drawn.find((item) => item.text === "Alpha")?.x, layout.columns[1].x);
});

/** Group members carry fixed baselines so the exported group value is a real number. */
function groupedDimension(id: number, weight: number, groupName: string, baseline: number): RankingDimension {
  return { id, name: `维度 ${id}`, weight, groupName, baselineMax: baseline, effectiveBaselineMax: baseline, skipMedian: 0 };
}

test("group column draws its value in the dimension format on the same anchor", () => {
  const dimensions = [groupedDimension(1, 20, "通用", 5), groupedDimension(2, 10, "通用", 4)];
  const rankings: Rankings = {
    totalWeight: 30,
    updatedAt: null,
    dimensions,
    models: [
      {
        slug: "a",
        name: "Alpha",
        vendor: "Vendor",
        hidden: false,
        score: 50,
        rank: 1,
        scoredCount: 2,
        scores: { "1": 4.5, "2": 3.6 },
        skips: [],
      },
    ],
  };
  const { canvas, drawn, width } = recorder();
  renderExportCanvas(canvas, rankings, ACTUAL, new Date("2026-11-12T00:00:00Z"));
  const group = planExportLayout(dimensions).columns.find((column) => column.kind === "group");
  assert.ok(group);
  // Both members convert to 90, so the group averages to one decimal like the dimension columns.
  const call = drawn.find((item) => item.text === "90.0");
  assert.ok(call, `group value missing: ${drawn.map((item) => item.text).join(", ")}`);
  assert.equal(call.x + width(call.text), group.x + group.width - 8);
});

/**
 * One ungrouped dimension with a real range, one two-member group, and one
 * dimension every model rates the same (no range).
 */
function board(): { dimensions: RankingDimension[]; rankings: Rankings } {
  const dimensions = [dimension(1, 20), groupedDimension(2, 20, "通用", 10), groupedDimension(3, 20, "通用", 10), dimension(4, 10)];
  const rankings: Rankings = {
    totalWeight: 70,
    updatedAt: null,
    dimensions,
    models: [
      { slug: "a", name: "Alpha", vendor: "Vendor", hidden: false, score: 75, rank: 2, scoredCount: 4, scores: { "1": 5, "2": 10, "3": 10, "4": 8 }, skips: [] },
      { slug: "b", name: "Bravo", vendor: "Vendor", hidden: false, score: 100, rank: 1, scoredCount: 4, scores: { "1": 10, "2": 5, "3": 5, "4": 8 }, skips: [] },
    ],
  };
  return { dimensions, rankings };
}

test("export follows the board's percentage mode", () => {
  const { rankings } = board();
  const textsFor = (display: ExportDisplay) => {
    const { canvas, drawn } = recorder();
    renderExportCanvas(canvas, rankings, display, new Date("2026-11-12T00:00:00Z"));
    return drawn.map((item) => item.text);
  };
  /** The footer and the info line are single drawn strings, so labels are matched inside them. */
  const mentions = (texts: string[], fragment: string) => texts.some((text) => text.includes(fragment));

  // 相对强度: composite 75-100 -> 1% / 100%, dimension 5-10 -> 1% / 100%,
  // group 50-100 -> 1% / 100%, the tied dimension has no range and shows a dash.
  const strength = textsFor({ percentage: true, maxShare: false, emphasis: false });
  assert.ok(strength.includes("综合强度"));
  assert.ok(mentions(strength, "相对强度"));
  assert.equal(strength.filter((text) => text === "—").length, 2);
  assert.ok(strength.includes("1%"));
  assert.ok(strength.includes("100%"));
  for (const actual of ["综合分", "75.00", "5.0", "100.0"]) {
    assert.ok(!strength.includes(actual), `actual value ${actual} leaked into percentage mode`);
  }
  assert.ok(!mentions(strength, "加权平均"));

  // 最高分占比: composite 75/100, dimension 5/10, group 50/100, tied dimension 8/8.
  const share = textsFor({ percentage: true, maxShare: true, emphasis: false });
  assert.ok(share.includes("综合占比"));
  assert.ok(mentions(share, "最高分占比"));
  assert.ok(share.includes("75%"));
  assert.ok(share.includes("50%"));
  assert.ok(!share.includes("75.00"));
  // Composite, dimension 1, group and the tied dimension each reach their maximum.
  assert.equal(share.filter((text) => text === "100%").length, 5);

  // Actual values stay one decimal for dimension and group cells, two for the composite.
  const actual = textsFor(ACTUAL);
  assert.ok(actual.includes("综合分"));
  assert.ok(mentions(actual, "加权平均"));
  for (const value of ["75.00", "100.00", "5.0", "10.0", "100.0", "50.0", "8.0"]) {
    assert.ok(actual.includes(value), `actual mode is missing ${value}`);
  }
});

test("tone fill blends the board token into the paper at the rounded strength", () => {
  assert.equal(toneFill("low", 1), "rgb(232, 154, 139)");
  assert.equal(toneFill("high", 1), "rgb(159, 203, 210)");
  assert.equal(toneFill("low", 0.59), "rgb(236, 189, 176)");
  assert.equal(toneFill("high", 0.2456), "rgb(221, 230, 225)");
});

test("export draws the board's tone on dimension and group values only", () => {
  const { rankings } = board();
  const toned = recorder();
  renderExportCanvas(toned.canvas, rankings, { ...ACTUAL, emphasis: true }, new Date("2026-11-12T00:00:00Z"));
  // Dimension 1 and the group have a range, the tied dimension and the composite do not.
  const fills = toned.rects.filter((rect) => rect.fill.startsWith("rgb("));
  assert.equal(fills.length, 4, `toned cells: ${fills.map((rect) => rect.fill).join(", ")}`);
  assert.deepEqual([...new Set(fills.map((rect) => rect.fill))].sort(), ["rgb(159, 203, 210)", "rgb(232, 154, 139)"]);
  const underlines = toned.rects.filter((rect) => rect.height === 2);
  assert.equal(underlines.length, 4);
  assert.deepEqual([...new Set(underlines.map((rect) => rect.fill))].sort(), ["#174f5b", "#8f1c14"]);
  assert.ok(toned.drawn.some((item) => item.text.includes("低分红 → 高分蓝")));

  const plain = recorder();
  renderExportCanvas(plain.canvas, rankings, ACTUAL, new Date("2026-11-12T00:00:00Z"));
  assert.equal(plain.rects.filter((rect) => rect.fill.startsWith("rgb(")).length, 0);
  assert.ok(!plain.drawn.some((item) => item.text.includes("低分红 → 高分蓝")));
});

test("export marks the champion by rank, not row order", () => {
  const { dimensions, rankings } = board();
  const layout = planExportLayout(dimensions);
  const rowY = (index: number) => layout.headerHeight + 46 + index * layout.rowHeight + 28;

  const { canvas, rects, drawn } = recorder();
  renderExportCanvas(canvas, rankings, ACTUAL, new Date("2026-11-12T00:00:00Z"));
  // Bravo holds rank 1 on the second row, so only that row gets the signal bar.
  const signals = rects.filter((rect) => rect.fill === "#b92a20" && rect.width === 3);
  assert.deepEqual(signals.map((rect) => rect.y), [rowY(1) - 14]);
  assert.equal(drawn.find((item) => item.text === "01")?.fill, "#b92a20");
  assert.equal(drawn.find((item) => item.text === "02")?.fill, "#14130f");

  // A board with no ranks at all marks nothing.
  const unranked: Rankings = { ...rankings, models: rankings.models.map((model) => ({ ...model, rank: null })) };
  const plain = recorder();
  renderExportCanvas(plain.canvas, unranked, ACTUAL, new Date("2026-11-12T00:00:00Z"));
  assert.equal(plain.rects.filter((rect) => rect.fill === "#b92a20").length, 0);
  const dashes = plain.drawn.filter((item) => item.text === "—");
  assert.equal(dashes.length, 2);
  assert.ok(dashes.every((item) => item.fill === "#14130f"));
});

test("layout widens instead of clipping many columns", () => {
  const many = Array.from({ length: 20 }, (_, index) => dimension(index + 1, 10));
  const layout = planExportLayout(many, 1200);
  assert.ok(layout.width > 1200);
  const last = layout.columns[layout.columns.length - 1];
  assert.ok(last.x + last.width <= layout.width);
});
