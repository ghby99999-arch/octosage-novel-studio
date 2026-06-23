import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createProject, runSingleChapterQualityLoop } from "../src/core/workflow.mjs";

async function createTempProject(prefix = "octosage-model-quality-ledger-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "model quality ledger",
    idea: "2016 rebirth campus delivery business with ledgers and merchant contracts",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

test("model capability ledger joins chapter quality outcomes", async () => {
  const { root, project } = await createTempProject();
  try {
    const result = await runSingleChapterQualityLoop(project, 1, { maxRewrites: 0 });
    assert.ok(result.quality_report_path);

    const report = await readJson(result.quality_report_path);
    assert.ok(Array.isArray(report.model_call_details));
    assert.ok(report.model_call_details.length >= 2);

    const ledger = await readJson(path.join(project.path, "tasks", "model_capability_ledger.json"));
    assert.equal(ledger.version, 2);
    assert.ok(ledger.entries.length >= 2);
    const qualityEntries = ledger.entries.filter((entry) => Number(entry.quality_samples || 0) > 0);
    assert.ok(qualityEntries.length >= 2);
    assert.ok(qualityEntries.every((entry) => entry.publish_ready_rate !== undefined));
    assert.ok(qualityEntries.every((entry) => entry.avg_reader_behavior_score !== undefined));
    assert.ok(qualityEntries.every((entry) => entry.avg_ai_taste_score !== undefined));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
