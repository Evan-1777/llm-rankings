import assert from "node:assert/strict";
import { test } from "node:test";
import type { RankingDimension } from "../api/types.ts";
import { planExportLayout } from "./exportImage.ts";

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

test("layout widens instead of clipping many columns", () => {
  const many = Array.from({ length: 20 }, (_, index) => dimension(index + 1, 10));
  const layout = planExportLayout(many, 1200);
  assert.ok(layout.width > 1200);
  const last = layout.columns[layout.columns.length - 1];
  assert.ok(last.x + last.width <= layout.width);
});
