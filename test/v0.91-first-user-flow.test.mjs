import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createLocalServer } from "../src/server.mjs";
import { createProject } from "../src/core/workflow.mjs";

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
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

test("v0.91 project list creates missing default root and returns an empty state", async () => {
  const root = path.join(await mkdtemp(path.join(tmpdir(), "novel-studio-v091-root-")), "Projects");
  const app = await startTestServer();
  try {
    assert.equal(await exists(root), false);
    const result = await fetch(`${app.baseUrl}/api/projects?root=${encodeURIComponent(root)}`).then((response) =>
      response.json(),
    );

    assert.equal(await exists(root), true);
    assert.equal(result.root, root);
    assert.deepEqual(result.projects, []);
    assert.match(result.empty_message, /还没有项目/);
  } finally {
    await app.close();
    await rm(path.dirname(root), { recursive: true, force: true });
  }
});

test("v0.91 home page has a first-run guide, empty project state, and write button highlight", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());

    assert.match(html, /firstRunGuide/);
    assert.match(html, /&#9312; &#20889;&#19968;&#21477;&#35805;&#24819;&#27861;/);
    assert.match(html, /&#9313; &#24314;&#31435;&#26032;&#20070;&#39033;&#30446;/);
    assert.match(html, /&#9314; &#20889;&#31532;1&#31456;/);
    assert.match(html, /还没有项目/);
    assert.match(html, /highlightWriteButton/);
    assert.match(html, /output\.scrollIntoView/);
    assert.match(html, /id="writeFirstButton"/);
  } finally {
    await app.close();
  }
});

test("v0.91 server task API supports run-project for continuous writing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v091-run-"));
  const app = await startTestServer();
  try {
    const project = await createProject({
      root,
      title: "continuous writing",
      idea: "2016 rebirth campus local service business story",
      platform: "fanqie",
      genre: "urban business rebirth",
    });

    const created = await fetch(`${app.baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "run-project",
        project: project.path,
        until_chapter: 2,
      }),
    }).then((response) => response.json());

    let task;
    for (let i = 0; i < 40; i += 1) {
      task = await fetch(`${app.baseUrl}/api/tasks/${created.task_id}`).then((response) => response.json());
      if (task.status === "completed" || task.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.equal(task.status, "completed");
    assert.equal(task.result.status, "completed");
    assert.equal(task.result.until_chapter, 2);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v0.91 home page exposes continuous writing controls", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());

    assert.match(html, /id="untilChapter"/);
    assert.match(html, /runProjectAction/);
    assert.match(html, /type: "run-project"/);
    assert.match(html, /连续写/);
  } finally {
    await app.close();
  }
});




