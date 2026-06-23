import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createProject, runSingleChapterQualityLoop } from "../src/core/workflow.mjs";

async function createTempProject(prefix = "novel-studio-real-single-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.27 real single",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("runSingleChapterQualityLoop runs card-write-review-rewrite-state-export", async () => {
  const { root, project } = await createTempProject();
  const calls = [];
  try {
    const router = {
      async invoke(task) {
        calls.push(task.task_type);
        if (task.task_type === "generate_chapter_card") {
          return {
            chapter_no: task.chapter_no,
            display_title: "报到日，先退车",
            opening_hook: "陆川醒在 2016 年报到日。",
            main_event: "陆川退车并发现食堂履约痛点。",
            protagonist_action: "陆川先退车，再去食堂观察。",
            conflict: "同学误判他没钱，商户以为他折腾。",
            cool_point_type: "信息差暗爽",
            visible_result: "第一批订单出现。",
            tail_hook: "老周后台数字突然跳动。",
            characters_in_scene: ["陆川", "老周"],
            facts_required: ["时间是 2016 年"],
            forbidden_items: ["不能出现小程序"],
          };
        }
        if (task.task_type === "write_chapter") {
          const versionText =
            task.draft_mode === "strong"
              ? "陆川没有解释，直接把退车电话挂断，食堂门口的队伍已经拐出第二道弯。"
              : "本章说明陆川发现了一个商业机会，具有巨大商业价值。";
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: `${task.chapter_card.display_title}\n\n${versionText}`,
          };
        }
        if (task.task_type === "review_chapter") {
          const isStrong = task.text.includes("第二道弯");
          return {
            grade: isStrong ? "B" : "D",
            next_action: isStrong ? "approve" : "rewrite_chapter",
            issues: isStrong ? [] : ["解释腔过重"],
          };
        }
        if (task.task_type === "extract_state_candidates") {
          return {
            meta: { source_chapter: task.chapter_no },
            characters: [{ name: "陆川", fact: "确认回到 2016 年", confidence: 0.9 }],
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

    const result = await runSingleChapterQualityLoop(project, 1, {
      router,
      maxRewrites: 1,
    });

    assert.equal(result.status, "approved");
    assert.equal(result.chapter_no, 1);
    assert.equal(result.final_grade, "B");
    assert.equal(result.rewrite_count, 1);
    assert.equal(result.final_version, "v2");
    assert.ok(result.export_path);
    assert.ok(result.state_candidates_path);
    assert.deepEqual(calls, [
      "generate_chapter_card",
      "write_chapter",
      "review_chapter",
      "write_chapter",
      "review_chapter",
      "extract_state_candidates",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runSingleChapterQualityLoop stops when review requires outline rollback", async () => {
  const { root, project } = await createTempProject("novel-studio-real-single-stop-");
  try {
    const result = await runSingleChapterQualityLoop(project, 1, {
      routerOptions: { provider: "mock-e" },
    });

    assert.equal(result.status, "stopped");
    assert.equal(result.stop.grade, "E");
    assert.equal(result.stop.reason, "rollback_required");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
