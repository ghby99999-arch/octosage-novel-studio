import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createProject, runProject } from "../src/core/workflow.mjs";
import { runReportFile } from "../src/core/paths.mjs";
import { readJson } from "../src/core/fsx.mjs";

async function createTempProject(prefix = "novel-studio-run-report-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.11 run report",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("runProject writes a latest run report for a completed run", async () => {
  const { root, project } = await createTempProject();
  try {
    const result = await runProject(project, { untilChapter: 3 });

    assert.equal(result.status, "completed");
    assert.equal(result.report_path, runReportFile(project));

    const report = await readJson(runReportFile(project));
    assert.equal(report.status, "completed");
    assert.equal(report.project_title, project.title);
    assert.equal(report.until_chapter, 3);
    assert.equal(report.next_chapter, 4);
    assert.equal(report.batches.length, 1);
    assert.deepEqual(report.completed_chapters, [1, 2, 3]);
    assert.deepEqual(report.repaired, []);
    assert.equal(report.stop, null);
    assert.equal(report.next_action, "continue");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runProject writes a latest run report for a stopped run", async () => {
  const { root, project } = await createTempProject("novel-studio-run-report-stop-");
  try {
    const result = await runProject(project, {
      untilChapter: 3,
      routerOptions: { provider: "mock-e" },
    });

    assert.equal(result.status, "stopped");
    assert.equal(result.report_path, runReportFile(project));

    const report = await readJson(runReportFile(project));
    assert.equal(report.status, "stopped");
    assert.equal(report.stop.reason, "rollback_required");
    assert.equal(report.next_action, "fix_stopped_batch");
    assert.deepEqual(report.completed_chapters, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
