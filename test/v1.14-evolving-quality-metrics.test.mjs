import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  calibrateQualityMetricRegistry,
  createProject,
  defaultQualityMetricRegistry,
  ingestQualityMetricObservation,
  loadQualityMetricRegistry,
} from "../src/core/workflow.mjs";

async function createTempProject(prefix = "novel-studio-v114-quality-metrics-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.14 evolving quality metrics",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("v1.14 defaultQualityMetricRegistry defines versioned thresholds with evidence", () => {
  const registry = defaultQualityMetricRegistry();
  const opening = registry.metrics.opening_hook_score;
  const dropRisk = registry.metrics.drop_risk_segments;
  const readerBehavior = registry.metrics.reader_behavior_score;

  assert.equal(registry.version, 2);
  assert.equal(registry.data_basis.status, "public-behavior-proxy");
  assert.equal(opening.thresholds.premium, 75);
  assert.equal(opening.thresholds.pass, 60);
  assert.equal(opening.thresholds.eliminate_below, 50);
  assert.ok(opening.evidence.some((item) => item.source_type === "craft_rule"));
  assert.ok(opening.calibration.enabled);

  assert.equal(dropRisk.direction, "lower_is_better");
  assert.equal(dropRisk.thresholds.premium, 0);
  assert.equal(dropRisk.thresholds.pass, 2);
  assert.equal(dropRisk.thresholds.eliminate_above, 3);
  assert.equal(readerBehavior.thresholds.pass, 80);
  assert.equal(readerBehavior.thresholds.premium, 92);
  assert.ok(readerBehavior.evidence.some((item) => item.source_type === "public_platform_proxy"));
});

test("v1.14 calibrateQualityMetricRegistry conservatively updates premium thresholds from real outcomes", () => {
  const registry = defaultQualityMetricRegistry();
  const calibrated = calibrateQualityMetricRegistry(
    registry,
    [
      { metric: "opening_hook_score", predicted_score: 70, outcome: "premium" },
      { metric: "opening_hook_score", predicted_score: 72, outcome: "premium" },
      { metric: "opening_hook_score", predicted_score: 74, outcome: "premium" },
      { metric: "opening_hook_score", predicted_score: 92, outcome: "fail" },
      { metric: "drop_risk_segments", value: 1, outcome: "premium" },
      { metric: "drop_risk_segments", value: 0, outcome: "premium" },
      { metric: "drop_risk_segments", value: 2, outcome: "premium" },
    ],
    { minSamples: 3 },
  );

  assert.equal(calibrated.metrics.opening_hook_score.thresholds.premium, 74);
  assert.equal(calibrated.metrics.opening_hook_score.calibration.sample_count, 4);
  assert.equal(calibrated.metrics.opening_hook_score.calibration.positive_sample_count, 3);
  assert.equal(calibrated.metrics.opening_hook_score.calibration.status, "calibrated");
  assert.equal(calibrated.metrics.drop_risk_segments.thresholds.premium, 1);
  assert.equal(calibrated.metrics.drop_risk_segments.calibration.status, "calibrated");
});

test("v1.14 ingestQualityMetricObservation persists observations and refreshes project registry", async () => {
  const { root, project } = await createTempProject();
  try {
    await ingestQualityMetricObservation(project, {
      metric: "tail_hook_score",
      predicted_score: 82,
      outcome: "premium",
      source: "manual_author_backend",
      platform: "fanqie",
      chapter_no: 1,
    });
    await ingestQualityMetricObservation(project, {
      metric: "tail_hook_score",
      predicted_score: 84,
      outcome: "premium",
      source: "manual_author_backend",
      platform: "fanqie",
      chapter_no: 2,
    });
    await ingestQualityMetricObservation(project, {
      metric: "tail_hook_score",
      predicted_score: 86,
      outcome: "premium",
      source: "manual_author_backend",
      platform: "fanqie",
      chapter_no: 3,
    });

    const registry = await loadQualityMetricRegistry(project);

    assert.equal(registry.metrics.tail_hook_score.calibration.status, "calibrated");
    assert.equal(registry.metrics.tail_hook_score.thresholds.premium, 86);
    assert.ok(registry.metrics.tail_hook_score.calibration.last_updated_at);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
