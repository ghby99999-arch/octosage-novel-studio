import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createLocalServer } from "../src/server.mjs";
import { createProject } from "../src/core/workflow.mjs";

async function pathExists(targetPath) {
  try {
    await access(targetPath);
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

test("project trash endpoint moves a workspace project into .octosage-trash", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octosage-project-trash-"));
  const project = await createProject({
    root,
    title: "待删除测试书",
    idea: "测试安全移除书架项目",
    platform: "fanqie",
    genre: "urban",
  });
  const app = await startTestServer();
  try {
    const result = await fetch(`${app.baseUrl}/api/project/trash`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root, project: project.path }),
    }).then((response) => response.json());

    assert.equal(result.status, "trashed");
    assert.equal(await pathExists(project.path), false);
    assert.equal(await pathExists(result.trash_path), true);
    assert.equal(path.dirname(result.trash_path), path.join(root, ".octosage-trash"));
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("project trash endpoint rejects paths outside the selected workspace", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octosage-project-trash-root-"));
  const otherRoot = await mkdtemp(path.join(tmpdir(), "octosage-project-trash-other-"));
  const project = await createProject({
    root: otherRoot,
    title: "外部测试书",
    idea: "测试不能移除工作区外项目",
    platform: "fanqie",
    genre: "urban",
  });
  const app = await startTestServer();
  try {
    const response = await fetch(`${app.baseUrl}/api/project/trash`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root, project: project.path }),
    });
    const result = await response.json();

    assert.equal(response.status, 400);
    assert.match(result.error, /不在当前工作区/);
    assert.equal(await pathExists(project.path), true);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
    await rm(otherRoot, { recursive: true, force: true });
  }
});
