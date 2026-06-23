import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildChapterContext,
  buildWritingTaskPackage,
  createProject,
  generateChapterCard,
} from "../src/core/workflow.mjs";
import { writeJson } from "../src/core/fsx.mjs";
import { reviewFile } from "../src/core/paths.mjs";

async function createTempProject(prefix = "novel-studio-v12-review-history-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.2 review history",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

async function writeReview(project, chapterNo, issues, grade = "D") {
  await writeJson(reviewFile(project, chapterNo), {
    grade,
    next_action: grade === "D" ? "rewrite_chapter" : "approve",
    issues,
    created_at: `2026-05-2${chapterNo}T00:00:00.000Z`,
  });
}

test("v1.2 buildChapterContext injects recent review lessons from the last five chapters", async () => {
  const { root, project } = await createTempProject();
  try {
    for (let chapterNo = 1; chapterNo <= 6; chapterNo += 1) {
      await writeReview(project, chapterNo, [
        "解释腔过重",
        chapterNo % 2 === 0 ? "主角靠旁白推进" : "章尾钩子弱",
      ]);
    }

    const context = await buildChapterContext(project, 7);

    assert.equal(context.recent_review_history.window, 5);
    assert.deepEqual(
      context.recent_review_history.source_chapters.map((item) => item.chapter_no),
      [2, 3, 4, 5, 6],
    );
    assert.ok(context.recent_review_history.issues.includes("解释腔过重"));
    assert.ok(context.recent_review_history.issues.includes("主角靠旁白推进"));
    assert.ok(context.recent_review_history.issues.includes("章尾钩子弱"));
    assert.ok(context.recent_review_history.writing_constraints.some((item) => item.includes("具体动作")));
    assert.ok(context.recent_review_history.writing_constraints.some((item) => item.includes("章尾")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.2 buildWritingTaskPackage persists review history as creative constraints", async () => {
  const { root, project } = await createTempProject("novel-studio-v12-task-package-");
  try {
    await generateChapterCard(project, 6);
    await writeReview(project, 1, ["解释腔过重"]);
    await writeReview(project, 2, ["主角靠旁白推进"]);
    await writeReview(project, 3, ["配角老周台词同质化"]);

    const taskPackage = await buildWritingTaskPackage(project, 6, { force: true });

    assert.ok(taskPackage.context.recent_review_history);
    assert.ok(taskPackage.context.recent_review_history.issues.includes("解释腔过重"));
    assert.ok(taskPackage.context.recent_review_history.issues.includes("配角老周台词同质化"));
    assert.equal(taskPackage.context.recent_review_history.use_as_prompt_constraints, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
