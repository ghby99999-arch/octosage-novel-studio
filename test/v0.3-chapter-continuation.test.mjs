import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildWritingTaskPackage,
  createProject,
  runBatch,
  writeChapter,
} from "../src/core/workflow.mjs";
import { taskPackageFile } from "../src/core/paths.mjs";
import { validateWritingTaskPackage } from "../src/core/schemas.mjs";

async function createTempProject(prefix = "novel-studio-continuation-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.3 continuation",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("buildWritingTaskPackage creates a schema-valid task package with recent batch state", async () => {
  const { root, project } = await createTempProject();
  try {
    await runBatch(project, { from: 1, to: 5 });

    const taskPackage = await buildWritingTaskPackage(project, 6);

    assert.equal(validateWritingTaskPackage(taskPackage).ok, true);
    assert.equal(taskPackage.chapter_no, 6);
    assert.equal(taskPackage.context.recent_batch_range.from, 1);
    assert.equal(taskPackage.context.recent_batch_range.to, 5);
    assert.ok(taskPackage.context.batch_state.characters.some((item) => item.name === "陆川"));

    const saved = JSON.parse(await readFile(taskPackage.path, "utf8"));
    assert.equal(saved.chapter_no, 6);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writeChapter uses the recent batch state when writing chapter six", async () => {
  const { root, project } = await createTempProject("novel-studio-write-six-");
  try {
    await runBatch(project, { from: 1, to: 5 });

    const draft = await writeChapter(project, 6);

    assert.match(draft.text, /CONTEXT-RANGE-1-5/);
    assert.match(draft.text, /STATE-CHARACTER-陆川/);
    assert.match(draft.text, /CHAPTER-CONTEXT-6/);

    const taskPackage = JSON.parse(await readFile(taskPackageFile(project, 6), "utf8"));
    assert.equal(taskPackage.chapter_no, 6);
    assert.equal(taskPackage.context.recent_batch_range.to, 5);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writeChapter still works without prior batch state for an opening chapter", async () => {
  const { root, project } = await createTempProject("novel-studio-no-context-");
  try {
    const draft = await writeChapter(project, 1);

    assert.equal(draft.chapter_no, 1);
    assert.doesNotMatch(draft.text, /CONTEXT-RANGE-/);
    assert.match(draft.text, /重回报到日/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
