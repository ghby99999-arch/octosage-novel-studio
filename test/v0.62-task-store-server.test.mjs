import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createLocalServer } from "../src/server.mjs";
import { createPersistentTaskStore } from "../src/task-store.mjs";
import { createProject } from "../src/core/workflow.mjs";

async function createTempProject(prefix = "novel-studio-v062-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.62 task store",
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

test("server rejects oversized JSON request bodies", async () => {
  const app = await startTestServer({ maxBodyBytes: 64 });
  try {
    const response = await fetch(`${app.baseUrl}/api/dry-run-cost`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: "x", padding: "x".repeat(256) }),
    });

    assert.equal(response.status, 413);
    const body = await response.json();
    assert.match(body.error, /request body too large/);
  } finally {
    await app.close();
  }
});

test("task store persists completed tasks and reloads them after restart", async () => {
  const { root, project } = await createTempProject("novel-studio-v062-persist-");
  try {
    const store = await createPersistentTaskStore({ project, maxConcurrent: 1 });
    const created = await store.enqueue("unit-task", async ({ setProgress }) => {
      await setProgress({ step: "unit", chapter_no: 1 });
      return { ok: true };
    });

    let task;
    for (let i = 0; i < 20; i += 1) {
      task = store.get(created.task_id);
      if (task.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    assert.equal(task.status, "completed");
    assert.equal(task.progress.step, "unit");
    assert.equal(task.progress.chapter_no, 1);
    assert.equal(task.progress.done, true);
    assert.deepEqual(task.result, { ok: true });

    const stored = JSON.parse(await readFile(task.path, "utf8"));
    assert.equal(stored.task_id, created.task_id);
    assert.equal(stored.status, "completed");

    const reloaded = await createPersistentTaskStore({ project, maxConcurrent: 1 });
    assert.equal(reloaded.get(created.task_id).status, "completed");
    assert.deepEqual(reloaded.get(created.task_id).result, { ok: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("task store compacts large historical progress events and keeps monotonic seq", async () => {
  const { root, project } = await createTempProject("novel-studio-v062-compact-events-");
  try {
    const store = await createPersistentTaskStore({ project, maxConcurrent: 1 });
    const long = "正文长预览".repeat(1000);
    const created = await store.enqueue("unit-task", async ({ setProgress }) => {
      for (let index = 0; index < 260; index += 1) {
        await setProgress({
          step: "streaming",
          draft_preview: `${index}-${long}`,
          before_rewrite_preview: long,
          text_delta: long,
          issues: Array.from({ length: 12 }, (_, issueIndex) => `${issueIndex}-${long}`),
        });
      }
      return { ok: true };
    });

    let task;
    for (let i = 0; i < 80; i += 1) {
      task = store.get(created.task_id);
      if (task.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    assert.equal(task.status, "completed");
    const stored = JSON.parse(await readFile(task.path, "utf8"));
    assert.ok(stored.events.length <= 240);
    const seqs = stored.events.map((event) => event.seq);
    assert.equal(new Set(seqs).size, seqs.length);
    assert.deepEqual([...seqs].sort((a, b) => a - b), seqs);
    const largestEvent = stored.events.reduce((max, event) => Math.max(max, JSON.stringify(event).length), 0);
    assert.ok(largestEvent < 3500, `event remained too large: ${largestEvent}`);
    const sample = stored.events.find((event) => event.progress?.draft_preview_truncated);
    assert.ok(sample, "expected truncated draft preview event");
    assert.ok(sample.progress.draft_preview.length < 500);
    assert.ok(sample.progress.text_delta.length < 120);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("task store honors maxConcurrent and keeps extra tasks queued", async () => {
  const { root, project } = await createTempProject("novel-studio-v062-concurrent-");
  try {
    const store = await createPersistentTaskStore({ project, maxConcurrent: 1 });
    let releaseFirst;
    const firstDone = new Promise((resolve) => {
      releaseFirst = resolve;
    });

    const first = await store.enqueue("slow", async ({ setProgress }) => {
      await setProgress({ step: "running-first" });
      await firstDone;
      return { first: true };
    });
    const second = await store.enqueue("slow", async () => ({ second: true }));

    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.equal(store.get(first.task_id).status, "running");
    assert.equal(store.get(second.task_id).status, "queued");

    releaseFirst();
    for (let i = 0; i < 20; i += 1) {
      if (store.get(second.task_id).status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    assert.equal(store.get(first.task_id).status, "completed");
    assert.equal(store.get(second.task_id).status, "completed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("server task API returns persisted path and progress", async () => {
  const { root, project } = await createTempProject("novel-studio-v062-api-");
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

    let task;
    for (let i = 0; i < 25; i += 1) {
      task = await fetch(`${app.baseUrl}/api/tasks/${created.task_id}`).then((response) =>
        response.json(),
      );
      if (task.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.equal(task.status, "completed");
    assert.ok(task.path.endsWith(".json"));
    assert.equal(task.progress.done, true);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
