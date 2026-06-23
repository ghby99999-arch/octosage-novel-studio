import test from "node:test";
import assert from "node:assert/strict";
import { createModelRouter } from "../src/core/model-router.mjs";

test("openai provider calls Responses API through injected fetch when enabled", async () => {
  const requests = [];
  const router = createModelRouter({
    provider: "openai",
    model: "gpt-test",
    allowNetwork: true,
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            output_text: "generated chapter text",
          };
        },
      };
    },
  });

  const result = await router.invoke({
    task_type: "write_chapter",
    chapter_card: {
      chapter_no: 1,
      display_title: "Hook title",
    },
    task_package: {
      output: { target_words: 2600 },
    },
  });

  assert.equal(result.text, "generated chapter text");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.openai.com/v1/responses");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers.Authorization, "Bearer sk-test");
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.model, "gpt-test");
  assert.match(body.input, /只输出正文/);
  assert.match(body.input, /不输出 JSON/);
  assert.match(body.input, /Hook title/);
  assert.doesNotMatch(body.input, /浣犳槸|鍙緭鍑|绔犲崱|姝ｆ枃/);
  assert.doesNotMatch(body.input, /task_type: write_chapter/);
});

test("openai provider returns structured review JSON from Responses API output_text", async () => {
  const router = createModelRouter({
    provider: "openai",
    model: "gpt-test",
    allowNetwork: true,
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          output_text: JSON.stringify({
            grade: "B",
            next_action: "approve",
            issues: [],
          }),
        };
      },
    }),
  });

  const review = await router.invoke({
    task_type: "review_chapter",
    text: "chapter text",
    chapter_card: { chapter_no: 1 },
  });

  assert.equal(review.grade, "B");
  assert.equal(review.next_action, "approve");
});

test("review prompt sends evidence windows instead of full current chapter", async () => {
  const requests = [];
  const long = "商业规则与人物关系必须严格自洽。".repeat(500);
  const middle = "陆川在食堂后门核对账本、订单、赔付和商家反应。".repeat(260);
  const chapterText = `唯一正文起点-${middle}-唯一正文终点`;
  const router = createModelRouter({
    provider: "openai",
    model: "gpt-test",
    allowNetwork: true,
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            output_text: JSON.stringify({
              grade: "B",
              next_action: "approve",
              issues: ["可发布，仅保留一个小建议"],
              scores: {
                opening_hook: 86,
                logic_consistency: 88,
                coolpoint_delivery: 84,
                tail_hook: 82,
                ai_taste: 90,
                publish_readiness: 86,
              },
              risky_segments: [],
              keep: ["账本和订单证明能力"],
              remove: [],
              rewrite_direction: "已经达到发布线，仅需后续章节继续强化商家压力。",
              publish_gate: { publish_ready: true, blockers: [], label: "可发布" },
            }),
          };
        },
      };
    },
  });

  await router.invoke({
    task_type: "review_chapter",
    text: chapterText,
    chapter_card: {
      chapter_no: 1,
      display_title: "账本开局",
      opening_hook: long,
      main_event: long,
      protagonist_action: long,
      scene_beats: Array.from({ length: 20 }, (_, index) => ({ index, description: long })),
      evidence_chain: Array.from({ length: 20 }, (_, index) => ({ index, evidence: long })),
    },
    review_context: {
      mode: "contextual_publish_gate_review",
      project: { title: "重生外卖", idea: "2016年重生校园外卖创业" },
      writing_rules: Array.from({ length: 80 }, () => long),
      stage_rule_contract: {
        task_type: "review_chapter",
        stage: "review",
        rules: Array.from({ length: 80 }, () => long),
        quality_contract: { hard_blockers: Array.from({ length: 30 }, () => long) },
      },
      project_bible: long,
      character_relationships: long,
      volume_outline: long,
      recent_chapters: Array.from({ length: 8 }, (_, index) => ({ chapter_no: index + 1, ending_excerpt: long })),
      chapter_context_summary: {
        hard_rules: Array.from({ length: 50 }, () => long),
        scene_character_anchors: Array.from({ length: 20 }, () => ({ name: "陆川", note: long })),
      },
      first_300_chars: chapterText.slice(0, 300),
    },
    local_quality_metrics: {
      drop_risk_segments: {
        segments: [
          {
            index: 8,
            high_risk: true,
            preview: "商户实际到手比堂食多两块，这个说法需要核对。",
            reasons: ["business_logic"],
            risk_score: 88,
          },
        ],
      },
    },
  });

  const input = requests.at(-1).input;
  assert.ok(input.length < 7000, `review prompt too large: ${input.length}`);
  assert.match(input, /本地质量算法摘要/);
  assert.match(input, /语义硬伤/);
  assert.match(input, /审查证据包/);
  assert.match(input, /Evidence-window review/);
  assert.doesNotMatch(input, /opening_hook": 0/);
  assert.doesNotMatch(input, /coolpoint_delivery": 0/);
  assert.doesNotMatch(input, /ai_taste": 0/);
  assert.match(input, /唯一正文起点/);
  assert.match(input, /唯一正文终点/);
  assert.match(input, /商户实际到手比堂食多两块/);
  assert.doesNotMatch(input, new RegExp(middle.slice(0, 1200)));
});

test("review diagnostics reports the compact prompt size, not raw task size", async () => {
  const diagnostics = [];
  const long = "本书规划必须遵守商业逻辑、人物动机、章节细纲和平台节奏。".repeat(500);
  const router = createModelRouter({
    provider: "qwen",
    model: "qwen3.6-plus",
    allowNetwork: true,
    env: { DASHSCOPE_API_KEY: "dashscope-test" },
    fetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                grade: "B",
                next_action: "approve",
                issues: [],
                scores: { logic_consistency: 88, publish_readiness: 84 },
                risky_segments: [],
                keep: ["现场行动成立"],
                remove: [],
                rewrite_direction: "无需重写。",
                publish_gate: { publish_ready: true, blockers: [] },
              }),
            },
          }],
        };
      },
    }),
  });

  await router.invoke({
    task_type: "review_chapter",
    text: `唯一正文起点\n${"正文中段。".repeat(1200)}\n唯一正文终点`,
    chapter_card: {
      chapter_no: 1,
      display_title: "第一章",
      main_event: long,
      protagonist_action: long,
      conflict: long,
      visible_result: long,
      tail_hook: long,
    },
    review_context: {
      project: { title: "重生外卖", idea: "2016年重生校园外卖创业" },
      writing_rules: Array.from({ length: 60 }, () => long),
      project_bible: long,
      character_relationships: long,
      volume_outline: long,
      recent_chapters: Array.from({ length: 8 }, () => ({ summary: long })),
      first_300_chars: "唯一正文起点",
    },
    local_quality_metrics: {
      drop_risk_segments: {
        risky_segment_count: 1,
        segments: [{ high_risk: true, preview: long, reasons: [long], risk_score: 91 }],
      },
    },
    onModelDiagnostics: (event) => diagnostics.push(event),
  });

  const prepared = diagnostics.find((item) => item.event === "request_prepared");
  assert.ok(prepared, "missing request_prepared diagnostic");
  assert.ok(prepared.input_chars < 7000, `review prompt chars too large: ${prepared.input_chars}`);
  assert.ok(prepared.input_tokens < 5000, `review prompt tokens too large: ${prepared.input_tokens}`);
  assert.equal(prepared.task_package_chars, 0);
});

test("write prompt compacts large task package before model call", async () => {
  const requests = [];
  const long = "本书规划必须遵守商业逻辑、人物动机、章节细纲和平台节奏。".repeat(500);
  const router = createModelRouter({
    provider: "openai",
    model: "gpt-test",
    allowNetwork: true,
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        async json() {
          return { output_text: "正文从现场动作开始，陆川把账本摊开。" };
        },
      };
    },
  });

  await router.invoke({
    task_type: "write_chapter",
    chapter_card: {
      chapter_no: 1,
      display_title: "账本开局",
      opening_hook: long,
      main_event: long,
      protagonist_action: long,
      conflict: long,
      visible_result: long,
      tail_hook: long,
      scene_beats: Array.from({ length: 24 }, (_, index) => ({ index, description: long })),
    },
    task_package: {
      chapter_no: 1,
      chapter_card: { chapter_no: 1, display_title: "账本开局", main_event: long, scene_beats: Array.from({ length: 24 }, () => long) },
      hard_rules: Array.from({ length: 80 }, () => long),
      stage_rule_contract: { task_type: "write_chapter", rules: Array.from({ length: 80 }, () => long) },
      context: {
        project_planning: {
          title: "重生外卖",
          idea: "2016年重生校园外卖创业",
          project_bible: long,
          outline: long,
          settings: long,
          character_relationships: long,
          volume_outline: long,
          fine_outline_window: long,
        },
        batch_state: {
          timeline: Array.from({ length: 30 }, () => long),
          characters: Array.from({ length: 30 }, () => long),
          relationships: Array.from({ length: 30 }, () => long),
        },
      },
      output: { target_words: 2600 },
    },
  });

  const input = requests.at(-1).input;
  assert.ok(input.length < 18000, `write prompt too large: ${input.length}`);
  assert.match(input, /账本开局/);
  assert.ok(!input.includes(long.slice(0, 360)), "write prompt still contains an uncompressed long source chunk");
});

test("chapter card prompt compacts planning context and rules", async () => {
  const requests = [];
  const long = "本书规划必须遵守商业逻辑、人物动机、章节细纲和平台节奏。".repeat(500);
  const router = createModelRouter({
    provider: "openai",
    model: "gpt-test",
    allowNetwork: true,
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            output_text: JSON.stringify({
              chapter_no: 1,
              display_title: "账本开局",
              opening_hook: "陆川先看见食堂后门排错的餐盒。",
              main_event: "用账本试跑两单。",
              protagonist_action: "核对菜单、路线、订单和赔付风险。",
              conflict: "商户不信任，跑腿头目盯上。",
              cool_point_type: "visible_accounting",
              visible_result: "两单无错送达。",
              tail_hook: "跑腿头目拦住他。",
              characters_in_scene: [{ name: "陆川", role: "重生创业主角", anchor: "用账本证明能力" }],
              character_anchors: [{
                name: "陆川",
                surface: "刚重生的学生",
                core: "用现场账本和试单建立可信度",
                anchor: "刚重生的学生 but 用现场账本和试单建立可信度",
                signature_action: "摊开账本核对订单。",
                signature_line: "先试两单，错了我赔。",
              }],
              facts_required: ["账本", "订单"],
              forbidden_items: ["不能写成软件系统自动赚钱"],
            }),
          };
        },
      };
    },
  });

  await router.invoke({
    task_type: "generate_chapter_card",
    project: {
      title: "重生外卖",
      idea: "2016年重生校园外卖创业",
      platform: "fanqie",
      genre: "都市",
      target_words: 2000000,
    },
    chapter_no: 1,
    writing_rules: Array.from({ length: 80 }, () => long),
    stage_rule_contract: {
      task_type: "generate_chapter_card",
      rules: Array.from({ length: 80 }, () => long),
      quality_contract: { hard_blockers: Array.from({ length: 30 }, () => long) },
    },
    planning_context: {
      project_bible: long,
      settings: long,
      character_relationships: long,
      volume_outline: long,
      fine_outline_window: long,
      anti_cross_project_rules: Array.from({ length: 20 }, () => long),
      forbidden_cross_project_terms: Array.from({ length: 20 }, () => long),
    },
  });

  const input = requests.at(-1).input;
  assert.ok(input.length < 6500, `chapter card prompt too large: ${input.length}`);
  assert.match(input, /重生外卖/);
  assert.match(input, /2016年重生校园外卖创业/);
  assert.match(input, /planning_context/);
  assert.ok(!input.includes(long.slice(0, 360)), "chapter card prompt still contains an uncompressed long source chunk");
});

test("synthetic segment patch uses the segment-only prompt", async () => {
  const requests = [];
  const router = createModelRouter({
    provider: "openai",
    model: "gpt-test",
    allowNetwork: true,
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        async json() {
          return { output_text: "账本上改成：收入10元，支出0元，手里从七块变成十七块。" };
        },
      };
    },
  });

  await router.invoke({
    task_type: "rewrite_chapter",
    rewrite_strategy: "targeted_rewrite",
    patch_mode: "synthetic_segment",
    chapter_card: {
      chapter_no: 1,
      display_title: "第一单",
      main_event: "跑通第一单",
      protagonist_action: "用账本和签字对账",
      visible_result: "商户同意继续试一天",
      tail_hook: "室友嘲笑",
    },
    source_draft_text: "收入10元，支出0元，结余7元。",
    segment_context: "前文他原本有七块钱，室友又给了十块跑腿费。",
    rewrite_focus: { type: "fact_consistency_repair" },
  });

  const input = requests.at(-1).input;
  assert.match(input, /patch ONLY the marked problematic prose segment/);
  assert.match(input, /Problem segment to replace/);
  assert.doesNotMatch(input, /任务包/);
  assert.doesNotMatch(input, /目标字数/);
});

test("segment patch prompt compacts long context, rules, and focus", async () => {
  const requests = [];
  const long = "LONG-SEGMENT-CONTEXT-".repeat(500);
  const router = createModelRouter({
    provider: "openai",
    model: "gpt-test",
    allowNetwork: true,
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        async json() {
          return { output_text: "The ledger line is repaired with visible action." };
        },
      };
    },
  });

  await router.invoke({
    task_type: "rewrite_chapter",
    rewrite_strategy: "targeted_rewrite",
    patch_mode: "synthetic_segment",
    chapter_card: {
      chapter_no: 1,
      display_title: "第一单",
      main_event: long,
      protagonist_action: long,
      visible_result: long,
      tail_hook: long,
    },
    task_package: {
      stage_rule_contract: {
        task_type: "segment_patch",
        rules: Array.from({ length: 50 }, () => long),
        quality_contract: { hard_blockers: Array.from({ length: 20 }, () => long), repair_policy: long },
      },
    },
    source_draft_text: long,
    segment_context: long,
    rewrite_focus: {
      type: "historical_logic_repair",
      source_issue: long,
      instruction: long,
      risk_segment: { preview: long, reason: long, reasons: Array.from({ length: 10 }, () => long), severity: "high" },
    },
    stage_rule_contract: {
      task_type: "segment_patch",
      rules: Array.from({ length: 50 }, () => long),
      quality_contract: { hard_blockers: Array.from({ length: 20 }, () => long), repair_policy: long },
    },
  });

  const input = requests.at(-1).input;
  assert.ok(input.length < 8000, `segment patch prompt too large: ${input.length}`);
  assert.match(input, /Problem segment to replace/);
  assert.doesNotMatch(input, /任务包/);
  assert.doesNotMatch(input, /target_words/);
});

test("openai provider uses chat completions for configured relay base URL", async () => {
  const requests = [];
  const router = createModelRouter({
    provider: "openai",
    model: "gpt-test",
    allowNetwork: true,
    env: {
      OPENAI_API_KEY: "sk-test",
      OPENAI_BASE_URL: "https://api.apikey.fun",
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: "relay text" } }] };
        },
      };
    },
  });

  await router.invoke({
    task_type: "write_chapter",
    chapter_card: { chapter_no: 1, display_title: "Relay hook" },
    task_package: { output: { target_words: 1200 } },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.apikey.fun/v1/chat/completions");
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.messages[0].role, "user");
});

test("openai provider strips copied quotes from relay base URL", async () => {
  const requests = [];
  const router = createModelRouter({
    provider: "openai",
    model: "gpt-test",
    allowNetwork: true,
    env: {
      OPENAI_API_KEY: "sk-test",
      OPENAI_BASE_URL: "\"https://api.apikey.fun\"",
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: "quoted relay text" } }] };
        },
      };
    },
  });

  await router.invoke({
    task_type: "write_chapter",
    chapter_card: { chapter_no: 1, display_title: "Relay hook" },
    task_package: { output: { target_words: 1200 } },
  });

  assert.equal(requests[0].url, "https://api.apikey.fun/v1/chat/completions");
});

test("project planning prompt asks for complete planning JSON instead of generic task dump", async () => {
  const requests = [];
  const router = createModelRouter({
    provider: "openai",
    model: "gpt-test",
    allowNetwork: true,
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            output_text: JSON.stringify({
              bible: "项目圣经：主线、人设、商业承诺、逻辑硬规则和第一章前300字要求。",
              settings: "设定库：时代规则、能力边界、资源来源和经营规则。",
              relationships: "人物关系：主角、同盟、对手、情感牵引和资源方。",
              volume: "第一卷纲：1-30章阶段目标、关键反转、伏笔和阶段成果。",
              chapter_plan: "前10章细纲：每章开头、目标、冲突、爽点和章尾钩子。",
            }),
          };
        },
      };
    },
  });

  const result = await router.invoke({
    task_type: "project_planning",
    project: {
      title: "大宋茶商",
      idea: "宋朝穿越做茶叶供应链",
      genre: "历史经营",
      platform: "fanqie",
    },
  });

  assert.match(result.text, /项目圣经/);
  const body = JSON.parse(requests[0].options.body);
  assert.match(body.input, /开书总编辑/);
  assert.match(body.input, /premise, selling_points, logic_constraints, characters, relationships, stages, chapter_beats/);
  assert.match(body.input, /chapter_beats/);
  assert.doesNotMatch(body.input, /^task_type: project_planning/);
});

test("rewrite chapter uses the chapter-writing prompt and parses text output", async () => {
  const requests = [];
  const router = createModelRouter({
    provider: "openai",
    model: "gpt-test",
    allowNetwork: true,
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: async (_url, options) => {
      requests.push({ options });
      return {
        ok: true,
        status: 200,
        async json() {
          return { output_text: "rewritten chapter text" };
        },
      };
    },
  });

  const result = await router.invoke({
    task_type: "rewrite_chapter",
    chapter_card: {
      chapter_no: 1,
      display_title: "修正商业逻辑",
    },
    task_package: {
      output: { target_words: 2600 },
    },
    rewrite_focus: {
      instruction: "修正茶叶价格和债务换算错误。",
    },
  });

  assert.equal(result.text, "rewritten chapter text");
  assert.equal(result.chapter_no, 1);
  const body = JSON.parse(requests[0].options.body);
  assert.match(body.input, /只输出正文/);
  assert.match(body.input, /修正茶叶价格和债务换算错误/);
  assert.doesNotMatch(body.input, /^task_type: rewrite_chapter/);
});

test("compatible provider honors custom timeoutMs for long tasks", async () => {
  let sawAbortSignal = false;
  const router = createModelRouter({
    provider: "deepseek",
    model: "deepseek-v4-pro",
    allowNetwork: true,
    timeoutMs: 480000,
    env: { DEEPSEEK_API_KEY: "ds-test" },
    fetch: async (_url, options) => {
      sawAbortSignal = Boolean(options.signal);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  bible: "项目圣经：主线、人设、商业承诺、逻辑硬规则和第一章前300字要求。",
                  settings: "设定库：时代规则、能力边界、资源来源和经营规则。",
                  relationships: "人物关系：主角、同盟、对手、情感牵引和资源方。",
                  volume: "第一卷纲：1-30章阶段目标、关键反转、伏笔和阶段成果。",
                  chapter_plan: "前10章细纲：每章开头、目标、冲突、爽点和章尾钩子。",
                }),
              },
            }],
          };
        },
      };
    },
  });

  const result = await router.invoke({
    task_type: "project_planning",
    project: { title: "长任务规划", idea: "宋朝茶商" },
  });

  assert.equal(sawAbortSignal, true);
  assert.match(result.text, /项目圣经/);
});
