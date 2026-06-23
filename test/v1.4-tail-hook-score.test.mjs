import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  planRewriteLayers,
  runSingleChapterQualityLoop,
  scoreTailHook,
} from "../src/core/workflow.mjs";

async function createTempProject(prefix = "novel-studio-v14-tail-hook-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.4 tail hook score",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function chapterCard(chapterNo = 1, tailHook = "明天继续努力。") {
  return {
    chapter_no: chapterNo,
    display_title: "报到日，先退车",
    opening_hook: "陆川醒在 2016 年报到日。",
    main_event: "陆川确认机会并推进校园外卖。",
    protagonist_action: "陆川直接拿订单和商户谈。",
    conflict: "同学误判他在瞎折腾。",
    cool_point_type: "信息差",
    visible_result: "第一批订单出现。",
    tail_hook: tailHook,
    characters_in_scene: ["陆川", "老周"],
    facts_required: ["时间是 2016 年"],
    forbidden_items: ["不能出现小程序"],
  };
}

test("v1.4 scoreTailHook rates specific pressure hooks higher than generic endings", () => {
  const weak = scoreTailHook("明天继续努力。", { characters: ["陆川", "老周"] });
  const strong = scoreTailHook("老周后台订单数突然跳到 99，创业中心老师的电话同时打了进来。", {
    characters: ["陆川", "老周"],
  });

  assert.equal(weak.score, 1);
  assert.ok(weak.issues.includes("tail_hook_weak"));
  assert.ok(strong.score >= 4);
  assert.ok(strong.reasons.includes("known_character_pressure"));
  assert.ok(strong.reasons.includes("data_or_result_change"));
});

test("v1.4 weak hook score is added to review issues and rewrite layers", async () => {
  const { root, project } = await createTempProject();
  try {
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return chapterCard(task.chapter_no, "明天继续努力。");
        if (task.task_type === "write_chapter") {
          return {
            chapter_no: task.chapter_card.chapter_no,
            text:
              task.rewrite_focus?.type === "strengthen_tail_hook"
                ? "陆川把订单表递过去。老周刚要骂，后台数字突然跳到 99。"
                : "陆川把订单表递过去。明天继续努力。",
          };
        }
        if (task.task_type === "review_chapter") {
          const strong = task.text.includes("99");
          return {
            grade: strong ? "B" : "D",
            next_action: strong ? "approve" : "rewrite_chapter",
            issues: [],
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
    const report = JSON.parse(await readFile(result.quality_report_path, "utf8"));

    assert.equal(result.status, "approved");
    assert.equal(report.tail_hook_score.score, 1);
    assert.ok(report.review.issues.includes("章尾钩子弱"));
    assert.deepEqual(planRewriteLayers(report.review.issues).map((layer) => layer.type), ["strengthen_tail_hook"]);
    assert.deepEqual(report.applied_rewrite_layers.map((layer) => layer.type), ["strengthen_tail_hook"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
