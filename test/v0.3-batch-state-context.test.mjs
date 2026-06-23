import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  aggregateBatchState,
  buildChapterContext,
  createProject,
  runBatch,
} from "../src/core/workflow.mjs";
import { stateCandidatesFile } from "../src/core/paths.mjs";
import { writeJson } from "../src/core/fsx.mjs";
import { validateBatchState } from "../src/core/schemas.mjs";

async function createTempProject(prefix = "novel-studio-batch-state-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.3 batch state",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("aggregateBatchState combines approved chapter state candidates into one batch file", async () => {
  const { root, project } = await createTempProject();
  try {
    await runBatch(project, { from: 1, to: 5 });

    const batchState = await aggregateBatchState(project, { from: 1, to: 5 });

    assert.equal(validateBatchState(batchState).ok, true);
    assert.equal(batchState.meta.from, 1);
    assert.equal(batchState.meta.to, 5);
    assert.equal(batchState.meta.source_files.length, 5);
    assert.ok(batchState.characters.some((item) => item.name === "陆川"));
    assert.ok(batchState.business_state.length > 0);

    const saved = JSON.parse(await readFile(batchState.path, "utf8"));
    assert.equal(saved.meta.to, 5);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("aggregateBatchState keeps low confidence candidates out of hard fact arrays", async () => {
  const { root, project } = await createTempProject("novel-studio-low-confidence-");
  try {
    await writeJson(stateCandidatesFile(project, 1), {
      meta: { source_chapter: 1, source_version: "v1", extractor: "test" },
      characters: [
        {
          name: "不可靠人物",
          state: "可能只是路人",
          source: "chapter:1",
          confidence: 0.4,
        },
      ],
      relationships: [],
      business_state: [],
      money_orders: [],
      foreshadowing_added: [],
      foreshadowing_resolved: [],
      timeline: [],
      risks: [],
      character_voice_samples: [],
    });

    const batchState = await aggregateBatchState(project, { from: 1, to: 1 });

    assert.equal(batchState.characters.length, 0);
    assert.ok(
      batchState.low_confidence_candidates.some(
        (item) => item.category === "characters" && item.name === "不可靠人物",
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("buildChapterContext loads recent batch state for the next chapter task package", async () => {
  const { root, project } = await createTempProject("novel-studio-chapter-context-");
  try {
    await runBatch(project, { from: 1, to: 5 });
    await aggregateBatchState(project, { from: 1, to: 5 });

    const context = await buildChapterContext(project, 6);

    assert.equal(context.chapter_no, 6);
    assert.deepEqual(context.recent_batch_range, { from: 1, to: 5 });
    assert.equal(context.project.title, project.title);
    assert.ok(context.hard_rules.some((rule) => rule.includes("2016")));
    assert.ok(context.batch_state.characters.some((item) => item.name === "陆川"));
    assert.ok(context.batch_state.low_confidence_candidates.every((item) => item.confidence < 0.7));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
