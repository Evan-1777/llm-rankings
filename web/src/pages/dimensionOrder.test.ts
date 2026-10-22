import { test } from "node:test";
import assert from "node:assert/strict";
import { moveVisibleOrder } from "./dimensionOrder.ts";

test("moves a visible id one slot up or down", () => {
  const all = [1, 2, 3];
  assert.deepEqual(moveVisibleOrder(all, all, 1, 0), [2, 1, 3]);
  assert.deepEqual(moveVisibleOrder(all, all, 1, 2), [1, 3, 2]);
});

test("keeps hidden archived slots while visible ids move", () => {
  const all = [1, 2, 3, 4, 5];
  const visible = [1, 3, 5];
  assert.deepEqual(moveVisibleOrder(all, visible, 0, 2), [3, 2, 5, 4, 1]);
  assert.deepEqual(moveVisibleOrder(all, visible, 2, 0), [5, 2, 1, 4, 3]);
});

test("rejects no-op and out-of-range moves without mutating inputs", () => {
  const all = [1, 2, 3];
  const visible = [1, 2, 3];
  assert.equal(moveVisibleOrder(all, visible, 1, 1), null);
  assert.equal(moveVisibleOrder(all, visible, -1, 0), null);
  assert.equal(moveVisibleOrder(all, visible, 0, 3), null);
  assert.deepEqual(all, [1, 2, 3]);
  assert.deepEqual(visible, [1, 2, 3]);
});