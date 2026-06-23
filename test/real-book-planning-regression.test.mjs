import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createLocalServer } from "../src/server.mjs";
import { createModelRouter } from "../src/core/model-router.mjs";

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

test("real book planning preserves gold finger and does not misclassify order system as game system", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octo-real-book-planning-"));
  const app = await startTestServer();
  try {
    const created = await fetch(`${app.baseUrl}/api/project`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        root,
        title: "重生2016从校园外卖到本地生活",
        idea: "2016年程序员被裁员后重生回大学，为了还债从校园外卖做起。他的能力来源是前世做过本地生活平台产品经理，懂商户履约、订单系统和校园流量。",
        platform: "fanqie",
        genre: "都市/重生/创业/外卖",
        target_words: 2000000,
        protagonist_name: "陆川",
        supporting_characters: ["周立", "苏晴", "秦远"],
        golden_finger: "前世本地生活产品经理经验 + 订单系统判断 + 商户履约账本复盘",
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
    assert.equal(task.result.status, "planning-ready");

    const project = JSON.parse(await readFile(path.join(created.project_path, "project.json"), "utf8"));
    assert.match(project.golden_finger, /本地生活产品经理/);

    const bible = await readFile(path.join(created.project_path, "项目圣经.md"), "utf8");
    assert.match(bible, /金手指\/核心优势：前世本地生活产品经理经验/);
    assert.doesNotMatch(bible, /游戏系统开书规则/);
    assert.match(bible, /重生商战开书规则/);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("project planning compatible requests reserve enough output tokens for closed JSON", async () => {
  const requests = [];
  const router = createModelRouter({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    allowNetwork: true,
    env: { DEEPSEEK_API_KEY: "ds-test" },
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  premise: "2016年程序员陆川重生回大学，从校园外卖做成本地生活平台。",
                  selling_points: ["订单证据链", "校园外卖切入", "本地生活扩张"],
                  logic_constraints: ["能力必须通过订单、账本和合同证明"],
                  characters: ["陆川:主角/重生创业/第一章"],
                  relationships: ["陆川与周立：室友到合伙人"],
                  stages: ["校园试点", "校内扩张", "商圈复制", "平台化", "资本战", "终局兑现"],
                  chapter_beats: ["第1章：试跑第一单", "第2章：拿下第一家商户"],
                }),
              },
            }],
          };
        },
      };
    },
  });

  await router.invoke({
    task_type: "project_planning",
    project: {
      title: "重生2016从校园外卖到本地生活",
      idea: "2016年程序员被裁员后重生回大学，为了还债从校园外卖做起。",
      platform: "fanqie",
      genre: "都市/重生/创业/外卖",
      target_words: 2000000,
    },
  });

  assert.ok(requests[0].max_tokens >= 6000, `project planning max_tokens too low: ${requests[0].max_tokens}`);
  assert.deepEqual(requests[0].response_format, { type: "json_object" });
});
