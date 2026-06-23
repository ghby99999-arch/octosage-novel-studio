import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  estimateSingleChapterCost,
  saveProjectConfig,
} from "../src/core/workflow.mjs";
import {
  draftFile,
  exportFile,
  modelCallsFile,
  qualityReportFile,
  stateCandidatesFile,
} from "../src/core/paths.mjs";

async function createTempProject(prefix = "novel-studio-dry-run-cost-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.29 dry run cost",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

test("estimateSingleChapterCost plans real-single cost without model calls or artifacts", async () => {
  const { root, project } = await createTempProject();
  try {
    await saveProjectConfig(project, {
      model: {
        provider: "openai",
        default_writer: "gpt-test",
        default_reviewer: "gpt-test",
        default_extractor: "gpt-test",
        allow_network: true,
      },
      budget: {
        openai_rates: {
          input_per_million_cny: 10,
          output_per_million_cny: 40,
        },
      },
    });

    const estimate = await estimateSingleChapterCost(project, 1, { maxRewrites: 2 });

    assert.equal(estimate.status, "dry_run");
    assert.equal(estimate.chapter_no, 1);
    assert.equal(estimate.provider, "openai");
    assert.equal(estimate.model, "gpt-test");
    assert.equal(estimate.max_rewrites, 2);
    assert.equal(estimate.base.total_calls, 4);
    assert.equal(estimate.worst_case.total_calls, 8);
    assert.deepEqual(
      estimate.planned_tasks.map((task) => task.task_type),
      [
        "generate_chapter_card",
        "write_chapter",
        "review_chapter",
        "write_chapter",
        "review_chapter",
        "write_chapter",
        "review_chapter",
        "extract_state_candidates",
      ],
    );
    assert.ok(estimate.base.estimated_input_tokens > 0);
    assert.ok(estimate.base.estimated_output_tokens > 0);
    assert.ok(estimate.base.estimated_cost_cny > 0);
    assert.ok(estimate.worst_case.estimated_cost_cny > estimate.base.estimated_cost_cny);

    assert.equal(await exists(draftFile(project, 1, "v1")), false);
    assert.equal(await exists(exportFile(project, 1)), false);
    assert.equal(await exists(stateCandidatesFile(project, 1)), false);
    assert.equal(await exists(qualityReportFile(project, 1)), false);
    assert.equal(await exists(modelCallsFile(project)), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("estimateSingleChapterCost uses mock provider as zero-cost dry run", async () => {
  const { root, project } = await createTempProject("novel-studio-dry-run-cost-mock-");
  try {
    const estimate = await estimateSingleChapterCost(project, 3, { maxRewrites: 1 });

    assert.equal(estimate.provider, "mock");
    assert.equal(estimate.base.total_calls, 4);
    assert.equal(estimate.worst_case.total_calls, 6);
    assert.equal(estimate.base.estimated_cost_cny, 0);
    assert.equal(estimate.worst_case.estimated_cost_cny, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cli real-single --dry-run-cost prints the planned cost without writing model logs", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-cli-dry-run-cost-"));
  try {
    const init = spawnSync(
      "node",
      [
        "src/cli.mjs",
        "init",
        "--root",
        root,
        "--title",
        "cli-dry-run-cost-project",
        "--idea",
        "2016 rebirth campus local service business story",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(init.status, 0, init.stderr);
    const projectPath = path.join(root, "cli-dry-run-cost-project");

    const result = spawnSync(
      "node",
      [
        "src/cli.mjs",
        "real-single",
        "1",
        "--project",
        projectPath,
        "--provider",
        "openai",
        "--model",
        "gpt-test",
        "--dry-run-cost",
        "--max-rewrites",
        "2",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /dry-run: cost/);
    assert.match(result.stdout, /chapter: 1/);
    assert.match(result.stdout, /provider: openai/);
    assert.match(result.stdout, /model: gpt-test/);
    assert.match(result.stdout, /base-calls: 4/);
    assert.match(result.stdout, /worst-calls: 8/);
    assert.match(result.stdout, /estimated-cost-cny:/);

    assert.equal(await exists(modelCallsFile({ path: projectPath })), false);
    assert.equal(await exists(draftFile({ path: projectPath }, 1, "v1")), false);

    const config = await readFile(path.join(projectPath, "config.json"), "utf8");
    assert.equal(config.includes("gpt-test"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
