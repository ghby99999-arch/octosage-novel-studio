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
  evaluateChapterPublishGate,
  writePremiumGateReport,
} from "../src/core/workflow.mjs";
import {
  premiumGateReportFile,
  qualityReportFile,
} from "../src/core/paths.mjs";
import { readJson, writeJson } from "../src/core/fsx.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createGateProject(prefix = "novel-studio-v141-gate-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "premium gate target",
    idea: "2016 rebirth campus delivery story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

async function seedQuality(project, chapterNo, overrides = {}) {
  const metrics = {
    tail_hook_score: { score: 98 },
    micro_hook_density: { density: 1.4 },
    coolpoint_delivered: { effective_count: 2 },
    drop_risk_segments: { risky_segment_count: 0 },
    retention_prediction: { score: 96 },
    opening_hook_score: { score: 96 },
    ai_taste_score: { score: 96 },
    ...overrides,
  };
  await writeJson(qualityReportFile(project, chapterNo), {
    project_title: project.title,
    chapter_no: chapterNo,
    status: "approved",
    final_grade: "A",
    quality_metrics: metrics,
    publish_gate: evaluateChapterPublishGate(metrics, { grade: "A" }, []),
  });
}

async function seedRange(project, from, to, overridesByChapter = {}) {
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    await seedQuality(project, chapterNo, overridesByChapter[chapterNo] || {});
  }
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

async function fetchPixsoBundleText(app) {
  const html = await fetch(`${app.baseUrl}/`).then((response) => response.text());
  const match = html.match(/<script[^>]+src="([^"]*\/pixso\/assets\/[^"]+\.js)"/);
  assert.ok(match, "Pixso bundle script should be referenced from root HTML");
  return fetch(`${app.baseUrl}${match[1]}`).then((response) => response.text());
}

test("v1.141 premium gate allows publish package only when target score and hard rules pass", async () => {
  const { root, project } = await createGateProject();
  try {
    await seedRange(project, 1, 5);
    const gate = await writePremiumGateReport(project, { from: 1, to: 5, targetScore: 95 });

    assert.equal(gate.status, "pass");
    assert.equal(gate.publish_package_allowed, true);
    assert.equal(gate.overall_score >= 95, true);
    assert.equal(gate.blocking_chapters.length, 0);
    assert.equal(gate.path, premiumGateReportFile(project, 1, 5));

    const saved = await readJson(gate.path);
    assert.equal(saved.publish_package_allowed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.142 premium gate blocks weak first-three and hard-risk chapters", async () => {
  const { root, project } = await createGateProject("novel-studio-v142-gate-block-");
  try {
    await seedRange(project, 1, 5, {
      2: {
        opening_hook_score: { score: 72 },
        retention_prediction: { score: 74 },
      },
      4: {
        drop_risk_segments: { risky_segment_count: 2 },
      },
    });
    const gate = await writePremiumGateReport(project, { from: 1, to: 5, targetScore: 95 });

    assert.equal(gate.status, "blocked");
    assert.equal(gate.publish_package_allowed, false);
    assert.ok(gate.blocking_chapters.some((item) => item.chapter_no === 2 && item.scope === "first_three"));
    assert.ok(gate.blocking_chapters.some((item) => item.chapter_no === 4 && item.metric === "drop_risk_segments"));
    assert.ok(gate.must_fix_before_publish.length >= 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.143 server exposes premium gate API", async () => {
  const { root, project } = await createGateProject("novel-studio-v143-gate-api-");
  const app = await startTestServer();
  try {
    await seedRange(project, 1, 3);
    const response = await fetch(`${app.baseUrl}/api/premium-gate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, from: 1, to: 3, target_score: 95 }),
    });
    const gate = await response.json();

    assert.equal(response.status, 200);
    assert.equal(gate.status, "pass");
    assert.equal(gate.publish_package_allowed, true);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.144 CLI exposes premium gate", async () => {
  const { root, project } = await createGateProject("novel-studio-v144-gate-cli-");
  try {
    await seedRange(project, 1, 3);
    const help = spawnSync("node", ["src/cli.mjs", "help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /premium-gate --from 1 --to 30/);

    const result = spawnSync("node", [
      "src/cli.mjs",
      "premium-gate",
      "--project",
      project.path,
      "--from",
      "1",
      "--to",
      "3",
      "--target-score",
      "95",
    ], { cwd: repoRoot, encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /premium-gate: pass/);
    assert.match(result.stdout, /publish-package-allowed: true/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.145 Web workbench exposes premium gate action", async () => {
  const app = await startTestServer();
  try {
    const bundle = await fetchPixsoBundleText(app);

    assert.match(bundle, /premiumGate/);
    assert.match(bundle, /\/api\/premium-gate/);
  } finally {
    await app.close();
  }
});
