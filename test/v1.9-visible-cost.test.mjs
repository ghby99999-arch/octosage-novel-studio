import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  analyzeVisibleCost,
  createProject,
  planRewriteLayers,
  runSingleChapterQualityLoop,
} from "../src/core/workflow.mjs";

async function createTempProject(prefix = "novel-studio-v19-visible-cost-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.9 visible cost",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function costCard(chapterNo = 1) {
  return {
    chapter_no: chapterNo,
    display_title: "The win leaves a debt",
    opening_hook: "Lu Chuan turns the queue into orders.",
    main_event: "Lu Chuan wins merchant trust, but the win leaves a visible cost.",
    protagonist_action: "He exposes the order data to prove the route.",
    conflict: "The route works but draws school and merchant pressure.",
    cool_point_type: "visible_cost_after_win",
    visible_result: "The order backend jumps to 99.",
    visible_cost: "Zhou is misunderstood by nearby merchants and Lu Chuan owes him a public explanation.",
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

test("v1.9 analyzeVisibleCost distinguishes clean wins from wins with concrete cost", () => {
  const cleanWin = analyzeVisibleCost(
    "The backend jumps to 99. Everyone believes Lu Chuan. The route is proven and the merchant smiles.",
  );
  const costlyWin = analyzeVisibleCost(
    "The backend jumps to 99, but nearby merchants think Zhou stole their students. Lu Chuan wins the order route and owes Zhou a public explanation before evening.",
  );

  assert.equal(cleanWin.score, 0);
  assert.ok(cleanWin.issues.includes("visible_cost_missing"));
  assert.ok(costlyWin.score >= 2);
  assert.equal(costlyWin.issues.includes("visible_cost_missing"), false);
});

test("v1.9 missing visible cost adds review flag and targeted rewrite layer when card asks for it", async () => {
  const { root, project } = await createTempProject();
  try {
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return costCard(task.chapter_no);
        if (task.task_type === "write_chapter") {
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: "The backend jumps to 99. Everyone believes Lu Chuan. The route is proven and the merchant smiles.",
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
    assert.ok(report.review_quality_flags.includes("visible_cost_missing"));
    assert.ok(report.review.issues.includes("visible_cost_missing"));
    assert.deepEqual(planRewriteLayers(report.review.issues).map((layer) => layer.type), ["cost_visibility"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
