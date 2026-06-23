import test from "node:test";
import assert from "node:assert/strict";

import {
  createProject,
  buildWritingTaskPackage,
  __test_markRuntimeSlowRoute,
  __test_runtimeRouteAttempts,
  __test_routerOptionsForTask,
  __test_formalMockStages,
  effectiveReviewGate,
  evaluateChapterPublishGate,
  rewriteChapterSmart,
  analyzeDropRiskSegments,
  analyzeChapterCardFactAnchors,
  __test_applyReviewQualityFlags,
  __test_localPostRepairDecision,
  __test_targetedRepairIssues,
  chapterCardExecutionGaps,
  strengthenChapterCardLocally,
} from "../src/core/workflow.mjs";
import { chapterCardFile, draftFile } from "../src/core/paths.mjs";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";

test("local drop-risk metrics block publish even when reviewer grade is B", () => {
  const gate = evaluateChapterPublishGate(
    {
      drop_risk_segments: { risky_segment_count: 2 },
      tail_hook_score: { score: 5 },
      micro_hook_density: { density: 1 },
      coolpoint_delivered: { effective_count: 2 },
      retention_prediction: { score: 92 },
      ai_taste_score: { score: 80 },
    },
    { grade: "B" },
    ["drop_risk_segments"],
  );

  assert.equal(gate.publish_ready, false);
  assert.ok(gate.blockers.includes("drop_risk_segments_remaining"));
});

test("formal workspace direct writing rejects implicit mock route", async () => {
  const mockStages = __test_formalMockStages({
    model: {
      provider: "mock",
      quality_mode: "balanced",
      default_writer: "mock",
      default_reviewer: "mock",
      default_extractor: "mock",
      task_routes: {},
    },
  });

  assert.deepEqual(mockStages, [
    "generate_chapter_card",
    "write_chapter",
    "review_chapter",
    "rewrite_chapter",
    "extract_state_candidates",
  ]);

  const realStages = __test_formalMockStages({
    model: {
      provider: "wenxin",
      quality_mode: "balanced",
      default_writer: "ernie-5.1",
      default_reviewer: "ernie-5.1",
      default_extractor: "ernie-5.1",
      allow_network: true,
      task_routes: {
        review_chapter: { provider: "qwen", model: "qwen3.6-plus" },
        generate_chapter_card: { provider: "deepseek", model: "deepseek-v4-flash" },
        extract_state_candidates: { provider: "deepseek", model: "deepseek-v4-flash" },
      },
    },
  });

  assert.deepEqual(realStages, []);
});

test("request task routes override stale project mock config", () => {
  const staleConfig = {
    model: {
      provider: "mock",
      quality_mode: "balanced",
      default_writer: "mock",
      default_reviewer: "mock",
      default_extractor: "mock",
      task_routes: {},
    },
  };
  const routerOptions = {
    provider: "wenxin",
    model: "ernie-5.1",
    allowNetwork: true,
    taskRoutes: {
      generate_chapter_card: { provider: "deepseek", model: "deepseek-v4-flash" },
      write_chapter: { provider: "wenxin", model: "ernie-5.1" },
      review_chapter: { provider: "qwen", model: "qwen3.6-plus" },
      rewrite_chapter: { provider: "wenxin", model: "ernie-5.1" },
      extract_state_candidates: { provider: "deepseek", model: "deepseek-v4-flash" },
    },
  };

  assert.deepEqual(__test_formalMockStages(staleConfig, routerOptions), []);
});

test("cross-project contaminated chapter card is discarded before task package reuse", async () => {
  const root = path.join(process.cwd(), ".tmp-contaminated-card-rebuild");
  await rm(root, { recursive: true, force: true });
  try {
    const project = await createProject({
      root,
      title: "重生2016从外卖到商业帝国",
      idea: "2016年重生回大学，陆川从校园外卖做起",
      genre: "都市",
      platform: "fanqie",
      protagonist_name: "陆川",
      supporting_characters: "周启明,林晚,赵衣",
    });
    await writeFile(chapterCardFile(project, 2), `${JSON.stringify({
      chapter_no: 2,
      display_title: "旧办法挡不住新局面",
      opening_hook: "林远刚把上一件事压下去，新的阻力已经堵到眼前。",
      main_event: "林远和账房老秦试图处理旧账。",
      protagonist_action: "林远拿出账本。",
      conflict: "账房老秦质疑他。",
      cool_point_type: "visible_result",
      visible_result: "账房老秦被说服。",
      tail_hook: "账房老秦要继续看账。",
      characters_in_scene: ["林远", "账房老秦"],
      facts_required: ["当前作品：重生2016从外卖到商业帝国"],
      forbidden_items: ["不要套用其他项目的人物名"],
      target_words: 1800,
    }, null, 2)}\n`, "utf8");

    const router = {
      async invoke(task) {
        assert.equal(task.task_type, "generate_chapter_card");
        return {
          chapter_no: 2,
          display_title: "第2章 把混乱变成订单",
          opening_hook: "陆川站在宿舍楼下，把错拿的三份外卖重新摊开。",
          main_event: "陆川用菜单、路线和签收表把宿舍楼下的混乱变成两单可对账试跑。",
          protagonist_action: "陆川先找商户谈出餐，再让周启明跟一单。",
          conflict: "商户怕学生送丢，周启明也觉得跑腿没前途。",
          cool_point_type: "现场验证爽点",
          visible_result: "两单签收，账本能对上，商户愿意明天继续试。",
          tail_hook: "赵衣看见签收表后，问他能不能管一整栋楼。",
          characters_in_scene: ["陆川", "周启明", "赵衣"],
          facts_required: ["2016年", "陆川从校园外卖做起"],
          forbidden_items: ["不要出现林远或账房老秦"],
          target_words: 1800,
        };
      },
    };

    const taskPackage = await buildWritingTaskPackage(project, 2, { router });
    const storyFields = JSON.stringify({
      opening_hook: taskPackage.chapter_card.opening_hook,
      main_event: taskPackage.chapter_card.main_event,
      protagonist_action: taskPackage.chapter_card.protagonist_action,
      conflict: taskPackage.chapter_card.conflict,
      visible_result: taskPackage.chapter_card.visible_result,
      tail_hook: taskPackage.chapter_card.tail_hook,
      characters_in_scene: taskPackage.chapter_card.characters_in_scene,
      character_anchors: taskPackage.chapter_card.character_anchors,
    });
    assert.match(storyFields, /陆川/);
    assert.doesNotMatch(storyFields, /林远|账房老秦/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("chapter-card money anchors block drift introduced by drafts or repairs", async () => {
  const card = {
    facts_required: ["陆川有5000元存款，每月生活费1500元"],
    conflict: "启动资金必须从这5000元存款里拆出来，不能凭空增加。",
  };
  const text = [
    "陆川把口袋里的现金重新数了一遍。",
    "",
    "口袋里装着四千八百元现金，这是他上辈子攒的全部家当。银行卡里还有这个月一千五生活费。",
  ].join("\n");
  const anchors = analyzeChapterCardFactAnchors(text, card);

  assert.ok(anchors.violations.some((item) => item.expected_amount === 5000));
  const startupViolation = anchors.violations.find((item) => item.expected_amount === 5000);
  assert.deepEqual(startupViolation.observed_amounts, [4800, 1500]);

  const root = path.join(process.cwd(), ".tmp-card-anchor-gate");
  await rm(root, { recursive: true, force: true });
  try {
    const project = await createProject({
      root,
      title: "章卡硬锚点样本",
      idea: "2016年重生回大学，从校园外卖做起",
      genre: "都市",
      platform: "fanqie",
    });
    await writeFile(chapterCardFile(project, 1), `${JSON.stringify(card, null, 2)}\n`, "utf8");
    const quality = await __test_applyReviewQualityFlags(project, 1, {
      grade: "B",
      issues: [],
      publish_gate: { publish_ready: true, blockers: [] },
    }, text);

    assert.ok(quality.flags.includes("fact_consistency_violation"));
    assert.ok(quality.review.issues.includes("fact_consistency_violation"));
    assert.equal(quality.review.publish_gate.publish_ready, false);
    assert.ok(quality.review.publish_gate.blockers.includes("fact_consistency_violation"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("chapter-card money anchors ignore order counts such as one trial order", () => {
  const card = {
    protagonist_action: "陆川拿菜单和路线，带现金去找商户试点一单；当场谈清出餐、送达和商户对账。",
    facts_required: ["能力来源必须落在菜单、传单、现金、订单或商户反应中。"],
  };
  const text = [
    "陆川摸了摸兜里的现金，一百八十七块。",
    "",
    "不多。",
    "",
    "他在笔记本上写了一行字：启动资金，187块。先跑一单试试。",
  ].join("\n");

  const anchors = analyzeChapterCardFactAnchors(text, card);

  assert.deepEqual(anchors.violations, []);
  assert.deepEqual(anchors.issues, []);
});

test("chapter-card money anchor drift is repaired before full rewrite", async () => {
  const root = path.join(process.cwd(), ".tmp-card-anchor-repair");
  await rm(root, { recursive: true, force: true });
  try {
    const project = await createProject({
      root,
      title: "章卡资金修补样本",
      idea: "2016年重生回大学，从校园外卖做起",
      genre: "都市",
      platform: "fanqie",
    });
    await writeFile(chapterCardFile(project, 1), `${JSON.stringify({
      chapter_no: 1,
      display_title: "第一章",
      opening_hook: "陆川在宿舍楼下看到外卖堆成一片。",
      main_event: "陆川用现金、菜单和路线图验证校园外卖试单。",
      protagonist_action: "陆川数清启动资金，画路线，找商户试跑。",
      cool_point_type: "低成本验证",
      visible_result: "商户愿意继续试单，室友态度松动。",
      tail_hook: "赵老板要看他的账本和路线图。",
      characters_in_scene: ["陆川"],
      character_anchors: [{
        name: "陆川",
        surface: "重生大学生",
        core: "用账本和现场行动证明能力",
        anchor: "先跑通再解释",
        signature_action: "翻账本核对现金",
        signature_line: "先跑通一单。",
      }],
      facts_required: ["陆川有5000元存款，每月生活费1500元"],
      conflict: "启动资金必须从这5000元存款里拆出来，不能凭空增加。",
      forbidden_items: ["不得凭空增加启动资金"],
      target_words: 1800,
    }, null, 2)}\n`, "utf8");
    const source = [
      "陆川把口袋里的现金重新数了一遍。",
      "",
      "口袋里装着四千八百元现金，这是他上辈子攒的全部家当。银行卡里还有这个月一千五生活费。",
      "",
      "他把菜单翻到背面，开始画宿舍楼到后街餐馆的路线。",
    ].join("\n");
    await writeFile(draftFile(project, 1, "v1"), source, "utf8");
    const router = {
      async invoke() {
        throw new Error("rewrite model should not be called for deterministic money anchor patch");
      },
    };

    const draft = await rewriteChapterSmart(project, 1, {
      router,
      rewriteFocus: {
        type: "fact_consistency_repair",
        source_issue: "chapter_card_money_anchor_mismatch: expected 5000, observed 4800+1500",
      },
    });

    assert.match(draft.text, /五千|5000/);
    assert.doesNotMatch(draft.text, /四千八百元现金，这是他上辈子攒的全部家当。银行卡里还有这个月一千五生活费/);
    assert.equal(draft.output_stats.patch_mode, "targeted_segment");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("post-repair local gate can skip reviewer for measurable style blockers", () => {
  const decision = __test_localPostRepairDecision({
    previousReview: {
      grade: "D",
      issues: ["ai_taste_below_publish", "drop_risk_segments_remaining"],
      publish_gate: {
        publish_ready: false,
        blockers: ["ai_taste_below_publish", "drop_risk_segments_remaining"],
      },
    },
    rewriteFocus: {
      type: "drop_risk_repair",
      source_issue: "drop_risk_segments_remaining",
    },
    rewriteLayers: [{ type: "drop_risk_repair" }, { type: "sentence_pattern_repair" }],
  });

  assert.equal(decision.can_use_local_gate, true);
  assert.equal(decision.reason, "locally_verifiable_repair");
});

test("post-repair local gate still requires reviewer for semantic blockers", () => {
  const decision = __test_localPostRepairDecision({
    previousReview: {
      grade: "D",
      issues: ["fact_consistency_violation: 能力来源与项目设定不一致"],
      hard_rule_violations: ["fact_consistency_violation"],
      publish_gate: {
        publish_ready: false,
        blockers: ["fact_consistency_violation"],
      },
    },
    rewriteFocus: {
      type: "fact_consistency_repair",
      source_issue: "fact_consistency_violation: 能力来源与项目设定不一致",
    },
    rewriteLayers: [{ type: "fact_consistency_repair" }],
  });

  assert.equal(decision.can_use_local_gate, false);
  assert.equal(decision.reason, "semantic_repair_requires_reviewer");
});

test("chapter-card anchor repairs can use local gate only after the anchor is clean", () => {
  const card = {
    facts_required: ["\u9646\u5ddd\u67095000\u5143\u5b58\u6b3e\uff0c\u6bcf\u6708\u751f\u6d3b\u8d391500\u5143"],
    conflict: "\u542f\u52a8\u8d44\u91d1\u5fc5\u987b\u4ece\u8fd95000\u5143\u5b58\u6b3e\u91cc\u62c6\u51fa\u6765",
  };
  const previousReview = {
    grade: "D",
    issues: ["chapter_card_money_anchor_mismatch: expected 5000, observed 4800+1500", "fact_consistency_violation"],
    card_fact_anchor_violations: [{
      type: "chapter_card_money_anchor_mismatch",
      expected_amount: 5000,
      observed_amounts: [4800, 1500],
    }],
    publish_gate: {
      publish_ready: false,
      blockers: ["fact_consistency_violation"],
    },
  };
  const badText = "\u53e3\u888b\u91cc\u88c5\u7740\u56db\u5343\u516b\u767e\u5143\u73b0\u91d1\uff0c\u94f6\u884c\u5361\u91cc\u8fd8\u6709\u8fd9\u4e2a\u6708\u4e00\u5343\u4e94\u751f\u6d3b\u8d39\u3002";
  const goodText = "\u53e3\u888b\u91cc\u88c5\u77405000\u5143\u73b0\u91d1\uff0c\u8fd9\u662f\u4ed6\u80fd\u52a8\u7528\u7684\u5168\u90e8\u542f\u52a8\u8d44\u91d1\u3002\u94f6\u884c\u5361\u91cc\u7684\u751f\u6d3b\u8d39\u5148\u538b\u7740\u4e0d\u52a8\u3002";

  const stillBad = __test_localPostRepairDecision({
    previousReview,
    card,
    text: badText,
    rewriteFocus: {
      type: "chapter_card_fact_anchor_repair",
      source_issue: "chapter_card_money_anchor_mismatch: expected 5000, observed 4800+1500",
    },
    rewriteLayers: [{ type: "chapter_card_fact_anchor_repair" }],
  });
  assert.equal(stillBad.can_use_local_gate, false);
  assert.equal(stillBad.reason, "chapter_card_fact_anchor_still_drifting");

  const fixed = __test_localPostRepairDecision({
    previousReview,
    card,
    text: goodText,
    rewriteFocus: {
      type: "chapter_card_fact_anchor_repair",
      source_issue: "chapter_card_money_anchor_mismatch: expected 5000, observed 4800+1500",
    },
    rewriteLayers: [{ type: "chapter_card_fact_anchor_repair" }],
  });
  assert.equal(fixed.can_use_local_gate, true);
  assert.equal(fixed.reason, "locally_verifiable_repair");
});

test("reviewer green light cannot override local hard gate", () => {
  const computedGate = {
    status: "needs_rewrite",
    publish_ready: false,
    label: "需自动优化",
    blockers: ["drop_risk_segments_remaining"],
    values: { grade: "B", drop_risk_segments: 2 },
  };

  const merged = effectiveReviewGate(
    { grade: "B", publish_gate: { status: "publish_ready", publish_ready: true, blockers: [] } },
    computedGate,
  );

  assert.equal(merged.publish_ready, false);
  assert.deepEqual(merged.blockers, ["drop_risk_segments_remaining"]);
});

test("positive Chinese consistency note does not become a fact blocker", async () => {
  const root = path.join(process.cwd(), ".tmp-positive-consistency-note");
  await rm(root, { recursive: true, force: true });
  try {
    const project = await createProject({
      root,
      title: "\u6b63\u5411\u4e00\u81f4\u6027\u6837\u672c",
      idea: "2016\u5e74\u91cd\u751f\u56de\u5927\u5b66\uff0c\u4ece\u6821\u56ed\u5916\u5356\u505a\u8d77",
      genre: "\u90fd\u5e02",
      platform: "fanqie",
    });
    await writeFile(chapterCardFile(project, 1), `${JSON.stringify({
      chapter_no: 1,
      display_title: "\u7b2c1\u7ae0",
      opening_hook: "\u9646\u5ddd\u91cd\u751f\u9192\u6765\uff0c\u624b\u673a\u663e\u793a2016\u5e745\u670812\u65e5\u3002",
      main_event: "\u9646\u5ddd\u7528\u4f59\u989d\u548c\u8d26\u672c\u8bd5\u8dd1\u6821\u56ed\u5916\u5356\u9996\u5355\u3002",
      protagonist_action: "\u9646\u5ddd\u62ff\u73b0\u91d1\u3001\u8d26\u672c\u548c\u6253\u5305\u76d2\u53bb\u98df\u5802\u7a97\u53e3\u8c08\u8bd5\u5355\u3002",
      conflict: "\u4f59\u989d\u6709\u9650\uff0c\u5546\u6237\u4e0d\u4fe1\uff0c\u5ba4\u53cb\u8d77\u54c4\u3002",
      visible_result: "\u5546\u6237\u613f\u610f\u7ed9\u4e09\u5355\u8bd5\u8dd1\u673a\u4f1a\u3002",
      tail_hook: "\u5ba4\u53cb\u770b\u5230\u7b2c\u4e00\u7b14\u94b1\u540e\u95ee\u80fd\u4e0d\u80fd\u5e26\u4ed6\u3002",
      target_words: 1200,
      facts_required: ["\u4f59\u989d500\u5143", "\u5fc5\u987b\u7528\u8d26\u672c\u5bf9\u8d26"],
      forbidden_items: ["\u4e0d\u5f97\u51fa\u73b0\u7cfb\u7edf\u9762\u677f"],
    }, null, 2)}\n`, "utf8");
    const text = [
      "\u9646\u5ddd\u6309\u4eae\u624b\u673a\uff0c\u5c4f\u5e55\u4e0a\u76842016\u5e745\u670812\u65e5\u523a\u5f97\u4ed6\u624b\u6307\u4e00\u505c\u3002",
      "",
      "\u4ed6\u6ca1\u6709\u6025\u7740\u89e3\u91ca\uff0c\u5148\u7ffb\u5f00\u8d26\u672c\uff0c\u628a\u94b1\u5305\u91cc\u7684\u4e94\u5f20\u7ea2\u949e\u538b\u5728\u684c\u89d2\u3002",
      "",
      "\u98df\u5802\u7a97\u53e3\u524d\uff0c\u9646\u5ddd\u628a\u4e09\u4efd\u8bd5\u5355\u5199\u5728\u672c\u5b50\u4e0a\uff0c\u8bf7\u8001\u9648\u5728\u65c1\u8fb9\u7b7e\u4e86\u5b57\u3002",
      "",
      "\u5bbf\u820d\u697c\u4e0b\uff0c\u7b2c\u4e00\u7b14\u8dd1\u817f\u8d39\u8fdb\u4e86\u94b1\u5305\uff0c\u5468\u542f\u660e\u76ef\u7740\u8d26\u672c\u5c0f\u58f0\u95ee\uff1a\"\u5ddd\u54e5\uff0c\u660e\u5929\u5e26\u6211\u4e00\u4e2a\uff1f\"",
    ].join("\n");
    const review = {
      grade: "B",
      next_action: "approve",
      issues: ["\u65e0\u8bbe\u5b9a\u51b2\u7a81\u3001\u52a8\u673a\u65ad\u88c2\u6216\u65f6\u4ee3\u903b\u8f91\u786c\u4f24\uff1b\u7b26\u5408\u903b\u8f91\u4e0e\u7ae0\u5361\u3002"],
      hard_rule_violations: [],
      risky_segments: [],
      publish_gate: { publish_ready: true, blockers: [], label: "\u53ef\u53d1\u5e03" },
    };
    const result = await __test_applyReviewQualityFlags(project, 1, review, text);

    assert.equal(result.flags.includes("fact_consistency_violation"), false);
    assert.equal(result.review.publish_gate.publish_ready, true);
    assert.deepEqual(__test_targetedRepairIssues(result.review), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tiny factual risk segments are locally patched before calling rewrite model", async () => {
  const root = path.join(process.cwd(), ".tmp-publish-gate-local-patch");
  await rm(root, { recursive: true, force: true });
  try {
    const project = await createProject({
      root,
      title: "本地微修样本",
      idea: "2016年重生回大学，从校园外卖做起",
      genre: "都市",
      platform: "fanqie",
    });
    await writeFile(chapterCardFile(project, 1), `${JSON.stringify({
      chapter_no: 1,
      display_title: "第1章",
      opening_hook: "陆川重生醒来，手机显示2016年9月1日。",
      main_event: "陆川用五十个打包盒试跑校园外卖。",
      protagonist_action: "陆川拿现金、账页和打包盒去找老陈谈试单。",
      conflict: "余额有限，老陈不信，学生担心送餐不稳。",
      cool_point_type: "低成本验证模式",
      visible_result: "老陈愿意给三单试跑机会。",
      tail_hook: "周启明看到零钱后问能不能带他一个。",
      target_words: 2600,
      facts_required: ["打包盒成本1元/个，小炒均价10元"],
      characters_in_scene: [{ name: "陆川", role: "主角", anchor: "余额紧张但行动冷静" }],
      character_anchors: [{
        name: "陆川",
        surface: "普通大四学生",
        core: "重生程序员",
        anchor: "普通大四学生但有未来履约经验",
        signature_action: "先算账再开口",
        signature_line: "先跑三单。",
      }],
      forbidden_items: ["不得让打包盒单价和章卡冲突"],
    }, null, 2)}\n`, "utf8");
    const source = [
      "陆川把一百块现金拍在台面上。",
      "",
      "\"陈哥，我出一百块买你五十个打包盒，一个盒子两块钱，够不够？\"",
      "",
      "老陈看了他几秒：\"你先跑一单试试。送到了，饭钱你先垫，我晚上跟你结。\"",
    ].join("\n");
    await writeFile(draftFile(project, 1, "v1"), source, "utf8");
    const calls = [];
    const router = {
      async invoke(task) {
        calls.push(task);
        throw new Error("rewrite model should not be called for local micro patch");
      },
    };
    const draft = await rewriteChapterSmart(project, 1, {
      router,
      rewriteFocus: {
        type: "drop_risk_repair",
        risk_segments: [
          {
            preview: "\"陈哥，我出一百块买你五十个打包盒，一个盒子两块钱，够不够？\"",
            reason: "与章卡设定的打包盒成本1元/个冲突。",
          },
          {
            preview: "老陈看了他几秒：\"你先跑一单试试。送到了，饭钱你先垫，我晚上跟你结。\"",
            reason: "商户决策过程过于顺滑，缺乏风险规避动作。",
          },
        ],
      },
    });

    assert.equal(calls.length, 0);
    assert.match(draft.text, /出五十块买你五十个打包盒，一个盒子一块钱/);
    assert.match(draft.text, /先跑三单。洒了、凉了、学生退单，你照价赔/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime timeout skips the same writer provider for later rewrite in one task", async () => {
  const routerOptions = {
    provider: "wenxin",
    model: "ernie-5.1",
    allowNetwork: true,
    timeoutMs: 90000,
    fallbacks: [{ provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 90000 }],
  };
  __test_markRuntimeSlowRoute(routerOptions, "write_chapter", { provider: "wenxin", model: "ernie-5.1" });
  const attempts = __test_runtimeRouteAttempts(routerOptions, "rewrite_chapter");

  assert.deepEqual(
    attempts.map((attempt) => [attempt.provider, attempt.model]),
    [["deepseek", "deepseek-v4-flash"]],
  );
});

test("runtime slow writer memory is shared across task-specific route merges", async () => {
  const rootRouterOptions = {
    provider: "mock",
    model: "mock",
    allowNetwork: true,
    taskRoutes: {
      write_chapter: {
        provider: "wenxin",
        model: "ernie-5.1",
        timeoutMs: 90000,
        fallbacks: [{ provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 90000 }],
      },
      rewrite_chapter: {
        provider: "wenxin",
        model: "ernie-5.1",
        timeoutMs: 90000,
        fallbacks: [{ provider: "deepseek", model: "deepseek-v4-flash", timeoutMs: 90000 }],
      },
    },
  };

  const writeRouterOptions = __test_routerOptionsForTask(rootRouterOptions, "write_chapter");
  __test_markRuntimeSlowRoute(writeRouterOptions, "write_chapter", { provider: "wenxin", model: "ernie-5.1" });

  const rewriteRouterOptions = __test_routerOptionsForTask(rootRouterOptions, "rewrite_chapter");
  const attempts = __test_runtimeRouteAttempts(rewriteRouterOptions, "rewrite_chapter");

  assert.deepEqual(
    attempts.map((attempt) => [attempt.provider, attempt.model]),
    [["deepseek", "deepseek-v4-flash"]],
  );
});

test("fact consistency repair uses targeted segment patch before full chapter rewrite", async () => {
  const root = path.join(process.cwd(), ".tmp-fact-segment-patch");
  await rm(root, { recursive: true, force: true });
  try {
    const project = await createProject({
      root,
      title: "事实局部修补样本",
      idea: "2016年重生回大学，从校园外卖做起",
      genre: "都市",
      platform: "fanqie",
    });
    await writeFile(chapterCardFile(project, 1), `${JSON.stringify({
      chapter_no: 1,
      display_title: "第一章 第一单",
      opening_hook: "余额短信亮起，室友抱怨外卖太慢。",
      main_event: "主角跑通第一单校园外卖。",
      protagonist_action: "主角拿订单、现金和账本找商户试单。",
      conflict: "室友不信，商户担心对不上账，主角只有一辆旧电动车。",
      cool_point_type: "低成本验证",
      visible_result: "商户签字，室友愿意继续下一单。",
      tail_hook: "有人嘲笑他开始跑腿。",
      characters_in_scene: [
        { name: "陆川", role: "主角", anchor: "用账本和跑单结果证明能力" },
        { name: "周启明", role: "室友", anchor: "第一单顾客" },
      ],
      character_anchors: [
        {
          name: "陆川",
          surface: "重生大学生",
          core: "被裁程序员，有未来履约经验",
          anchor: "先对账再扩单",
          signature_action: "翻账本核对现金",
          signature_line: "先跑通一单。",
        },
      ],
      facts_required: ["跑腿费10元", "餐费18元", "必须用账本和签字对账"],
      forbidden_items: ["不得写成商业计划书", "不得出现系统面板"],
      target_words: 2200,
    }, null, 2)}\n`, "utf8");
    const source = [
      "手机屏幕亮着。银行短信：余额500元。",
      "",
      "周启明把手机摔到床上：等四十分钟，饿死了。",
      "",
      "我抓起钥匙，下楼推车。",
      "",
      "王姐把餐袋递出来，我把订单截图和账本一起推过去，让她在窗口编号旁签了字。",
      "",
      "送回宿舍后，周启明付了十块跑腿费。我翻开账本核对：收入10元，支出0元，结余7元。",
      "",
      "赵衫站在门口冷笑：怎么，穷得开始跑腿了？",
    ].join("\n");
    await writeFile(draftFile(project, 1, "v1"), source, "utf8");
    const calls = [];
    const router = {
      async invoke(task) {
        calls.push(task);
        assert.equal(task.rewrite_strategy, "targeted_rewrite");
        assert.ok(task.source_draft_text.length < source.length);
        assert.match(task.source_draft_text, /收入10元/);
        return {
          text: "送回宿舍后，周启明付了十块跑腿费。我翻开账本核对：收入10元，支出0元，手里从七块变成十七块；明天还要给王姐结十八块餐费，还差一块，必须再跑一单。",
        };
      },
    };
    const draft = await rewriteChapterSmart(project, 1, {
      router,
      rewriteFocus: {
        type: "fact_consistency_repair",
        source_issue: "fact_consistency_violation: 账本结余与正文现金变化不一致",
      },
    });

    assert.equal(calls.length, 1);
    assert.match(draft.text, /手里从七块变成十七块/);
    assert.match(draft.text, /赵衫站在门口冷笑/);
    assert.equal(draft.output_stats.patch_mode, "targeted_segment");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("review-specific factual polish is locally patched before model rewrite", async () => {
  const root = path.join(process.cwd(), ".tmp-review-specific-local-patch");
  await rm(root, { recursive: true, force: true });
  try {
    const project = await createProject({
      root,
      title: "审稿明确小修样本",
      idea: "2016年重生回大学，从校园外卖做起",
      genre: "都市",
      platform: "fanqie",
    });
    await writeFile(chapterCardFile(project, 1), `${JSON.stringify({
      chapter_no: 1,
      display_title: "第一章",
      opening_hook: "宿舍楼下外卖堆成一片，陆川蹲下开始记账。",
      main_event: "陆川发现校园外卖配送痛点，带现金去找商户试跑。",
      protagonist_action: "主角带现金去找商户试点一单。",
      conflict: "室友不信，商户担心赔付，陆川必须用现金和账本证明能跑通。",
      cool_point_type: "低成本试跑验证",
      visible_result: "商户愿意给两单试跑，室友开始动摇。",
      tail_hook: "周启明打电话说赵老板愿意见他。",
      characters_in_scene: [{ name: "陆川", role: "主角", anchor: "用账本和现金证明能力" }],
      character_anchors: [{
        name: "陆川",
        surface: "重生大学生",
        core: "被裁程序员，有未来本地生活履约经验",
        anchor: "先现场跑通，再谈扩张",
        signature_action: "翻账本核对现金",
        signature_line: "先跑通两单。",
      }],
      target_words: 1800,
      facts_required: ["2016年校园", "带现金找商户试点"],
      forbidden_items: ["不得出现系统面板", "不得写成商业计划书"],
    }, null, 2)}\n`, "utf8");
    const source = [
      "周启明从楼里出来，端着搪瓷饭盆，看见陆川蹲在外卖堆旁边写字。",
      "",
      "老张黄焖鸡的门帘一掀，热气裹着酱香味扑出来。",
      "",
      "他盯着这个数字看了很久。",
      "",
      "明天，才是真正的第一单。",
    ].join("\n");
    await writeFile(draftFile(project, 1, "v1"), source, "utf8");
    const router = {
      async invoke() {
        throw new Error("rewrite model should not be called for deterministic factual polish");
      },
    };
    const draft = await rewriteChapterSmart(project, 1, {
      router,
      rewriteFocus: {
        type: "fact_consistency_repair",
        risk_segments: [
          {
            preview: "周启明从楼里出来，端着搪瓷饭盆，看见陆川蹲在外卖堆旁边写字。",
            reason: "时代细节偏差：2016年高校男生宿舍普遍使用不锈钢餐盘或塑料饭盒。",
          },
          {
            preview: "老张黄焖鸡的门帘一掀，热气裹着酱香味扑出来。",
            reason: "证据链断裂：缺失前往餐馆/递交现金/现场观察出餐的过渡动作。",
          },
          {
            preview: "明天，才是真正的第一单。",
            reason: "逻辑表述矛盾：应指代第一笔正式合作。",
          },
        ],
      },
    });

    assert.doesNotMatch(draft.text, /搪瓷饭盆|真正的第一单/);
    assert.match(draft.text, /不锈钢餐盘/);
    assert.match(draft.text, /十八块零钱/);
    assert.match(draft.text, /真正的第一笔合作/);
    assert.equal(draft.output_stats.patch_mode, "targeted_segment");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("review blockers patch living-money drift, exposition, and motivation bridge locally", async () => {
  const root = path.join(process.cwd(), ".tmp-real-v10-local-patch");
  await rm(root, { recursive: true, force: true });
  try {
    const project = await createProject({
      root,
      title: "真实阻断本地修补样本",
      idea: "2016年重生回大学，从校园外卖做起",
      genre: "都市",
      platform: "fanqie",
    });
    await writeFile(chapterCardFile(project, 1), `${JSON.stringify({
      chapter_no: 1,
      display_title: "宿舍醒来",
      opening_hook: "陆川拎着三份外卖站在男生宿舍楼下。",
      main_event: "陆川用现金、账本和现场试跑证明校园配送能跑通。",
      protagonist_action: "陆川拿菜单圈路线，带现金去找商户试点。",
      conflict: "生活费只剩200元，商户不信学生能稳定送到，室友觉得跑腿没前途。",
      cool_point_type: "认知碾压",
      visible_result: "两单跑通，商户愿意明天继续试，周启明从嘲笑变成愿意跟一单。",
      tail_hook: "周启明打来电话：赵老板想看账本和路线图。",
      facts_required: ["重生回2016年9月", "生活费只剩200元"],
      forbidden_items: ["不得写成商业计划书"],
      characters_in_scene: [
        { name: "陆川", role: "主角", anchor: "用账本和现场试跑证明能力" },
        { name: "周启明", role: "室友", anchor: "从嘲笑到愿意跟单" },
      ],
      character_anchors: [
        {
          name: "陆川",
          surface: "重生大学生",
          core: "被裁程序员，有未来履约经验",
          anchor: "先现场跑通，再谈扩张",
          signature_action: "翻账本核对现金",
          signature_line: "先跑通两单。",
        },
      ],
      target_words: 2200,
    }, null, 2)}\n`, "utf8");
    const source = [
      "陆川拎着三份外卖站在男生宿舍楼下。",
      "",
      "2016年，校园外卖刚冒头，商家自己送，送到楼下放地上，学生自己下来翻。没人管，没人核对，丢了就丢了。骂两句商家，商家骂两句骑手，骑手骂两句学生，最后谁都不爽，但谁都没办法。",
      "",
      "里面有一张一百块的钞票，两张十块的，一张五块的，一把硬币。全部身家：一百二十五块六毛。",
      "",
      "赵老板沉默了几秒，把账本还给他，拉开抽屉，从里面拿出两张皱巴巴的一块钱纸币，放在柜台上。",
      "",
      "今日资金变动：初始125.6元，收入2元，待支出晚饭8元，预计结余119.6元。",
      "",
      "周启明凑过来看了一眼：“你记这个干嘛？真打算干？”",
      "",
      "“你疯了吧？送外卖能送出什么花来？”",
      "",
      "周启明打来电话：“赵老板说，明天有空，想当面看看你的账本和路线图。”",
    ].join("\n");
    await writeFile(draftFile(project, 1, "v1"), source, "utf8");
    const calls = [];
    const router = {
      async invoke(task) {
        calls.push(task);
        throw new Error("rewrite model should not be called for deterministic blocker patch");
      },
    };
    const draft = await rewriteChapterSmart(project, 1, {
      router,
      rewriteFocus: {
        type: "drop_risk_repair",
        issues: [
          "章卡设定生活费剩200元，正文账本记为125.6元，存在设定偏差",
          "2016年外卖背景采用纯说明段落，未融入主角现场观察或动作，削弱代入感",
          "室友周启明从嘲笑到愿意跟单的动机转变缺乏中间行为证据，仅靠结尾电话带过导致逻辑微断",
        ],
        rewrite_direction: "将125.6元修正为200元；将2016外卖背景说明拆解为主角送单时的具体动作与路人反应；在周启明来电前增加1-2句其态度转变的现场细节。",
        risk_segments: [
          {
            preview: "2016年，校园外卖刚冒头，商家自己送，送到楼下放地上，学生自己下来翻。没人管，没人核对，丢了就丢了。骂两句商家，商家骂两句骑手，骑手骂两句学生，最后谁都不爽，但谁都没办法。",
            reason: "纯说明段落",
            severity: "high",
          },
          {
            preview: "今日资金变动：初始125.6元，收入2元，待支出晚饭8元，预计结余119.6元。",
            reason: "生活费金额与章卡不一致",
            severity: "high",
          },
        ],
      },
    });

    assert.equal(calls.length, 0);
    assert.doesNotMatch(draft.text, /125\.6元|119\.6元|一百二十五块六毛|没人管，没人核对/);
    assert.match(draft.text, /全部身家：两百块/);
    assert.match(draft.text, /初始200元，收入2元，待支出晚饭8元，预计结余194元/);
    assert.match(draft.text, /把三个塑料袋上的店名和楼号抄进纸页/);
    assert.match(draft.text, /把桌角那张路线图按平/);
    assert.equal(draft.output_stats.patch_mode, "targeted_segment");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("concrete accounting scene is not marked as drop-risk exposition", () => {
  const text = [
    "老张把那叠钱推回来一半：\"两单。多了不干。送丢了按原价十三块赔，送凉了学生拒收你也得赔。出餐到你手里不能超八分钟，超时算你的。能做到？\"",
    "",
    "\"能。\"",
    "",
    "陆川拔开笔帽，在本子上写：张叔黄焖鸡，试跑2单，配送费2元/单，押金18元，赔付上限13元。",
    "",
    "周启明端着不锈钢餐盘靠在门框上，餐盘里的菜已经不冒热气了。",
  ].join("\n");
  const risk = analyzeDropRiskSegments(text);

  assert.equal(risk.risky_segment_count, 0);
});

test("early campus delivery card removes unfunded vehicle purchase anchors", () => {
  const card = {
    chapter_no: 1,
    opening_hook: "陆川拎着外卖站在宿舍楼下。",
    main_event: "陆川买一辆二手电动车开始跑校园外卖。",
    protagonist_action: "陆川拿菜单圈路线。",
    conflict: "资金只有小额零钱。",
    visible_result: "两单跑通。",
    facts_required: ["2016年9月", "二手电动车市场价约400元"],
    forbidden_items: ["不得写成商业计划书"],
  };
  const gaps = chapterCardExecutionGaps(card, {
    project_bible: "2016年重生回大学，从校园外卖做起。",
  });
  assert.ok(gaps.includes("early_delivery_unfunded_vehicle_purchase"));

  const strengthened = strengthenChapterCardLocally(card, gaps);
  const text = JSON.stringify(strengthened);
  assert.doesNotMatch(text, /二手电动车市场价|购买电动车|买电动车|电动车定金/);
  assert.match(text, /低成本现场验证/);
  assert.match(text, /不得突然购买400元二手电动车/);
});

test("real first-chapter vehicle funding and Zhou bridge are locally repaired", async () => {
  const root = path.join(process.cwd(), ".tmp-vehicle-funding-bridge");
  await rm(root, { recursive: true, force: true });
  try {
    const project = await createProject({
      root,
      title: "车辆资金闭环样本",
      idea: "2016年重生回大学，从校园外卖做起",
      genre: "都市",
      platform: "fanqie",
    });
    await writeFile(chapterCardFile(project, 1), `${JSON.stringify({
      chapter_no: 1,
      display_title: "试跑第一单",
      opening_hook: "陆川拎着外卖站在宿舍楼下。",
      main_event: "陆川用账本和现场试跑证明校园配送能跑通。",
      protagonist_action: "陆川拿菜单圈路线，带现金找商户试跑。",
      conflict: "资金只有小额零钱，商户不信学生能稳定送到。",
      cool_point_type: "低成本现场验证",
      visible_result: "首日完成两单小样本，账本能对上，商户愿意明天继续试，周启明从嘲笑变成愿意跟一单。",
      tail_hook: "周启明打来电话：赵老板想看账本和路线图。",
      facts_required: ["首日只做两单试跑"],
      characters_in_scene: [
        { name: "陆川", role: "主角", anchor: "用账本和现场试跑证明能力" },
        { name: "周启明", role: "室友", anchor: "从嘲笑到愿意跟单" },
      ],
      character_anchors: [
        {
          name: "陆川",
          surface: "重生大学生",
          core: "被裁程序员，有未来履约经验",
          anchor: "先现场跑通，再谈扩张",
          signature_action: "翻账本核对现金",
          signature_line: "先跑通两单。",
        },
      ],
      forbidden_items: ["第一章不得突然购买400元二手电动车"],
      target_words: 2600,
    }, null, 2)}\n`, "utf8");
    const source = [
      "陆川接过两袋外卖，没有马上走。",
      "",
      "他把两袋外卖挂在车把上，骑上那辆从二手市场花四百块买的电动车，往8号楼骑。",
      "",
      "路上他算了算账：电动车四百块，剩下的钱买打包盒和一次性餐具，还要留点钱吃饭。如果明天能跑二十单，每单一块五到两块，收入大概三十五块左右，后天如果能翻一倍，就是七十块。一个星期下来，差不多能把电动车钱挣回来。",
      "",
      "回宿舍的时候，周启明还在打游戏。",
      "",
      "手机震了一下。",
      "",
      "是周启明发来的微信：“赵老板说，明天有空，想当面看看你的账本和路线图。”",
    ].join("\n");
    await writeFile(draftFile(project, 1, "v1"), source, "utf8");
    const router = {
      async invoke() {
        throw new Error("rewrite model should not be called for deterministic vehicle funding patch");
      },
    };

    const draft = await rewriteChapterSmart(project, 1, {
      router,
      rewriteFocus: {
        type: "fact_consistency_repair",
        issues: [
          "商业逻辑断裂：支出400元未交代具体用途，与当日零收入缺乏资金闭环",
          "人物关系断裂：周启明态度转变仅靠微信转述，未通过试跑结果落地",
        ],
        rewrite_direction: "明确400元资金流向；将周启明态度转变锁定在试跑成功后的现场反应上。",
        risk_segments: [
          {
            preview: "电动车四百块，剩下的钱买打包盒和一次性餐具，还要留点钱吃饭。如果明天能跑二十单",
            reason: "资金闭环断裂",
            severity: "high",
          },
        ],
      },
    });

    assert.doesNotMatch(draft.text, /花四百块买的电动车|电动车四百块|一周回本/);
    assert.match(draft.text, /旧电动车|步行|账页|签收记录/);
    assert.match(draft.text, /周启明[\s\S]{0,160}(路线图按平|盯着.*账|矿泉水|明天跑丢)/);
    assert.equal(draft.output_stats.patch_mode, "targeted_segment");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("low severity review suggestions do not downgrade a publish-ready chapter", async () => {
  const root = path.join(process.cwd(), ".tmp-low-risk-suggestion");
  await rm(root, { recursive: true, force: true });
  try {
    const project = await createProject({
      root,
      title: "低风险建议样本",
      idea: "2016年重生回大学，从校园外卖做起",
      genre: "都市",
      platform: "fanqie",
    });
    await writeFile(chapterCardFile(project, 1), `${JSON.stringify({
      chapter_no: 1,
      display_title: "第1章",
      opening_hook: "陆川重生醒来，手机显示2016年9月1日。",
      main_event: "陆川用五十个打包盒试跑校园外卖。",
      protagonist_action: "陆川拿现金、账页和打包盒去找老陈谈试单。",
      conflict: "余额有限，老陈不信，学生担心送餐不稳。",
      cool_point_type: "低成本验证模式",
      visible_result: "老陈愿意给三单试跑机会。",
      tail_hook: "周启明看到零钱后问能不能带他一个。",
      target_words: 2600,
      facts_required: ["打包盒成本1元/个，小炒均价10元"],
      characters_in_scene: [{ name: "陆川", role: "主角", anchor: "余额紧张但行动冷静" }],
      character_anchors: [{
        name: "陆川",
        surface: "普通大四学生",
        core: "重生程序员",
        anchor: "普通大四学生但有未来履约经验",
        signature_action: "先算账再开口",
        signature_line: "先跑三单。",
      }],
      forbidden_items: ["不得出现系统、面板、任务等游戏化元素"],
    }, null, 2)}\n`, "utf8");
    const text = [
      "陆川睁开眼，先按亮手机。",
      "",
      "2016年9月1日。",
      "",
      "他没有解释，抓起钱包数出两张红票子，又把饭卡压进账本。",
      "",
      "\"周启明，醒醒，借我一百。\"",
      "",
      "周启明骂了一句，把钱扔下来。",
      "",
      "陆川拿着钱去了食堂窗口，和老陈约好先跑三单，洒了照价赔。",
      "",
      "三单跑完，账页上多了三行房号，硬币压在纸角，老陈把卷帘门留了一条缝。",
      "",
      "周启明盯着那几枚硬币，声音低下来：\"川哥，明天带我一个？\"",
    ].join("\n");
    const review = {
      grade: "B",
      next_action: "approve",
      issues: ["有一句算账还可以更现场化"],
      risky_segments: [{ text: "明天只要再出五单，传单钱就回来了。", reason: "轻微商业推演", severity: "low" }],
      publish_gate: { publish_ready: true, blockers: [], label: "可发布" },
    };
    const result = await __test_applyReviewQualityFlags(project, 1, review, text);

    assert.equal(result.review.grade, "B");
    assert.equal(result.review.publish_gate.publish_ready, true);
    assert.deepEqual(result.review.publish_gate.blockers, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
