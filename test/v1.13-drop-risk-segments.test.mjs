import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  analyzeDropRiskSegments,
  createProject,
  planRewriteLayers,
  runSingleChapterQualityLoop,
} from "../src/core/workflow.mjs";

async function createTempProject(prefix = "novel-studio-v113-drop-risk-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.13 drop risk",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function baseCard(chapterNo = 1) {
  return {
    chapter_no: chapterNo,
    display_title: "Orders should move on screen",
    opening_hook: "The first backend order jumps before Zhou can finish cursing.",
    main_event: "Lu Chuan turns a queue into a visible order route.",
    protagonist_action: "He pushes the order sheet across the counter.",
    conflict: "Zhou thinks students only make noise.",
    cool_point_type: "misjudgment_payoff",
    visible_result: "The backend count jumps from 0 to 99.",
    tail_hook: "Zhou 后台订单数字突然跳到 99，创业中心老师电话同时打进来。",
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

function boringBlock(index) {
  return [
    `This section explains the business model again for the ${index} time.`,
    "Lu Chuan knew the opportunity was important. He realized the campus service market had value.",
    "This meant the order route could become a platform. He understood that merchants needed traffic.",
    "The same information about students, merchants, traffic, and future local services is repeated here.",
    "It was a rule, a responsibility, and a strategy, but no one moved and no one spoke.",
  ].join(" ");
}

function repeatText(paragraphs, minLength = 700) {
  const base = Array.isArray(paragraphs) ? paragraphs.join("\n\n") : String(paragraphs || "");
  const copies = [];
  while (copies.join("\n\n").length < minLength) copies.push(base);
  return copies.join("\n\n");
}

test("v1.13 analyzeDropRiskSegments marks explanation-heavy blocks as high risk", () => {
  const riskyText = [boringBlock(1), boringBlock(2), boringBlock(3), boringBlock(4)].join("\n\n");

  const result = analyzeDropRiskSegments(riskyText, { segmentSize: 220 });

  assert.ok(result.risky_segment_count >= 2);
  assert.ok(result.issues.includes("drop_risk_segments"));
  assert.ok(result.segments.some((segment) => segment.risk_points >= 3));
  assert.ok(result.segments.some((segment) => segment.reasons.includes("no_dialogue_streak")));
  assert.ok(result.segments.some((segment) => segment.reasons.includes("exposition_heavy")));
});

test("v1.13 analyzeDropRiskSegments keeps action-dialogue-result prose below the rewrite line", () => {
  const activeText = [
    "The backend beeped. Zhou slapped the greasy towel on the counter and stared at the new order.",
    "\"Who clicked this?\" he asked.",
    "Lu Chuan pushed the paper forward. \"The boys in line. They already paid.\"",
    "Zhou cursed, but his thumb refreshed the screen twice before the charcoal sparked.",
    "The count moved from 7 to 19. The queue outside stopped laughing and leaned toward the counter.",
  ].join("\n\n");

  const result = analyzeDropRiskSegments(activeText, { segmentSize: 180 });

  assert.equal(result.issues.includes("drop_risk_segments"), false);
  assert.equal(result.risky_segment_count, 0);
});

test("v1.13 drop-risk review flag feeds targeted pacing rewrite", async () => {
  const { root, project } = await createTempProject();
  try {
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return baseCard(task.chapter_no);
        if (task.task_type === "write_chapter") {
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: [boringBlock(1), boringBlock(2), boringBlock(3), boringBlock(4)].join("\n\n"),
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
    assert.ok(report.review_quality_flags.includes("drop_risk_segments"));
    assert.ok(report.review.issues.includes("drop_risk_segments"));
    assert.equal(planRewriteLayers(report.review.issues)[0].type, "drop_risk_repair");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.13 red-marked review segments trigger automatic targeted rewrite before approval", async () => {
  const { root, project } = await createTempProject("novel-studio-v113-inline-risk-");
  try {
    const calls = [];
    let writeCount = 0;
    let reviewCount = 0;
    const riskySentence = "Qian Wu stayed quiet and kept rubbing the same coin.";
    const originalText = repeatText([
      riskySentence,
      "The queue outside kept growing, but the scene stayed in description instead of action.",
      "Lu Chuan watched everyone talk about the business without forcing a visible change.",
    ], 720);
    const repairedText = repeatText([
      "The third student slapped payment onto the counter before Qian Wu could rub the coin again.",
      "\"Count it again,\" Lu Chuan said.",
      "The order number on the paper jumped from 7 to 19.",
      "Qian Wu stopped smiling.",
      "\"Who paid first?\"",
      "The queue outside moved two steps forward. A girl raised her phone and shouted her order number.",
      "Lu Chuan pressed the route sheet beside the money box. \"You roast. I stop them from yelling.\"",
      "The phone buzzed again.",
      "Then the campus office teacher pushed through the line with a complaint form in her hand.",
      "\"Which one of you made the queue quiet?\"",
      "Qian Wu finally looked at Lu Chuan.",
      "Lu Chuan pointed at the order screen. \"Ask the number. It tells the truth faster than people.\"",
    ], 720);

    const router = {
      async invoke(task) {
        calls.push(task);
        if (task.task_type === "generate_chapter_card") return baseCard(task.chapter_no);
        if (task.task_type === "write_chapter" || task.task_type === "rewrite_chapter") {
          writeCount += 1;
          if (task.task_type === "rewrite_chapter") assert.ok(["targeted_rewrite", "segment_patch"].includes(task.rewrite_strategy));
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: writeCount === 1 ? originalText : repairedText,
          };
        }
        if (task.task_type === "review_chapter") {
          reviewCount += 1;
          return reviewCount === 1
            ? {
              grade: "B",
              next_action: "approve",
              issues: [],
              risky_segments: [
                {
                  preview: riskySentence,
                  reasons: ["static_sentence", "no_scene_change"],
                  risk_points: 2,
                },
              ],
            }
            : {
              grade: "B",
              next_action: "approve",
              issues: [],
              risky_segments: [],
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

    const result = await runSingleChapterQualityLoop(project, 1, { router, maxRewrites: 2 });
    const report = JSON.parse(await readFile(result.quality_report_path, "utf8"));
    const rewriteCall = calls.find((task) => ["targeted_rewrite", "segment_patch"].includes(task.rewrite_strategy));

    assert.equal(result.status, "approved");
    assert.equal(result.rewrite_count, 1);
    assert.ok(writeCount >= 2);
    assert.ok(report.cumulative_review_quality_flags.includes("inline_risk_segments"));
    assert.equal(report.review.risky_segments?.length || 0, 0);
    assert.equal(rewriteCall?.rewrite_focus?.type, "drop_risk_repair");
    assert.ok(rewriteCall?.rewrite_focus?.risk_segments?.some((segment) => segment.preview === riskySentence));
    if (rewriteCall.rewrite_strategy === "segment_patch") {
      assert.equal(rewriteCall.source_draft_text, riskySentence);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.13 A-grade chapters still rewrite until publish gate is ready", async () => {
  const { root, project } = await createTempProject("novel-studio-v113-publish-gate-");
  try {
    const calls = [];
    let writeCount = 0;
    let reviewCount = 0;
    const weakText = repeatText([
      "Lu Chuan looked at the queue and understood the chance.",
      "The business was important. The market was valuable. Everyone would need this service.",
      "He explained the model again and waited for people to believe him.",
      "The queue stayed noisy while Zhou counted the same coins twice.",
      "No order changed, no person moved, and the page sounded like a plan instead of a scene.",
      "Lu Chuan finally pressed the route sheet onto the counter and waited.",
      "The old fan above the stall clicked three times.",
      "A student at the end of the line shouted that his rice was getting cold.",
      "Zhou looked up, but the paragraph still had not forced him to choose.",
      "Lu Chuan counted the same three orders again and said the path would work soon.",
      "The narration explained the opportunity instead of making Zhou or the students change.",
      "Another student complained, but the page returned to the value of the model.",
      "The stall smelled of oil, the line moved slowly, and the prose kept describing the market.",
      "Lu Chuan knew the future was coming, yet nobody in the scene paid a visible cost.",
      "Zhou rubbed the coin again. The order paper stayed flat on the counter.",
      "The chapter needed a turn, but this weak sample deliberately kept talking around it.",
    ], 720);
    const publishReadyText = repeatText([
      "The phone on Zhou's counter buzzed before Lu Chuan finished writing the last name.",
      "\"Another one?\" Zhou wiped his hand on the apron.",
      "Lu Chuan pointed at the students outside. \"Three paid, two added spice, one asks you not to burn it.\"",
      "The girl at the front raised her phone. \"Boss, mine is order seventeen.\"",
      "Zhou stopped laughing.",
      "A second buzz followed.",
      "Then a third.",
      "The old order pad slid off the counter. Lu Chuan caught it and pressed the new route sheet down.",
      "\"You roast. I keep them from yelling.\"",
      "Zhou looked past him. The queue had stopped pushing. Every student was staring at the same order number.",
      "At the end of the line, the campus office teacher took a photo of the screen.",
      "\"Who built this?\" she asked.",
      "Lu Chuan did not turn around.",
      "\"Depends,\" he said. \"Are you here to stop it, or ask why your complaint count just dropped?\"",
      "The phone buzzed again before she answered.",
      "Order twenty-one appeared with a paid note.",
      "Zhou grabbed a fresh skewer and cursed under his breath.",
      "\"If this keeps working, tomorrow they all come to me.\"",
      "Lu Chuan folded the route sheet once.",
      "\"No,\" he said. \"Tomorrow they come to whoever can keep up.\"",
    ], 900);

    const router = {
      async invoke(task) {
        calls.push(task);
        if (task.task_type === "generate_chapter_card") return baseCard(task.chapter_no);
        if (task.task_type === "write_chapter" || task.task_type === "rewrite_chapter") {
          writeCount += 1;
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: writeCount === 1 ? weakText : publishReadyText,
          };
        }
        if (task.task_type === "review_chapter") {
          reviewCount += 1;
          return {
            grade: "A",
            next_action: "approve",
            issues: [],
            scores: {
              opening_hook: 85,
              logic_consistency: 85,
              coolpoint_delivery: 85,
              tail_hook: 85,
              ai_taste: 85,
              publish_readiness: 85,
            },
            risky_segments: [],
            keep: ["visible order movement"],
            remove: ["static explanation"],
            rewrite_direction: "Keep the visible order scene and repair only the publish-gate blockers if local metrics still fail.",
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

    const result = await runSingleChapterQualityLoop(project, 1, { router, maxRewrites: 2 });
    const report = JSON.parse(await readFile(result.quality_report_path, "utf8"));
    const rewriteCall = calls.find((task) => ["targeted_rewrite", "segment_patch"].includes(task.rewrite_strategy));

    assert.equal(result.status, "approved");
    assert.ok(result.rewrite_count >= 1);
    assert.ok(report.cumulative_review_quality_flags.includes("publish_gate_not_ready"));
    assert.ok(rewriteCall?.rewrite_focus?.type);
    assert.equal(report.publish_gate?.publish_ready, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
