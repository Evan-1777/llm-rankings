import assert from "node:assert/strict";
import { test } from "node:test";
import type { RankingDimension, Rankings } from "../api/types.ts";
import { planExportLayout, renderExportCanvas } from "./exportImage.ts";

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

/** Records the drawn text so the anchor of every column can be checked. */
function recorder() {
  const drawn: { text: string; x: number }[] = [];
  const width = (text: string) => text.length * 6;
  const context = {
    setTransform() {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fillText(text: string, x: number) {
      drawn.push({ text, x });
    },
    measureText: (text: string) => ({ width: width(text) }),
  };
  const canvas = { width: 0, height: 0, style: {}, getContext: () => context } as unknown as HTMLCanvasElement;
  return { canvas, drawn, width };
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
  renderExportCanvas(canvas, rankings, new Date("2026-11-12T00:00:00Z"));
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

test("layout widens instead of clipping many columns", () => {
  const many = Array.from({ length: 20 }, (_, index) => dimension(index + 1, 10));
  const layout = planExportLayout(many, 1200);
  assert.ok(layout.width > 1200);
  const last = layout.columns[layout.columns.length - 1];
  assert.ok(last.x + last.width <= layout.width);
});
