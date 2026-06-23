import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createProject, readTaskCheckpoint, runBatch } from "../src/core/workflow.mjs";
import { taskCheckpointFile } from "../src/core/paths.mjs";

async function createTempProject(prefix = "novel-studio-checkpoint-frequency-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.25 checkpoint frequency",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("runBatch writes checkpoints only at durable boundaries for a successful chapter", async () => {
  const { root, project } = await createTempProject();
  const checkpointWrites = [];
  try {
    const result = await runBatch(project, {
      from: 1,
      to: 1,
      onCheckpointWrite(checkpoint) {
        checkpointWrites.push({
          status: checkpoint.status,
          current_chapter: checkpoint.current_chapter,
          last_step: checkpoint.last_step,
        });
      },
    });

    assert.equal(result.status, "completed");
    assert.deepEqual(checkpointWrites, [
      { status: "running", current_chapter: 1, last_step: "start" },
      { status: "running", current_chapter: 1, last_step: "chapter_completed" },
      { status: "running", current_chapter: 1, last_step: "batch_state" },
      { status: "completed", current_chapter: 1, last_step: "batch_state" },
    ]);

    const saved = await readTaskCheckpoint(project, { from: 1, to: 1 });
    assert.equal(saved.status, "completed");
    assert.equal(saved.last_step, "batch_state");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runBatch still writes an immediate stopped checkpoint", async () => {
  const { root, project } = await createTempProject("novel-studio-checkpoint-stop-frequency-");
  const checkpointWrites = [];
  try {
    const result = await runBatch(project, {
      from: 1,
      to: 1,
      routerOptions: { provider: "mock-e" },
      onCheckpointWrite(checkpoint) {
        checkpointWrites.push({
          status: checkpoint.status,
          current_chapter: checkpoint.current_chapter,
          last_step: checkpoint.last_step,
          stop: checkpoint.stop,
        });
      },
    });

    assert.equal(result.status, "stopped");
    assert.deepEqual(
      checkpointWrites.map((checkpoint) => checkpoint.last_step),
      ["start", "review"],
    );
    assert.equal(checkpointWrites.at(-1).status, "stopped");
    assert.equal(checkpointWrites.at(-1).stop.grade, "E");

    const raw = await readFile(taskCheckpointFile(project, 1, 1), "utf8");
    assert.match(raw, /"status": "stopped"/);
    assert.match(raw, /"last_step": "review"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
