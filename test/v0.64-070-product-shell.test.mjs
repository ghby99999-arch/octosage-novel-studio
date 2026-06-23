import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createLocalServer } from "../src/server.mjs";
import {
  compareModelsForChapter,
  createProject,
  runSingleChapterQualityLoop,
} from "../src/core/workflow.mjs";
import { exportFile } from "../src/core/paths.mjs";

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function createTempProject(prefix = "novel-studio-v070-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.70 product shell",
    idea: "2016 rebirth campus local service business story",
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

test("v0.64 real-single emits detailed progress steps", async () => {
  const { root, project } = await createTempProject("novel-studio-v064-progress-");
  try {
    const steps = [];
    const result = await runSingleChapterQualityLoop(project, 1, {
      maxRewrites: 1,
      onProgress: (progress) => steps.push(progress.step),
    });

    assert.equal(result.status, "approved");
    assert.deepEqual(steps, ["card", "write", "review", "rewrite", "review", "state", "export", "completed"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v0.65 task events stream emits current task state", async () => {
  const { root, project } = await createTempProject("novel-studio-v065-sse-");
  const app = await startTestServer();
  try {
    const created = await fetch(`${app.baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "real-single",
        project: project.path,
        chapter_no: 1,
        max_rewrites: 1,
      }),
    }).then((response) => response.json());

    const response = await fetch(
      `${app.baseUrl}/api/tasks/${created.task_id}/events?project=${encodeURIComponent(project.path)}`,
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);
    const text = await response.text();
    assert.match(text, /event: task/);
    assert.match(text, new RegExp(created.task_id));

    for (let i = 0; i < 30; i += 1) {
      const task = await fetch(`${app.baseUrl}/api/tasks/${created.task_id}`).then((res) => res.json());
      if (task.status === "completed" || task.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v0.66 home page includes dark mode and mobile layout CSS", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());

    assert.match(html, /prefers-color-scheme: dark/);
    assert.match(html, /max-width: 640px/);
  } finally {
    await app.close();
  }
});

test("v0.67 model comparison uses sandbox outputs instead of main chapter files", async () => {
  const { root, project } = await createTempProject("novel-studio-v067-sandbox-");
  try {
    const report = await compareModelsForChapter(project, 1, {
      providers: ["mock", "mock-always-d"],
    });

    assert.equal(report.results.length, 2);
    assert.ok(report.results.every((result) => result.sandbox_path));
    assert.equal(await exists(exportFile(project, 1)), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v0.68 server can create a project from Web API", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v068-create-"));
  const app = await startTestServer();
  try {
    const result = await fetch(`${app.baseUrl}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        root,
        title: "web created project",
        idea: "2016 rebirth campus local service business story",
      }),
    }).then((response) => response.json());

    assert.equal(result.title, "web created project");
    assert.ok(result.path.endsWith("web-created-project"));
    assert.equal(await exists(path.join(result.path, "project.json")), true);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v0.69 server can update model config without secrets", async () => {
  const { root, project } = await createTempProject("novel-studio-v069-config-");
  const app = await startTestServer();
  try {
    const result = await fetch(`${app.baseUrl}/api/config/model`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: project.path,
        provider: "deepseek",
        model: "deepseek-chat",
        api_key: "must-not-save",
      }),
    }).then((response) => response.json());

    assert.equal(result.model.provider, "deepseek");
    assert.equal(result.model.default_writer, "deepseek-chat");
    assert.equal(JSON.stringify(result).includes("must-not-save"), false);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v0.70 server exposes an exe readiness health check", async () => {
  const { root, project } = await createTempProject("novel-studio-v070-health-");
  const app = await startTestServer();
  try {
    const result = await fetch(
      `${app.baseUrl}/api/exe-readiness?project=${encodeURIComponent(project.path)}`,
    ).then((response) => response.json());

    assert.equal(result.status, "ready");
    assert.ok(result.checks.every((check) => check.ok));
    assert.ok(result.next_steps.includes("package-desktop-shell"));
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
