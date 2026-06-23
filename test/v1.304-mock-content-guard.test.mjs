import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createLocalServer } from "../src/server.mjs";
import { createProject, runProject } from "../src/core/workflow.mjs";

async function startTestServer(project) {
  const app = createLocalServer({ defaultProject: project });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const { port } = app.server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => app.server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

test("v1.304 mock provider chapters are not treated as formal manuscript in desktop workbench", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octosage-mock-guard-"));
  const project = await createProject({
    root,
    title: "mock guard",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "都市",
  });
  const app = await startTestServer(project);
  try {
    const run = await runProject(project, { untilChapter: 2, routerOptions: { provider: "mock" } });
    assert.equal(run.status, "completed");

    const chapters = await fetch(`${app.baseUrl}/api/chapters`).then((response) => response.json());
    assert.equal(chapters.completed_chapters, 0);
    assert.equal(chapters.latest_completed_chapter, null);
    assert.equal(chapters.chapters.filter((chapter) => chapter.status === "ready").length, 0);
    assert.ok(chapters.chapters.some((chapter) => chapter.status === "mock"));

    const first = await fetch(`${app.baseUrl}/api/chapter?chapter_no=1`).then((response) => response.json());
    assert.equal(first.status, "mock");
    assert.equal(first.text, "");
    assert.match(first.message, /演示|mock|正式写作/);

    const ready = await fetch(`${app.baseUrl}/api/workspace/ready`).then((response) => response.json());
    assert.equal(ready.ready.can_export, false);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
