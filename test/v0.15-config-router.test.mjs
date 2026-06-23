import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  reviewChapter,
  saveProjectConfig,
  writeChapter,
} from "../src/core/workflow.mjs";
import { modelCallsFile } from "../src/core/paths.mjs";

async function createTempProject(prefix = "novel-studio-config-router-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.15 config router",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

async function readJsonLines(file) {
  const text = await readFile(file, "utf8");
  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("workflow uses config model provider when routerOptions are omitted", async () => {
  const { root, project } = await createTempProject();
  try {
    await writeChapter(project, 1);
    await saveProjectConfig(project, {
      model: {
        provider: "mock-e",
      },
    });

    const review = await reviewChapter(project, 1);

    assert.equal(review.grade, "E");
    const calls = await readJsonLines(modelCallsFile(project));
    assert.equal(calls.at(-1).provider, "mock-e");
    assert.equal(calls.at(-1).task_type, "review_chapter");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
