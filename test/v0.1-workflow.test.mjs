import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  generateChapterCard,
  writeChapter,
  reviewChapter,
  rewriteChapter,
  exportChapter,
} from "../src/core/workflow.mjs";

test("v0.1 runs a single-chapter loop without user-written prompts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-"));
  try {
    const project = await createProject({
      root,
      title: "都重生了谁还开法拉利啊",
      idea: "2016年重生回大学，从校园外卖切入，最后做成互联网大佬，番茄男频，轻松暗爽，200万字。",
      platform: "fanqie",
      genre: "都市重生商业爽文",
    });

    assert.equal(project.current_chapter, 1);
    assert.equal(project.batch_size, 5);

    const card = await generateChapterCard(project, 1);
    assert.equal(card.chapter_no, 1);
    assert.ok(card.display_title.length > 0);
    assert.ok(card.opening_hook.length > 0);

    const draft = await writeChapter(project, 1);
    assert.equal(draft.chapter_no, 1);
    assert.match(draft.text, /陆川/);

    const review = await reviewChapter(project, 1);
    assert.equal(review.grade, "D");
    assert.equal(review.next_action, "rewrite_chapter");

    const rewritten = await rewriteChapter(project, 1);
    assert.ok(rewritten.text.length > draft.text.length);
    assert.doesNotMatch(rewritten.text, /本章通过|创作说明|JSON/);

    const secondReview = await reviewChapter(project, 1);
    assert.equal(secondReview.grade, "B");

    const exported = await exportChapter(project, 1);
    const output = await readFile(exported.path, "utf8");
    assert.match(output, /陆川/);
    assert.match(output, new RegExp(card.display_title));
    assert.doesNotMatch(output, /本章通过|创作说明|JSON/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
