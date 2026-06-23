import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  readTaskCheckpoint,
  runBatch,
  runProject,
} from "../src/core/workflow.mjs";
import { taskCheckpointFile } from "../src/core/paths.mjs";
import { validateTaskCheckpoint } from "../src/core/schemas.mjs";

async function createTempProject(prefix = "novel-studio-checkpoint-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.6 checkpoints",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("runBatch writes a completed checkpoint for a successful batch", async () => {
  const { root, project } = await createTempProject();
  try {
    const result = await runBatch(project, { from: 1, to: 3 });

    assert.equal(result.status, "completed");
    assert.ok(result.checkpoint_path);

    const checkpoint = await readTaskCheckpoint(project, { from: 1, to: 3 });
    assert.equal(validateTaskCheckpoint(checkpoint).ok, true);
    assert.equal(checkpoint.status, "completed");
    assert.equal(checkpoint.current_chapter, 3);
    assert.equal(checkpoint.last_step, "batch_state");
    assert.deepEqual(
      checkpoint.completed_chapters.map((item) => item.chapter_no),
      [1, 2, 3],
    );

    const saved = JSON.parse(await readFile(taskCheckpointFile(project, 1, 3), "utf8"));
    assert.equal(saved.status, "completed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runBatch writes a stopped checkpoint when review requires rollback", async () => {
  const { root, project } = await createTempProject("novel-studio-checkpoint-stop-");
  try {
    const result = await runBatch(project, {
      from: 1,
      to: 3,
      routerOptions: { provider: "mock-e" },
    });

    assert.equal(result.status, "stopped");
    assert.ok(result.checkpoint_path);

    const checkpoint = await readTaskCheckpoint(project, { from: 1, to: 3 });
    assert.equal(checkpoint.status, "stopped");
    assert.equal(checkpoint.current_chapter, 1);
    assert.equal(checkpoint.last_step, "review");
    assert.equal(checkpoint.stop.grade, "E");
    assert.equal(checkpoint.completed_chapters.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runProject exposes the latest checkpoint path in every batch result", async () => {
  const { root, project } = await createTempProject("novel-studio-run-checkpoint-");
  try {
    const result = await runProject(project, { untilChapter: 7 });

    assert.equal(result.status, "completed");
    assert.ok(result.batches.every((batch) => batch.checkpoint_path));
    assert.equal(result.batches[0].checkpoint_path, taskCheckpointFile(project, 1, 5));
    assert.equal(result.batches[1].checkpoint_path, taskCheckpointFile(project, 6, 7));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readTaskCheckpoint reports a friendly missing checkpoint message", async () => {
  const { root, project } = await createTempProject("novel-studio-missing-checkpoint-");
  try {
    await assert.rejects(
      () => readTaskCheckpoint(project, { from: 1, to: 5 }),
      /该批次尚未运行或检查点文件缺失/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
