import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIMENSION_SCORE_EMPHASIS_KEY,
  SCORE_PERCENTAGE_MODE_KEY,
  readDimensionScoreEmphasis,
  readScorePercentageMode,
  writeDimensionScoreEmphasis,
  writeScorePercentageMode,
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

test("percentage mode is opt-in and round-trips under its own key", () => {
  const storage = fakeStorage();
  assert.equal(SCORE_PERCENTAGE_MODE_KEY, "llmrank:score-percentage-mode");
  assert.equal(readScorePercentageMode(storage), false);
  assert.equal(writeScorePercentageMode(storage, true), true);
  assert.equal(storage.data.get(SCORE_PERCENTAGE_MODE_KEY), "true");
  assert.equal(readScorePercentageMode(storage), true);
  assert.equal(writeScorePercentageMode(storage, false), true);
  assert.equal(storage.data.get(SCORE_PERCENTAGE_MODE_KEY), "false");
  assert.equal(readScorePercentageMode(storage), false);
});

test("percentage mode only accepts the literal string true", () => {
  assert.equal(readScorePercentageMode(fakeStorage({ [SCORE_PERCENTAGE_MODE_KEY]: "1" })), false);
  assert.equal(readScorePercentageMode(fakeStorage({ [SCORE_PERCENTAGE_MODE_KEY]: "TRUE" })), false);
  assert.equal(readScorePercentageMode(fakeStorage({ [SCORE_PERCENTAGE_MODE_KEY]: " " })), false);
  assert.equal(readScorePercentageMode(null), false);
  assert.equal(writeScorePercentageMode(null, true), false);
  assert.equal(
    readScorePercentageMode({
      getItem() {
        throw new Error("blocked");
      },
    }),
    false,
  );
});

test("the two display preferences never overwrite each other", () => {
  const storage = fakeStorage();
  writeScorePercentageMode(storage, true);
  assert.equal(readDimensionScoreEmphasis(storage), true);
  writeDimensionScoreEmphasis(storage, false);
  assert.equal(readDimensionScoreEmphasis(storage), false);
  assert.equal(readScorePercentageMode(storage), true);
  assert.equal(storage.data.size, 2);
});
