import test from "node:test";
import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  __test_repairTaxonomyForIssue,
  createProject,
  repairChapterToPublish,
  rewriteChapterSmart,
} from "../src/core/workflow.mjs";
import { chapterCardFile, draftFile } from "../src/core/paths.mjs";

test("targeted repair uses project character name and fixes tail-hook medium without full rewrite", async () => {
  const root = path.join(process.cwd(), ".tmp-auto-repair-closed-loop");
  await rm(root, { recursive: true, force: true });
  try {
    const project = await createProject({
      root,
      title: "重生本地生活测试",
      idea: "2016年重生回大学，从校园外卖做起",
      genre: "都市",
      platform: "fanqie",
      protagonistName: "陆川",
      supportingCharacters: ["周立", "苏晴", "秦远"],
      initializePlanning: false,
    });
    await writeFile(path.join(project.path, "设定", "人物关系.md"), [
      "# 人物关系",
      "",
      "- 陆川：主角，重生回大学。",
      "- 周立：陆川室友，前期嘴硬，看到试跑结果后愿意跟一单。",
    ].join("\n"), "utf8");
    await writeFile(chapterCardFile(project, 1), `${JSON.stringify({
      chapter_no: 1,
      display_title: "试跑第一单",
      opening_hook: "陆川拎着两份外卖站在宿舍楼下。",
      main_event: "陆川用现金、账本和现场试跑证明校园配送能跑通。",
      protagonist_action: "陆川拿菜单画路线，带现金找商户试跑。",
      conflict: "商户不信学生能稳定送到，室友周立觉得跑腿没前途。",
      cool_point_type: "现场验证爽点",
      visible_result: "首日完成两单小样本，账本能对上，商户愿意明天继续试，周立从嘲笑变成愿意跟一单。",
      tail_hook: "周立打来电话：赵老板想看账本和路线图。",
      facts_required: ["角色名统一为周立", "尾钩必须是周立打来电话", "能力必须通过账本和试跑结果展示"],
      forbidden_items: ["不得把电话尾钩改成微信消息"],
      characters_in_scene: [
        { name: "陆川", role: "主角", anchor: "用账本和现场试跑证明能力" },
        { name: "周立", role: "室友", anchor: "从嘲笑到愿意跟单" },
      ],
      target_words: 2200,
    }, null, 2)}\n`, "utf8");
    const source = [
      "陆川拎着两份外卖站在宿舍楼下。",
      "",
      "赵老板把账本推回来，指尖在两条签收记录上停了停：“明天再试两单。”",
      "",
      "回宿舍的时候，周启明还在打游戏。",
      "",
      "周启明凑过来看了一眼：“你记这个干嘛？真打算干？”",
      "",
      "“送外卖能送出什么花来？”",
      "",
      "手机震了一下。",
      "",
      "是周启明发来的微信：“赵老板说，明天有空，想当面看看你的账本和路线图。”",
    ].join("\n");
    await writeFile(draftFile(project, 1, "v1"), source, "utf8");

    const calls = [];
    const router = {
      async invoke(task) {
        calls.push(task);
        throw new Error("full rewrite model should not be called for deterministic name/tail repair");
      },
    };
    const draft = await rewriteChapterSmart(project, 1, {
      router,
      rewriteFocus: {
        type: "fact_consistency_repair",
        issues: [
          "角色名跨文档冲突：项目设定与人物关系为周立，正文和章卡残留周启明",
          "尾钩媒介偏离：章卡要求周立打来电话，正文写成微信消息",
          "章卡明确要求周立从嘲笑变成愿意跟一单，但正文缺乏态度转变的直接动作/对话证据",
        ],
        rewrite_direction: "统一角色名为周立；结尾改成电话；在来电前补出周立态度转变的现场动作证据。",
      },
    });

    assert.equal(calls.length, 0);
    assert.doesNotMatch(draft.text, /周启明|微信/);
    assert.match(draft.text, /周立打来电话/);
    assert.match(draft.text, /周立[\s\S]{0,180}(路线图按平|矿泉水|带我|跟一单|怕你明天跑丢)/);
    assert.equal(draft.output_stats.patch_mode, "targeted_segment");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("targeted repair clarifies delivery accounting chain and merchant reaction without full rewrite", async () => {
  const root = path.join(process.cwd(), ".tmp-accounting-repair-closed-loop");
  await rm(root, { recursive: true, force: true });
  try {
    const project = await createProject({
      root,
      title: "校园配送账目测试",
      idea: "2016年重生回大学，从校园外卖做起",
      genre: "都市",
      platform: "fanqie",
      protagonistName: "陆川",
      supportingCharacters: ["周立"],
      initializePlanning: false,
    });
    await writeFile(chapterCardFile(project, 1), `${JSON.stringify({
      chapter_no: 1,
      display_title: "账本试跑",
      opening_hook: "陆川把账本摊在赵老板柜台上。",
      main_event: "陆川用两单试跑、现金、签收和账本证明校园配送能跑通。",
      protagonist_action: "陆川逐笔核对餐费、配送费、找零和签收记录。",
      conflict: "商户担心学生送丢、拒收、账对不上。",
      cool_point_type: "账本对上后的商户改口",
      visible_result: "账本能对上，赵老板愿意明天继续试，周立愿意跟一单。",
      tail_hook: "周立打来电话：赵老板想看账本和路线图。",
      facts_required: ["餐费18元", "配送费2元", "签收记录必须可核对", "商户反应必须现场出现"],
      forbidden_items: ["不得只写账本结论，不展示现金流和现场反应"],
      characters_in_scene: [
        { name: "陆川", role: "主角", anchor: "用账本和现金证明能力" },
        { name: "周立", role: "室友", anchor: "看到试跑结果后愿意跟单" },
      ],
      target_words: 2200,
    }, null, 2)}\n`, "utf8");
    const source = [
      "陆川把账本摊在赵老板柜台上。",
      "",
      "两单都送到了，签收也有。",
      "",
      "他在账本最后写：配送费实留1元，欠找零1元。",
      "",
      "赵老板看了一眼账本，说：“明天再试两单。”",
      "",
      "周立打来电话：“赵老板说，明天有空，想当面看看你的账本和路线图。”",
    ].join("\n");
    await writeFile(draftFile(project, 1, "v1"), source, "utf8");

    const calls = [];
    const router = {
      async invoke(task) {
        calls.push(task);
        throw new Error("full rewrite model should not be called for deterministic accounting repair");
      },
    };
    const draft = await rewriteChapterSmart(project, 1, {
      router,
      rewriteFocus: {
        type: "fact_consistency_repair",
        issues: [
          "账本明细中‘配送费实留1元’与‘欠找零1元’的财务闭环略显跳跃，需补全交易过程",
          "账目结算缺乏单价拆解，能力证据链存在逻辑跳跃",
          "账本明细呈现偏静态说明，需将数字转化为商户和周立的即时反应",
        ],
        rewrite_direction: "补出餐费、配送费、找零、签收和商户改口的现场链条，不整章重写。",
      },
    });

    assert.equal(calls.length, 0);
    assert.match(draft.text, /餐费18元|十八块餐费/);
    assert.match(draft.text, /配送费2元|两块配送费/);
    assert.match(draft.text, /欠找零1元|找零一块/);
    assert.match(draft.text, /赵老板[\s\S]{0,120}(沉默|盯|改口|明天再试)/);
    assert.match(draft.text, /周立[\s\S]{0,180}(账本|签收|路线图|跟一单|明天跑)/);
    assert.equal(draft.output_stats.patch_mode, "targeted_segment");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repair taxonomy gives UI readable labels for closed-loop progress", () => {
  assert.deepEqual(
    __test_repairTaxonomyForIssue("账本明细中‘配送费实留1元’与‘欠找零1元’的财务闭环略显跳跃，需补全交易过程"),
    {
      key: "accounting_chain",
      label: "账目闭环",
      stage_label: "修账目闭环",
      repair_type: "fact_consistency_repair",
      ui_color: "amber",
      requires_rereview: true,
    },
  );
  assert.deepEqual(
    __test_repairTaxonomyForIssue("角色名跨文档冲突：项目设定与人物关系为周立，正文和章卡残留周启明"),
    {
      key: "canon_consistency",
      label: "设定一致性",
      stage_label: "统一设定口径",
      repair_type: "fact_consistency_repair",
      ui_color: "rose",
      requires_rereview: true,
    },
  );
  assert.deepEqual(
    __test_repairTaxonomyForIssue("尾钩媒介偏离：章卡要求周立打来电话，正文写成微信消息"),
    {
      key: "tail_hook_medium",
      label: "章尾钩子",
      stage_label: "修章尾钩子",
      repair_type: "strengthen_tail_hook",
      ui_color: "violet",
      requires_rereview: true,
    },
  );
});

test("quality loop progress exposes repair taxonomy for UI timeline", async () => {
  const root = path.join(process.cwd(), ".tmp-repair-taxonomy-progress");
  await rm(root, { recursive: true, force: true });
  try {
    const project = await createProject({
      root,
      title: "返工进度分类测试",
      idea: "2016年重生回大学，从校园外卖做起",
      genre: "都市",
      platform: "fanqie",
      protagonistName: "陆川",
      supportingCharacters: ["周立"],
      initializePlanning: false,
    });
    await writeFile(chapterCardFile(project, 1), `${JSON.stringify({
      chapter_no: 1,
      display_title: "账本试跑",
      opening_hook: "陆川把账本摊在赵老板柜台上。",
      main_event: "陆川用两单试跑、现金、签收和账本证明校园配送能跑通。",
      protagonist_action: "陆川逐笔核对餐费、配送费、找零和签收记录。",
      conflict: "商户担心学生送丢、拒收、账对不上。",
      cool_point_type: "账本对上后的商户改口",
      visible_result: "账本能对上，赵老板愿意明天继续试，周立愿意跟一单。",
      tail_hook: "周立打来电话：赵老板想看账本和路线图。",
      facts_required: ["餐费18元", "配送费2元", "签收记录必须可核对", "商户反应必须现场出现"],
      forbidden_items: ["不得只写账本结论，不展示现金流和现场反应"],
      characters_in_scene: [
        { name: "陆川", role: "主角", anchor: "用账本和现金证明能力" },
        { name: "周立", role: "室友", anchor: "看到试跑结果后愿意跟单" },
      ],
      target_words: 2200,
    }, null, 2)}\n`, "utf8");
    await writeFile(draftFile(project, 1, "v1"), [
      "陆川把账本摊在赵老板柜台上。",
      "",
      "两单都送到了，签收也有。",
      "",
      "他在账本最后写：配送费实留1元，欠找零1元。",
      "",
      "赵老板看了一眼账本，说：“明天再试两单。”",
      "",
      "周立打来电话：“赵老板说，明天有空，想当面看看你的账本和路线图。”",
    ].join("\n"), "utf8");

    const progress = [];
    let reviewCount = 0;
    const router = {
      async invoke(task) {
        if (task.task_type === "review_chapter") {
          reviewCount += 1;
          return reviewCount === 1
            ? {
                grade: "D",
                next_action: "rewrite_chapter",
                issues: [
                  "账本明细中‘配送费实留1元’与‘欠找零1元’的财务闭环略显跳跃，需补全交易过程",
                ],
                keep: ["开头动作可保留"],
                remove: ["账目结论跳跃"],
                rewrite_direction: "补全账目闭环",
                publish_gate: {
                  publish_ready: false,
                  blockers: ["fact_consistency_violation"],
                  label: "需自动优化",
                },
              }
            : {
                grade: "B",
                next_action: "extract_state_candidates",
                issues: [],
                keep: ["账目闭环已补齐"],
                remove: [],
                rewrite_direction: "",
                publish_gate: {
                  publish_ready: true,
                  blockers: [],
                  label: "可发布",
                },
              };
        }
        if (task.task_type === "extract_state_candidates") {
          return {
            meta: { source_chapter: 1 },
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
        throw new Error(`unexpected model call: ${task.task_type}`);
      },
    };
    await repairChapterToPublish(project, 1, {
      router,
      maxRepairRounds: 2,
      onProgress: (item) => {
        progress.push(item);
      },
    });
    const rewriteEvent = progress.find((item) => item.step === "rewrite" && item.repair_taxonomy);
    const deltaEvent = progress.find((item) => item.rewrite_delta);
    const delta = deltaEvent?.rewrite_delta;

    assert.equal(rewriteEvent?.repair_taxonomy?.key, "accounting_chain");
    assert.equal(rewriteEvent?.repair_taxonomy?.stage_label, "修账目闭环");
    assert.equal(rewriteEvent?.repair_label, "账目闭环");
    assert.ok(delta, "repair progress should expose structured rewrite_delta");
    assert.equal(delta.before.publish_ready, false);
    assert.equal(delta.after.publish_ready, true);
    assert.ok(delta.before.blocker_count >= 1);
    assert.equal(delta.after.blocker_count, 0);
    assert.equal(delta.blockers_removed, delta.before.blocker_count);
    assert.equal(delta.blockers_added, 0);
    assert.equal(typeof delta.before.word_count, "number");
    assert.equal(typeof delta.after.word_count, "number");
    assert.equal(delta.word_count_collapsed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
