import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  loadProject,
  readTaskCheckpoint,
  runBatch,
  runProject,
} from "../src/core/workflow.mjs";
import { taskCheckpointFile } from "../src/core/paths.mjs";
import { writeJson } from "../src/core/fsx.mjs";

async function createTempProject(prefix = "novel-studio-run-resume-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.8 run resume",
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

test("runProject resumes an unfinished checkpoint instead of rerunning completed chapters", async () => {
  const { root, project } = await createTempProject();
  try {
    await seedRunningCheckpoint(project);

    const result = await runProject(project, { untilChapter: 5, resume: true });

    assert.equal(result.status, "completed");
    assert.equal(result.completed_batches, 1);
    assert.equal(result.next_chapter, 6);
    assert.equal(result.batches[0].resumed, true);
    assert.equal(result.batches[0].resume_from, 4);
    assert.deepEqual(
      result.batches[0].chapters.map((chapter) => chapter.chapter_no),
      [1, 2, 3, 4, 5],
    );
    assert.ok(result.batches[0].chapters[0].export_path.includes("0001"));

    const savedProject = await loadProject(project.path);
    assert.equal(savedProject.current_chapter, 6);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
