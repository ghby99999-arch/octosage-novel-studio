import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  writePremiumReadinessReport,
} from "../src/core/workflow.mjs";
import { createLocalServer } from "../src/server.mjs";
import { premiumReadinessReportFile, qualityReportFile } from "../src/core/paths.mjs";
import { readJson, writeJson } from "../src/core/fsx.mjs";

async function createTempProject(prefix = "novel-studio-v117-premium-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.17 premium readiness",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

async function startTestServer(options = {}) {
  const app = createLocalServer(options);
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const { port } = app.server.address();
  return {
    ...app,
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => {
        app.server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function qualityReport(chapterNo, patch = {}) {
  const metrics = {
    tail_hook_score: { score: 88, issues: [] },
    micro_hook_density: { density: 1.0, issues: [] },
    coolpoint_delivered: { effective_count: 1, grade: "B", issues: [] },
    drop_risk_segments: { risky_segment_count: 1, total_segments: 6, issues: [] },
    retention_prediction: { score: 78, band: "pass" },
    ...(patch.quality_metrics || {}),
  };
  return {
    project_title: "v1.17 premium readiness",
    status: "approved",
    chapter_no: chapterNo,
    final_grade: "B",
    quality_metrics: metrics,
    review_quality_flags: [],
    created_at: new Date().toISOString(),
    ...patch,
  };
}

test("v1.17 writePremiumReadinessReport aggregates first-30 quality metrics and pinpoints repairs", async () => {
  const { root, project } = await createTempProject();
  try {
    for (let chapterNo = 1; chapterNo <= 30; chapterNo += 1) {
      const patch = {};
      if (chapterNo === 12) {
        patch.quality_metrics = {
          micro_hook_density: { density: 0.45, issues: ["micro_hook_density_low"] },
          retention_prediction: { score: 52, band: "risk" },
        };
      }
      if (chapterNo === 18) {
        patch.quality_metrics = {
          tail_hook_score: { score: 42, issues: ["tail_hook_weak"] },
          retention_prediction: { score: 49, band: "risk" },
        };
      }
      if (chapterNo === 25) {
        patch.quality_metrics = {
          drop_risk_segments: { risky_segment_count: 4, total_segments: 6, issues: ["drop_risk_segments"] },
          retention_prediction: { score: 38, band: "eliminate" },
        };
      }
      await writeJson(qualityReportFile(project, chapterNo), qualityReport(chapterNo, patch));
    }

    const report = await writePremiumReadinessReport(project, { from: 1, to: 30 });

    assert.equal(report.path, premiumReadinessReportFile(project, 1, 30));
    assert.equal(report.range.from, 1);
    assert.equal(report.range.to, 30);
    assert.equal(report.chapter_count, 30);
    assert.equal(report.metric_summary.tail_hook_score.problem_chapters.includes(18), true);
    assert.equal(report.metric_summary.micro_hook_density.problem_chapters.includes(12), true);
    assert.equal(report.metric_summary.drop_risk_segments.problem_chapters.includes(25), true);
    assert.ok(report.repair_queue.some((item) => item.chapter_no === 12 && item.issue === "micro_hook_density_low"));
    assert.ok(report.repair_queue.some((item) => item.chapter_no === 18 && item.issue === "tail_hook_weak"));
    assert.ok(report.repair_queue.some((item) => item.chapter_no === 25 && item.issue === "drop_risk_segments"));
    assert.ok(Number.isFinite(report.overall_score));
    assert.match(report.status, /premium_ready|needs_repair|blocked/);

    const saved = await readJson(report.path);
    assert.equal(saved.overall_score, report.overall_score);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.17 server exposes premium readiness report API", async () => {
  const { root, project } = await createTempProject("novel-studio-v117-premium-api-");
  const app = await startTestServer();
  try {
    await writeJson(qualityReportFile(project, 1), qualityReport(1));
    const response = await fetch(`${app.baseUrl}/api/premium-readiness`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, from: 1, to: 1 }),
    });
    const report = await response.json();

    assert.equal(response.status, 200);
    assert.equal(report.range.from, 1);
    assert.equal(report.range.to, 1);
    assert.equal(report.chapter_count, 1);
    assert.ok(report.path.endsWith("premium_readiness_0001-0001.json"));
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
