import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  createProject,
  createSingleChapterPreflight,
  runSingleChapterQualityLoop,
  summarizeProjectCost,
} from "../src/core/workflow.mjs";
import {
  draftFile,
  modelCallsFile,
  singleChapterPreflightFile,
} from "../src/core/paths.mjs";
import { readJson } from "../src/core/fsx.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function createTempProject(prefix = "novel-studio-v040-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.40 preflight budget report",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function initProject(root, title = "cli-v040-project") {
  const result = spawnSync(
    "node",
    [
      "src/cli.mjs",
      "init",
      "--root",
      root,
      "--title",
      title,
      "--idea",
      "2016 rebirth campus local service business story",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return path.join(root, title);
}

test("createSingleChapterPreflight writes a reusable real-model preflight without model calls", async () => {
  const { root, project } = await createTempProject();
  try {
    const preflight = await createSingleChapterPreflight(project, 1, {
      routerOptions: { provider: "openai", model: "gpt-test", allowNetwork: true },
      maxRewrites: 2,
      confirmed: false,
    });

    assert.equal(preflight.status, "ready");
    assert.equal(preflight.chapter_no, 1);
    assert.equal(preflight.provider, "openai");
    assert.equal(preflight.model, "gpt-test");
    assert.equal(preflight.confirmed, false);
    assert.equal(preflight.estimate.worst_case.total_calls, 8);
    assert.equal(preflight.path, singleChapterPreflightFile(project, 1));
    assert.equal(await exists(modelCallsFile(project)), false);
    assert.equal(await exists(draftFile(project, 1, "v1")), false);

    const saved = await readJson(preflight.path);
    assert.equal(saved.status, "ready");
    assert.equal(saved.estimate.provider, "openai");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cli real-single --preflight writes and prints the preflight file", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v040-cli-preflight-"));
  try {
    const projectPath = initProject(root);
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
        "--preflight",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /preflight:/);
    assert.match(result.stdout, /status: ready/);
    assert.match(result.stdout, /estimated-cost-cny:/);

    const preflightPath = singleChapterPreflightFile({ path: projectPath }, 1);
    assert.equal(await exists(preflightPath), true);
    assert.equal(await exists(modelCallsFile({ path: projectPath })), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cli real-single blocks confirmed OpenAI runs when estimated cost exceeds max-cost-cny", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v040-cost-gate-"));
  try {
    const projectPath = initProject(root, "cli-v040-cost-gate-project");
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
        "--allow-network",
        "--confirm-cost",
        "--max-cost-cny",
        "0.000001",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, OPENAI_API_KEY: "sk-test" },
      },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /cost limit exceeded/i);
    assert.match(result.stderr, /max-cost-cny: 0.000001/);
    assert.match(result.stderr, /estimated-cost-cny:/);
    assert.equal(await exists(modelCallsFile({ path: projectPath })), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("summarizeProjectCost aggregates model_calls for project-level reporting", async () => {
  const { root, project } = await createTempProject("novel-studio-v040-cost-summary-");
  try {
    await runSingleChapterQualityLoop(project, 1, { maxRewrites: 1 });
    const summary = await summarizeProjectCost(project);

    assert.equal(summary.status, "ok");
    assert.ok(summary.total_calls >= 6);
    assert.equal(summary.currency, "CNY");
    assert.ok(summary.by_task.generate_chapter_card >= 1);
    assert.ok(summary.by_task.write_chapter >= 2);
    assert.ok(Number.isFinite(summary.estimated_cost_cny));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cli cost-report prints the project model-call cost summary", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v040-cost-report-"));
  try {
    const projectPath = initProject(root, "cli-v040-cost-report-project");
    const run = spawnSync(
      "node",
      ["src/cli.mjs", "real-single", "1", "--project", projectPath, "--max-rewrites", "1"],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(run.status, 0, run.stderr);

    const report = spawnSync(
      "node",
      ["src/cli.mjs", "cost-report", "--project", projectPath],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.equal(report.status, 0, report.stderr);
    assert.match(report.stdout, /total-calls:/);
    assert.match(report.stdout, /estimated-input-tokens:/);
    assert.match(report.stdout, /estimated-output-tokens:/);
    assert.match(report.stdout, /estimated-cost-cny:/);
    assert.match(report.stdout, /write_chapter:/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
