import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createLocalServer } from "../src/server.mjs";
import {
  createProject,
  exportMerged,
  runSingleChapterQualityLoop,
} from "../src/core/workflow.mjs";

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

async function createTempProject(prefix = "novel-studio-v092-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.92 dashboard",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("v0.92 dashboard API summarizes progress, cost, grades, and latest activity", async () => {
  const { root, project } = await createTempProject("novel-studio-v092-dashboard-");
  const app = await startTestServer();
  try {
    await runSingleChapterQualityLoop(project, 1, { maxRewrites: 1 });
    const result = await fetch(
      `${app.baseUrl}/api/dashboard?project=${encodeURIComponent(project.path)}`,
    ).then((response) => response.json());

    assert.equal(result.project_title, project.title);
    assert.equal(result.current_chapter, 1);
    assert.ok(result.completed_chapters >= 1);
    assert.ok(result.grade_counts.B >= 1);
    assert.ok(Number.isFinite(result.estimated_cost_cny));
    assert.ok(Array.isArray(result.latest_activity));
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v0.92 merged export API returns delivery actions for the exported TXT", async () => {
  const { root, project } = await createTempProject("novel-studio-v092-export-");
  const app = await startTestServer();
  try {
    await runSingleChapterQualityLoop(project, 1, { maxRewrites: 1 });
    const result = await fetch(`${app.baseUrl}/api/export-merged`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, from: 1, to: 1 }),
    }).then((response) => response.json());

    assert.ok(result.path.endsWith(".txt"));
    assert.equal(result.delivery.open_file_path, result.path);
    assert.equal(result.delivery.open_folder_path, path.dirname(result.path));
    assert.equal(result.delivery.can_send_feishu, true);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v0.92 home page exposes dashboard and export delivery actions", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());

    assert.match(html, /showDashboard/);
    assert.match(html, /api\/dashboard/);
    assert.match(html, /openExportFolderAction/);
    assert.match(html, /sendFeishuAction/);
    assert.match(html, /dashboardSummary/);
  } finally {
    await app.close();
  }
});

test("v0.92 desktop source exposes shell open path capability for exported files", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile("src/desktop-main.mjs", "utf8"),
  );

  assert.match(source, /shell/);
  assert.match(source, /openPath/);
});
