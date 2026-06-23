import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("cli rejects non-numeric chapter numbers", () => {
  const result = spawnSync("node", ["src/cli.mjs", "card", "abc"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /chapter must be a positive integer/);
});

test("cli run rejects --to and requires --until for target chapter", () => {
  const result = spawnSync("node", ["src/cli.mjs", "run", "--to", "10"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /run requires --until/);
});

test("cli usage exposes resume run commands", async () => {
  const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  const result = spawnSync("node", ["src/cli.mjs", "help"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, new RegExp(`novel v${pkg.version.replaceAll(".", "\\.")}`));
  assert.match(result.stdout, /run --resume --until 10/);
  assert.match(result.stdout, /resume-batch --from 1 --to 5/);
  assert.match(result.stdout, /report --project/);
  assert.match(result.stdout, /real-single <chapter>/);
  assert.match(result.stdout, /real-single <chapter> --dry-run-cost/);
  assert.match(result.stdout, /real-single <chapter> --preflight/);
  assert.match(result.stdout, /real-single <chapter> --provider openai --allow-network --confirm-cost/);
  assert.match(result.stdout, /export-merged --from 1 --to 5/);
  assert.match(result.stdout, /cost-report --project/);
  assert.match(result.stdout, /compare-models <chapter>/);
  assert.match(result.stdout, /web-status --project/);
  assert.match(result.stdout, /openai-smoke --allow-network/);
});

test("cli openai-smoke prints actionable missing key guidance", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-cli-openai-key-"));
  try {
    const init = spawnSync(
      "node",
      [
        "src/cli.mjs",
        "init",
        "--root",
        root,
        "--title",
        "cli-openai-key-project",
        "--idea",
        "2016 rebirth campus local service business story",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(init.status, 0, init.stderr);
    const projectPath = path.join(root, "cli-openai-key-project");

    const smoke = spawnSync(
      "node",
      ["src/cli.mjs", "openai-smoke", "--allow-network", "--project", projectPath],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, OPENAI_API_KEY: "" },
      },
    );
    assert.notEqual(smoke.status, 0);
    assert.match(smoke.stderr, /OPENAI_API_KEY is missing/);
    assert.match(smoke.stderr, /\$env:OPENAI_API_KEY/);
    assert.match(smoke.stderr, /write 1 --provider openai --allow-network/);
    assert.match(smoke.stderr, /does not store API keys/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cli report prints the latest run report summary", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-cli-report-"));
  try {
    const init = spawnSync(
      "node",
      [
        "src/cli.mjs",
        "init",
        "--root",
        root,
        "--title",
        "cli-report-project",
        "--idea",
        "2016 rebirth campus local service business story",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(init.status, 0, init.stderr);
    const projectPath = path.join(root, "cli-report-project");

    const run = spawnSync(
      "node",
      ["src/cli.mjs", "run", "--until", "2", "--project", projectPath],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(run.status, 0, run.stderr);

    const report = spawnSync("node", ["src/cli.mjs", "report", "--project", projectPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(report.status, 0, report.stderr);
    assert.match(report.stdout, /status: completed/);
    assert.match(report.stdout, /next-action: continue/);
    assert.match(report.stdout, /next-chapter: 3/);
    assert.match(report.stdout, /completed: 1,2/);
    assert.match(report.stdout, /repaired: 0/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cli real-single runs a single chapter quality loop", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-cli-real-single-"));
  try {
    const init = spawnSync(
      "node",
      [
        "src/cli.mjs",
        "init",
        "--root",
        root,
        "--title",
        "cli-real-single-project",
        "--idea",
        "2016 rebirth campus local service business story",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(init.status, 0, init.stderr);
    const projectPath = path.join(root, "cli-real-single-project");

    const result = spawnSync(
      "node",
      ["src/cli.mjs", "real-single", "1", "--project", projectPath, "--max-rewrites", "1"],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /status: approved/);
    assert.match(result.stdout, /grade: B/);
    assert.match(result.stdout, /version: v2/);
    assert.match(result.stdout, /export:/);
    assert.match(result.stdout, /state:/);
    assert.match(result.stdout, /report:/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
