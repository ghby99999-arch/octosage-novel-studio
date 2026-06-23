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
import {
  draftFile,
  exportFile,
  reviewFile,
  stateCandidatesFile,
  taskCheckpointFile,
  taskPackageFile,
} from "../src/core/paths.mjs";
import { writeJson } from "../src/core/fsx.mjs";

async function createTempProject(prefix = "novel-studio-resume-artifacts-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.10 resume artifacts",
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
  return partialCheckpoint.completed_chapters;
}

test("resumeBatch repairs missing export and task package artifacts for completed chapters", async () => {
  const { root, project } = await createTempProject();
  try {
    await seedRunningCheckpoint(project);
    await rm(exportFile(project, 2), { force: true });
    await rm(taskPackageFile(project, 2), { force: true });

    const result = await resumeBatch(project, { from: 1, to: 5 });

    assert.equal(result.status, "completed");
    assert.equal(result.resume_from, 4);
    assert.deepEqual(
      result.repaired.map((item) => [item.chapter_no, item.artifact]),
      [
        [2, "task_package"],
        [2, "export"],
      ],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resumeBatch stops before resume when completed chapter draft is missing", async () => {
  const { root, project } = await createTempProject("novel-studio-resume-artifacts-missing-");
  try {
    await seedRunningCheckpoint(project);
    await rm(draftFile(project, 2, "v2"), { force: true });

    const result = await resumeBatch(project, { from: 1, to: 5 });

    assert.equal(result.status, "stopped");
    assert.equal(result.resumed, true);
    assert.equal(result.stop.reason, "artifact_missing");
    assert.equal(result.stop.chapter_no, 2);
    assert.deepEqual(result.stop.missing_artifacts, [
      {
        artifact: "draft",
        path: draftFile(project, 2, "v2"),
      },
    ]);

    const checkpoint = await readTaskCheckpoint(project, { from: 1, to: 5 });
    assert.equal(checkpoint.status, "stopped");
    assert.equal(checkpoint.stop.reason, "artifact_missing");
    assert.equal(checkpoint.current_chapter, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resumeBatch repairs missing review and state candidates after draft is present", async () => {
  const { root, project } = await createTempProject("novel-studio-resume-artifacts-review-");
  try {
    await seedRunningCheckpoint(project);
    await rm(reviewFile(project, 2), { force: true });
    await rm(stateCandidatesFile(project, 2), { force: true });

    const result = await resumeBatch(project, { from: 1, to: 5 });

    assert.equal(result.status, "completed");
    assert.deepEqual(
      result.repaired.map((item) => [item.chapter_no, item.artifact]),
      [
        [2, "review"],
        [2, "state_candidates"],
      ],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
