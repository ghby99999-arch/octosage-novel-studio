import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  analyzeReversalDensity,
  createProject,
  planRewriteLayers,
  runSingleChapterQualityLoop,
} from "../src/core/workflow.mjs";

async function createTempProject(prefix = "novel-studio-v18-reversal-density-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.8 reversal density",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function reversalCard(chapterNo = 1) {
  return {
    chapter_no: chapterNo,
    display_title: "The queue is not the business",
    opening_hook: "Everyone thinks Lu Chuan is only watching a lunch queue.",
    main_event: "Lu Chuan turns mockery into order validation.",
    protagonist_action: "He lets people misread him, then reveals the order backend.",
    conflict: "Classmates think he is wasting time.",
    cool_point_type: "expectation_reversal",
    visible_result: "The backend proves the queue is money.",
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

test("v1.8 analyzeReversalDensity distinguishes flat task prose from reversal-heavy prose", () => {
  const flat = analyzeReversalDensity(
    "Lu Chuan writes the order list. Zhou reads it. The students wait. The order count grows.",
  );
  const strong = analyzeReversalDensity(
    "Everyone thought Lu Chuan was wasting time, but the order backend jumped to 99. Zhou was about to scold him, then suddenly refreshed the backend faster than anyone.",
  );

  assert.equal(flat.score, 0);
  assert.ok(flat.issues.includes("reversal_density_low"));
  assert.ok(strong.score >= 2);
  assert.equal(strong.issues.includes("reversal_density_low"), false);
});

test("v1.8 low reversal density adds review flag and pace rewrite layer when card asks for reversal", async () => {
  const { root, project } = await createTempProject();
  try {
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return reversalCard(task.chapter_no);
        if (task.task_type === "write_chapter") {
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: "Lu Chuan writes the order list. Zhou reads it. The students wait. The order count grows.",
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

    assert.equal(result.status, "approved");
    assert.ok(report.review_quality_flags.includes("reversal_density_low"));
    assert.ok(report.review.issues.includes("reversal_density_low"));
    assert.deepEqual(planRewriteLayers(report.review.issues).map((layer) => layer.type), ["pace_tightening"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
