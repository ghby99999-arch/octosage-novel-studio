import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  analyzeRhythmTransferCompliance,
  createProject,
  planRewriteLayers,
  runSingleChapterQualityLoop,
} from "../src/core/workflow.mjs";

async function createTempProject(prefix = "novel-studio-v121-rhythm-compliance-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.21 rhythm compliance",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function rhythmCard(chapterNo = 1) {
  return {
    chapter_no: chapterNo,
    display_title: "The screen should move first",
    opening_hook: "The backend order jumps before Zhou can curse.",
    main_event: "Lu Chuan turns misjudgment into visible order data.",
    protagonist_action: "He pushes the order sheet across the counter.",
    conflict: "Zhou thinks the students are joking.",
    cool_point_type: "misjudgment_payoff",
    visible_result: "The backend count jumps from 0 to 37.",
    tail_hook: "Someone behind the milk-tea wall watched the screen, but Lu Chuan did not see him.",
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
    forbidden_items: ["do not copy reference prose"],
    rhythm_transfer: {
      reference_name: "benchmark-rhythm",
      opening_pattern: "data_result",
      tail_hook_type: "information_gap",
      beat_constraints: ["misread_then_result", "data_payoff"],
      dialogue_ratio_target: { min: 0.08, target: 0.16, max: 0.24 },
      avg_paragraph_chars_target: { min: 40, target: 90, max: 140 },
      micro_hook_density_min: 1.2,
      drop_risk_segments_max: 0,
      copy_policy: "rhythm_and_structure_only",
    },
  };
}

test("v1.21 analyzeRhythmTransferCompliance flags prose that misses transferred rhythm constraints", () => {
  const flatText = [
    "The morning was quiet and the campus road looked normal.",
    "Lu Chuan understood the business opportunity. He knew the market had value and he realized the platform logic mattered.",
    "This section explains the same business model again. No one moves and no one speaks.",
    "The chapter ends after he decides to work harder tomorrow.",
  ].join("\n\n");

  const result = analyzeRhythmTransferCompliance(flatText, rhythmCard());

  assert.ok(result.issues.includes("rhythm_opening_mismatch"));
  assert.ok(result.issues.includes("rhythm_tail_hook_mismatch"));
  assert.ok(result.issues.includes("rhythm_beat_missing"));
  assert.ok(result.issues.includes("rhythm_dialogue_ratio_off"));
  assert.ok(result.issues.includes("rhythm_micro_hook_low"));
  assert.ok(result.issues.includes("rhythm_drop_risk_high"));
});

test("v1.21 rhythm transfer issues map to a targeted rewrite layer", () => {
  const layers = planRewriteLayers([
    "rhythm_opening_mismatch",
    "rhythm_tail_hook_mismatch",
    "rhythm_beat_missing",
  ]);

  assert.deepEqual(layers.map((layer) => layer.type), ["rhythm_transfer_repair"]);
});

test("v1.21 rhythm transfer deviations enter review quality flags", async () => {
  const { root, project } = await createTempProject();
  try {
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return rhythmCard(task.chapter_no);
        if (task.task_type === "write_chapter") {
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: [
              "The morning was quiet and the campus road looked normal.",
              "Lu Chuan understood the business opportunity. He knew the market had value and he realized the platform logic mattered.",
              "This section explains the same business model again. No one moves and no one speaks.",
              "The chapter ends after he decides to work harder tomorrow.",
            ].join("\n\n"),
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
    assert.ok(report.review_quality_flags.includes("rhythm_transfer_deviation"));
    assert.ok(report.review.issues.includes("rhythm_opening_mismatch"));
    assert.ok(report.review.issues.includes("rhythm_beat_missing"));
    assert.ok(planRewriteLayers(report.review.issues).some((layer) => layer.type === "rhythm_transfer_repair"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
