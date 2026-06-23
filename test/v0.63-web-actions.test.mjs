import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createLocalServer } from "../src/server.mjs";
import {
  createProject,
  indexProjectMemory,
  runSingleChapterQualityLoop,
} from "../src/core/workflow.mjs";

async function createTempProject(prefix = "novel-studio-v063-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.63 web actions",
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

test("web server exposes report, merged export, memory search, and reader simulation APIs", async () => {
  const { root, project } = await createTempProject("novel-studio-v063-api-");
  const app = await startTestServer();
  try {
    await runSingleChapterQualityLoop(project, 1, { maxRewrites: 1 });
    await indexProjectMemory(project, { from: 1, to: 1 });

    const report = await fetch(
      `${app.baseUrl}/api/quality-report?project=${encodeURIComponent(project.path)}&chapter=1`,
    ).then((response) => response.json());
    assert.equal(report.chapter_no, 1);
    assert.equal(report.status, "approved");

    const merged = await fetch(`${app.baseUrl}/api/export-merged`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, from: 1, to: 1 }),
    }).then((response) => response.json());
    assert.equal(merged.chapter_count, 1);
    assert.ok(merged.path.endsWith("_0001-0001_merged.txt"));

    const memory = await fetch(`${app.baseUrl}/api/memory-search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, query: "陆川" }),
    }).then((response) => response.json());
    assert.equal(memory.query, "陆川");
    assert.ok(Array.isArray(memory.results));

    const readers = await fetch(`${app.baseUrl}/api/reader-sim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, chapter_no: 1 }),
    }).then((response) => response.json());
    assert.equal(readers.chapter_no, 1);
    assert.ok(readers.readers.some((reader) => reader.type === "fanqie_fast_reader"));
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("home page wires action buttons and uses 500ms task polling", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());

    assert.match(html, /onclick="showQualityReport\(\)"/);
    assert.match(html, /onclick="exportMergedAction\(\)"/);
    assert.match(html, /onclick="memorySearchAction\(\)"/);
    assert.match(html, /onclick="readerSimAction\(\)"/);
    assert.match(html, /setTimeout\(\(\) => pollTask\(task\.task_id\), 500\)/);
    assert.match(html, /setTimeout\(\(\) => pollTask\(taskId\), 500\)/);
    assert.doesNotMatch(html, /setTimeout\(pollTask, 25\)/);
  } finally {
    await app.close();
  }
});
