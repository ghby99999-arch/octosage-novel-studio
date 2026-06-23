import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createLocalServer } from "../src/server.mjs";
import {
  createProject,
  repairQueueSummaryFromPremiumReport,
} from "../src/core/workflow.mjs";

async function createTempProject(prefix = "novel-studio-v121-repair-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "repair queue target",
    idea: "2016 rebirth campus delivery story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
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

async function waitForTask(app, taskId) {
  for (let i = 0; i < 30; i += 1) {
    const task = await fetch(`${app.baseUrl}/api/tasks/${taskId}`).then((response) => response.json());
    if (task.status === "completed" || task.status === "failed") return task;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`task did not finish: ${taskId}`);
}

test("v1.121 repair queue summary includes direct repair actions", () => {
  const summary = repairQueueSummaryFromPremiumReport({
    project_reports: [
      {
        title: "book-a",
        project_path: "A",
        premium_readiness: {
          repair_queue: [
            { chapter_no: 7, metric: "drop_risk_segments", issue: "drop_risk_segments", value: 3 },
          ],
        },
      },
    ],
  });

  assert.equal(summary.priority_order[0].repair_action.type, "repair-single");
  assert.equal(summary.priority_order[0].repair_action.project, "A");
  assert.equal(summary.priority_order[0].repair_action.chapter_no, 7);
  assert.equal(summary.by_project[0].items[0].repair_action.endpoint, "/api/tasks");
});

test("v1.122 local server runs queued repair-single tasks", async () => {
  const { root, project } = await createTempProject();
  const app = await startTestServer();
  try {
    const created = await fetch(`${app.baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "repair-single",
        project: project.path,
        chapter_no: 1,
        max_rewrites: 1,
        metric: "tail_hook_score",
        issue: "tail_hook_weak",
      }),
    }).then((response) => response.json());

    assert.match(created.task_id, /^task-/);
    const task = await waitForTask(app, created.task_id);

    assert.equal(task.status, "completed");
    assert.equal(task.result.status, "approved");
    assert.equal(task.result.repair.type, "repair-single");
    assert.equal(task.result.repair.metric, "tail_hook_score");
    assert.equal(task.result.chapter_no, 1);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.123 Web repair queue renders one-click repair controls", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(`${app.baseUrl}/`).then((response) => response.text());

    assert.match(html, /renderRepairQueue/);
    assert.match(html, /repairQueueItemAction/);
    assert.match(html, /repair-single/);
    assert.match(html, /\/api\/tasks/);
  } finally {
    await app.close();
  }
});
