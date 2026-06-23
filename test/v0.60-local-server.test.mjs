import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createLocalServer } from "../src/server.mjs";
import { createProject } from "../src/core/workflow.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createTempProject(prefix = "novel-studio-v060-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.60 local server",
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

test("local server exposes health and a button-first HTML shell", async () => {
  const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  const app = await startTestServer();
  try {
    const health = await fetch(`${app.baseUrl}/api/health`).then((response) => response.json());
    assert.equal(health.status, "ok");
    assert.equal(health.version, pkg.version);

    const html = await fetch(app.baseUrl).then((response) => response.text());
    assert.match(html, /id="novelSimplePanel"/);
    assert.match(html, /flow-card/);
    assert.match(html, /advanced-drawer/);
    assert.match(html, /createProjectAction/);
    assert.match(html, /runSingle/);
    assert.match(html, /runBatchAction/);
    assert.doesNotMatch(html, /AI novel generator/);
  } finally {
    await app.close();
  }
});

test("local server exposes API key settings without leaking secret values", async () => {
  const original = process.env.OPENAI_API_KEY;
  const originalDeepseek = process.env.DEEPSEEK_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test-secret-value";
  const app = await startTestServer({
    saveApiKey: async (name, value) => {
      assert.equal(name, "DEEPSEEK_API_KEY");
      assert.equal(value, "ds-test-secret-value");
    },
  });
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());
    assert.match(html, /id="apiKeyPanel"/);
    assert.match(html, /id="apiKeyName"/);
    assert.match(html, /id="apiKeyValue"/);
    assert.match(html, /apiKeyStatusAction/);
    assert.match(html, /saveApiKeyAction/);

    const status = await fetch(`${app.baseUrl}/api/settings/api-keys`).then((response) =>
      response.json(),
    );
    const openai = status.keys.find((item) => item.name === "OPENAI_API_KEY");
    assert.equal(openai.configured, true);
    assert.equal(openai.masked, "sk-t...alue");
    assert.doesNotMatch(JSON.stringify(status), /sk-test-secret-value/);

    const saved = await fetch(`${app.baseUrl}/api/settings/api-keys`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "DEEPSEEK_API_KEY",
        value: "ds-test-secret-value",
      }),
    }).then((response) => response.json());
    assert.equal(saved.status, "saved");
    assert.doesNotMatch(JSON.stringify(saved), /ds-test-secret-value/);
  } finally {
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
    if (originalDeepseek === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalDeepseek;
    await app.close();
  }
});

test("local server reads project status and dry-run cost through API", async () => {
  const { root, project } = await createTempProject("novel-studio-v060-status-");
  const app = await startTestServer();
  try {
    const status = await fetch(
      `${app.baseUrl}/api/status?project=${encodeURIComponent(project.path)}`,
    ).then((response) => response.json());

    assert.equal(status.project_title, project.title);
    assert.equal(status.current_chapter, 1);
    assert.equal(status.provider, "mock");

    const cost = await fetch(`${app.baseUrl}/api/dry-run-cost`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: project.path,
        chapter_no: 1,
        provider: "mock",
        max_rewrites: 1,
      }),
    }).then((response) => response.json());

    assert.equal(cost.chapter_no, 1);
    assert.equal(cost.provider, "mock");
    assert.equal(cost.worst_case.estimated_cost_cny, 0);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("local server runs queued single-chapter tasks and exposes task status", async () => {
  const { root, project } = await createTempProject("novel-studio-v060-task-");
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

    assert.match(created.task_id, /^task-/);
    let task;
    for (let i = 0; i < 20; i += 1) {
      task = await fetch(`${app.baseUrl}/api/tasks/${created.task_id}`).then((response) =>
        response.json(),
      );
      if (task.status === "completed" || task.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.equal(task.status, "completed");
    assert.equal(task.result.status, "approved");
    assert.equal(task.result.chapter_no, 1);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("cli serve command is advertised", async () => {
  const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  const help = spawnSync("node", ["src/cli.mjs", "help"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, new RegExp(`novel v${pkg.version.replaceAll(".", "\\.")}`));
  assert.match(help.stdout, /serve --project <project-dir> --port 8787/);
});
