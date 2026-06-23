import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  createPremiumIncubationPlan,
  createProject,
  loadProject,
  loadProjectConfig,
  resolveRouterOptionsFromConfig,
  runProject,
  saveProjectConfig,
  writePremiumReadinessReport,
} from "../src/core/workflow.mjs";
import { modelCallsFile, premiumReadinessReportFile } from "../src/core/paths.mjs";
import { readJson } from "../src/core/fsx.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createTempProject(prefix = "novel-studio-v176-fallback-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "provider fallback",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function okChat(content) {
  return {
    ok: true,
    status: 200,
    async json() {
      return { choices: [{ message: { content } }] };
    },
  };
}

function cardJson() {
  return JSON.stringify({
    chapter_no: 1,
    display_title: "Fallback card",
    opening_hook: "The phone rang before Zhou could deny the order.",
    main_event: "Lu Chuan tests a campus order route.",
    protagonist_action: "He pushes the receipt toward the doubting merchant.",
    conflict: "The merchant thinks the student is bluffing.",
    cool_point_type: "information_gap",
    visible_result: "The backend order count jumps.",
    tail_hook: "Across the alley, a rival copies the QR code.",
    characters_in_scene: ["Lu Chuan", "Zhou"],
    facts_required: ["2016 campus"],
    forbidden_items: ["no mini program"],
  });
}

function stateJson() {
  return JSON.stringify({
    meta: { source_chapter: 1 },
    characters: [],
    relationships: [],
    business_state: [],
    money_orders: [],
    foreshadowing_added: [],
    foreshadowing_resolved: [],
    timeline: [],
    risks: [],
  });
}

function longDraftText(label = "fallback") {
  const paragraph = [
    `Lu Chuan checked the receipt again before the ${label} route started.`,
    "The merchant pointed at the counter, the order slip, and the delivery time, refusing to believe a student could make the numbers line up.",
    "Lu Chuan did not explain his whole previous life. He marked the menu, counted the cash change, asked Zhou to watch the back door queue, and sent the first trial order with the price risk written beside it.",
    "When the backend count moved, the laughing students went quiet. The merchant took the ledger back, saw the order number match the receipt, and finally asked what the second route would cost.",
  ].join(" ");
  return Array.from({ length: 5 }, (_, index) => `${paragraph} Beat ${index + 1} leaves a visible result and a next pressure.`).join("\n\n");
}

test("v1.76 resolveRouterOptionsFromConfig preserves task fallback chain", async () => {
  const { root, project } = await createTempProject();
  try {
    await saveProjectConfig(project, {
      model: {
        provider: "auto",
        allow_network: true,
        fallback_enabled: true,
        task_routes: {
          write_chapter: {
            provider: "wenxin",
            model: "ernie-5.1",
            fallbacks: [
              { provider: "deepseek", model: "deepseek-chat" },
              { provider: "mock", model: "mock" },
            ],
          },
        },
      },
    });
    const config = await loadProjectConfig(project);
    const resolved = resolveRouterOptionsFromConfig(config, { taskType: "write_chapter" });

    assert.equal(resolved.provider, "wenxin");
    assert.equal(resolved.model, "ernie-5.1");
    assert.equal(resolved.fallbackEnabled, true);
    assert.deepEqual(resolved.fallbacks, [
      { provider: "deepseek", model: "deepseek-chat" },
      { provider: "mock", model: "mock" },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.77 router falls back after primary provider failure and logs both attempts", async () => {
  const { root, project } = await createTempProject("novel-studio-v177-router-fallback-");
  const requestedModels = [];
  try {
    await saveProjectConfig(project, {
      model: {
        provider: "auto",
        allow_network: true,
        task_routes: {
          generate_chapter_card: { provider: "deepseek", model: "deepseek-card" },
          write_chapter: {
            provider: "wenxin",
            model: "ernie-write",
            fallbacks: [{ provider: "deepseek", model: "deepseek-write" }],
          },
          review_chapter: { provider: "qwen", model: "qwen-review" },
          extract_state_candidates: { provider: "deepseek", model: "deepseek-extract" },
        },
      },
    });
    await runProject(project, {
      untilChapter: 1,
      maxRewrites: 0,
      routerOptions: {
        allowNetwork: true,
        env: {
          DEEPSEEK_API_KEY: "deepseek-test",
          QIANFAN_API_KEY: "qianfan-test",
          DASHSCOPE_API_KEY: "dashscope-test",
        },
        fetch: async (_url, options) => {
          const body = JSON.parse(options.body);
          requestedModels.push(body.model);
          if (body.model === "ernie-write") {
            return {
              ok: false,
              status: 503,
              headers: { get: () => null },
              async text() {
                return "temporary unavailable";
              },
            };
          }
          if (body.model === "deepseek-card") return okChat(cardJson());
          if (body.model === "deepseek-write") return okChat(longDraftText("write fallback"));
          if (body.model === "qwen-review") return okChat('{"grade":"A","next_action":"approve","issues":[]}');
          if (body.model === "deepseek-extract") return okChat(stateJson());
          throw new Error(`unexpected model ${body.model}`);
        },
        maxRetries: 0,
      },
    });

    assert.ok(requestedModels.includes("ernie-write"));
    assert.ok(requestedModels.includes("deepseek-write"));
    const lines = (await readFile(modelCallsFile(project), "utf8"))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    const writeCalls = lines.filter((line) => line.task_type === "write_chapter");
    assert.deepEqual(writeCalls.map((line) => `${line.provider}:${line.model}:${line.status}`), [
      "wenxin:ernie-write:error",
      "deepseek:deepseek-write:fallback_ok",
    ]);
    assert.equal(writeCalls[1].fallback_from.provider, "wenxin");
    assert.match(writeCalls[1].fallback_reason, /503/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.77b chapter card timeout uses real configured fallback route", async () => {
  const { root, project } = await createTempProject("novel-studio-v177b-card-fallback-");
  const requestedModels = [];
  try {
    await saveProjectConfig(project, {
      model: {
        provider: "auto",
        allow_network: true,
        task_routes: {
          generate_chapter_card: {
            provider: "deepseek",
            model: "deepseek-card",
            timeoutMs: 5,
            fallbacks: [{ provider: "qwen", model: "qwen-card" }],
          },
          write_chapter: { provider: "deepseek", model: "deepseek-write" },
          review_chapter: { provider: "qwen", model: "qwen-review" },
          extract_state_candidates: { provider: "deepseek", model: "deepseek-extract" },
        },
      },
    });

    await runProject(project, {
      untilChapter: 1,
      maxRewrites: 0,
      routerOptions: {
        allowNetwork: true,
        env: {
          DEEPSEEK_API_KEY: "deepseek-test",
          DASHSCOPE_API_KEY: "dashscope-test",
        },
        fetch: async (_url, options) => {
          const body = JSON.parse(options.body);
          requestedModels.push(body.model);
          if (body.model === "deepseek-card") {
            return new Promise((_resolve, reject) => {
              options.signal?.addEventListener("abort", () => {
                const error = new Error("aborted");
                error.name = "AbortError";
                reject(error);
              }, { once: true });
            });
          }
          if (body.model === "qwen-card") return okChat(cardJson());
          if (body.model === "deepseek-write") return okChat(longDraftText("card fallback"));
          if (body.model === "qwen-review") return okChat('{"grade":"A","next_action":"approve","issues":[]}');
          if (body.model === "deepseek-extract") return okChat(stateJson());
          throw new Error(`unexpected model ${body.model}`);
        },
        maxRetries: 0,
      },
    });

    assert.ok(requestedModels.includes("deepseek-card"));
    assert.ok(requestedModels.includes("qwen-card"));
    const lines = (await readFile(modelCallsFile(project), "utf8"))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    const cardCalls = lines.filter((line) => line.task_type === "generate_chapter_card");
    assert.deepEqual(cardCalls.map((line) => `${line.provider}:${line.model}:${line.status}`), [
      "deepseek:deepseek-card:error",
      "qwen:qwen-card:fallback_ok",
    ]);
    assert.equal(cardCalls[0].fallback_next.provider, "qwen");
    assert.equal(cardCalls[1].fallback_from.provider, "deepseek");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.78 use-premium-router writes default fallback chains without saving secrets", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v178-cli-fallback-"));
  try {
    const init = spawnSync("node", [
      "src/cli.mjs",
      "init",
      "--root",
      root,
      "--title",
      "cli-fallback-router",
      "--idea",
      "2016 rebirth campus business",
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    const projectPath = path.join(root, "cli-fallback-router");
    const result = spawnSync("node", ["src/cli.mjs", "use-premium-router", "--project", projectPath], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, QIANFAN_API_KEY: "do-not-save" },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /fallback: enabled/);

    const configText = await readFile(path.join(projectPath, "config.json"), "utf8");
    const config = JSON.parse(configText);
    assert.equal(config.model.fallback_enabled, true);
    assert.equal(config.model.task_routes.write_chapter.fallbacks[0].provider, "deepseek");
    assert.equal(configText.includes("do-not-save"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.79 premium-run CLI keeps fallback enabled by default", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v179-premium-run-"));
  try {
    await createPremiumIncubationPlan({
      root,
      baseTitle: "fallback-premium",
      ideas: ["2016 campus business"],
      targetChapters: 1,
    });
    const projectPath = path.join(root, "fallback-premium-01");
    const router = spawnSync("node", ["src/cli.mjs", "use-premium-router", "--project", projectPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(router.status, 0, router.stderr);
    const result = spawnSync("node", [
      "src/cli.mjs",
      "premium-run",
      "--root",
      root,
      "--until",
      "1",
      "--max-rewrites",
      "0",
    ], { cwd: repoRoot, encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /fallback: enabled/);
    assert.match(result.stdout, /premium-run:/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.80 e2e smoke runs idea to premium readiness report", async () => {
  const { root, project } = await createTempProject("novel-studio-v180-e2e-");
  try {
    const run = await runProject(project, { untilChapter: 3, maxRewrites: 1 });
    assert.ok(["completed", "stopped"].includes(run.status));
    if (run.status === "stopped") {
      assert.ok(run.stop, "stopped smoke run must preserve stop reason");
    }

    const loaded = await loadProject(project.path);
    const report = await writePremiumReadinessReport(loaded, { from: 1, to: 3 });
    assert.equal(report.project_title, project.title);
    assert.equal(report.range.from, 1);
    assert.equal(report.range.to, 3);
    assert.ok(report.metric_summary.tail_hook_score);
    assert.ok(report.metric_summary.micro_hook_density);
    assert.ok(report.metric_summary.retention_prediction);
    assert.ok(Array.isArray(report.repair_queue));

    const saved = await readJson(premiumReadinessReportFile(project, 1, 3));
    assert.equal(saved.range.to, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
