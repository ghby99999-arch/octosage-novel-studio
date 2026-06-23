import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { modelCallsFile, draftFile } from "../src/core/paths.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function initProject(root, title = "cli-cost-confirmation-project") {
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

test("cli real-single blocks OpenAI runs until cost is confirmed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-cost-confirmation-"));
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
        "--allow-network",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, OPENAI_API_KEY: "sk-test" },
      },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /cost confirmation required/i);
    assert.match(result.stderr, /--dry-run-cost/);
    assert.match(result.stderr, /--confirm-cost/);
    assert.match(result.stderr, /estimated-cost-cny:/);
    assert.equal(await exists(modelCallsFile({ path: projectPath })), false);
    assert.equal(await exists(draftFile({ path: projectPath }, 1, "v1")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cli real-single --confirm-cost passes the cost gate before API key validation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-cost-confirmed-"));
  try {
    const projectPath = initProject(root, "cli-cost-confirmed-project");

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
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, OPENAI_API_KEY: "" },
      },
    );

    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, /cost confirmation required/i);
    assert.match(result.stderr, /OPENAI_API_KEY is missing/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cli real-single mock provider does not require cost confirmation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-cost-confirmation-mock-"));
  try {
    const projectPath = initProject(root, "cli-cost-confirmation-mock-project");

    const result = spawnSync(
      "node",
      ["src/cli.mjs", "real-single", "1", "--project", projectPath, "--max-rewrites", "1"],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /status: approved/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
