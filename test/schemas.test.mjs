import test from "node:test";
import assert from "node:assert/strict";

import {
  validateChapterCard,
  validateDraft,
  validateProject,
  validateReview,
} from "../src/core/schemas.mjs";

test("chapter card schema rejects missing hook fields", () => {
  const result = validateChapterCard({
    chapter_no: 1,
    display_title: "重回报到日",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /opening_hook/);
});

test("review schema accepts A-E grades and rejects unknown grades", () => {
  assert.equal(validateReview({ grade: "D", next_action: "rewrite_chapter" }).ok, true);
  assert.equal(validateReview({ grade: "Z", next_action: "approve" }).ok, false);
});

test("project schema requires planning fields", () => {
  const result = validateProject({
    title: "测试",
    platform: "fanqie",
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /target_words/);
});

test("draft schema validates draft version format", () => {
  assert.equal(
    validateDraft({
      chapter_no: 1,
      version: "v2",
      text: "正文",
      path: "正文/第0001章_v2.txt",
    }).ok,
    true,
  );
  assert.equal(
    validateDraft({
      chapter_no: 1,
      version: "second",
      text: "正文",
      path: "正文/第0001章_v2.txt",
    }).ok,
    false,
  );
});
