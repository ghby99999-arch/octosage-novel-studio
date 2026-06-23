import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createProject, readLatestGlobalReview, runBatch } from "../src/core/workflow.mjs";
import { globalReviewFile } from "../src/core/paths.mjs";

async function createTempProject(prefix = "novel-studio-global-review-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "global review book",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function card(chapterNo) {
  return {
    chapter_no: chapterNo,
    display_title: `第${chapterNo}章订单测试`,
    opening_hook: "订单提示音打断争吵。",
    main_event: "主角用真实订单解决现场怀疑。",
    protagonist_action: "主角拿出订单路径和商家对账。",
    conflict: "商家怀疑学生团队不靠谱。",
    cool_point_type: "visible_result",
    visible_result: "订单数现场上涨。",
    tail_hook: "新的投诉电话打进来。",
    characters_in_scene: ["Lu Chuan", "Zhou"],
    character_anchors: [{
      name: "Lu Chuan",
      surface: "student",
      core: "operator",
      anchor: "student but operator",
      signature_action: "uses order data to resolve pressure",
      signature_line: "Numbers move faster than excuses.",
    }],
    facts_required: ["2016"],
    forbidden_items: ["no unexplained software ability"],
  };
}

function textFor(chapterNo) {
  return [
    `第${chapterNo}章开场，order notification beeped before Zhou could curse.`,
    "\"Stop arguing,\" Lu Chuan said. He pushed the printed order route across the greasy counter.",
    "The backend order count moved from 12 to 29, and the queue shortened in front of everyone.",
    "\"Again?\" Zhou stared at the backend data and refreshed the screen twice.",
    "Lu Chuan did not invent software out of nowhere; he had worked operations before being laid off, then delivered takeout to support his family.",
    "\"You roast,\" Lu Chuan said. \"I stop the line from yelling.\"",
    "A second merchant called with a complaint, but the paid order result had already proved the route.",
    "The teacher walked in, phone still buzzing, and asked why the campus queue had suddenly split in two.",
  ].join("\n\n");
}

const passReview = {
  grade: "A",
  next_action: "approve",
  issues: [],
  risky_segments: [],
  publish_gate: { publish_ready: true, blockers: [] },
};

const emptyState = (chapterNo) => ({
  meta: { source_chapter: chapterNo },
  characters: [],
  relationships: [],
  business_state: [],
  money_orders: [],
  foreshadowing_added: [],
  foreshadowing_resolved: [],
  timeline: [],
  risks: [],
});

test("runBatch triggers a global review after completing chapter 10", async () => {
  const { root, project } = await createTempProject();
  try {
    const seen = [];
    const checkpoints = [];
    const router = {
      async invoke(task) {
        seen.push(task.task_type);
        if (task.task_type === "generate_chapter_card") return card(task.chapter_no);
        if (task.task_type === "write_chapter") return { chapter_no: task.chapter_card.chapter_no, text: textFor(task.chapter_card.chapter_no) };
        if (task.task_type === "rewrite_chapter") return { chapter_no: task.chapter_card.chapter_no, text: textFor(task.chapter_card.chapter_no) };
        if (task.task_type === "review_chapter") return passReview;
        if (task.task_type === "extract_state_candidates") return emptyState(task.chapter_no);
        if (task.task_type === "global_review") {
          assert.equal(task.from, 1);
          assert.equal(task.to, 10);
          assert.equal(task.chapters.length, 10);
          return {
            status: "needs_attention",
            summary: "第1-10章整体可读，但第6章人物动机承接需要补一句。",
            cross_chapter_issues: [{
              chapter_no: 6,
              type: "character_logic",
              severity: "warn",
              issue: "第6章老周态度软化过快。",
              fix: "补一段他看到订单稳定后的犹豫。",
            }],
            publish_gate: { status: "needs_repair" },
          };
        }
        throw new Error(`unexpected task ${task.task_type}`);
      },
    };

    const result = await runBatch(project, {
      from: 1,
      to: 10,
      router,
      maxRewrites: 0,
      onCheckpointWrite: (checkpoint) => checkpoints.push(checkpoint),
    });

    assert.equal(result.status, "completed");
    assert.equal(result.global_reviews.length, 1);
    assert.ok(seen.includes("global_review"));
    assert.ok(checkpoints.some((checkpoint) => checkpoint.last_step === "global_review"));

    const saved = JSON.parse(await readFile(globalReviewFile(project, 1, 10), "utf8"));
    assert.equal(saved.range.from, 1);
    assert.equal(saved.range.to, 10);
    assert.equal(saved.cross_chapter_issues[0].chapter_no, 6);

    const latest = await readLatestGlobalReview(project);
    assert.equal(latest.status, "ready");
    assert.equal(latest.reviews[0].path, globalReviewFile(project, 1, 10));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
