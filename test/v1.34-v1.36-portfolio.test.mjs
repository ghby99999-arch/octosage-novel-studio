import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createLocalServer } from "../src/server.mjs";
import {
  allocatePortfolioBudget,
  createPortfolio,
  createProject,
  detectPortfolioRisers,
  ingestQualityMetricObservation,
  runPortfolioFrontlist,
} from "../src/core/workflow.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createProjects(root) {
  const projectA = await createProject({
    root,
    title: "portfolio-a",
    idea: "2016 rebirth campus business story",
    platform: "fanqie",
    genre: "urban business",
  });
  const projectB = await createProject({
    root,
    title: "portfolio-b",
    idea: "game IP adventure with domain knowledge",
    platform: "fanqie",
    genre: "game ip",
  });
  return [projectA, projectB];
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

test("v1.34 createPortfolio registers multiple projects for frontlist incubation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v134-portfolio-"));
  try {
    const projects = await createProjects(root);
    const portfolio = await createPortfolio({
      root,
      name: "frontlist-portfolio",
      projects: projects.map((project) => project.path),
      target_chapters: 30,
    });

    assert.equal(portfolio.name, "frontlist-portfolio");
    assert.equal(portfolio.target_chapters, 30);
    assert.equal(portfolio.projects.length, 2);
    assert.ok(portfolio.projects.every((item) => item.status === "incubating"));
    assert.ok(portfolio.path.endsWith("portfolio.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.35 runPortfolioFrontlist runs every project to the requested chapter", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v135-frontlist-"));
  try {
    const projects = await createProjects(root);
    await createPortfolio({
      root,
      name: "frontlist-run",
      projects: projects.map((project) => project.path),
      target_chapters: 2,
    });
    const report = await runPortfolioFrontlist({ root, untilChapter: 2, maxRewrites: 1 });

    assert.equal(report.status, "completed");
    assert.equal(report.results.length, 2);
    assert.ok(report.results.every((item) => item.run.status === "completed"));
    assert.ok(report.results.every((item) => item.project_path));
    assert.ok(report.path.endsWith("portfolio_run_report.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.36 detectPortfolioRisers and allocatePortfolioBudget favor stronger real data", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v136-risers-"));
  try {
    const [projectA, projectB] = await createProjects(root);
    await createPortfolio({
      root,
      name: "frontlist-risers",
      projects: [projectA.path, projectB.path],
      target_chapters: 30,
    });
    await ingestQualityMetricObservation(projectA, {
      metric: "retention_prediction",
      value: 92,
      outcome: "published_positive",
      source: "fanqie_backend",
    });
    await ingestQualityMetricObservation(projectA, {
      metric: "tail_hook_score",
      value: 95,
      outcome: "published_positive",
      source: "fanqie_backend",
    });
    await ingestQualityMetricObservation(projectB, {
      metric: "retention_prediction",
      value: 43,
      outcome: "published_weak",
      source: "fanqie_backend",
    });

    const risers = await detectPortfolioRisers({ root });
    const allocation = await allocatePortfolioBudget({ root, totalBudgetCny: 1000 });

    assert.equal(risers.risers[0].project_path, projectA.path);
    assert.ok(risers.risers[0].rise_score > risers.risers[1].rise_score);
    assert.equal(allocation.allocations[0].project_path, projectA.path);
    assert.ok(allocation.allocations[0].budget_cny > allocation.allocations[1].budget_cny);
    assert.equal(allocation.total_budget_cny, 1000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.34-v1.36 server exposes portfolio create, run, riser, and allocation APIs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v136-server-"));
  const app = await startTestServer();
  try {
    const projects = await createProjects(root);
    const portfolio = await fetch(`${app.baseUrl}/api/portfolio`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        root,
        name: "server-portfolio",
        projects: projects.map((project) => project.path),
        target_chapters: 1,
      }),
    }).then((response) => response.json());
    assert.equal(portfolio.projects.length, 2);

    const run = await fetch(`${app.baseUrl}/api/portfolio/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root, until_chapter: 1, max_rewrites: 1 }),
    }).then((response) => response.json());
    assert.equal(run.status, "completed");

    const risers = await fetch(`${app.baseUrl}/api/portfolio/risers?root=${encodeURIComponent(root)}`).then((response) =>
      response.json(),
    );
    assert.equal(risers.risers.length, 2);

    const allocation = await fetch(`${app.baseUrl}/api/portfolio/allocation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root, total_budget_cny: 600 }),
    }).then((response) => response.json());
    assert.equal(allocation.total_budget_cny, 600);
    assert.equal(allocation.allocations.length, 2);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.34 CLI exposes portfolio commands", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v134-cli-"));
  try {
    const projects = await createProjects(root);
    const help = spawnSync("node", ["src/cli.mjs", "help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /portfolio-create --root/);
    assert.match(help.stdout, /portfolio-risers --root/);
    assert.match(help.stdout, /portfolio-allocate --root/);

    const created = spawnSync(
      "node",
      [
        "src/cli.mjs",
        "portfolio-create",
        "--root",
        root,
        "--name",
        "cli-portfolio",
        "--projects",
        projects.map((project) => project.path).join(";"),
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(created.status, 0, created.stderr);
    assert.match(created.stdout, /portfolio: cli-portfolio/);
    assert.match(created.stdout, /projects: 2/);

    const risers = spawnSync("node", ["src/cli.mjs", "portfolio-risers", "--root", root], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(risers.status, 0, risers.stderr);
    assert.match(risers.stdout, /risers: 2/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
