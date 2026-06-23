import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createModelRouter } from "../src/core/model-router.mjs";
import {
  createProject,
  runSingleChapterQualityLoop,
} from "../src/core/workflow.mjs";

const writeTask = {
  task_type: "write_chapter",
  chapter_card: {
    chapter_no: 1,
    display_title: "Hook title",
  },
  task_package: {
    output: { target_words: 300 },
  },
};

async function createTempProject(prefix = "novel-studio-v10-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1 product readiness",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function chapterCard(chapterNo = 1) {
  return {
    chapter_no: chapterNo,
    display_title: `第${chapterNo}章钩子标题`,
    opening_hook: "陆川醒在 2016 年报到日。",
    main_event: "陆川确认机会并推进校园外卖。",
    protagonist_action: "陆川直接拿订单和商户谈。",
    conflict: "同学误判他在瞎折腾。",
    cool_point_type: "信息差",
    visible_result: "第一批订单出现。",
    tail_hook: "老周后台订单数突然跳动。",
    characters_in_scene: ["陆川", "老周"],
    facts_required: ["时间是 2016 年"],
    forbidden_items: ["不能出现小程序"],
  };
}

test("v1.0 OpenAI provider honors Retry-After and minInterval before requests", async () => {
  const sleeps = [];
  const calls = [];
  const router = createModelRouter({
    provider: "openai",
    model: "gpt-test",
    allowNetwork: true,
    maxRetries: 1,
    retryDelayMs: 0,
    minIntervalMs: 25,
    sleep: async (ms) => sleeps.push(ms),
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: async () => {
      calls.push(Date.now());
      if (calls.length === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: (name) => (name.toLowerCase() === "retry-after" ? "2" : null) },
          async text() {
            return "rate limited";
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return { output_text: "generated after retry-after" };
        },
      };
    },
  });

  const result = await router.invoke(writeTask);

  assert.equal(result.text, "generated after retry-after");
  assert.ok(sleeps.includes(25));
  assert.ok(sleeps.includes(2000));
});

test("v1.0 compatible providers honor Retry-After and minInterval before requests", async () => {
  const sleeps = [];
  const router = createModelRouter({
    provider: "deepseek",
    model: "deepseek-test",
    allowNetwork: true,
    maxRetries: 1,
    retryDelayMs: 0,
    minIntervalMs: 10,
    sleep: async (ms) => sleeps.push(ms),
    env: { DEEPSEEK_API_KEY: "sk-test" },
    fetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: "chat generated" } }] };
      },
    }),
  });

  const result = await router.invoke(writeTask);

  assert.equal(result.text, "chat generated");
  assert.deepEqual(sleeps, [10]);
});

test("v1.0 quality loop keeps the better prior draft when rewrite degrades review grade", async () => {
  const { root, project } = await createTempProject("novel-studio-v10-degrade-");
  const reviews = ["D", "E"];
  try {
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return chapterCard(task.chapter_no);
        if (task.task_type === "write_chapter") {
          const text =
            task.draft_mode === "strong"
              ? "重写稿反而变差，没有场景承接。"
              : "初稿虽然一般，但有订单、有动作、有承接。";
          return { chapter_no: task.chapter_card.chapter_no, text };
        }
        if (task.task_type === "review_chapter") {
          const grade = reviews.shift();
          return {
            grade,
            next_action: grade === "D" ? "rewrite_chapter" : "approve",
            issues: grade === "D" ? ["rewrite degraded"] : [],
          };
        }
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

    const result = await runSingleChapterQualityLoop(project, 1, { router, maxRewrites: 1 });

    assert.equal(result.status, "stopped");
    assert.equal(result.final_grade, "D");
    assert.equal(result.final_version, "v1");
    assert.equal(result.rewrite_count, 1);
    assert.equal(result.rewrite_degraded, true);
    assert.equal(result.stop.reason, "degraded_on_rewrite");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.0 quality loop flags a broken previous hook chain in review issues", async () => {
  const { root, project } = await createTempProject("novel-studio-v10-hook-");
  try {
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return chapterCard(task.chapter_no);
        if (task.task_type === "write_chapter") {
          return { chapter_no: task.chapter_card.chapter_no, text: "陆川去了食堂，完全没有提后台订单数。" };
        }
        if (task.task_type === "review_chapter") {
          return { grade: "B", next_action: "approve", issues: [] };
        }
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
    const result = await runSingleChapterQualityLoop(project, 2, { router, maxRewrites: 1 });
    const report = JSON.parse(await readFile(result.quality_report_path, "utf8"));

    assert.equal(result.status, "approved");
    assert.ok(report.review_quality_flags.includes("broken_hook_chain"));
    assert.ok(report.review.issues.includes("broken_hook_chain"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.0 package and release gate require a 1.x product version", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const releaseSource = await readFile("scripts/release-readiness.mjs", "utf8");

  assert.match(pkg.version, /^1\.\d+\.\d+$/);
  assert.match(releaseSource, /\^1\\\./);
  assert.match(releaseSource, /desktop preload/);
});
