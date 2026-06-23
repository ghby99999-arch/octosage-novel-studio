import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createLocalServer } from "../src/server.mjs";
import {
  createPremiumIncubationPlan,
  getLatestPremiumIncubationReport,
  ingestPortfolioProjectObservation,
  repairQueueSummaryFromPremiumReport,
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

test("v1.46 loads the latest premium incubation report after restart", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v146-latest-"));
  try {
    await createPremiumIncubationPlan({
      root,
      baseTitle: "latest-incubation",
      ideas: ["2016 rebirth campus business", "2015 campus local life"],
      targetChapters: 1,
    });
    const written = await runPremiumIncubation({ root, untilChapter: 1, maxRewrites: 0 });
    const latest = await getLatestPremiumIncubationReport({ root });

    assert.equal(latest.status, written.status);
    assert.equal(latest.path, written.path);
    assert.equal(latest.project_reports.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.47 groups repair queue items by project, metric, and priority", async () => {
  const report = {
    project_reports: [
      {
        title: "book-a",
        project_path: "A",
        premium_readiness: {
          repair_queue: [
            { chapter_no: 1, metric: "tail_hook_score", issue: "tail_hook_weak", value: 40 },
            { chapter_no: 2, metric: "drop_risk_segments", issue: "drop_risk_segments", value: 4 },
          ],
        },
      },
      {
        title: "book-b",
        project_path: "B",
        premium_readiness: {
          repair_queue: [
            { chapter_no: 1, metric: "tail_hook_score", issue: "tail_hook_weak", value: 45 },
          ],
        },
      },
    ],
  };

  const summary = repairQueueSummaryFromPremiumReport(report);

  assert.equal(summary.total_items, 3);
  assert.equal(summary.by_metric.tail_hook_score.count, 2);
  assert.equal(summary.by_project[0].title, "book-a");
  assert.equal(summary.by_project[0].items.length, 2);
  assert.deepEqual(summary.priority_order.map((item) => item.metric), [
    "drop_risk_segments",
    "tail_hook_score",
    "tail_hook_score",
  ]);
});

test("v1.48 ingests platform data into one selected portfolio project", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v148-ingest-"));
  try {
    const plan = await createPremiumIncubationPlan({
      root,
      baseTitle: "portfolio-ingest",
      ideas: ["strong hook campus story", "weak opening campus story"],
      targetChapters: 1,
    });
    const target = plan.projects[0];

    const result = await ingestPortfolioProjectObservation({
      root,
      projectPath: target.project_path,
      chapterNo: 1,
      outcome: "high_retention",
      metrics: {
        retention_prediction: 91,
        tail_hook_score: 94,
      },
      source: "fanqie_author_backend",
    });

    assert.equal(result.status, "ingested");
    assert.equal(result.project_title, target.title);
    assert.equal(result.observations.length, 2);
    assert.ok(result.riser.rise_score > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.46-v1.48 server exposes latest, repair queue, and portfolio ingest APIs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v148-server-"));
  const app = await startTestServer();
  try {
    const plan = await createPremiumIncubationPlan({
      root,
      baseTitle: "server-polish",
      ideas: ["2016 campus local service", "2015 campus commerce"],
      targetChapters: 1,
    });
    await runPremiumIncubation({ root, untilChapter: 1, maxRewrites: 1 });

    const latest = await fetch(`${app.baseUrl}/api/premium-incubation/latest?root=${encodeURIComponent(root)}`)
      .then((response) => response.json());
    assert.equal(latest.status, "completed");

    const repairQueue = await fetch(`${app.baseUrl}/api/premium-incubation/repair-queue?root=${encodeURIComponent(root)}`)
      .then((response) => response.json());
    assert.ok(Number.isInteger(repairQueue.total_items));
    assert.ok(repairQueue.by_project);

    const ingested = await fetch(`${app.baseUrl}/api/portfolio/data/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        root,
        project_path: plan.projects[0].project_path,
        chapter_no: 1,
        outcome: "high_retention",
        source: "fanqie_author_backend",
        metrics: { retention_prediction: 90 },
      }),
    }).then((response) => response.json());
    assert.equal(ingested.status, "ingested");
    assert.equal(ingested.observations.length, 1);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.49-v1.50 workbench UI and README describe the V2 operational loop", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());
    assert.match(html, /premiumLoadLatestAction/);
    assert.match(html, /premiumRepairQueueAction/);
    assert.match(html, /portfolioIngestAction/);
    assert.match(html, /\/api\/premium-incubation\/latest/);
    assert.match(html, /\/api\/portfolio\/data\/ingest/);

    const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");
    assert.match(readme, /V1\.100 Dynamic Incubation/);
    assert.match(readme, /premium-plan/);
    assert.match(readme, /premium-run/);
    assert.match(readme, /domain-sources/);
    assert.match(readme, /portfolio data ingest/i);
  } finally {
    await app.close();
  }
});
