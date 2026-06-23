import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createModelRouter } from "../src/core/model-router.mjs";
import {
  buildWritingTaskPackage,
  createProject,
  estimateCostCny,
  estimateTokens,
  runOpenAiSmoke,
} from "../src/core/workflow.mjs";
import { batchStateFile, modelCallsFile } from "../src/core/paths.mjs";
import { writeJson } from "../src/core/fsx.mjs";

async function createTempProject(prefix = "novel-studio-real-model-guardrails-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.23 real model guardrails",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

async function readJsonLines(file) {
  const text = await readFile(file, "utf8");
  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("estimateTokens treats Chinese text as expensive instead of length divided by four", () => {
  assert.equal(estimateTokens("a".repeat(100)), 25);
  assert.equal(estimateTokens("汉".repeat(100)), 150);
});

test("estimateCostCny uses separate input/output rates from config", () => {
  const cost = estimateCostCny({
    provider: "openai",
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    rates: {
      input_per_million_cny: 18,
      output_per_million_cny: 72,
    },
  });
  assert.equal(cost, 90);
});

test("buildWritingTaskPackage trims oversized batch state and records budget metadata", async () => {
  const { root, project } = await createTempProject();
  try {
    const batchState = {
      meta: {
        from: 1,
        to: 5,
        source_files: [],
        confidence_threshold: 0.7,
        created_at: new Date().toISOString(),
      },
      characters: Array.from({ length: 40 }, (_, index) => ({
        name: `角色${index}`,
        fact: "这里是一段会占用上下文的角色变化".repeat(20),
        chapter_no: index + 1,
        confidence: 0.9,
      })),
      relationships: Array.from({ length: 40 }, (_, index) => ({
        parties: [`陆川`, `角色${index}`],
        fact: "关系变化".repeat(20),
        chapter_no: index + 1,
        confidence: 0.9,
      })),
      business_state: Array.from({ length: 40 }, (_, index) => ({
        project: "校园外卖",
        fact: "业务状态".repeat(20),
        chapter_no: index + 1,
        confidence: 0.9,
      })),
      money_orders: [],
      foreshadowing_added: Array.from({ length: 40 }, (_, index) => ({
        key: `伏笔${index}`,
        status: index % 2 === 0 ? "open" : "resolved",
        fact: "伏笔描述".repeat(20),
        chapter_no: index + 1,
        confidence: 0.9,
      })),
      foreshadowing_resolved: [],
      timeline: Array.from({ length: 80 }, (_, index) => ({
        fact: "历史事件".repeat(20),
        chapter_no: index + 1,
        confidence: 0.9,
      })),
      risks: [],
      low_confidence_candidates: Array.from({ length: 60 }, (_, index) => ({
        category: "characters",
        fact: "低信心事实".repeat(20),
        chapter_no: index + 1,
        confidence: 0.3,
      })),
    };
    await writeJson(batchStateFile(project, 1, 5), batchState);

    const taskPackage = await buildWritingTaskPackage(project, 6, {
      force: true,
      contextTokenBudget: 1200,
    });

    assert.ok(taskPackage.context_budget);
    assert.equal(taskPackage.context_budget.status, "trimmed");
    assert.ok(taskPackage.context_budget.estimated_tokens <= 1200);
    assert.equal(taskPackage.context.batch_state.low_confidence_candidates.length, 0);
    assert.ok(taskPackage.context.batch_state.timeline.length < batchState.timeline.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("OpenAI review and state prompts are structured instead of bare JSON dumps", async () => {
  const requests = [];
  const router = createModelRouter({
    provider: "openai",
    model: "gpt-test",
    allowNetwork: true,
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: async (url, options) => {
      requests.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            output_text: JSON.stringify({
              grade: "B",
              next_action: "approve",
              issues: [],
            }),
          };
        },
      };
    },
  });

  await router.invoke({
    task_type: "review_chapter",
    text: "陆川走进食堂。",
    chapter_card: {
      chapter_no: 1,
      display_title: "报到日",
    },
  });

  assert.match(requests.at(-1).input, /开头抓力/);
  assert.match(requests.at(-1).input, /弃读风险/);
  assert.doesNotMatch(requests.at(-1).input, /^task_type: review_chapter/);
});

test("runOpenAiSmoke records model call logs", async () => {
  const { root, project } = await createTempProject("novel-studio-smoke-logs-");
  try {
    await runOpenAiSmoke(project, {
      allowNetwork: true,
      model: "gpt-test",
      env: { OPENAI_API_KEY: "sk-test" },
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return { output_text: "smoke text" };
        },
      }),
    });

    const calls = await readJsonLines(modelCallsFile(project));
    assert.equal(calls.at(-1).provider, "openai");
    assert.equal(calls.at(-1).task_type, "write_chapter");
    assert.equal(calls.at(-1).status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
