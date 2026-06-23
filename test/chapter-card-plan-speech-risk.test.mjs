import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeDropRiskSegments,
  chapterCardExecutionGaps,
  detectBusinessFormulaExposition,
  planRewriteLayers,
  strengthenChapterCardLocally,
} from "../src/core/workflow.mjs";
import { assertChapterCard } from "../src/core/schemas.mjs";

test("chapter card assertion fills inferable character anchors", () => {
  const card = assertChapterCard({
    chapter_no: 1,
    display_title: "重生2016，从外卖开始",
    opening_hook: "陆川拎着三份外卖站在宿舍楼下。",
    main_event: "陆川发现校园外卖取餐混乱，带现金和菜单找商户试跑两单。",
    protagonist_action: "陆川画路线、记账、当场对现金和订单。",
    conflict: "商户不相信学生能稳定送达，室友也觉得跑腿没前途。",
    cool_point_type: "低成本验证",
    visible_result: "两单跑通，账本对上，商户愿意明天继续试。",
    tail_hook: "老周打来电话，要当面看账本和路线图。",
    characters_in_scene: ["陆川", { name: "周启明", role: "室友" }],
    facts_required: ["2016 年校园仍以现金、小票和电话确认为主"],
    forbidden_items: ["不得展示未来支付截图"],
  });

  assert.equal(card.character_anchors.length, 2);
  assert.equal(card.character_anchors[0].name, "陆川");
  assert.notEqual(card.character_anchors[0].surface, card.character_anchors[0].core);
});

test("chapter card assertion normalizes string character lists before filling anchors", () => {
  const card = assertChapterCard({
    chapter_no: 1,
    display_title: "重生2016，从外卖开始",
    opening_hook: "陆川拎着三份外卖站在宿舍楼下。",
    main_event: "陆川发现校园外卖取餐混乱，带现金和菜单找商户试跑两单。",
    protagonist_action: "陆川画路线、记账、当场对现金和订单。",
    conflict: "商户不相信学生能稳定送达，室友也觉得跑腿没前途。",
    cool_point_type: "低成本验证",
    visible_result: "两单跑通，账本对上，商户愿意明天继续试。",
    tail_hook: "老周打来电话，要当面看账本和路线图。",
    characters_in_scene: "陆川、周启明、老周",
    facts_required: ["2016 年校园仍以现金、小票和电话确认为主"],
    forbidden_items: ["不得展示未来支付截图"],
  });

  assert.deepEqual(card.characters_in_scene, ["陆川", "周启明", "老周"]);
  assert.equal(card.character_anchors.length, 3);
});

test("early campus delivery cards convert plan-speech risks into action evidence", () => {
  const card = {
    chapter_no: 2,
    opening_hook: "陆川把账本推到周启明面前。",
    main_event: "两人用补贴成本、用户量和定价策略说服商户合作。",
    protagonist_action: "陆川解释顾客端免费、商户端后续订单抽成，保温袋折旧分摊到三十天。",
    conflict: "周启明担心前期扛不住，商户担心免费配送是套路。",
    visible_result: "商户同意试试，学生留下订单。",
    tail_hook: "隔壁宿舍也开始发传单。",
    forbidden_items: ["不得把正文写成商业计划书。"],
  };
  const planningContext = {
    project_bible: "2016 年校园外卖，从路线、订单、商户反馈切入。",
  };

  const gaps = chapterCardExecutionGaps(card, planningContext);
  assert.ok(gaps.includes("early_delivery_plan_speech_risk"));

  const strengthened = strengthenChapterCardLocally(card, gaps);
  const text = JSON.stringify(strengthened);

  assert.match(strengthened.protagonist_action, /圈路线|试点一单|现金|菜单|传单|商户对账/);
  assert.doesNotMatch(strengthened.protagonist_action, /用户量|定价策略|订单抽成|折旧|商户端|顾客端/);
  assert.ok(strengthened.planning_strength.gaps.includes("early_delivery_plan_speech_risk"));
  assert.match(text, /不得让角色说用户量、定价策略、订单抽成、折旧/);
});

test("inline risk segments outrank generic grade lifting during repairs", () => {
  const layers = planRewriteLayers([
    "review_grade_below_publish",
    "inline_risk_segments",
    "publish_gate_not_ready",
  ]);

  assert.equal(layers[0].type, "drop_risk_repair");
});

test("replacement accounting explanations remain hard drop-risk segments", () => {
  const paragraph = "一份饭原料成本3块，打9折能省3毛。押金50块，一份饭多赚3毛，得凑够一百六十多份才能回来。也就是一周的量。开头几天不指望赚，先把路跑熟了，把楼里的学生记住，回头客自然来。";

  const formulaRisk = detectBusinessFormulaExposition(paragraph);
  assert.equal(formulaRisk.hit, true);
  assert.ok(formulaRisk.reasons.includes("accounting_formula_exposition"));

  const dropRisk = analyzeDropRiskSegments(`陆川把账本推过去。\n\n${paragraph}\n\n周启明盯着那一页没说话。`, {
    segmentSize: 260,
  });
  assert.equal(dropRisk.risky_segment_count >= 1, true);
  assert.ok(dropRisk.segments.some((segment) =>
    segment.high_risk && segment.reasons.some((reason) => /formula|payback|per_order/.test(reason)),
  ));
});

test("scene negotiation with visible action is not mistaken for formula exposition", () => {
  const paragraph = "王姐正靠在案板上抽烟，看见林晚进来，脸色缓了缓，再看到后面的陆川，烟头往地上一扔，踩灭了。\n\n“就是这小子要拿9折？”\n\n“王姨，每天保底20份，按周结。少一份我补差价，多一份算您照顾学弟。”\n\n陆川也不废话，直接把那一叠数好的50块钱拍在桌上。";

  const formulaRisk = detectBusinessFormulaExposition(paragraph);
  assert.equal(formulaRisk.hit, false);
});

test("money amount drift is routed to fact consistency repair", () => {
  const layers = planRewriteLayers([
    "资金总额与章卡设定存在偏差，正文54元但章卡58元，需要统一财务口径",
  ]);

  assert.equal(layers[0].type, "fact_consistency_repair");
});

test("impossible future screenshot in chapter card is rewritten into field evidence", () => {
  const card = {
    chapter_no: 1,
    opening_hook: "陆川醒来发现自己回到2016年。",
    main_event: "陆川在校园BBS发帖接单，随后展示未来支付截图，说服周启明借出500元作为启动资金。",
    protagonist_action: "陆川展示未来支付截图。",
    conflict: "周启明质疑重生记忆和商业计划。",
    visible_result: "周启明借出500元。",
    tail_hook: "陆川开始构思订餐路线和订单验证。",
    forbidden_items: ["不得过早写系统和平台。"],
  };
  const planningContext = {
    project_bible: "2016年校园外卖，从路线、订单、商户反馈切入。",
  };

  const gaps = chapterCardExecutionGaps(card, planningContext);
  assert.ok(gaps.includes("impossible_future_evidence"));
  assert.ok(gaps.includes("unearned_startup_capital"));
  assert.ok(gaps.includes("early_delivery_skips_field_trial"));

  const strengthened = strengthenChapterCardLocally(card, gaps);
  const executableText = JSON.stringify({
    opening_hook: strengthened.opening_hook,
    main_event: strengthened.main_event,
    protagonist_action: strengthened.protagonist_action,
    conflict: strengthened.conflict,
    visible_result: strengthened.visible_result,
    tail_hook: strengthened.tail_hook,
    money_source: strengthened.money_source,
    supplier_info_path: strengthened.supplier_info_path,
    first_trial_plan: strengthened.first_trial_plan,
    scene_beats: strengthened.scene_beats,
  });

  assert.doesNotMatch(executableText, /未来支付截图|借出500元作为启动资金|BBS发帖接单/);
  assert.match(strengthened.main_event, /菜单|路线图|商户|试跑|账本|现金|订单/);
  assert.match(strengthened.money_source, /不得靠未来截图/);
  assert.ok(strengthened.forbidden_items.some((item) => /不得展示未来支付截图/.test(item)));
  assert.match(strengthened.supplier_info_path, /亲自观察|抄菜单|出餐时间/);
  assert.ok(strengthened.planning_strength.gaps.includes("impossible_future_evidence"));
});
