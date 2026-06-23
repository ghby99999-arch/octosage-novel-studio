import test from "node:test";
import assert from "node:assert/strict";

import {
  auditStoryRoomChapterPlan,
  buildOpeningThirtyChapterPlan,
} from "../src/core/story-room-contract.mjs";

test("story-room audit rejects generic chapter-plan advice", () => {
  const generic = [
    "# 泛化细纲",
    "",
    ...Array.from({ length: 30 }, (_, index) => [
      `## 第 ${index + 1} 章`,
      "",
      "- 目标：本章必须完成一个读者可感知的小结果。",
      "- 冲突：资源、规则、人物关系或时间压力。",
      "- 爽点：让主角通过可信能力和选择解决问题。",
      "- 章尾：留下下一章必须点开的新变量。",
      "",
    ].join("\n")),
  ].join("\n");

  const audit = auditStoryRoomChapterPlan(generic);
  assert.equal(audit.status, "fail");
  assert.equal(audit.chapter_count, 30);
  assert.ok(audit.generic_hits >= 4);
  assert.ok(audit.missing_fields.includes("章节功能"));
  assert.ok(audit.missing_fields.includes("可见证据"));
});

test("story-room audit accepts concrete opening thirty outline", () => {
  const outline = buildOpeningThirtyChapterPlan({
    title: "重生茶商从汴京小铺开始",
    idea: "宋朝小账房重生到汴京茶铺，用账册、茶引和契约做茶叶供应链生意",
    genre: "历史/重生/商战/茶叶",
    protagonist_name: "沈砚",
    supporting_characters: ["柳青禾", "周掌柜", "赵承"],
    golden_finger: "前世账房经验 + 茶引税单记忆 + 契约风险判断",
  }, { estimatedChapters: 770 });

  const audit = auditStoryRoomChapterPlan(outline);
  assert.equal(audit.status, "pass");
  assert.equal(audit.chapter_count, 30);
  assert.equal(audit.complete_chapters, 30);
  assert.equal(audit.generic_hits, 0);
  assert.ok(audit.average_coverage >= 0.9);
});
