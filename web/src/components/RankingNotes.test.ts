import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RankingNotes } from "./RankingNotes.ts";

function render(content: string) {
  return renderToStaticMarkup(createElement(RankingNotes, { content }));
}

test("empty or whitespace-only content renders nothing", () => {
  assert.equal(render(""), "");
  assert.equal(render("  \n\t "), "");
});

test("content is wrapped in a labelled region without a fixed heading", () => {
  const html = render("评审规则");
  assert.match(html, /^<section aria-label="排行榜备注">/);
  assert.match(html, /<p>评审规则<\/p>/);
  assert.doesNotMatch(html, /<h[1-6]/);
});

test("common markdown maps to semantic markup", () => {
  const html = render(
    [
      "## 规则",
      "",
      "**重点** 与 *补充*",
      "",
      "1. 第一",
      "2. 第二",
      "",
      "- 条目",
      "",
      "> 引用",
      "",
      "`行内` 与 [文档](https://example.com/guide)",
      "",
      "```",
      "const a = 1;",
      "```",
    ].join("\n"),
  );
  assert.match(html, /<h2>规则<\/h2>/);
  assert.match(html, /<strong>重点<\/strong>/);
  assert.match(html, /<em>补充<\/em>/);
  assert.match(html, /<ol>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<code>行内<\/code>/);
  assert.match(html, /<a href="https:\/\/example.com\/guide">文档<\/a>/);
  assert.match(html, /<pre tabindex="0"><code/);
});

test("raw html, dangerous links and images never become active nodes", () => {
  const html = render(
    [
      "<script>alert(1)</script>",
      "",
      "<img src=x onerror=alert(1)>",
      "",
      "[危险](javascript:alert(1))",
      "",
      "![截图](https://example.com/shot.png)",
    ].join("\n"),
  );
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /onerror/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /javascript:/);
});
