import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  continueBatch,
  createProject,
  loadProject,
} from "../src/core/workflow.mjs";

async function createTempProject(prefix = "novel-studio-continue-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.4 continue batch",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("continueBatch runs the next configured batch and advances project progress", async () => {
  const { root, project } = await createTempProject();
  try {
    const first = await continueBatch(project);

    assert.equal(first.status, "completed");
    assert.equal(first.from, 1);
    assert.equal(first.to, 5);
    assert.equal(first.next_chapter, 6);

    const afterFirst = await loadProject(project.path);
    assert.equal(afterFirst.current_chapter, 6);

    const second = await continueBatch(afterFirst);

    assert.equal(second.status, "completed");
    assert.equal(second.from, 6);
    assert.equal(second.to, 10);
    assert.equal(second.next_chapter, 11);
    assert.ok(second.chapters[0].export_path.includes("0006"));

    const afterSecond = await loadProject(project.path);
    assert.equal(afterSecond.current_chapter, 11);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("continueBatch does not advance current_chapter when a batch stops", async () => {
  const { root, project } = await createTempProject("novel-studio-continue-stop-");
  try {
    const result = await continueBatch(project, {
      routerOptions: { provider: "mock-e" },
    });

    assert.equal(result.status, "stopped");
    assert.equal(result.from, 1);
    assert.equal(result.stop.chapter_no, 1);

    const reloaded = await loadProject(project.path);
    assert.equal(reloaded.current_chapter, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("continueBatch writes project progress back to project.json", async () => {
  const { root, project } = await createTempProject("novel-studio-project-progress-");
  try {
    await continueBatch(project);

    const saved = JSON.parse(await readFile(path.join(project.path, "project.json"), "utf8"));
    assert.equal(saved.current_chapter, 6);
    assert.equal(saved.status, "writing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
