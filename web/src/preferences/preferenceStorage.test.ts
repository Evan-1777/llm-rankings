import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIMENSION_SCORE_EMPHASIS_KEY,
  readDimensionScoreEmphasis,
  writeDimensionScoreEmphasis,
} from "./preferenceStorage.ts";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

test("stored true and false round-trip under the fixed key", () => {
  const storage = fakeStorage();
  assert.equal(writeDimensionScoreEmphasis(storage, true), true);
  assert.equal(storage.data.get(DIMENSION_SCORE_EMPHASIS_KEY), "true");
  assert.equal(readDimensionScoreEmphasis(storage), true);
  assert.equal(writeDimensionScoreEmphasis(storage, false), true);
  assert.equal(storage.data.get(DIMENSION_SCORE_EMPHASIS_KEY), "false");
  assert.equal(readDimensionScoreEmphasis(storage), false);
  assert.equal(DIMENSION_SCORE_EMPHASIS_KEY, "llmrank:dimension-score-emphasis");
});

test("missing or invalid values fall back to enabled", () => {
  assert.equal(readDimensionScoreEmphasis(fakeStorage()), true);
  assert.equal(readDimensionScoreEmphasis(fakeStorage({ [DIMENSION_SCORE_EMPHASIS_KEY]: "0" })), true);
  assert.equal(readDimensionScoreEmphasis(fakeStorage({ [DIMENSION_SCORE_EMPHASIS_KEY]: "false " })), true);
});

test("unavailable storage keeps the session default without throwing", () => {
  assert.equal(readDimensionScoreEmphasis(null), true);
  assert.equal(writeDimensionScoreEmphasis(null, false), false);
  const blockedRead = {
    getItem() {
      throw new Error("blocked");
    },
  };
  const blockedWrite = {
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readDimensionScoreEmphasis(blockedRead), true);
  assert.equal(writeDimensionScoreEmphasis(blockedWrite, true), false);
});
