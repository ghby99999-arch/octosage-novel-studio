import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildWritingTaskPackage,
  createProject,
  detectTemplateOpeningInertia,
  generateOpeningHookCandidates,
  runSingleChapterQualityLoop,
  scoreOpeningHook,
} from "../src/core/workflow.mjs";
import { writeJson } from "../src/core/fsx.mjs";
import { chapterCardFile } from "../src/core/paths.mjs";

async function createTempProject(prefix = "novel-studio-v111-opening-hook-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.11 opening hook",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function hookCard(chapterNo = 1) {
  return {
    chapter_no: chapterNo,
    display_title: "First order catches fire",
    opening_hook: "The first order jumps out and Zhou drops a skewer into the charcoal.",
    main_event: "Lu Chuan turns a queue into an order route.",
    protagonist_action: "He pushes the order sheet across the counter.",
    conflict: "Zhou thinks students only make noise.",
    cool_point_type: "opening_hook_reversal",
    visible_result: "订单后台数字跳到 99",
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

test("v1.11 scoreOpeningHook rewards action-conflict openings and rejects static setup", () => {
  const strong = scoreOpeningHook("第一条订单跳出来的时候，老周手里的串掉进了炭火里。");
  const weak = scoreOpeningHook("2016 年的秋天，江城大学的梧桐叶开始变黄。");
  const explain = scoreOpeningHook("陆川是一个重生者，他回到了大学时代。");

  assert.ok(strong.score >= 80);
  assert.ok(strong.reasons.includes("concrete_action"));
  assert.ok(strong.reasons.includes("abnormal_or_conflict"));
  assert.ok(weak.score < 50);
  assert.ok(weak.issues.includes("static_environment_opening"));
  assert.ok(explain.issues.includes("exposition_opening"));
});

test("v1.11 generateOpeningHookCandidates returns ranked hook options from a chapter card", () => {
  const candidates = generateOpeningHookCandidates(hookCard());

  assert.ok(candidates.length >= 3);
  assert.equal(candidates[0].rank, 1);
  assert.ok(candidates[0].score >= candidates.at(-1).score);
  assert.ok(candidates.some((candidate) => candidate.text.includes("订单")));
  assert.ok(candidates.some((candidate) => candidate.text.includes("后台") || candidate.text.includes("counter")));
});

test("v1.11 generateOpeningHookCandidates blocks known repeated hard-coded openings", () => {
  const candidates = generateOpeningHookCandidates({
    ...hookCard(),
    opening_hook: "张明轩刚要骂人，后台数字先跳了出来。",
  });
  const joined = candidates.map((candidate) => candidate.text).join("\n");

  assert.ok(candidates.length >= 3);
  assert.equal(joined.includes("刚要骂人，后台数字先跳了出来"), false);
  assert.equal(joined.includes("后台数字先跳了出来"), false);
  assert.equal(joined.includes("手里的串掉进了炭火里"), false);
});

test("v1.11 detectTemplateOpeningInertia flags repeated generated openings in existing drafts", () => {
  const hits = detectTemplateOpeningInertia("张明轩刚要骂人，后台数字先跳了出来。\n\n他站在茶摊前。");

  assert.equal(hits.length > 0, true);
  assert.equal(hits[0].issue, "template_opening_inertia");
});

test("v1.11 hard template opening triggers automatic rewrite even when reviewer is lenient", async () => {
  const { root, project } = await createTempProject("novel-studio-v111-template-rewrite-");
  let rewritten = false;
  try {
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return hookCard(1);
        if (task.task_type === "write_chapter" || task.task_type === "rewrite_chapter") {
          if (task.rewrite_strategy) {
            rewritten = true;
            return {
              text: "库存预警刚跳出来，张明轩已经把发霉茶饼推到炉边。\n\n他没解释穿越，只盯着茶饼的霉斑分布。",
            };
          }
          return {
            text: "张明轩刚要骂人，后台数字先跳了出来。\n\n他站在茶摊前。",
          };
        }
        if (task.task_type === "review_chapter") {
          return { grade: "A", next_action: "approve", issues: [] };
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
        return {};
      },
    };

    const result = await runSingleChapterQualityLoop(project, 1, { router, maxRewrites: 1 });

    assert.equal(rewritten, true);
    assert.equal(result.status, "stopped");
    assert.equal(result.final_grade, "D");
    assert.equal(result.rewrite_count, 1);
    assert.equal(result.stop?.reason, "max_rewrites_exhausted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.11 hard template rewrite progress explains automatic rework stages", async () => {
  const { root, project } = await createTempProject("novel-studio-v111-template-progress-");
  const progressEvents = [];
  try {
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return hookCard(1);
        if (task.task_type === "write_chapter" || task.task_type === "rewrite_chapter") {
          return {
            text: task.rewrite_strategy
              ? "库存预警刚跳出来，张明轩已经把发霉茶饼推到炉边。"
              : "张明轩刚要骂人，后台数字先跳了出来。\n\n他站在茶摊前。",
          };
        }
        if (task.task_type === "review_chapter") {
          return { grade: "A", next_action: "approve", issues: [] };
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
        return {};
      },
    };

    await runSingleChapterQualityLoop(project, 1, {
      router,
      maxRewrites: 1,
      onProgress: (progress) => progressEvents.push(progress),
    });

    const hardRuleEvent = progressEvents.find((item) =>
      (item.quality_events || []).some((event) => event.key === "template_opening_inertia"),
    );
    const rewriteEvent = progressEvents.find((item) =>
      (item.quality_events || []).some((event) => event.key === "auto_rewrite" && event.status === "running"),
    );
    const passedEvent = progressEvents.find((item) =>
      (item.quality_events || []).some((event) => event.key === "rereview" && event.status === "running"),
    );

    assert.ok(hardRuleEvent);
    assert.ok(rewriteEvent);
    assert.ok(passedEvent);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.11 buildWritingTaskPackage includes opening hook candidates for real drafting", async () => {
  const { root, project } = await createTempProject();
  try {
    const card = hookCard(1);
    await writeJson(chapterCardFile(project, 1), card);

    const taskPackage = await buildWritingTaskPackage(project, 1, { force: true });

    assert.ok(taskPackage.opening_hook_candidates);
    assert.ok(taskPackage.opening_hook_candidates.candidates.length >= 3);
    assert.equal(taskPackage.opening_hook_candidates.use_first_300_chars, true);
    assert.ok(taskPackage.opening_hook_candidates.rules.some((rule) => rule.includes("300")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
