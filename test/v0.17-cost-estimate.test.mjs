import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createProject, writeChapter } from "../src/core/workflow.mjs";
import { modelCallsFile } from "../src/core/paths.mjs";

async function createTempProject(prefix = "novel-studio-cost-estimate-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.17 cost estimate",
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

test("model call log includes token and cost estimate placeholders", async () => {
  const { root, project } = await createTempProject();
  try {
    await writeChapter(project, 1);

    const calls = await readJsonLines(modelCallsFile(project));
    const call = calls.find((item) => item.task_type === "write_chapter");

    assert.ok(call);
    assert.equal(call.currency, "CNY");
    assert.ok(Number.isInteger(call.estimated_input_tokens));
    assert.ok(Number.isInteger(call.estimated_output_tokens));
    assert.ok(Number.isFinite(call.estimated_cost_cny));
    assert.equal(call.estimated_cost_cny, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
