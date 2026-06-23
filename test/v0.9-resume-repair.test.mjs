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
import { stateCandidatesFile, taskCheckpointFile } from "../src/core/paths.mjs";
import { writeJson } from "../src/core/fsx.mjs";

async function createTempProject(prefix = "novel-studio-resume-repair-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.9 resume repair",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("resumeBatch repairs missing state candidates for completed checkpoint chapters", async () => {
  const { root, project } = await createTempProject();
  try {
    await runBatch(project, { from: 1, to: 3 });
    const partialCheckpoint = await readTaskCheckpoint(project, { from: 1, to: 3 });
    await writeJson(taskCheckpointFile(project, 1, 5), {
      ...partialCheckpoint,
      task_id: "batch-1-5",
      status: "running",
      from: 1,
      to: 5,
      current_chapter: 3,
      last_step: "chapter_completed",
      stop: null,
    });
    await rm(stateCandidatesFile(project, 2), { force: true });

    const result = await resumeBatch(project, { from: 1, to: 5 });

    assert.equal(result.status, "completed");
    assert.equal(result.resumed, true);
    assert.equal(result.resume_from, 4);
    assert.deepEqual(result.repaired, [
      {
        chapter_no: 2,
        artifact: "state_candidates",
        path: stateCandidatesFile(project, 2),
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
