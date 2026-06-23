import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildChapterContext,
  createProject,
  normalizeInformationGap,
  planRewriteLayers,
  runSingleChapterQualityLoop,
} from "../src/core/workflow.mjs";
import { writeJson } from "../src/core/fsx.mjs";
import { batchStateFile } from "../src/core/paths.mjs";

async function createTempProject(prefix = "novel-studio-v110-information-gap-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.10 information gap",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function batchStateWithInformationGap({ from = 10, to = 14 } = {}) {
  return {
    meta: {
      from,
      to,
      source_files: [],
      confidence_threshold: 0.7,
      created_at: "2026-05-23T00:00:00.000Z",
    },
    characters: [],
    relationships: [],
    business_state: [],
    money_orders: [],
    foreshadowing_added: [
      {
        type: "information_gap",
        hook: "milk tea owner prepares to copy Zhou's QR route",
        reader_knows: "milk tea owner has photographed Zhou's QR code",
        protagonist_blindspot: "Lu Chuan does not know the milk tea owner has the photo",
        holders: ["reader", "milk tea owner"],
        unaware: ["Lu Chuan", "Zhou"],
        reveal_window: { earliest_chapter: 17, latest_chapter: 20 },
        handling_policy: "keep_secret_but_escalate_clues",
        clue_policy: "show the milk tea owner asking one indirect question; do not let Lu Chuan identify the threat yet",
        confidence: 0.92,
      },
    ],
    foreshadowing_resolved: [],
    timeline: [],
    risks: [],
    low_confidence_candidates: [],
  };
}

function gapCard(chapterNo = 16) {
  return {
    chapter_no: chapterNo,
    display_title: "Someone asks about the QR code",
    opening_hook: "A milk tea owner asks one indirect question about Zhou's QR route.",
    main_event: "Lu Chuan advances the order route while the hidden threat gets closer.",
    protagonist_action: "He checks orders without realizing the owner has already photographed the code.",
    conflict: "The threat should remain hidden from Lu Chuan this chapter.",
    cool_point_type: "hidden_information_gap",
    visible_result: "The route keeps growing.",
    tail_hook: "Zhou 后台订单数字突然跳到 99，创业中心老师电话同时打进来。",
    characters_in_scene: ["Lu Chuan", "Zhou", "milk tea owner"],
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

test("v1.10 normalizeInformationGap preserves holders, blindspot, reveal window, and policy", () => {
  const gap = normalizeInformationGap(
    {
      type: "information_gap",
      hook: "milk tea owner prepares to copy Zhou's QR route",
      reader_knows: "milk tea owner has photographed Zhou's QR code",
      protagonist_blindspot: "Lu Chuan does not know the milk tea owner has the photo",
      holders: ["reader", "milk tea owner"],
      unaware: ["Lu Chuan", "Zhou"],
      reveal_window: { earliest_chapter: 17, latest_chapter: 20 },
      handling_policy: "keep_secret_but_escalate_clues",
      clue_policy: "one indirect question only",
      source_chapter: 12,
      confidence: 0.92,
    },
    16,
  );

  assert.equal(gap.status, "active_hidden");
  assert.equal(gap.source_chapter, 12);
  assert.equal(gap.reveal_window.earliest_chapter, 17);
  assert.equal(gap.reveal_window.latest_chapter, 20);
  assert.ok(gap.holders.includes("reader"));
  assert.ok(gap.unaware.includes("Lu Chuan"));
  assert.equal(gap.handling_policy, "keep_secret_but_escalate_clues");
});

test("v1.10 buildChapterContext injects active information gaps separate from generic debts", async () => {
  const { root, project } = await createTempProject();
  try {
    await writeJson(batchStateFile(project, 10, 14), batchStateWithInformationGap());

    const context = await buildChapterContext(project, 15);

    assert.ok(context.information_gaps);
    assert.equal(context.information_gaps.active.length, 1);
    assert.equal(context.information_gaps.active[0].status, "active_hidden");
    assert.equal(context.information_gaps.active[0].reader_knows, "milk tea owner has photographed Zhou's QR code");
    assert.equal(context.information_gaps.active[0].protagonist_blindspot, "Lu Chuan does not know the milk tea owner has the photo");
    assert.equal(context.foreshadowing_debts.open.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.10 premature reveal before reveal window adds quality flag and rewrite layer", async () => {
  const { root, project } = await createTempProject("novel-studio-v110-premature-reveal-");
  try {
    await writeJson(batchStateFile(project, 11, 15), batchStateWithInformationGap({ from: 11, to: 15 }));
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return gapCard(task.chapter_no);
        if (task.task_type === "write_chapter") {
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: "Lu Chuan realizes the milk tea owner has photographed Zhou's QR code and immediately identifies the threat.",
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

    const result = await runSingleChapterQualityLoop(project, 16, { router, maxRewrites: 0 });
    const report = JSON.parse(await readFile(result.quality_report_path, "utf8"));

    assert.equal(result.status, "approved");
    assert.ok(report.review_quality_flags.includes("information_gap_premature_reveal"));
    assert.ok(report.review.issues.includes("information_gap_premature_reveal"));
    assert.deepEqual(planRewriteLayers(report.review.issues).map((layer) => layer.type), ["information_gap_control"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
