import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  exportChapter,
  rewriteChapter,
  runBatch,
  writeChapter,
} from "../src/core/workflow.mjs";
import { qualityReportFile } from "../src/core/paths.mjs";
import { readJson } from "../src/core/fsx.mjs";

test("runBatch stops on E grade instead of rewriting", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-e-grade-"));
  try {
    const project = await createProject({
      root,
      title: "E级停止",
      idea: "2016年重生校园外卖",
      platform: "fanqie",
      genre: "都市重生商业爽文",
    });

    const result = await runBatch(project, {
      from: 1,
      to: 1,
      routerOptions: { provider: "mock-e" },
    });
    assert.equal(result.status, "stopped");
    assert.equal(result.stop.grade, "E");
    assert.equal(result.stop.reason, "rollback_required");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runBatch refuses to export a chapter that remains D after max rewrites", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-d-loop-"));
  try {
    const project = await createProject({
      root,
      title: "D级保护",
      idea: "2016年重生校园外卖",
      platform: "fanqie",
      genre: "都市重生商业爽文",
    });

    const result = await runBatch(project, {
      from: 1,
      to: 1,
      maxRewrites: 1,
      routerOptions: { provider: "mock-always-d" },
    });
    assert.equal(result.status, "stopped");
    assert.equal(result.stop.grade, "D");
    assert.equal(result.stop.reason, "max_rewrites_exhausted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runBatch does not stop on a stale D grade when the publish gate passed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-d-publish-ready-"));
  try {
    const project = await createProject({
      root,
      title: "D grade stale but ready",
      idea: "2016 rebirth campus local service business story",
      platform: "fanqie",
      genre: "urban business rebirth",
    });
    const router = {
      async invoke(task) {
        if (task.task_type === "review_chapter") {
          return {
            grade: "D",
            next_action: "publish_gate_pass",
            issues: ["stale reviewer grade should not override passed gate"],
            hard_rule_violations: [],
            scores: {
              opening_hook: 88,
              cool_point: 88,
              pacing: 88,
              character: 88,
              business_logic: 88,
              tail_hook: 88,
              ai_taste: 8,
            },
            publish_gate: {
              status: "publish_ready",
              publish_ready: true,
              label: "ready",
              blockers: [],
              values: { grade: "B" },
            },
          };
        }
        if (task.task_type === "extract_state_candidates") {
          return {
            meta: { source_chapter: task.chapter_no, source_version: "latest", extractor: "test" },
            characters: [],
            relationships: [],
            business_state: [],
            money_orders: [],
            foreshadowing_added: [],
            foreshadowing_resolved: [],
            timeline: [],
            risks: [],
            character_voice_samples: [],
          };
        }
        const { createModelRouter } = await import("../src/core/model-router.mjs");
        return createModelRouter({ provider: "mock" }).invoke(task);
      },
    };

    const result = await runBatch(project, {
      from: 1,
      to: 1,
      maxRewrites: 0,
      router,
    });

    assert.equal(result.status, "completed");
    assert.equal(result.chapters[0].publish_ready, true);
    assert.equal(result.chapters[0].review_grade, "B");

    const report = await readJson(qualityReportFile(project, 1));
    assert.equal(report.status, "approved");
    assert.equal(report.final_grade, "B");
    assert.equal(report.stop, null);
    assert.equal(report.publish_gate.publish_ready, true);
    assert.equal(report.failure_summary.title, "approved");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("export path sanitizes project title for Windows filenames", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-safe-export-"));
  try {
    const project = await createProject({
      root,
      title: "书名:含?非法|字符",
      idea: "2016年重生校园外卖",
      platform: "fanqie",
      genre: "都市重生商业爽文",
    });
    await writeChapter(project, 1);
    await rewriteChapter(project, 1);

    const exported = await exportChapter(project, 1);
    assert.doesNotMatch(path.basename(exported.path), /[:?|"<>\\/*]/);
    assert.match(await readFile(exported.path, "utf8"), /陆川/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
