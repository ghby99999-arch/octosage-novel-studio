import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  loadProject,
  runProject,
} from "../src/core/workflow.mjs";

async function createTempProject(prefix = "novel-studio-run-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.5 run project",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("runProject runs repeated batches until the target chapter is reached", async () => {
  const { root, project } = await createTempProject();
  try {
    const result = await runProject(project, { untilChapter: 10 });

    assert.equal(result.status, "completed");
    assert.equal(result.until_chapter, 10);
    assert.equal(result.batches.length, 2);
    assert.deepEqual(
      result.batches.map((batch) => [batch.from, batch.to]),
      [
        [1, 5],
        [6, 10],
      ],
    );
    assert.equal(result.next_chapter, 11);

    const saved = await loadProject(project.path);
    assert.equal(saved.current_chapter, 11);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runProject respects a non-batch-aligned target chapter", async () => {
  const { root, project } = await createTempProject("novel-studio-run-exact-");
  try {
    const result = await runProject(project, { untilChapter: 7 });

    assert.equal(result.status, "completed");
    assert.deepEqual(
      result.batches.map((batch) => [batch.from, batch.to]),
      [
        [1, 5],
        [6, 7],
      ],
    );
    assert.equal(result.next_chapter, 8);

    const saved = await loadProject(project.path);
    assert.equal(saved.current_chapter, 8);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runProject stops and preserves progress when a later batch fails", async () => {
  const { root, project } = await createTempProject("novel-studio-run-stop-");
  try {
    await runProject(project, { untilChapter: 5 });
    const afterFirst = await loadProject(project.path);

    const result = await runProject(afterFirst, {
      untilChapter: 10,
      routerOptions: { provider: "mock-e" },
    });

    assert.equal(result.status, "stopped");
    assert.equal(result.completed_batches, 0);
    assert.equal(result.stop.chapter_no, 6);

    const saved = await loadProject(project.path);
    assert.equal(saved.current_chapter, 6);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runProject returns already_reached when target is before current progress", async () => {
  const { root, project } = await createTempProject("novel-studio-run-already-");
  try {
    await runProject(project, { untilChapter: 5 });
    const afterFirst = await loadProject(project.path);

    const result = await runProject(afterFirst, { untilChapter: 3 });

    assert.equal(result.status, "already_reached");
    assert.equal(result.until_chapter, 3);
    assert.equal(result.next_chapter, 6);
    assert.equal(result.batches.length, 0);
    assert.equal(result.completed_batches, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
