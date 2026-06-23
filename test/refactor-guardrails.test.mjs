import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { readJson } from "../src/core/fsx.mjs";
import { createModelRouter } from "../src/core/model-router.mjs";
import { projectSlug, safeFileName } from "../src/core/paths.mjs";
import {
  buildWritingTaskPackage,
  createProject,
} from "../src/core/workflow.mjs";

test("projectSlug and safeFileName share slug behavior with different max lengths", () => {
  const input = '  A B:C*D?E"F<G>H|I '.repeat(10);

  assert.equal(projectSlug(input).length, 80);
  assert.equal(safeFileName(input).length, 100);
  assert.doesNotMatch(projectSlug(input), /[\\/:*?"<>| ]/);
  assert.doesNotMatch(safeFileName(input), /[\\/:*?"<>| ]/);
});

test("readJson includes file path when JSON parsing fails", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-bad-json-"));
  const file = path.join(root, "broken.json");
  try {
    await writeFile(file, "{ broken", "utf8");
    await assert.rejects(() => readJson(file), new RegExp(`无法解析 JSON: ${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("buildWritingTaskPackage reuses an existing task package by default", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-task-cache-"));
  try {
    const project = await createProject({
      root,
      title: "task cache",
      idea: "2016 rebirth campus local service business story",
      platform: "fanqie",
      genre: "urban business rebirth",
    });

    const first = await buildWritingTaskPackage(project, 1);
    const firstMtime = (await stat(first.path)).mtimeMs;
    const second = await buildWritingTaskPackage(project, 1);
    const secondMtime = (await stat(second.path)).mtimeMs;

    assert.equal(second.path, first.path);
    assert.equal(secondMtime, firstMtime);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("model router reports unknown providers through registry lookup", () => {
  assert.throws(
    () => createModelRouter({ provider: "missing-provider" }),
    /Provider not configured: missing-provider/,
  );
});
