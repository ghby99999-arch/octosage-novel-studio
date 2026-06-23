import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  runSingleChapterQualityLoop,
} from "../src/core/workflow.mjs";

async function createTempProject(prefix = "novel-studio-v122-rhythm-repair-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.22 rhythm repair context",
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

const flatDraft = [
  "The morning was quiet and the campus road looked normal.",
  "Lu Chuan understood the business opportunity. He knew the market had value and he realized the platform logic mattered.",
  "This section explains the same business model again. No one moves and no one speaks.",
  "The chapter ends after he decides to work harder tomorrow.",
].join("\n\n");

const repairedDraft = [
  "The backend beeped before Zhou could curse.",
  "\"Who paid?\" Zhou asked.",
  "Everyone thought the students were joking, but the count jumped from 0 to 37 and the queue stopped laughing.",
  "Someone behind the milk-tea wall watched the screen, but Lu Chuan did not see him.",
].join("\n\n");

test("v1.22 quality report records rhythm transfer compliance checks", async () => {
  const { root, project } = await createTempProject();
  try {
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return rhythmCard(task.chapter_no);
        if (task.task_type === "write_chapter") return { chapter_no: task.chapter_card.chapter_no, text: flatDraft };
        if (task.task_type === "review_chapter") {
          return { grade: "B", next_action: "approve", issues: [] };
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

    assert.ok(report.rhythm_transfer_compliance);
    assert.equal(report.rhythm_transfer_compliance.reference_name, "benchmark-rhythm");
    assert.ok(report.rhythm_transfer_compliance.issues.includes("rhythm_opening_mismatch"));
    assert.equal(report.rhythm_transfer_compliance.checks.opening_pattern.expected, "data_result");
    assert.equal(report.rhythm_transfer_compliance.checks.opening_pattern.ok, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.22 rhythm transfer rewrite focus includes compliance repair context", async () => {
  const { root, project } = await createTempProject("novel-studio-v122-rewrite-");
  const writeTasks = [];
  try {
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return rhythmCard(task.chapter_no);
        if (task.task_type === "write_chapter") {
          writeTasks.push(task);
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: task.rewrite_focus?.type === "rhythm_transfer_repair" ? repairedDraft : flatDraft,
          };
        }
        if (task.task_type === "review_chapter") {
          const repaired = task.text.includes("count jumped from 0 to 37");
          return {
            grade: repaired ? "B" : "D",
            next_action: repaired ? "approve" : "rewrite_chapter",
            issues: repaired ? [] : ["rhythm_opening_mismatch", "rhythm_beat_missing"],
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

    const result = await runSingleChapterQualityLoop(project, 1, { router, maxRewrites: 1 });
    assert.equal(result.status, "approved");
    const rewriteTask = writeTasks.find((task) => task.draft_mode === "strong");
    assert.equal(rewriteTask.rewrite_focus.type, "rhythm_transfer_repair");
    assert.ok(rewriteTask.rewrite_focus.rhythm_transfer_compliance);
    assert.ok(rewriteTask.rewrite_focus.rhythm_transfer_compliance.issues.includes("rhythm_opening_mismatch"));
    assert.equal(
      rewriteTask.rewrite_focus.rhythm_transfer_compliance.checks.opening_pattern.expected,
      "data_result",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
