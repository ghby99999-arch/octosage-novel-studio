import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  repairItemsFromGlobalReview,
  runBatch,
} from "../src/core/workflow.mjs";
import { globalReviewFile } from "../src/core/paths.mjs";

async function createTempProject(prefix = "novel-studio-global-repair-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "global repair book",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function card(chapterNo) {
  return {
    chapter_no: chapterNo,
    display_title: `第${chapterNo}章 校园订单`,
    opening_hook: "订单提示音打断争吵。",
    main_event: "Lu Chuan uses real orders and backend data to solve the campus queue.",
    protagonist_action: "Lu Chuan pushes the route sheet and asks Zhou to check backend data.",
    conflict: "Zhou doubts the student team can keep the queue moving.",
    cool_point_type: "visible_result",
    visible_result: "order count moved from 12 to 29 and the queue shortened",
    tail_hook: "Another complaint phone call came in; tomorrow morning the teacher wanted the same paid order data on her desk.",
    characters_in_scene: ["Lu Chuan", "Zhou"],
    character_anchors: [{
      name: "陆川",
      surface: "学生",
      core: "运营老手",
      anchor: "学生外表和运营老手内核",
      signature_action: "用订单数据解决压力",
      signature_line: "数字比借口跑得快。",
    }],
    facts_required: ["2016"],
    forbidden_items: ["no unexplained software ability"],
  };
}

function textFor(chapterNo) {
  return [
    `Chapter ${chapterNo} opened with the order phone ringing before Zhou could curse.`,
    "\"Stop arguing.\" Lu Chuan pushed the order route across the counter.",
    "The backend order count moved from 12 to 29, and the queue shortened in front of everyone.",
    "Zhou refreshed the backend data twice. The order count kept moving and the queue kept shrinking.",
    "Lu Chuan did not invent software out of nowhere; he had worked operations before being laid off, then delivered takeout to support his family.",
    "\"You cook,\" Lu Chuan said. \"I stop the queue from yelling.\"",
    "Another complaint phone call came in. Tomorrow morning, the teacher wanted the same paid order data on her desk.",
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

test("repairItemsFromGlobalReview turns cross-chapter issues into actionable repair items", () => {
  const items = repairItemsFromGlobalReview({
    range: { from: 1, to: 10 },
    cross_chapter_issues: [{
      chapter_no: 6,
      type: "character_logic",
      severity: "blocker",
      issue: "老周态度软化太快，人物动机断裂",
      fix: "补一段他看到订单稳定后的迟疑",
    }],
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].chapter_no, 6);
  assert.equal(items[0].source, "global_review");
  assert.equal(items[0].metric, "global_consistency");
  assert.equal(items[0].status, "queued");
  assert.ok(items[0].rewrite_focus.instruction.includes("老周态度软化太快"));
});

test("runBatch repairs global review issues and reruns global review for the same range", async () => {
  const { root, project } = await createTempProject();
  try {
    let globalReviewCount = 0;
    const seen = [];
    const checkpoints = [];
    const router = {
      async invoke(task) {
        seen.push({ task_type: task.task_type, chapter_no: task.chapter_no, rewrite_focus: task.rewrite_focus });
        if (task.task_type === "generate_chapter_card") return card(task.chapter_no);
        if (task.task_type === "write_chapter") return { chapter_no: task.chapter_card.chapter_no, text: textFor(task.chapter_card.chapter_no) };
        if (task.task_type === "rewrite_chapter") {
          if (task.rewrite_focus?.type !== "global_review_repair") {
            return { chapter_no: task.chapter_card.chapter_no, text: textFor(task.chapter_card.chapter_no) };
          }
          assert.equal(task.chapter_card.chapter_no, 6);
          assert.equal(task.rewrite_focus.type, "global_review_repair");
          assert.match(task.rewrite_focus.instruction, /人物动机断裂/);
          return { chapter_no: 6, text: `${textFor(6)}\n\nZhou stared at the backend data for three seconds before sliding the refund paper back into the drawer.` };
        }
        if (task.task_type === "review_chapter") return passReview;
        if (task.task_type === "extract_state_candidates") return emptyState(task.chapter_no);
        if (task.task_type === "global_review") {
          globalReviewCount += 1;
          if (globalReviewCount === 1) {
            return {
              status: "needs_attention",
              summary: "第6章人物动机承接需要返工。",
              cross_chapter_issues: [{
                chapter_no: 6,
                type: "character_logic",
                severity: "blocker",
                issue: "老周态度软化太快，人物动机断裂",
                fix: "补一段他看到订单稳定后的迟疑。",
              }],
              publish_gate: { status: "needs_repair" },
            };
          }
          return {
            status: "pass",
            summary: "返工后跨章逻辑通过。",
            cross_chapter_issues: [],
            publish_gate: { status: "pass" },
          };
        }
        throw new Error(`unexpected task ${task.task_type}`);
      },
    };

    const result = await runBatch(project, {
      from: 1,
      to: 10,
      router,
      maxRewrites: 1,
      onCheckpointWrite: (checkpoint) => checkpoints.push(checkpoint),
    });

    assert.equal(result.status, "completed");
    assert.equal(globalReviewCount, 2);
    assert.equal(result.global_reviews.length, 1);
    assert.equal(result.global_reviews[0].repair_status, "repaired");
    assert.equal(result.global_reviews[0].repair_runs.length, 1);
    assert.equal(result.global_reviews[0].rereview.status, "pass");
    assert.ok(seen.some((item) => item.task_type === "rewrite_chapter" && item.rewrite_focus?.type === "global_review_repair"));
    assert.ok(checkpoints.some((checkpoint) => checkpoint.last_step === "global_repair"));
    assert.ok(checkpoints.some((checkpoint) => checkpoint.last_step === "global_rereview"));

    const saved = JSON.parse(await readFile(globalReviewFile(project, 1, 10), "utf8"));
    assert.equal(saved.repair_status, "repaired");
    assert.equal(saved.rereview.status, "pass");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
