import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createProject, generateChapterCard, writeChapter } from "../src/core/workflow.mjs";
import { modelCallsFile } from "../src/core/paths.mjs";

async function createTempProject(prefix = "novel-studio-model-calls-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.14 model calls",
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

test("model calls are appended to project model_calls.jsonl", async () => {
  const { root, project } = await createTempProject();
  try {
    await generateChapterCard(project, 1);
    await writeChapter(project, 1);

    const calls = await readJsonLines(modelCallsFile(project));

    assert.equal(calls.length, 2);
    assert.deepEqual(
      calls.map((call) => call.task_type),
      ["generate_chapter_card", "write_chapter"],
    );
    assert.ok(calls.every((call) => call.provider === "mock"));
    assert.ok(calls.every((call) => call.status === "ok"));
    assert.ok(calls.every((call) => Number.isFinite(call.duration_ms)));
    assert.ok(calls.every((call) => call.created_at));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
