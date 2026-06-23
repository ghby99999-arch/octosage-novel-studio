import test from "node:test";
import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildChapterQualityMetrics,
  buildWritingTaskPackage,
  createProject,
  evaluateChapterPublishGate,
} from "../src/core/workflow.mjs";
import { chapterCardFile } from "../src/core/paths.mjs";

const storyRoomCard = {
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

test("writing task package carries story-room execution contract into drafting", async () => {
  const root = path.join(process.cwd(), ".tmp-story-room-task-package");
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
    });
    await writeFile(chapterCardFile(project, 1), `${JSON.stringify(storyRoomCard, null, 2)}\n`, "utf8");

    const taskPackage = await buildWritingTaskPackage(project, 1, { force: true });

    assert.equal(taskPackage.story_room_execution.status, "required");
    assert.equal(taskPackage.story_room_execution.public_feedback, storyRoomCard.public_feedback);
    assert.equal(taskPackage.story_room_execution.cost_residue, storyRoomCard.cost_residue);
    assert.equal(taskPackage.story_room_execution.relationship_shift, storyRoomCard.relationship_shift);
    assert.equal(taskPackage.story_room_execution.chapter_debt, storyRoomCard.chapter_debt);
    assert.ok(taskPackage.hard_rules.some((rule) => /public_feedback/.test(rule)));
    assert.ok(taskPackage.hard_rules.some((rule) => /cost_residue/.test(rule)));
    assert.ok(taskPackage.hard_rules.some((rule) => /relationship_shift/.test(rule)));
    assert.ok(taskPackage.hard_rules.some((rule) => /chapter_debt/.test(rule)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publish gate blocks prose that ignores story-room contract delivery", async () => {
  const weakText = [
    "张青站在茶摊前，想起自己懂商业逻辑，也知道未来趋势。",
    "他很快说明茶叶生意有机会，只要抓住市场，就能完成逆袭。",
    "众人听完觉得有道理，事情暂时结束。",
  ].join("\n");

  const metrics = await buildChapterQualityMetrics({}, 1, storyRoomCard, weakText);
  assert.equal(metrics.story_room_contract_delivery.status, "fail");
  assert.ok(metrics.story_room_contract_delivery.missing.includes("public_feedback"));
  assert.ok(metrics.story_room_contract_delivery.missing.includes("cost_residue"));

  const gate = evaluateChapterPublishGate(
    {
      ...metrics,
      drop_risk_segments: { risky_segment_count: 0 },
      tail_hook_score: { score: 5 },
      micro_hook_density: { density: 1.2 },
      coolpoint_delivered: { effective_count: 3 },
      retention_prediction: { score: 90 },
      ai_taste_score: { score: 90 },
      reader_behavior_score: { score: 90 },
      first_300_retention_proxy: { score: 90 },
      chapter_completion_proxy: { score: 90 },
      next_chapter_click_proxy: { score: 90 },
      follow_intent_proxy: { score: 90 },
    },
    { grade: "A" },
    [],
  );

  assert.equal(gate.publish_ready, false);
  assert.ok(gate.blockers.includes("story_room_contract_not_delivered"));
});

test("story-room delivery passes when prose lands feedback cost relationship and debt", async () => {
  const strongText = [
    "张青把账本推到赵老板面前，指尖压住茶引缺角：\"账不会替人撒谎。\"",
    "伙计刚要笑，码头问价的人跑回来报了数字，赵老板的脸色停住，改口说先给两担茶试跑。",
    "张青从袖袋里摸出最后三贯钱押在桌上，若茶引出错，这点本钱连回客栈都不够。",
    "赵老板没再嘲他，只把算盘拨到张青面前，语气从打发变成试探：\"那你先碰这一笔小单。\"",
    "章尾官差突然进门，把一张缺印的茶引拍在桌上，逼张青当场解释凭证来源。",
  ].join("\n");

  const metrics = await buildChapterQualityMetrics({}, 1, storyRoomCard, strongText);
  assert.equal(metrics.story_room_contract_delivery.status, "pass");
  assert.deepEqual(metrics.story_room_contract_delivery.missing, []);
});
