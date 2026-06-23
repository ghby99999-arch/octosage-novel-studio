import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  analyzeParagraphRhythm,
  analyzeSentencePatternInertia,
  createProject,
  planRewriteLayers,
  runSingleChapterQualityLoop,
} from "../src/core/workflow.mjs";

async function createTempProject(prefix = "novel-studio-v1281-review-depth-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.281 review depth",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function baseCard(chapterNo = 1) {
  return {
    chapter_no: chapterNo,
    display_title: "The line starts moving",
    opening_hook: "Zhou sees the backend count move before Lu Chuan explains anything.",
    main_event: "Lu Chuan turns a campus queue into visible order validation.",
    protagonist_action: "He pushes the order sheet across the counter.",
    conflict: "Zhou thinks students only make noise.",
    cool_point_type: "misjudgment_payoff",
    visible_result: "The backend count jumps from 0 to 99.",
    tail_hook: "Zhou backend order count jumps to 99 while the campus office calls.",
    characters_in_scene: ["Lu Chuan", "Zhou"],
    character_anchors: [
      {
        name: "Zhou",
        surface: "hard-mouthed",
        core: "watches backend orders faster than anyone",
        anchor: "hard-mouthed but watches backend orders faster than anyone",
        signature_action: "refreshes backend while pretending not to care",
        signature_line: "Students only make noise.",
        first_appearance_chapter: 1,
      },
    ],
    facts_required: ["year is 2016"],
    forbidden_items: ["do not mention mini program"],
  };
}

test("v1.281 sentence pattern inertia catches repeated template prose without explanation keywords", () => {
  const inert = [
    "It was not a queue, but a test.",
    "It was not traffic, but proof.",
    "It was not luck, but a route.",
    "He picked up the paper, then crossed the room, then placed it beside the register.",
  ].join("\n");

  const result = analyzeSentencePatternInertia(inert);

  assert.ok(result.issue_count >= 2);
  assert.ok(result.issues.includes("sentence_pattern_inertia"));
  assert.ok(result.patterns.some((pattern) => pattern.id === "not_but_loop"));
  assert.ok(result.patterns.some((pattern) => pattern.id === "then_chain"));
});

test("v1.282 paragraph rhythm catches long same-type streaks", () => {
  const actionOnly = [
    "Lu Chuan picked up the paper and walked to the counter.",
    "Zhou slapped the towel down and stared at the screen.",
    "The students leaned forward and moved toward the window.",
    "The phone buzzed and the backend count jumped again.",
  ].join("\n\n");
  const dialogueOnly = [
    "\"Who clicked this?\" Zhou asked.",
    "\"The boys in line,\" Lu Chuan said.",
    "\"They paid?\"",
    "\"Already paid.\"",
    "\"Then why did no one tell me?\"",
  ].join("\n\n");

  const actionResult = analyzeParagraphRhythm(actionOnly);
  const dialogueResult = analyzeParagraphRhythm(dialogueOnly);

  assert.ok(actionResult.issues.includes("paragraph_rhythm_single_note"));
  assert.ok(actionResult.streaks.some((streak) => streak.type === "action" && streak.count >= 3));
  assert.ok(dialogueResult.issues.includes("dialogue_wall"));
  assert.ok(dialogueResult.streaks.some((streak) => streak.type === "dialogue" && streak.count >= 5));
});

test("v1.283 review quality flags include sentence and paragraph rhythm issues", async () => {
  const { root, project } = await createTempProject();
  try {
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return baseCard(task.chapter_no);
        if (task.task_type === "write_chapter") {
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: [
              "It was not a queue, but a test.",
              "It was not traffic, but proof.",
              "It was not luck, but a route.",
              "",
              "Lu Chuan picked up the paper and walked to the counter.",
              "",
              "Zhou slapped the towel down and stared at the screen.",
              "",
              "The students leaned forward and moved toward the window.",
              "",
              "The phone buzzed and the backend count jumped again.",
            ].join("\n"),
          };
        }
        if (task.task_type === "review_chapter") {
          return {
            grade: "B",
            next_action: "approve",
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

    const result = await runSingleChapterQualityLoop(project, 1, { router, maxRewrites: 0 });
    const report = JSON.parse(await readFile(result.quality_report_path, "utf8"));

    assert.equal(result.status, "stopped");
    assert.ok(report.review_quality_flags.includes("sentence_pattern_inertia"));
    assert.ok(report.review_quality_flags.includes("paragraph_rhythm_single_note"));
    assert.ok(report.review.issues.includes("sentence_pattern_inertia"));
    assert.ok(report.review.issues.includes("paragraph_rhythm_single_note"));
    const layerTypes = planRewriteLayers(report.review.issues).map((layer) => layer.type);
    assert.ok(layerTypes.includes("remove_explanation"));
    assert.ok(layerTypes.includes("drop_risk_repair"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
