import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createLocalServer } from "../src/server.mjs";
import {
  createProject,
  runPremiumRepairSweep,
} from "../src/core/workflow.mjs";
import {
  premiumIncubationReportFile,
  premiumRepairSweepReportFile,
  qualityReportFile,
} from "../src/core/paths.mjs";
import { readJson, writeJson } from "../src/core/fsx.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createSweepPortfolio(prefix = "novel-studio-v131-sweep-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const projectA = await createProject({
    root,
    title: "sweep book a",
    idea: "2016 rebirth campus delivery story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  const projectB = await createProject({
    root,
    title: "sweep book b",
    idea: "2015 campus local life platform story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  await writePremiumReport(root, projectA, projectB);
  return { root, projectA, projectB };
}

async function writePremiumReport(root, projectA, projectB) {
  await writeJson(premiumIncubationReportFile(root), {
    status: "completed",
    root,
    until_chapter: 3,
    project_reports: [
      {
        title: projectA.title,
        project_path: projectA.path,
        premium_readiness: {
          range: { from: 1, to: 3 },
          repair_queue: [
            { chapter_no: 2, metric: "drop_risk_segments", issue: "drop_risk_segments", value: 3 },
            { chapter_no: 1, metric: "tail_hook_score", issue: "tail_hook_weak", value: 42 },
          ],
        },
      },
      {
        title: projectB.title,
        project_path: projectB.path,
        premium_readiness: {
          range: { from: 1, to: 3 },
          repair_queue: [
            { chapter_no: 1, metric: "coolpoint_delivered", issue: "coolpoint_not_delivered", value: 0 },
          ],
        },
      },
    ],
  });
}

async function seedPassingQuality(project, chapterNo) {
  await writeJson(qualityReportFile(project, chapterNo), {
    project_title: project.title,
    chapter_no: chapterNo,
    status: "approved",
    metrics: {
      tail_hook_score: { score: 95 },
      micro_hook_density: { density: 1.2 },
      coolpoint_delivered: { effective_count: 2 },
      drop_risk_segments: { count: 0 },
      retention_prediction: { score: 92 },
    },
  });
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

test("v1.131 premium repair sweep runs priority queue items and rechecks touched projects", async () => {
  const { root, projectA, projectB } = await createSweepPortfolio();
  try {
    const repaired = [];
    const result = await runPremiumRepairSweep({
      root,
      limit: 2,
      maxRewrites: 1,
      repairRunner: async ({ project, item }) => {
        repaired.push(`${project.title}:${item.chapter_no}:${item.metric}`);
        await seedPassingQuality(project, item.chapter_no);
        return { status: "approved", chapter_no: item.chapter_no, final_grade: "A" };
      },
    });

    assert.equal(result.status, "completed");
    assert.equal(result.repaired_count, 2);
    assert.deepEqual(repaired, [
      "sweep book a:2:drop_risk_segments",
      "sweep book a:1:tail_hook_score",
    ]);
    assert.equal(result.project_rechecks.length, 1);
    assert.equal(result.project_rechecks[0].project_path, projectA.path);
    assert.equal(result.project_rechecks[0].premium_readiness.range.to, 3);
    assert.equal(result.path, premiumRepairSweepReportFile(root));
    const saved = await readJson(result.path);
    assert.equal(saved.repaired_count, 2);
    assert.equal(result.remaining_queue[0].project_path, projectB.path);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.132 server exposes premium repair sweep API", async () => {
  const { root } = await createSweepPortfolio("novel-studio-v132-sweep-api-");
  const app = await startTestServer();
  try {
    const response = await fetch(`${app.baseUrl}/api/premium-incubation/repair-sweep`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root, limit: 1, max_rewrites: 0 }),
    });
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.status, "completed");
    assert.equal(result.repaired_count, 1);
    assert.equal(result.repair_runs[0].metric, "drop_risk_segments");
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.133 CLI exposes premium repair sweep", async () => {
  const { root } = await createSweepPortfolio("novel-studio-v133-sweep-cli-");
  try {
    const help = spawnSync("node", ["src/cli.mjs", "help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /premium-repair-sweep --root/);

    const result = spawnSync("node", [
      "src/cli.mjs",
      "premium-repair-sweep",
      "--root",
      root,
      "--limit",
      "1",
      "--max-rewrites",
      "0",
    ], { cwd: repoRoot, encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /premium-repair-sweep: completed/);
    assert.match(result.stdout, /repaired: 1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.134 Web workbench exposes premium repair sweep action", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(`${app.baseUrl}/`).then((response) => response.text());

    assert.match(html, /premiumRepairSweepAction/);
    assert.match(html, /\/api\/premium-incubation\/repair-sweep/);
    assert.match(html, /premiumRepairSweepAction/);
  } finally {
    await app.close();
  }
});
