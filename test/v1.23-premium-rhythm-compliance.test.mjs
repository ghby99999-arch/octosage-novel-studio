import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  writePremiumReadinessReport,
} from "../src/core/workflow.mjs";
import { qualityReportFile } from "../src/core/paths.mjs";
import { writeJson } from "../src/core/fsx.mjs";

async function createTempProject(prefix = "novel-studio-v123-premium-rhythm-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.23 premium rhythm",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function baseMetrics() {
  return {
    tail_hook_score: { score: 88, issues: [] },
    micro_hook_density: { density: 1.0, issues: [] },
    coolpoint_delivered: { effective_count: 1, grade: "B", issues: [] },
    drop_risk_segments: { risky_segment_count: 1, total_segments: 6, issues: [] },
    retention_prediction: { score: 78, band: "pass" },
  };
}

function rhythmCompliance(chapterNo, issues = []) {
  return {
    enabled: true,
    reference_name: "benchmark-rhythm",
    issues,
    checks: {
      opening_pattern: {
        expected: "data_result",
        actual: issues.includes("rhythm_opening_mismatch") ? "static_environment" : "data_result",
        ok: !issues.includes("rhythm_opening_mismatch"),
      },
      tail_hook_type: {
        expected: "information_gap",
        actual: issues.includes("rhythm_tail_hook_mismatch") ? "generic" : "information_gap",
        ok: !issues.includes("rhythm_tail_hook_mismatch"),
      },
      beat_constraints: {
        expected: ["misread_then_result", "data_payoff"],
        actual: issues.includes("rhythm_beat_missing") ? ["data_payoff"] : ["misread_then_result", "data_payoff"],
        missing: issues.includes("rhythm_beat_missing") ? ["misread_then_result"] : [],
        ok: !issues.includes("rhythm_beat_missing"),
      },
      dialogue_ratio: { expected: { min: 0.08, max: 0.24 }, actual: 0.12, ok: true },
      micro_hook_density: { expected_min: 0.9, actual: 1.0, ok: true },
      drop_risk_segments: { expected_max: 1, actual: 1, ok: true },
    },
  };
}

function qualityReport(chapterNo, rhythmIssues = []) {
  return {
    project_title: "v1.23 premium rhythm",
    status: "approved",
    chapter_no: chapterNo,
    final_grade: "B",
    quality_metrics: baseMetrics(),
    review_quality_flags: rhythmIssues.length ? ["rhythm_transfer_deviation"] : [],
    rhythm_transfer_compliance: rhythmCompliance(chapterNo, rhythmIssues),
    created_at: new Date().toISOString(),
  };
}

test("v1.23 premium readiness aggregates rhythm transfer compliance and queues repairs", async () => {
  const { root, project } = await createTempProject();
  try {
    for (let chapterNo = 1; chapterNo <= 30; chapterNo += 1) {
      const rhythmIssues = chapterNo === 7
        ? ["rhythm_opening_mismatch", "rhythm_beat_missing"]
        : chapterNo === 19
          ? ["rhythm_tail_hook_mismatch"]
          : [];
      await writeJson(qualityReportFile(project, chapterNo), qualityReport(chapterNo, rhythmIssues));
    }

    const report = await writePremiumReadinessReport(project, { from: 1, to: 30 });

    assert.ok(report.rhythm_transfer_summary);
    assert.equal(report.rhythm_transfer_summary.enabled_chapter_count, 30);
    assert.equal(report.rhythm_transfer_summary.deviation_chapters.includes(7), true);
    assert.equal(report.rhythm_transfer_summary.deviation_chapters.includes(19), true);
    assert.equal(report.rhythm_transfer_summary.issue_counts.rhythm_opening_mismatch, 1);
    assert.equal(report.rhythm_transfer_summary.issue_counts.rhythm_tail_hook_mismatch, 1);
    assert.equal(report.rhythm_transfer_summary.issue_counts.rhythm_beat_missing, 1);
    assert.ok(report.rhythm_transfer_summary.execution_rate < 1);
    assert.ok(report.repair_queue.some((item) => item.chapter_no === 7 && item.issue === "rhythm_transfer_repair"));
    assert.ok(report.repair_queue.some((item) => item.chapter_no === 19 && item.issue === "rhythm_transfer_repair"));
    assert.equal(report.status, "needs_repair");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
