import test from "node:test";
import assert from "node:assert/strict";

import {
  chapterCardExecutionGaps,
  strengthenChapterCardLocally,
} from "../src/core/workflow.mjs";
import { assertChapterCard } from "../src/core/schemas.mjs";

test("chapter card gate rejects cards without story-room execution fields", () => {
  const card = assertChapterCard({
    chapter_no: 1,
    display_title: "重生茶商从汴京小铺开始",
    opening_hook: "沈砚站在茶铺柜台前，发现账册少了一页。",
    main_event: "沈砚发现茶引和税单对不上，准备试着救下第一笔茶单。",
    protagonist_action: "沈砚拿账册、税单和契约当场核对。",
    conflict: "周掌柜不信一个小账房能看出茶单问题。",
    cool_point_type: "账册验真",
    visible_result: "账册对上，周掌柜愿意让他再看一笔茶单。",
    tail_hook: "柳青禾拿出另一张茶引，问他敢不敢继续看。",
    characters_in_scene: ["沈砚", "周掌柜", "柳青禾"],
    character_anchors: [],
    facts_required: ["宋朝茶引、税单、契约必须通过现场物件展示。"],
    forbidden_items: ["不得用旁白解释主角聪明。"],
    scene_beats: [
      { purpose: "开场压力", pressure: "账册少页", action: "核对税单", evidence: "税单", result: "掌柜停手" },
      { purpose: "目标确认", pressure: "茶单将废", action: "翻契约", evidence: "契约", result: "找到漏洞" },
      { purpose: "误判", pressure: "掌柜不信", action: "当场复算", evidence: "算盘", result: "旁人围观" },
      { purpose: "反转", pressure: "客商催促", action: "指出茶引问题", evidence: "茶引", result: "客商改口" },
      { purpose: "落地", pressure: "税吏将到", action: "重排账目", evidence: "账册", result: "茶单保住" },
    ],
    evidence_chain: [
      { step: 1, evidence: "账册少页" },
      { step: 2, evidence: "税单金额" },
      { step: 3, evidence: "茶引编号" },
    ],
    pass_gate_requirements: [
      "前300字必须有账册或茶引出场。",
      "主角能力必须通过核账动作展示。",
      "必须有掌柜或客商态度变化。",
      "章尾必须留下下一张茶引压力。",
    ],
  });

  const gaps = chapterCardExecutionGaps(card, {});
  assert.ok(gaps.includes("story_room_contract_missing"));

  const strengthened = strengthenChapterCardLocally(card, gaps);
  assert.equal(strengthened.story_room_contract?.status, "ready");
  assert.match(strengthened.public_feedback, /周掌柜|柳青禾|人物|现场|态度|反应/);
  assert.match(strengthened.cost_residue, /茶引|税单|契约|成本|风险|下一章/);
  assert.match(strengthened.relationship_shift, /沈砚|周掌柜|柳青禾|判断|关系/);
  assert.match(strengthened.chapter_debt, /下一章|茶引|凭证|消息|规则|压力/);
});
