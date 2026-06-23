import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createLocalServer } from "../src/server.mjs";

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

test("local opening outline uses concrete story-room contract instead of generic writing advice", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octo-story-room-contract-"));
  const app = await startTestServer();
  try {
    const created = await fetch(`${app.baseUrl}/api/project`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        root,
        title: "重生茶商从汴京小铺开始",
        idea: "宋朝小账房重生到汴京茶铺，用账册、茶引和契约做茶叶供应链生意",
        platform: "fanqie",
        genre: "历史/重生/商战/茶叶",
        target_words: 2000000,
        protagonist_name: "沈砚",
        supporting_characters: ["柳青禾", "周掌柜", "赵承"],
        golden_finger: "前世账房经验 + 茶引税单记忆 + 契约风险判断",
        auto_planning: true,
        local_only: true,
      }),
    }).then((response) => response.json());

    let task;
    for (let i = 0; i < 80; i += 1) {
      task = await fetch(
        `${app.baseUrl}/api/tasks/${created.planning_task_id}?project=${encodeURIComponent(created.project_path)}`,
      ).then((response) => response.json());
      if (["completed", "failed", "cancelled"].includes(task.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.equal(task.status, "completed");
    const outline = await readFile(path.join(created.project_path, "细纲", "前30章.md"), "utf8");
    assert.doesNotMatch(outline, /让主角通过可信能力和选择解决问题|用可信能力和选择解决问题/);
    assert.doesNotMatch(outline, /留下下一章必须点开的新变量/);
    for (const required of ["章节功能", "触发事件", "主角欲望", "行动选择", "可见证据", "公开反馈", "代价残留", "关系推进", "章尾债务"]) {
      assert.match(outline, new RegExp(required), `missing ${required}`);
    }
    assert.match(outline, /账册|茶引|契约|税单/);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
