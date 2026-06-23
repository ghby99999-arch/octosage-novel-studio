import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createProject, runBatch } from "../src/core/workflow.mjs";
import { modelCallsFile } from "../src/core/paths.mjs";

test("runBatch reuses one router instance across the batch", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-router-cache-"));
  try {
    const project = await createProject({
      root,
      title: "v0.24 router cache",
      idea: "2016 rebirth campus local service business story",
      platform: "fanqie",
      genre: "urban business rebirth",
    });

    const routerCalls = [];
    const router = {
      async invoke(task) {
        routerCalls.push(task.task_type);
        if (task.task_type === "generate_chapter_card") {
          return {
            chapter_no: task.chapter_no,
            display_title: `第${task.chapter_no}章钩子`,
            opening_hook: "陆川醒在报到日。",
            main_event: "验证校园午饭履约痛点。",
            protagonist_action: "陆川先行动，不解释。",
            conflict: "同学误判他只是折腾。",
            cool_point_type: "信息差暗爽",
            visible_result: "第一批订单出现。",
            tail_hook: "后台数字跳了一下。",
            characters_in_scene: ["陆川", "老周"],
            facts_required: ["时间是 2016 年"],
            forbidden_items: ["不能出现小程序"],
          };
        }
        if (task.task_type === "write_chapter") {
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: `${task.chapter_card.display_title}\n\n陆川没有解释，直接把事情做完。\n\n后台数字跳了一下。`,
          };
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

    const result = await runBatch(project, {
      from: 1,
      to: 2,
      router,
    });

    assert.equal(result.status, "completed");
    assert.deepEqual(routerCalls, [
      "generate_chapter_card",
      "generate_chapter_card",
      "write_chapter",
      "review_chapter",
      "extract_state_candidates",
      "write_chapter",
      "review_chapter",
      "extract_state_candidates",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runBatch builds the configured router once and still logs every model call", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-router-cache-logs-"));
  try {
    const project = await createProject({
      root,
      title: "v0.24 router cache logs",
      idea: "2016 rebirth campus local service business story",
      platform: "fanqie",
      genre: "urban business rebirth",
    });

    const result = await runBatch(project, { from: 1, to: 2 });
    assert.equal(result.status, "completed");

    const calls = (await readFile(modelCallsFile(project), "utf8"))
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    assert.deepEqual(
      calls.map((call) => call.task_type),
      [
        "generate_chapter_card",
        "generate_chapter_card",
        "write_chapter",
        "review_chapter",
        "write_chapter",
        "review_chapter",
        "extract_state_candidates",
        "write_chapter",
        "review_chapter",
        "write_chapter",
        "review_chapter",
        "extract_state_candidates",
      ],
    );
    assert.ok(calls.every((call) => call.provider === "mock"));
    assert.ok(calls.every((call) => Number.isFinite(call.estimated_input_tokens)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
