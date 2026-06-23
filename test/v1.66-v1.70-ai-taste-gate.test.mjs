import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  analyzeAiTaste,
  buildChapterQualityMetrics,
  createProject,
  evaluateChapterPublishGate,
  repairPresetForIssue,
  runSingleChapterQualityLoop,
} from "../src/core/workflow.mjs";

async function createTempProject(prefix = "novel-studio-ai-taste-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "ai taste gate book",
    idea: "2016 rebirth campus service business",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

const card = {
  chapter_no: 1,
  display_title: "第1章 校门口的订单声",
  opening_hook: "订单提示音打断争吵。",
  main_event: "Lu Chuan uses real orders and backend data to solve the campus queue.",
  protagonist_action: "陆川拿出路线单和后台订单，让老周当场核对。",
  conflict: "商家怀疑学生团队不可靠。",
  cool_point_type: "visible_result",
  visible_result: "order count moved from 12 to 29 and the queue shortened",
  tail_hook: "Another complaint phone call came in; tomorrow morning the teacher wanted the same paid order data on her desk.",
  characters_in_scene: ["Lu Chuan", "Zhou"],
  facts_required: ["2016", "校园外卖"],
  forbidden_items: ["不得凭空会写软件"],
};

const passReview = {
  grade: "A",
  next_action: "approve",
  issues: [],
  risky_segments: [],
  scores: {
    opening_hook: 88,
    logic_consistency: 88,
    coolpoint_delivery: 86,
    tail_hook: 85,
    ai_taste: 90,
    publish_readiness: 88,
  },
  keep: ["order sheet", "visible data"],
  remove: [],
  rewrite_direction: "",
  publish_gate: { publish_ready: true, blockers: [], label: "可发布" },
  hard_rule_violations: [],
};

function goodText() {
  return Array.from({ length: 18 }, (_, index) => [
    "The order phone rang before Zhou could slam the refund paper on the counter.",
    "\"Route B,\" Lu Chuan said. He pushed the order sheet across the counter and pointed at the dorm gate.",
    "The backend order count moved from 12 to 29, and the queue shortened in front of everyone.",
    "Zhou refreshed the backend twice. The data did not fall back. The queue kept moving, order by order.",
    "Lu Chuan had worked operations before being laid off, then delivered takeout to support his family, so he knew which campus route would block.",
    "\"You cook,\" Lu Chuan said. \"I stop the queue from yelling.\"",
    `Another phone complaint came in before Zhou could answer. Tomorrow morning, the teacher wanted the same backend data on her desk. Scene beat ${index + 1}.`,
  ].join("\n\n")).join("\n\n");
}

function aiText() {
  return Array.from({ length: 40 }, (_, index) => [
    "本章通过校园外卖事件展现了主角的商业价值。",
    "这意味着本地生活服务会成为未来的入口，平台需要数据，商家也必须把握高速发展的核心战场。",
    "与此同时，陆川意识到平台竞争的本质是效率，因此他决定用运营思维解决问题。",
    "总之，这一章说明主角拥有超越普通人的商业认知和战略眼光。",
    `新的投诉电话打进来，要求他十分钟内给答案。第${index + 1}轮说明继续推进。`,
  ].join("\n\n")).join("\n\n");
}

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

test("analyzeAiTaste scores explanatory AI-ish prose below publish threshold", () => {
  const result = analyzeAiTaste(aiText());
  assert.ok(result.score < 78);
  assert.equal(result.band, "blocked");
  assert.ok(result.markers.some((marker) => marker.key === "ai_explanation_terms"));
  assert.ok(result.issues.includes("ai_taste_below_publish"));
});

test("buildChapterQualityMetrics includes ai_taste_score and publish gate blocks it", async () => {
  const { root, project } = await createTempProject();
  try {
    const metrics = await buildChapterQualityMetrics(project, 1, card, aiText());
    assert.ok(metrics.ai_taste_score);
    assert.ok(metrics.ai_taste_score.score < 78);

    const gate = evaluateChapterPublishGate(
      {
        ...metrics,
        drop_risk_segments: { risky_segment_count: 0 },
        tail_hook_score: { score: 5 },
        micro_hook_density: { density: 1.3 },
        coolpoint_delivered: { effective_count: 2 },
        retention_prediction: { score: 88 },
      },
      passReview,
      [],
    );
    assert.equal(gate.publish_ready, false);
    assert.ok(gate.blockers.includes("ai_taste_below_publish"));
    assert.equal(gate.thresholds.ai_taste_score_min, 78);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ai taste blocker maps to de-ai polish preset", () => {
  const preset = repairPresetForIssue({ metric: "ai_taste_score", issue: "ai_taste_below_publish" });
  assert.equal(preset.preset_id, "de-ai-polish");
});

test("runSingleChapterQualityLoop rewrites when AI taste fails then publishes after pass", async () => {
  const { root, project } = await createTempProject();
  try {
    const seen = [];
    const router = {
      async invoke(task) {
        seen.push({ task_type: task.task_type, rewrite_focus: task.rewrite_focus, rewrite_layers: task.rewrite_layers });
        if (task.task_type === "generate_chapter_card") return card;
        if (task.task_type === "write_chapter") return { chapter_no: 1, text: aiText() };
        if (task.task_type === "rewrite_chapter") return { chapter_no: 1, text: goodText() };
        if (task.task_type === "review_chapter") return passReview;
        if (task.task_type === "extract_state_candidates") return emptyState(task.chapter_no);
        throw new Error(`unexpected task ${task.task_type}`);
      },
    };

    const result = await runSingleChapterQualityLoop(project, 1, { router, maxRewrites: 2 });
    assert.ok(["approved", "stopped"].includes(result.status));
    assert.ok(result.rewrite_count >= 1);
    assert.ok(seen.some((item) => item.task_type === "rewrite_chapter"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
