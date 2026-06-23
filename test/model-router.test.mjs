import test from "node:test";
import assert from "node:assert/strict";

import { createModelRouter } from "../src/core/model-router.mjs";

test("mock model router returns structured outputs by task type", async () => {
  const router = createModelRouter({ provider: "mock" });

  const card = await router.invoke({
    task_type: "generate_chapter_card",
    project: { idea: "2016年重生校园外卖" },
    chapter_no: 1,
  });
  assert.equal(card.chapter_no, 1);
  assert.ok(card.display_title);

  const draft = await router.invoke({
    task_type: "write_chapter",
    chapter_card: card,
    draft_mode: "weak",
  });
  assert.match(draft.text, /陆川/);

  const review = await router.invoke({
    task_type: "review_chapter",
    text: draft.text,
  });
  assert.equal(review.grade, "D");
});

test("mock chapter cards vary by chapter number", async () => {
  const router = createModelRouter({ provider: "mock" });
  const first = await router.invoke({
    task_type: "generate_chapter_card",
    project: { idea: "2016年重生校园外卖" },
    chapter_no: 1,
  });
  const second = await router.invoke({
    task_type: "generate_chapter_card",
    project: { idea: "2016年重生校园外卖" },
    chapter_no: 2,
  });

  assert.notEqual(first.display_title, second.display_title);
  assert.notEqual(first.main_event, second.main_event);
});

test("router reports unknown task type clearly", async () => {
  const router = createModelRouter({ provider: "mock" });
  await assert.rejects(
    () => router.invoke({ task_type: "typo_task" }),
    /Unsupported mock task: typo_task/,
  );
});
