import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  readTaskCheckpoint,
  resumeBatch,
  runBatch,
} from "../src/core/workflow.mjs";
import { taskCheckpointFile } from "../src/core/paths.mjs";
import { writeJson } from "../src/core/fsx.mjs";

async function createTempProject(prefix = "novel-studio-resume-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.7 resume batch",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

async function seedRunningCheckpoint(project, { from = 1, completedTo = 3, to = 5 } = {}) {
  await runBatch(project, { from, to: completedTo });
  const partialCheckpoint = await readTaskCheckpoint(project, { from, to: completedTo });
  await writeJson(taskCheckpointFile(project, from, to), {
    ...partialCheckpoint,
    task_id: `batch-${from}-${to}`,
    status: "running",
    from,
    to,
    current_chapter: completedTo,
    last_step: "chapter_completed",
    stop: null,
  });
}

test("resumeBatch continues after completed chapters recorded in checkpoint", async () => {
  const { root, project } = await createTempProject();
  try {
    await seedRunningCheckpoint(project);

    const result = await resumeBatch(project, { from: 1, to: 5 });

    assert.equal(result.status, "completed");
    assert.equal(result.resumed, true);
    assert.equal(result.resume_from, 4);
    assert.deepEqual(
      result.chapters.map((chapter) => chapter.chapter_no),
      [1, 2, 3, 4, 5],
    );
    assert.ok(result.chapters[0].export_path.includes("0001"));
    assert.ok(result.chapters[3].export_path.includes("0004"));

    const checkpoint = await readTaskCheckpoint(project, { from: 1, to: 5 });
    assert.equal(checkpoint.status, "completed");
    assert.deepEqual(
      checkpoint.completed_chapters.map((chapter) => chapter.chapter_no),
      [1, 2, 3, 4, 5],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resumeBatch falls back to runBatch when checkpoint is missing", async () => {
  const { root, project } = await createTempProject("novel-studio-resume-missing-");
  try {
    const result = await resumeBatch(project, { from: 1, to: 2 });

    assert.equal(result.status, "completed");
    assert.equal(result.resumed, false);
    assert.deepEqual(
      result.chapters.map((chapter) => chapter.chapter_no),
      [1, 2],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resumeBatch returns already_completed for completed checkpoints", async () => {
  const { root, project } = await createTempProject("novel-studio-resume-done-");
  try {
    await runBatch(project, { from: 1, to: 2 });

    const result = await resumeBatch(project, { from: 1, to: 2 });

    assert.equal(result.status, "already_completed");
    assert.equal(result.resumed, true);
    assert.deepEqual(
      result.chapters.map((chapter) => chapter.chapter_no),
      [1, 2],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
