import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createModelRouter } from "../src/core/model-router.mjs";
import {
  createProject,
  loadProjectConfig,
  resolveRouterOptionsFromConfig,
  runSingleChapterQualityLoop,
  saveProjectConfig,
} from "../src/core/workflow.mjs";
import { modelCallsFile } from "../src/core/paths.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createTempProject(prefix = "novel-studio-v156-provider-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "provider routing",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function fakeChatFetch(requests, content) {
  return async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body), headers: options.headers });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [{ message: { content } }],
        };
      },
    };
  };
}

test("v1.56 wenxin qwen and kimi providers use compatible chat endpoints", async () => {
  const providers = [
    {
      provider: "wenxin",
      model: "ernie-5.1",
      env: { QIANFAN_API_KEY: "qianfan-test" },
      url: /qianfan\.baidubce\.com/,
      auth: "Bearer qianfan-test",
    },
    {
      provider: "qwen",
      model: "qwen3.6-plus",
      env: { DASHSCOPE_API_KEY: "dashscope-test" },
      url: /dashscope\.aliyuncs\.com/,
      auth: "Bearer dashscope-test",
    },
    {
      provider: "kimi",
      model: "kimi-k2.6",
      env: { MOONSHOT_API_KEY: "moonshot-test" },
      url: /api\.moonshot\.cn/,
      auth: "Bearer moonshot-test",
    },
  ];

  for (const item of providers) {
    const requests = [];
    const router = createModelRouter({
      provider: item.provider,
      model: item.model,
      allowNetwork: true,
      env: item.env,
      fetch: fakeChatFetch(requests, `${item.provider} draft`),
    });
    const result = await router.invoke({
      task_type: "write_chapter",
      chapter_card: { chapter_no: 1 },
      task_package: { output: { target_words: 300 } },
    });

    assert.equal(result.text, `${item.provider} draft`);
    assert.match(requests[0].url, item.url);
    assert.equal(requests[0].body.model, item.model);
    assert.equal(requests[0].headers.Authorization, item.auth);
  }
});

test("v1.56 qwen provider accepts DashScope region base URL from env", async () => {
  const requests = [];
  const router = createModelRouter({
    provider: "qwen",
    model: "qwen3.6-plus",
    allowNetwork: true,
    env: {
      DASHSCOPE_API_KEY: "dashscope-test",
      DASHSCOPE_BASE_URL: "https://dashscope-test.aliyuncs.com/compatible-mode/v1",
    },
    fetch: fakeChatFetch(requests, "qwen base url draft"),
  });

  await router.invoke({
    task_type: "write_chapter",
    chapter_card: { chapter_no: 1 },
    task_package: { output: { target_words: 300 } },
  });

  assert.equal(
    requests[0].url,
    "https://dashscope-test.aliyuncs.com/compatible-mode/v1/chat/completions",
  );
});

test("v1.57 project config can route each task type to a different provider and model", async () => {
  const { root, project } = await createTempProject();
  try {
    await saveProjectConfig(project, {
      model: {
        provider: "auto",
        allow_network: true,
        default_writer: "ernie-5.1",
        task_routes: {
          generate_chapter_card: { provider: "deepseek", model: "deepseek-chat" },
          write_chapter: { provider: "wenxin", model: "ernie-5.1" },
          review_chapter: { provider: "qwen", model: "qwen3.6-plus" },
          extract_state_candidates: { provider: "deepseek", model: "deepseek-chat" },
        },
      },
    });

    const config = await loadProjectConfig(project);
    assert.deepEqual(resolveRouterOptionsFromConfig(config, {
      taskType: "write_chapter",
      routerOptions: {
        env: { QIANFAN_API_KEY: "test" },
      },
    }), {
      provider: "wenxin",
      model: "ernie-5.1",
      allowNetwork: true,
      env: { QIANFAN_API_KEY: "test" },
    });
    assert.equal(resolveRouterOptionsFromConfig(config, { taskType: "review_chapter" }).provider, "qwen");
    assert.equal(resolveRouterOptionsFromConfig(config, { taskType: "extract_state_candidates" }).provider, "deepseek");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.58 auto router logs actual provider and model per task", async () => {
  const { root, project } = await createTempProject("novel-studio-v158-auto-log-");
  const requests = [];
  try {
    await saveProjectConfig(project, {
      model: {
        provider: "auto",
        allow_network: true,
        task_routes: {
          generate_chapter_card: { provider: "deepseek", model: "deepseek-card" },
          write_chapter: { provider: "wenxin", model: "ernie-write" },
          rewrite_chapter: { provider: "wenxin", model: "ernie-rewrite" },
          review_chapter: { provider: "qwen", model: "qwen-review" },
          extract_state_candidates: { provider: "deepseek", model: "deepseek-extract" },
        },
      },
    });
    const routerOptions = {
      allowNetwork: true,
      env: {
        DEEPSEEK_API_KEY: "deepseek-test",
        QIANFAN_API_KEY: "qianfan-test",
        DASHSCOPE_API_KEY: "dashscope-test",
      },
      fetch: async (url, options) => {
        const body = JSON.parse(options.body);
        requests.push({ url, model: body.model, input: body.messages?.[0]?.content || body.input });
        if (body.model === "deepseek-card") {
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                choices: [{ message: { content: JSON.stringify({
                  chapter_no: 1,
                  display_title: "Auto card",
                  opening_hook: "The phone rang.",
                  main_event: "The protagonist tests a campus order.",
                  protagonist_action: "He acts directly.",
                  conflict: "A merchant doubts him.",
                  cool_point_type: "information_gap",
                  visible_result: "Orders rise.",
                  tail_hook: "The backend jumps again.",
                  characters_in_scene: ["Lu Chuan"],
                  facts_required: ["2016"],
                  forbidden_items: ["no mini program"],
                }) } }],
              };
            },
          };
        }
        if (body.model === "qwen-review") {
          return {
            ok: true,
            status: 200,
            async json() {
              return { choices: [{ message: { content: '{"grade":"A","next_action":"approve","issues":[]}' } }] };
            },
          };
        }
        if (body.model === "deepseek-extract") {
          return {
            ok: true,
            status: 200,
            async json() {
              return { choices: [{ message: { content: JSON.stringify({
                meta: { source_chapter: 1 },
                characters: [],
                relationships: [],
                business_state: [],
                money_orders: [],
                foreshadowing_added: [],
                foreshadowing_resolved: [],
                timeline: [],
                risks: [],
              }) } }] };
            },
          };
        }
        return {
          ok: true,
          status: 200,
          async json() {
            return { choices: [{ message: { content: "Lu Chuan pushed the phone across the table and the order count jumped." } }] };
          },
        };
      },
    };

    await runSingleChapterQualityLoop(project, 1, { maxRewrites: 0, routerOptions });

    const lines = (await readFile(modelCallsFile(project), "utf8"))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    assert.deepEqual(lines.map((line) => `${line.task_type}:${line.provider}:${line.model}`), [
      "generate_chapter_card:deepseek:deepseek-card",
      "write_chapter:wenxin:ernie-write",
      "review_chapter:qwen:qwen-review",
    ]);
    assert.deepEqual(requests.map((item) => item.model), [
      "deepseek-card",
      "ernie-write",
      "qwen-review",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.60 targeted rewrite uses rewrite_chapter route instead of write route", async () => {
  const { root, project } = await createTempProject("novel-studio-v160-rewrite-route-");
  try {
    const calls = [];
    await saveProjectConfig(project, {
      model: {
        provider: "auto",
        allow_network: false,
        task_routes: {
          generate_chapter_card: { provider: "mock-card", model: "card-model" },
          write_chapter: { provider: "mock-write", model: "write-model" },
          rewrite_chapter: { provider: "mock-rewrite", model: "rewrite-model" },
          review_chapter: { provider: "mock-review", model: "review-model" },
        },
      },
    });
    const router = {
      async invoke(task) {
        calls.push(task.task_type);
        if (task.task_type === "generate_chapter_card") {
          return {
            chapter_no: 1,
            display_title: "Route card",
            opening_hook: "The phone rang.",
            main_event: "A live order test.",
            protagonist_action: "He takes over the queue.",
            conflict: "The owner doubts him.",
            cool_point_type: "visible_result",
            visible_result: "The order count rises.",
            tail_hook: "A teacher arrives.",
            characters_in_scene: ["Lu Chuan"],
            character_anchors: [{
              name: "Lu Chuan",
              surface: "student",
              core: "operator under pressure",
              anchor: "student but operator under pressure",
              signature_action: "Lu Chuan uses visible order changes to prove value.",
              signature_line: "The number tells the truth faster than people.",
            }],
            facts_required: ["2016"],
            forbidden_items: ["no unexplained software ability"],
          };
        }
        if (task.task_type === "write_chapter") return { text: "Lu Chuan explained the model and waited.\n\nThe scene stayed static." };
        if (task.task_type === "rewrite_chapter") return { text: "The phone buzzed twice. Lu Chuan pressed the order sheet down.\n\n\"You roast,\" he said. \"I stop the line from yelling.\"\n\nA teacher arrived with a complaint form." };
        if (task.task_type === "review_chapter") return { grade: "A", next_action: "approve", issues: [], risky_segments: [] };
        if (task.task_type === "extract_state_candidates") {
          return {
            meta: { source_chapter: task.chapter_no },
            characters: [],
            relationships: [],
            business_state: [],
            money_orders: [],
            foreshadowing_added: [],
            foreshadowing_resolved: [],
            timeline: [],
            risks: [],
          };
        }
        throw new Error(`unexpected task ${task.task_type}`);
      },
    };

    await runSingleChapterQualityLoop(project, 1, { router, maxRewrites: 1 });
    assert.ok(calls.includes("rewrite_chapter"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.59 CLI exposes use-premium-router without saving provider secrets", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v159-cli-router-"));
  try {
    const init = spawnSync(
      "node",
      [
        "src/cli.mjs",
        "init",
        "--root",
        root,
        "--title",
        "cli-premium-router",
        "--idea",
        "2016 rebirth campus business",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(init.status, 0, init.stderr);
    const projectPath = path.join(root, "cli-premium-router");
    const result = spawnSync("node", ["src/cli.mjs", "use-premium-router", "--project", projectPath], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        QIANFAN_API_KEY: "must-not-save",
        DASHSCOPE_API_KEY: "must-not-save",
        MOONSHOT_API_KEY: "must-not-save",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /provider: auto/);
    assert.match(result.stdout, /write_chapter: wenxin\/ernie-5.1/);
    assert.match(result.stdout, /review_chapter: qwen\/qwen3.6-plus/);

    const configText = await readFile(path.join(projectPath, "config.json"), "utf8");
    assert.match(configText, /"provider": "auto"/);
    assert.match(configText, /"wenxin"/);
    assert.equal(configText.includes("must-not-save"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
