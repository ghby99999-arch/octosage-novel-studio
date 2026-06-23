import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createProject, runSingleChapterQualityLoop } from "../src/core/workflow.mjs";
import { qualityReportFile } from "../src/core/paths.mjs";
import { readJson } from "../src/core/fsx.mjs";

async function createTempProject(prefix = "novel-studio-quality-report-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.28 quality report",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("runSingleChapterQualityLoop writes a quality report with publish blockers for stopped chapters", async () => {
  const { root, project } = await createTempProject();
  try {
    const result = await runSingleChapterQualityLoop(project, 1, { maxRewrites: 1 });

    assert.equal(result.status, "stopped");
    assert.equal(result.quality_report_path, qualityReportFile(project, 1));

    const report = await readJson(result.quality_report_path);
    assert.equal(report.status, "stopped");
    assert.equal(report.chapter_no, 1);
    assert.equal(report.final_grade, "D");
    assert.equal(report.final_version, "v2");
    assert.equal(report.rewrite_count, 1);
    assert.equal(report.publish_gate.publish_ready, false);
    assert.ok(report.failure_summary.reasons.length > 0);
    assert.ok(report.repair_failure_diagnosis.length > 0);
    assert.ok(report.model_calls.total_calls >= 4);
    assert.ok(report.model_calls.by_task.write_chapter >= 1);
    assert.ok(report.model_calls.by_task.review_chapter >= 1);
    assert.ok(Number.isFinite(report.model_calls.estimated_cost_cny));
    assert.ok(report.created_at);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runSingleChapterQualityLoop writes a quality report for stopped chapters", async () => {
  const { root, project } = await createTempProject("novel-studio-quality-report-stop-");
  try {
    const result = await runSingleChapterQualityLoop(project, 1, {
      routerOptions: { provider: "mock-e" },
    });

    assert.equal(result.status, "stopped");
    assert.equal(result.quality_report_path, qualityReportFile(project, 1));

    const report = await readJson(result.quality_report_path);
    assert.equal(report.status, "stopped");
    assert.equal(report.stop.reason, "rollback_required");
    assert.equal(report.final_grade, "E");
    assert.equal(report.model_calls.by_task.generate_chapter_card, 1);
    assert.equal(report.model_calls.by_task.review_chapter, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
