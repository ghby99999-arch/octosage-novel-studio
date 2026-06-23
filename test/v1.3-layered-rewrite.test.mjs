import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  planRewriteLayers,
  runSingleChapterQualityLoop,
} from "../src/core/workflow.mjs";

const cn = (hexValues = []) => String.fromCodePoint(...hexValues.map((hex) => Number.parseInt(hex, 16)));

const C = {
  luChuan: cn(["9646", "5ddd"]),
  oldWang: cn(["8001", "738b"]),
  firstOrderNotRun: cn(["7b2c", "4e00", "5355", "8fd8", "6ca1", "8dd1"]),
  conflictSentence: cn(["7b2c", "4e00", "5355", "8fd8", "6ca1", "8dd1", "ff0c", "7b2c", "4e8c", "5355", "7684", "673a", "4f1a", "5c31", "6765", "4e86", "3002"]),
  removeConflict: cn(["7ed3", "5c3e", "201c", "7b2c", "4e00", "5355", "8fd8", "6ca1", "8dd1", "201d", "7684", "77db", "76fe", "8868", "8ff0"]),
  removeSummary: cn(["65e0", "73b0", "573a", "652f", "6491", "7684", "76ee", "6807", "603b", "7ed3"]),
  rewriteDirection: cn(["8865", "9f50", "5546", "6237", "8c08", "5224", "3001", "8bd5", "8dd1", "3001", "5b66", "751f", "7b7e", "6536", "3001", "73b0", "91d1", "5bf9", "8d26", "548c", "9996", "65e5", "8d26", "76ee", "5df2", "5e73", "3002"]),
  structuralIssue: cn(["7ae0", "5361", "504f", "79bb", "ff1a", "7f3a", "5931", "62ff", "83dc", "5355", "5708", "8def", "7ebf", "3001", "5e26", "73b0", "91d1", "627e", "5546", "6237", "8bd5", "70b9", "3001", "5f53", "573a", "8c08", "6e05", "5bf9", "8d26", "7684", "6838", "5fc3", "52a8", "4f5c", "63cf", "5199"]),
  dialogueIssue: cn(["914d", "89d2", "53f0", "8bcd", "540c", "8d28", "5316"]),
  orderForm: cn(["8ba2", "5355", "8868"]),
  trialRun: cn(["4e24", "5355", "8bd5", "8dd1"]),
};

async function createTempProject(prefix = "novel-studio-v13-layered-rewrite-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.3 layered rewrite",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function chapterCard(chapterNo = 1) {
  return {
    chapter_no: chapterNo,
    display_title: "Report day",
    opening_hook: "Lu Chuan wakes on 2016 report day.",
    main_event: "Lu Chuan validates campus delivery demand with a merchant trial run.",
    protagonist_action: "Lu Chuan negotiates with a merchant using menu, cash, route, and account book.",
    conflict: "Classmates assume he is doing low-end chores.",
    cool_point_type: "information advantage",
    visible_result: "The first batch of orders produces cash and signatures.",
    tail_hook: "The merchant backend order count suddenly moves.",
    characters_in_scene: [C.luChuan, C.oldWang],
    facts_required: ["2016", "merchant trial run", "cash reconciliation"],
    forbidden_items: ["mini program"],
  };
}

function repeatProse(seed, times = 12) {
  return Array.from({ length: times }, (_, index) => `${seed} action ${index + 1}.`).join("\n\n");
}

function reviewPayload({ passed, issues = [], risky = !passed, remove = null, rewriteDirection = "", riskySegments = null }) {
  return {
    grade: passed ? "B" : "D",
    next_action: passed ? "approve" : "rewrite_chapter",
    issues,
    scores: {
      opening_hook: passed ? 88 : 55,
      logic_consistency: passed ? 86 : 40,
      coolpoint_delivery: passed ? 84 : 45,
      tail_hook: passed ? 82 : 50,
      ai_taste: passed ? 90 : 72,
      publish_readiness: passed ? 86 : 0,
    },
    risky_segments: riskySegments
      ? riskySegments
      : !risky || passed
        ? []
        : [{ text: "merchant trial run and cash reconciliation are missing", reason: "chapter card drift", severity: "high" }],
    keep: ["2016 rebirth", "campus delivery pressure"],
    remove: passed ? [] : (remove || ["unsupported summary"]),
    rewrite_direction: passed ? "approved" : (rewriteDirection || "add merchant negotiation, trial run, reconciliation, and visible result"),
    publish_gate: passed
      ? { publish_ready: true, blockers: [], label: "ready" }
      : { publish_ready: false, blockers: ["review_grade_below_publish"], label: "needs rewrite" },
  };
}

test("v1.3 planRewriteLayers maps review issues into focused rewrite passes", () => {
  const layers = planRewriteLayers([
    "ai_taste_below_publish",
    "tail_hook_below_publish",
    C.dialogueIssue,
    "ai_taste_below_publish",
  ]);

  assert.deepEqual(
    layers.map((layer) => layer.type),
    ["remove_explanation", "strengthen_tail_hook", "character_voice"],
  );
});

test("v1.3 structural chapter-card drift uses full structural scene repair", async () => {
  const { root, project } = await createTempProject("novel-studio-structural-repair-");
  const writeTasks = [];
  try {
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return chapterCard(task.chapter_no);
        if (task.task_type === "write_chapter") {
          writeTasks.push(task);
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: repeatProse("Lu Chuan delivers one order, then the manuscript skips the merchant trial run and account book proof.", 45),
          };
        }
        if (task.task_type === "rewrite_chapter") {
          writeTasks.push(task);
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: repeatProse(`${C.luChuan} puts the menu, cash, and route on the desk. ${C.oldWang} records ${C.trialRun} and asks for cash reconciliation after delivery.`, 28),
          };
        }
        if (task.task_type === "review_chapter") {
          const passed = task.text.includes(C.trialRun);
          return reviewPayload({
            passed,
            issues: passed ? [] : [C.structuralIssue],
          });
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
    const rewriteTask = writeTasks.find((task) => task.task_type === "rewrite_chapter");

    assert.ok(["approved", "stopped"].includes(result.status));
    assert.ok(result.rewrite_count >= 1);
    assert.equal(rewriteTask.rewrite_focus.type, "structural_scene_repair");
    assert.equal(rewriteTask.rewrite_focus.force_full_rewrite, true);
    assert.equal(rewriteTask.rewrite_strategy, "targeted_rewrite");
    assert.ok(!rewriteTask.patch_mode, "structural repair should not be downgraded to segment patch");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.3 rewriteChapter receives focused rewrite layers from review issues", async () => {
  const { root, project } = await createTempProject();
  const writeTasks = [];
  try {
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return chapterCard(task.chapter_no);
        if (task.task_type === "write_chapter" || task.task_type === "rewrite_chapter") {
          writeTasks.push(task);
          return {
            chapter_no: task.chapter_card.chapter_no,
            text:
              task.rewrite_focus?.type === "remove_explanation"
                ? repeatProse(`${C.luChuan} hangs up the rental-car call and hands ${C.oldWang} the ${C.orderForm}.`, 36)
                : repeatProse("This chapter explains the protagonist discovered business value.", 60),
          };
        }
        if (task.task_type === "review_chapter") {
          const isRewrite = task.text.includes(C.orderForm);
          return reviewPayload({ passed: isRewrite, issues: isRewrite ? [] : ["ai_taste_below_publish", "tail_hook_below_publish"], risky: false });
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
    const rewriteTask = writeTasks.find((task) => task.task_type === "rewrite_chapter" || task.rewrite_focus);

    assert.ok(["approved", "stopped"].includes(result.status));
    assert.ok(rewriteTask, "expected a rewrite task");
    assert.equal(rewriteTask.rewrite_strategy, "targeted_rewrite");
    assert.ok(["remove_explanation", "drop_risk_repair"].includes(rewriteTask.rewrite_focus.type));
    assert.ok(report.rewrite_layers.some((layer) => layer.type === "remove_explanation"));
    assert.ok(report.rewrite_layers.some((layer) => layer.type === "strengthen_tail_hook"));
    assert.ok(report.applied_rewrite_layers.length >= 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.3 targeted rewrite keeps concrete reviewer removal directives", async () => {
  const { root, project } = await createTempProject("novel-studio-review-directives-");
  const rewriteTasks = [];
  try {
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return chapterCard(task.chapter_no);
        if (task.task_type === "write_chapter") {
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: repeatProse(`${C.luChuan} writes three deliveries into the account book. ${C.conflictSentence} He still has not shown merchant trial run, student signing reaction, or cash reconciliation.`, 45),
          };
        }
        if (task.task_type === "rewrite_chapter") {
          rewriteTasks.push(task);
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: repeatProse(`${C.luChuan} puts the menu, cash, and route on the desk. ${C.oldWang} records ${C.trialRun} and asks for cash reconciliation after delivery.`, 45),
          };
        }
        if (task.task_type === "review_chapter") {
          return reviewPayload({
            passed: false,
            issues: [
              "timeline conflict: manuscript says delivered, then says first order has not run",
              "structural execution missing: merchant trial run, signing reaction, and cash reconciliation",
            ],
            risky: false,
            remove: [C.removeConflict, C.removeSummary],
            rewriteDirection: C.rewriteDirection,
            riskySegments: [C.conflictSentence],
          });
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
    const rewriteTask = rewriteTasks[0];

    assert.ok(rewriteTask, "expected a rewrite task");
    assert.ok(
      ["structural_scene_repair", "fact_consistency_repair", "drop_risk_repair"].includes(rewriteTask.rewrite_focus.type),
      `unexpected repair type ${rewriteTask.rewrite_focus.type}`,
    );
    assert.equal(rewriteTask.rewrite_focus.rewrite_direction, C.rewriteDirection);
    assert.deepEqual(rewriteTask.rewrite_focus.remove_targets, [C.removeConflict, C.removeSummary]);
    assert.ok(
      rewriteTask.rewrite_focus.risk_segments.some((segment) => String(segment.preview || "").includes(C.conflictSentence)),
      "string risky_segments must be carried into rewrite focus",
    );
    assert.ok(rewriteTask.rewrite_focus.instruction.includes(C.conflictSentence));
    assert.ok(rewriteTask.rewrite_focus.instruction.includes(C.removeConflict));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
