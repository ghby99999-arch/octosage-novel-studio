import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createProject, runBatch } from "../src/core/workflow.mjs";

test("v0.2 batch loop writes, reviews, rewrites, and exports five chapters", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-batch-"));
  try {
    const project = await createProject({
      root,
      title: "批次演示",
      idea: "2016年重生回大学，从校园外卖切入，最后做成互联网大佬。",
      platform: "fanqie",
      genre: "都市重生商业爽文",
    });

    const result = await runBatch(project, { from: 1, to: 5 });
    assert.equal(result.chapters.length, 5);
    assert.ok(result.chapters.every((chapter) => chapter.review_grade === "B"));

    const exported = await readdir(path.join(project.path, "导出"));
    assert.equal(exported.length, 5);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
