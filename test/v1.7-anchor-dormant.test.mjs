import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  characterAnchorUsage,
  createProject,
  planRewriteLayers,
  runSingleChapterQualityLoop,
} from "../src/core/workflow.mjs";
import { writeJson } from "../src/core/fsx.mjs";
import { batchStateFile } from "../src/core/paths.mjs";

async function createTempProject(prefix = "novel-studio-v17-anchor-dormant-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.7 anchor dormant",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function batchStateWithDormantAnchor() {
  return {
    meta: {
      from: 20,
      to: 24,
      source_files: [],
      confidence_threshold: 0.7,
      created_at: "2026-05-23T00:00:00.000Z",
    },
    characters: [
      {
        name: "Zhou",
        anchor: "hard-mouthed but watches backend orders faster than anyone",
        signature_action: "refreshes backend while pretending not to care",
        signature_line: "Students only make noise.",
        source_chapter: 3,
        confidence: 0.9,
      },
    ],
    relationships: [],
    business_state: [],
    money_orders: [],
    foreshadowing_added: [],
    foreshadowing_resolved: [],
    timeline: [],
    risks: [],
    low_confidence_candidates: [],
  };
}

function cardWithZhou(chapterNo = 25) {
  return {
    chapter_no: chapterNo,
    display_title: "The old merchant returns",
    opening_hook: "Zhou enters the office again.",
    main_event: "Lu Chuan asks Zhou to help verify a new order route.",
    protagonist_action: "Lu Chuan puts the order backend in front of Zhou.",
    conflict: "Zhou does not want to admit he cares.",
    cool_point_type: "character_echo",
    visible_result: "The route gets verified.",
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
        first_appearance_chapter: 3,
      },
    ],
    facts_required: ["year is 2016"],
    forbidden_items: ["do not mention mini program"],
  };
}

test("v1.7 characterAnchorUsage marks old unfulfilled anchors as dormant", () => {
  const usage = characterAnchorUsage(
    {
      name: "Zhou",
      contradiction: "hard-mouthed but watches backend orders faster than anyone",
      signature_action: "refreshes backend while pretending not to care",
      signature_line: "Students only make noise.",
      source_chapter: 3,
    },
    "Zhou walks in and says hello. The scene moves on.",
    25,
  );
  const realized = characterAnchorUsage(
    {
      name: "Zhou",
      contradiction: "hard-mouthed but watches backend orders faster than anyone",
      signature_action: "refreshes backend while pretending not to care",
      signature_line: "Students only make noise.",
      source_chapter: 3,
    },
    "Zhou says students only make noise, but his hand refreshes the backend before anyone else.",
    25,
  );

  assert.equal(usage.dormant, true);
  assert.equal(usage.realized, false);
  assert.equal(realized.dormant, false);
  assert.equal(realized.realized, true);
});

test("v1.7 dormant character anchor adds review flag and character rewrite layer", async () => {
  const { root, project } = await createTempProject();
  try {
    await writeJson(batchStateFile(project, 20, 24), batchStateWithDormantAnchor());
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return cardWithZhou(task.chapter_no);
        if (task.task_type === "write_chapter") {
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: "Zhou walks in and says hello. Lu Chuan shows him the order table. The route gets verified.",
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

    const result = await runSingleChapterQualityLoop(project, 25, { router, maxRewrites: 0 });
    const report = JSON.parse(await readFile(result.quality_report_path, "utf8"));

    assert.equal(result.status, "approved");
    assert.ok(report.review_quality_flags.includes("anchor_dormant"));
    assert.ok(report.review.issues.includes("anchor_dormant"));
    assert.deepEqual(planRewriteLayers(report.review.issues).map((layer) => layer.type), ["character_voice"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
