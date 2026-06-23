import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildChapterContext,
  createProject,
  normalizeForeshadowingDebt,
  planRewriteLayers,
  runSingleChapterQualityLoop,
} from "../src/core/workflow.mjs";
import { writeJson } from "../src/core/fsx.mjs";
import { batchStateFile } from "../src/core/paths.mjs";

async function createTempProject(prefix = "novel-studio-v15-foreshadowing-debt-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.5 foreshadowing debt",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function batchStateWithDebt({ from = 27, to = 31 } = {}) {
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
        hook: "platform observer watches Lu Chuan",
        source_chapter: 27,
        due_chapter: 32,
        payoff_requirement: "platform representative must appear or apply pressure",
        confidence: 0.91,
      },
      {
        hook: "milk tea shop owner asks who owns the QR code",
        source: "chapter:29",
        due_in_chapters: 6,
        confidence: 0.85,
      },
    ],
    foreshadowing_resolved: [
      {
        hook: "milk tea shop owner asks who owns the QR code",
        source_chapter: 31,
        confidence: 0.9,
      },
    ],
    timeline: [],
    risks: [],
    low_confidence_candidates: [],
  };
}

function chapterCard(chapterNo = 32) {
  return {
    chapter_no: chapterNo,
    display_title: "创业中心的门开了",
    opening_hook: "创业中心老师让陆川带数据过去。",
    main_event: "陆川带着订单数据进入创业中心。",
    protagonist_action: "陆川拿订单表和现场反馈推进。",
    conflict: "老师怀疑学生项目只是短期热闹。",
    cool_point_type: "data_proof",
    visible_result: "创业中心愿意继续观察。",
    tail_hook: "创业中心老师的电话同时打了进来。",
    characters_in_scene: ["Lu Chuan", "Zhou"],
    facts_required: ["year is 2016"],
    forbidden_items: ["do not mention mini program"],
  };
}

test("v1.5 normalizeForeshadowingDebt derives source, due chapter, status, and payoff requirement", () => {
  const debt = normalizeForeshadowingDebt(
    {
      hook: "platform observer watches Lu Chuan",
      source: "chapter:27",
      due_in_chapters: 5,
      confidence: 0.91,
    },
    32,
  );

  assert.equal(debt.source_chapter, 27);
  assert.equal(debt.due_chapter, 32);
  assert.equal(debt.status, "due");
  assert.equal(debt.payoff_requirement, "progress or pay off this hook");
  assert.equal(debt.confidence, 0.91);
});

test("v1.5 buildChapterContext injects open, due, and resolved foreshadowing debts", async () => {
  const { root, project } = await createTempProject();
  try {
    await writeJson(batchStateFile(project, 27, 31), batchStateWithDebt());

    const context = await buildChapterContext(project, 32);

    assert.ok(context.foreshadowing_debts);
    assert.equal(context.foreshadowing_debts.window.from, 27);
    assert.equal(context.foreshadowing_debts.window.to, 31);
    assert.equal(context.foreshadowing_debts.open.length, 1);
    assert.equal(context.foreshadowing_debts.due.length, 1);
    assert.equal(context.foreshadowing_debts.resolved.length, 1);
    assert.equal(context.foreshadowing_debts.due[0].hook, "platform observer watches Lu Chuan");
    assert.equal(context.foreshadowing_debts.due[0].payoff_requirement, "platform representative must appear or apply pressure");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.5 due foreshadowing debt adds a quality flag, issue, and targeted rewrite layer", async () => {
  const { root, project } = await createTempProject("novel-studio-v15-quality-flag-");
  try {
    await writeJson(batchStateFile(project, 27, 31), batchStateWithDebt());
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return chapterCard(task.chapter_no);
        if (task.task_type === "write_chapter") {
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: "Lu Chuan brings the order table into the office. The teacher asks about the order curve.",
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

    const result = await runSingleChapterQualityLoop(project, 32, { router, maxRewrites: 0 });
    const report = JSON.parse(await readFile(result.quality_report_path, "utf8"));

    assert.equal(result.status, "approved");
    assert.ok(report.review_quality_flags.includes("foreshadowing_debt_due"));
    assert.ok(report.review.issues.includes("foreshadowing_debt_due"));
    assert.deepEqual(planRewriteLayers(report.review.issues).map((layer) => layer.type), ["foreshadowing_progress"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
