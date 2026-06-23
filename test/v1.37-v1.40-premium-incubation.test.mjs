import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createLocalServer } from "../src/server.mjs";
import {
  createPremiumIncubationPlan,
  runPremiumIncubation,
} from "../src/core/workflow.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

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

test("v1.37 createPremiumIncubationPlan creates candidate projects with knowledge plans", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v137-plan-"));
  try {
    const plan = await createPremiumIncubationPlan({
      root,
      baseTitle: "精品孵化",
      ideas: [
        "2016重生校园外卖创业",
        "我要写一本梦幻西游网文，主角从大唐官府开始",
        "宋朝商战悬疑",
      ],
      targetChapters: 3,
    });

    assert.equal(plan.status, "planned");
    assert.equal(plan.portfolio.projects.length, 3);
    assert.equal(plan.projects.length, 3);
    assert.ok(plan.projects.every((item) => item.project_path));
    assert.ok(plan.projects.every((item) => item.domain_knowledge_plan));
    assert.ok(plan.next_actions.includes("run_premium_incubation"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.38-v1.40 runPremiumIncubation runs projects, reports readiness, and decides actions", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v138-run-"));
  try {
    await createPremiumIncubationPlan({
      root,
      baseTitle: "精品孵化",
      ideas: ["2016重生校园外卖创业", "2015校园本地生活平台"],
      targetChapters: 2,
    });

    const report = await runPremiumIncubation({
      root,
      untilChapter: 2,
      maxRewrites: 1,
      totalBudgetCny: 1000,
    });

    assert.equal(report.status, "completed");
    assert.equal(report.project_reports.length, 2);
    assert.ok(report.project_reports.every((item) => item.premium_readiness));
    assert.ok(report.project_reports.every((item) => item.decision));
    assert.ok(report.decisions.some((item) => ["continue_push", "repair_before_push", "rework_opening", "hold"].includes(item.action)));
    assert.equal(report.allocation.total_budget_cny, 1000);
    assert.ok(report.path.endsWith("premium_incubation_report.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.39 server exposes one-shot premium incubation API", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v139-server-"));
  const app = await startTestServer();
  try {
    const planned = await fetch(`${app.baseUrl}/api/premium-incubation/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        root,
        base_title: "server-incubation",
        ideas: ["2016重生校园外卖创业", "2015校园本地生活平台"],
        target_chapters: 1,
      }),
    }).then((response) => response.json());
    assert.equal(planned.status, "planned");
    assert.equal(planned.projects.length, 2);

    const report = await fetch(`${app.baseUrl}/api/premium-incubation/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        root,
        until_chapter: 1,
        max_rewrites: 1,
        total_budget_cny: 500,
      }),
    }).then((response) => response.json());
    assert.equal(report.status, "completed");
    assert.equal(report.project_reports.length, 2);
    assert.equal(report.allocation.total_budget_cny, 500);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.40 CLI exposes premium incubation commands", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v140-cli-"));
  try {
    const help = spawnSync("node", ["src/cli.mjs", "help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /premium-plan --root/);
    assert.match(help.stdout, /premium-run --root/);

    const planned = spawnSync(
      "node",
      [
        "src/cli.mjs",
        "premium-plan",
        "--root",
        root,
        "--base-title",
        "cli-incubation",
        "--ideas",
        "2016重生校园外卖创业|2015校园本地生活平台",
        "--target-chapters",
        "1",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(planned.status, 0, planned.stderr);
    assert.match(planned.stdout, /premium-plan: planned/);
    assert.match(planned.stdout, /projects: 2/);

    const report = spawnSync(
      "node",
      ["src/cli.mjs", "premium-run", "--root", root, "--until", "1", "--max-rewrites", "1", "--budget-cny", "300"],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(report.status, 0, report.stderr);
    assert.match(report.stdout, /premium-run: completed/);
    assert.match(report.stdout, /projects: 2/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
