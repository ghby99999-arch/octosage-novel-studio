import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  extractStateCandidates,
  runBatch,
  writeChapter,
  rewriteChapter,
} from "../src/core/workflow.mjs";
import { validateStateCandidates } from "../src/core/schemas.mjs";

test("extractStateCandidates writes sourced candidate facts for an approved chapter", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-state-"));
  try {
    const project = await createProject({
      root,
      title: "状态候选",
      idea: "2016年重生校园外卖",
      platform: "fanqie",
      genre: "都市重生商业爽文",
    });
    await writeChapter(project, 1);
    await rewriteChapter(project, 1);

    const candidates = await extractStateCandidates(project, 1);
    assert.equal(validateStateCandidates(candidates).ok, true);
    assert.ok(candidates.characters.some((item) => item.name === "陆川"));
    assert.ok(candidates.business_state.length > 0);
    assert.ok(candidates.meta.source_chapter === 1);

    const saved = JSON.parse(await readFile(candidates.path, "utf8"));
    assert.equal(saved.meta.source_chapter, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runBatch extracts state candidates for every approved chapter", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-batch-state-"));
  try {
    const project = await createProject({
      root,
      title: "批次状态",
      idea: "2016年重生校园外卖",
      platform: "fanqie",
      genre: "都市重生商业爽文",
    });

    const result = await runBatch(project, { from: 1, to: 5 });
    assert.ok(result.chapters.every((chapter) => chapter.state_candidates_path));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
