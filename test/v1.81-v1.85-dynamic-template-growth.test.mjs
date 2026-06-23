import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  createPortfolio,
  createProject,
  createPremiumIncubationPlan,
  ingestPortfolioProjectObservation,
  recommendDynamicTemplates,
  refreshDynamicTemplateLibrary,
} from "../src/core/workflow.mjs";
import {
  dynamicTemplateLibraryFile,
  premiumReadinessReportFile,
} from "../src/core/paths.mjs";
import { readJson, writeJson } from "../src/core/fsx.mjs";
import { serveLocal } from "../src/server.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createTemplateFixture(prefix = "novel-studio-v181-template-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const projectA = await createProject({
    root,
    title: "game-ip-template-a",
    idea: "梦幻西游 大唐官府 长安城经济流，主角靠门派任务和商会信息差起势",
    platform: "fanqie",
    genre: "game-ip economy",
  });
  const projectB = await createProject({
    root,
    title: "campus-template-b",
    idea: "2016重生校园外卖，大学城商户流量和订单系统",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  await createPortfolio({
    root,
    name: "dynamic-template-fixture",
    projects: [projectA.path, projectB.path],
    target_chapters: 30,
  });
  await ingestPortfolioProjectObservation({
    root,
    projectPath: projectA.path,
    chapterNo: 1,
    outcome: "high_retention",
    source: "test",
    metrics: {
      retention_prediction: 94,
      tail_hook_score: 91,
      opening_hook_score: 88,
    },
  });
  await ingestPortfolioProjectObservation({
    root,
    projectPath: projectB.path,
    chapterNo: 1,
    outcome: "observed",
    source: "test",
    metrics: {
      retention_prediction: 52,
    },
  });
  await writeJson(premiumReadinessReportFile(projectA, 1, 30), {
    project_title: projectA.title,
    status: "premium_ready",
    range: { from: 1, to: 30 },
    overall_score: 91,
    metric_summary: {
      tail_hook_score: { average: 90 },
      micro_hook_density: { average: 1.18 },
      retention_prediction: { average: 86 },
    },
    repair_queue: [],
  });
  return { root, projectA, projectB };
}

function postJson(port, route, body) {
  return fetch(`http://127.0.0.1:${port}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || response.statusText);
    return data;
  });
}

test("v1.81 refreshDynamicTemplateLibrary grows templates from portfolio risers", async () => {
  const { root, projectA } = await createTemplateFixture();
  try {
    const library = await refreshDynamicTemplateLibrary({ root, minRiseScore: 70, limit: 5 });

    assert.equal(library.root, root);
    assert.equal(library.saved_source_text, false);
    assert.equal(library.update_policy, "auto_from_portfolio_risers");
    assert.equal(library.templates.length, 1);
    assert.equal(library.templates[0].source_project_path, projectA.path);
    assert.equal(library.templates[0].rise_score >= 70, true);
    assert.equal(library.templates[0].evidence.readiness_status, "premium_ready");
    assert.equal(library.templates[0].evidence.overall_score, 91);
    assert.ok(library.templates[0].template_prompt.includes("梦幻西游"));
    assert.equal(JSON.stringify(library).includes("visible chapter text"), false);
    assert.equal(library.path, dynamicTemplateLibraryFile(root));

    const saved = await readJson(dynamicTemplateLibraryFile(root));
    assert.equal(saved.templates.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.82 recommendDynamicTemplates scores by idea/domain overlap", async () => {
  const { root } = await createTemplateFixture("novel-studio-v182-recommend-");
  try {
    await refreshDynamicTemplateLibrary({ root, minRiseScore: 40, limit: 5 });
    const recommendations = await recommendDynamicTemplates({
      root,
      idea: "我想写梦幻西游长安城商战，大唐官府弟子做经济流",
      limit: 3,
    });

    assert.equal(recommendations.length >= 1, true);
    assert.equal(recommendations[0].template_id.includes("game-ip-template-a"), true);
    assert.equal(recommendations[0].match_score > 0, true);
    assert.ok(recommendations[0].reasons.includes("domain_overlap") || recommendations[0].reasons.includes("keyword_overlap"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.83 createPremiumIncubationPlan can apply a dynamic template to new ideas", async () => {
  const { root } = await createTemplateFixture("novel-studio-v183-apply-");
  try {
    const library = await refreshDynamicTemplateLibrary({ root, minRiseScore: 70, limit: 5 });
    const plan = await createPremiumIncubationPlan({
      root,
      baseTitle: "template-applied",
      ideas: ["我要写梦幻西游大唐官府经济流"],
      template: library.templates[0],
      targetChapters: 3,
    });

    assert.equal(plan.projects.length, 1);
    assert.equal(plan.template_applied.template_id, library.templates[0].template_id);
    assert.ok(plan.projects[0].idea.includes("动态模板约束"));
    assert.ok(plan.projects[0].idea.includes("梦幻西游"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.84 CLI exposes dynamic template refresh and recommend commands", async () => {
  const { root } = await createTemplateFixture("novel-studio-v184-cli-");
  try {
    const refresh = spawnSync("node", [
      "src/cli.mjs",
      "templates-refresh",
      "--root",
      root,
      "--min-rise-score",
      "70",
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(refresh.status, 0, refresh.stderr);
    assert.match(refresh.stdout, /templates-refresh: 1/);
    assert.match(refresh.stdout, /saved-source-text: false/);

    const recommend = spawnSync("node", [
      "src/cli.mjs",
      "templates-recommend",
      "--root",
      root,
      "--idea",
      "梦幻西游长安城经济流",
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(recommend.status, 0, recommend.stderr);
    assert.match(recommend.stdout, /templates-recommend:/);
    assert.match(recommend.stdout, /game-ip-template-a/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.85 server and workbench expose dynamic template endpoints", async () => {
  const { root } = await createTemplateFixture("novel-studio-v185-api-");
  const app = await serveLocal({ port: 0 });
  try {
    const port = app.server.address().port;
    const library = await postJson(port, "/api/templates/refresh", {
      root,
      min_rise_score: 70,
    });
    assert.equal(library.templates.length, 1);
    const recommended = await postJson(port, "/api/templates/recommend", {
      root,
      idea: "梦幻西游大唐官府长安城经济流",
      limit: 3,
    });
    assert.equal(recommended.templates.length, 1);

    const source = await readFile(path.join(repoRoot, "src", "server.mjs"), "utf8");
    assert.match(source, /templatesRefreshAction/);
    assert.match(source, /templatesRecommendAction/);
    assert.match(source, /&#21047;&#26032;&#27169;&#26495;&#24211;/);
  } finally {
    await new Promise((resolve, reject) => app.server.close((error) => (error ? reject(error) : resolve())));
    await rm(root, { recursive: true, force: true });
  }
});
