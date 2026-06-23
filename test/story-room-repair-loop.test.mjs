import test from "node:test";
import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  __test_repairTaxonomyForIssue,
  __test_targetedRepairIssues,
  createProject,
  planRewriteLayers,
  rewriteChapterSmart,
} from "../src/core/workflow.mjs";
import { chapterCardFile, draftFile } from "../src/core/paths.mjs";

test("story-room publish blocker becomes a focused repair pass before generic grade lift", () => {
  const review = {
    grade: "A",
    publish_gate: {
      publish_ready: false,
      blockers: ["review_grade_below_publish", "story_room_contract_not_delivered"],
    },
    issues: [],
  };

  const issues = __test_targetedRepairIssues(review);
  assert.equal(issues[0], "story_room_contract_not_delivered");

  const layers = planRewriteLayers(issues);
  assert.equal(layers[0].type, "story_room_contract_repair");
  assert.match(layers[0].instruction, /public_feedback/);
  assert.match(layers[0].instruction, /cost_residue/);
  assert.match(layers[0].instruction, /relationship_shift/);
  assert.match(layers[0].instruction, /chapter_debt/);
});

test("story-room blocker has its own repair taxonomy for progress UI", () => {
  assert.deepEqual(
    __test_repairTaxonomyForIssue("story_room_contract_not_delivered"),
    {
      key: "story_room_contract",
      label: "章卡承诺落地",
      stage_label: "补章卡承诺",
      repair_type: "story_room_contract_repair",
      ui_color: "emerald",
      requires_rereview: true,
    },
  );
});

test("story-room repair uses a localized segment patch instead of full chapter rewrite", async () => {
  const root = path.join(process.cwd(), ".tmp-story-room-local-repair");
  await rm(root, { recursive: true, force: true });
  try {
    const project = await createProject({
      root,
      title: "大宋茶账",
      idea: "穿越宋朝，用账册茶引做茶叶生意",
      genre: "历史经商",
      platform: "fanqie",
      protagonist_name: "张青",
      supporting_characters: "赵老板,官差",
      initializePlanning: false,
    });
    const card = {
      chapter_no: 1,
      display_title: "账本先响",
      opening_hook: "张青把账本摊到茶摊桌上，赵老板的笑声先停了。",
      main_event: "张青用账本和三张茶引证明第一批茶货能避开压价。",
      protagonist_action: "张青当场核账、比对茶引、让伙计去码头问价。",
      conflict: "赵老板不信一个落魄书生懂茶货账目。",
      cool_point_type: "现场证据反转",
      visible_result: "赵老板同意先给两担茶试跑。",
      tail_hook: "官差突然把一张缺印的茶引拍到桌上。",
      public_feedback: "赵老板当场改口，同意先给两担茶试跑，茶摊伙计也停下手看账本。",
      cost_residue: "张青押下最后三贯钱，若茶引出错就要赔掉全部本钱。",
      relationship_shift: "赵老板从嘲笑变成试探，愿意让张青先碰一笔小单。",
      chapter_debt: "章尾官差拿出缺印茶引，逼张青下一章解释凭证来源。",
      characters_in_scene: ["张青", "赵老板", "官差"],
      character_anchors: [
        {
          name: "张青",
          surface: "落魄书生",
          core: "会用账册和茶引破局",
          anchor: "核账时先摸账角",
          signature_action: "把账本推到对方面前",
          signature_line: "账不会替人撒谎。",
        },
      ],
      facts_required: ["北宋茶引制度存在限制", "张青只剩三贯钱"],
      forbidden_items: ["不得用现代软件解释能力"],
      target_words: 1800,
    };
    await writeFile(chapterCardFile(project, 1), `${JSON.stringify(card, null, 2)}\n`, "utf8");
    const source = [
      "张青把账本摊到茶摊桌上，赵老板的笑声先停了。",
      "",
      ...Array.from({ length: 40 }, (_, index) => `茶摊旁第${index + 1}个伙计来回添水，账本上的旧墨还没干，张青没有解释来历，只把茶引号码一行行对过去。`),
      "",
      "他知道茶叶生意有机会，也明白未来商业的价值。",
      "",
      "张青讲完自己的判断，赵老板听着没有说话。",
      "",
      "事情看起来暂时结束，茶摊外的风吹过旗子。",
      "",
      "张青收起账本，准备明天再来。",
    ].join("\n");
    await writeFile(draftFile(project, 1, "v1"), source, "utf8");

    const calls = [];
    const router = {
      async invoke(task) {
        calls.push(task);
        assert.equal(task.task_type, "rewrite_chapter");
        assert.equal(task.patch_mode, "synthetic_segment");
        assert.equal(task.rewrite_strategy, "targeted_rewrite");
        assert.equal(task.task_package?.story_room_execution?.status, "required");
        assert.ok(task.source_draft_text.length < source.length);
        return {
          chapter_no: 1,
          text: [
            task.source_draft_text,
            "",
            "赵老板盯着账本上那条茶引号，手里的茶勺停在半空，终于改口：\"先给你两担茶试跑。\"",
            "张青把最后三贯钱压在桌角，声音不高：\"若茶引出错，这钱先赔。\"",
            "赵老板脸上的嘲笑淡了，改成试探：\"那你先碰这一笔小单。\"",
            "门口的官差却在这时进来，把一张缺印茶引拍在桌上：\"这凭证，谁给你的？\"",
          ].join("\n"),
        };
      },
    };

    const draft = await rewriteChapterSmart(project, 1, {
      router,
      rewriteFocus: {
        type: "story_room_contract_repair",
        source_issue: "story_room_contract_not_delivered",
        story_room_missing_fields: ["public_feedback", "cost_residue", "relationship_shift", "chapter_debt"],
      },
    });

    assert.equal(calls.length, 2);
    assert.equal(draft.output_stats.patch_mode, "targeted_segment");
    assert.equal(draft.segment_patches.length, 2);
    assert.match(draft.text, /赵老板盯着账本/);
    assert.match(draft.text, /最后三贯钱/);
    assert.match(draft.text, /缺印茶引/);
    assert.match(draft.text, /^张青把账本摊到茶摊桌上/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("story-room chapter-debt repair patches only the tail window", async () => {
  const root = path.join(process.cwd(), ".tmp-story-room-tail-repair");
  await rm(root, { recursive: true, force: true });
  try {
    const project = await createProject({
      root,
      title: "Tail Contract Test",
      idea: "A rebirth business novel with visible chapter debts.",
      genre: "urban business",
      platform: "fanqie",
      protagonist_name: "Lu Chuan",
      initializePlanning: false,
    });
    const card = {
      chapter_no: 1,
      display_title: "First order",
      opening_hook: "Lu Chuan puts the receipt on the counter before the owner can laugh.",
      main_event: "Lu Chuan wins a small order.",
      protagonist_action: "Lu Chuan checks orders, counts cash, and forces a route choice.",
      conflict: "The owner doubts Lu Chuan can deliver without losing money.",
      cool_point_type: "visible business reversal",
      visible_result: "The owner agrees to one trial order.",
      tail_hook: "A competitor's call exposes the hidden route list.",
      public_feedback: "The shop owner changes his attitude in front of witnesses.",
      cost_residue: "Lu Chuan risks his last cash deposit.",
      relationship_shift: "The owner moves from doubt to trial cooperation.",
      chapter_debt: "A competitor's call forces Lu Chuan to answer how he got the route list.",
      characters_in_scene: ["Lu Chuan", "shop owner", "competitor"],
      character_anchors: [
        {
          name: "Lu Chuan",
          surface: "calm delivery runner",
          core: "turns messy orders into visible profit",
          anchor: "pushes the receipt forward before speaking",
          signature_action: "folds the route list into a narrow strip",
          signature_line: "Count the money first.",
        },
      ],
      facts_required: ["Lu Chuan has a route list", "the order needs a cash deposit"],
      forbidden_items: ["do not solve the call in this chapter"],
      target_words: 1800,
    };
    await writeFile(chapterCardFile(project, 1), `${JSON.stringify(card, null, 2)}\n`, "utf8");
    const opening = `OPENING_SENTINEL ${"opening action and pressure. ".repeat(80)}`;
    const middle = `MIDDLE_SENTINEL ${"visible order work and public reaction. ".repeat(120)}`;
    const tail = `TAIL_SENTINEL ${"the order seems closed, but a phone starts ringing. ".repeat(6)}`;
    const source = [opening, middle, tail].join("\n\n");
    await writeFile(draftFile(project, 1, "v1"), source, "utf8");

    const calls = [];
    const router = {
      async invoke(task) {
        calls.push(task);
        assert.equal(task.patch_mode, "synthetic_segment");
        assert.equal(task.rewrite_focus?.risk_segment?.scope, "chapter_debt");
        assert.match(task.rewrite_focus?.risk_segment?.reason || "", /chapter_debt/);
        assert.match(task.source_draft_text, /TAIL_SENTINEL/);
        assert.doesNotMatch(task.source_draft_text, /OPENING_SENTINEL/);
        return {
          chapter_no: 1,
          text: `${task.source_draft_text}\nThe competitor's call named the route list and forced Lu Chuan to answer it before dawn.`,
        };
      },
    };

    const draft = await rewriteChapterSmart(project, 1, {
      router,
      rewriteFocus: {
        type: "story_room_contract_repair",
        source_issue: "story_room_contract_not_delivered",
        story_room_missing_fields: ["chapter_debt"],
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(draft.output_stats.patch_mode, "targeted_segment");
    assert.match(draft.text, /OPENING_SENTINEL/);
    assert.match(draft.text, /competitor's call named the route list/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
