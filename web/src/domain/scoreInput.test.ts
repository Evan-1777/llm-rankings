import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScoreInput, SCORE_INPUT_ERROR } from "./scoreInput.ts";

test("empty and whitespace-only input clears the score", () => {
  assert.deepEqual(parseScoreInput(""), { value: null, skip: false, error: null });
  assert.deepEqual(parseScoreInput("   "), { value: null, skip: false, error: null });
});

test("zero and regular values pass through", () => {
  assert.deepEqual(parseScoreInput("0"), { value: 0, skip: false, error: null });
  assert.deepEqual(parseScoreInput("9"), { value: 9, skip: false, error: null });
  assert.deepEqual(parseScoreInput("12.5"), { value: 12.5, skip: false, error: null });
});

test("the skip keyword is case-insensitive and never a number", () => {
  for (const raw of ["skip", "Skip", "  SKIP  "]) {
    assert.deepEqual(parseScoreInput(raw), { value: null, skip: true, error: null });
  }
});

test("negative, NaN and infinite values share one error", () => {
  for (const raw of ["-1", "NaN", "Infinity", "-Infinity", "abc"]) {
    assert.deepEqual(parseScoreInput(raw), { value: null, skip: false, error: SCORE_INPUT_ERROR });
  }
});

test("extra decimals round to one place", () => {
  assert.equal(parseScoreInput("8.75").value, 8.8);
  assert.equal(parseScoreInput("8.74").value, 8.7);
  assert.equal(parseScoreInput("0.04").value, 0);
  assert.equal(parseScoreInput("100.06").value, 100.1);
});
