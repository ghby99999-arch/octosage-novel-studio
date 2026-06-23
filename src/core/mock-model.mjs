import {
  AI_TASTE_EXPLANATION_TERMS,
  findForbiddenViolations,
} from "./rules.mjs";

function cleanText(value, fallback = "") {
  return String(value || fallback).trim();
}

function splitKeywords(value = "") {
  const text = cleanText(value);
  const matches = text.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,12}/g) || [];
  return [...new Set(matches)].slice(0, 8);
}

function inferProtagonist(project = {}) {
  const text = `${project.title || ""} ${project.idea || ""} ${project.genre || ""}`;
  if (/程序|软件|AI|算法|代码|技术|工程师/.test(text)) return "林远";
  if (/宋朝|大宋|茶|商|穿越|古代|科举/.test(text)) return "沈砚";
  if (/游戏|网游|副本|玩家/.test(text)) return "周启";
  if (/修仙|宗门|灵根|丹药/.test(text)) return "顾青";
  if (/外卖|校园|创业|重生|商业/.test(text)) return "陈知远";
  return "许行";
}

function inferPartner(project = {}) {
  const text = `${project.title || ""} ${project.idea || ""} ${project.genre || ""}`;
  if (/宋朝|大宋|茶|商|穿越|古代/.test(text)) return "账房老秦";
  if (/程序|软件|AI|算法|代码|技术/.test(text)) return "产品经理苏晴";
  if (/游戏|网游|副本|玩家/.test(text)) return "队友阿峰";
  if (/修仙|宗门|灵根/.test(text)) return "外门师兄韩舟";
  return "同伴周立";
}

function projectHook(project = {}) {
  const idea = cleanText(project.idea, project.title || "新的故事");
  return idea.replace(/[。！？\s]+$/g, "");
}

function chapterGoal(project = {}, chapterNo = 1) {
  const hook = projectHook(project);
  if (chapterNo === 1) return `用一个具体场景把“${hook}”落到读者看得见的冲突里`;
  if (chapterNo <= 3) return "承接上一章结果，扩大第一个优势，并抛出更明确的阻力";
  if (chapterNo <= 10) return "推进资源、关系或规则压力，让主角用行动换来阶段性结果";
  return "兑现前文伏笔，同时抬高下一阶段的目标和代价";
}

function sceneFor(project = {}) {
  const text = `${project.idea || ""} ${project.genre || ""}`;
  if (/宋朝|大宋|茶|古代|穿越/.test(text)) return "街市茶肆";
  if (/程序|软件|AI|算法|代码/.test(text)) return "共享办公区";
  if (/校园|大学/.test(text)) return "校园食堂门口";
  if (/游戏|网游|副本/.test(text)) return "主城交易区";
  if (/修仙|宗门/.test(text)) return "外门试炼场";
  return "人群最密的现场";
}

export function makeChapterCard(project = {}, chapterNo = 1) {
  const title = cleanText(project.title, "新书");
  const idea = projectHook(project);
  const protagonist = inferProtagonist(project);
  const partner = inferPartner(project);
  const scene = sceneFor(project);
  const keywords = splitKeywords(`${idea} ${project.genre || ""}`);
  const coreKeyword = keywords[0] || "机会";
  const displayTitle = chapterNo === 1
    ? `第${chapterNo}章 ${coreKeyword}露出破绽`
    : `第${chapterNo}章 旧办法挡不住新局面`;
  const openingHook = chapterNo === 1
    ? `${protagonist}站在${scene}外，先听见的不是掌声，而是一句质疑。`
    : `${protagonist}刚把上一件事压下去，新的阻力已经堵到眼前。`;
  const mainEvent = chapterGoal(project, chapterNo);
  const visibleResult = chapterNo === 1
    ? "主角用一次可见行动证明这个创意不是空想"
    : "主角拿到一个能推动下一章的新结果";
  const tailHook = chapterNo === 1
    ? `有人认出${protagonist}的做法背后还有更大的空间。`
    : "更高一层的对手开始注意到这件事。";

  const characterAnchors = [
    {
      name: protagonist,
      surface: "看起来克制、不急着解释",
      core: "关键时刻先做出结果再说话",
      anchor: "表面克制，内核是用行动压过质疑",
      signature_action: "被误解时先把可验证的结果摆出来",
      signature_line: "别急，先看结果。",
      first_appearance_chapter: 1,
    },
    {
      name: partner,
      surface: "嘴上谨慎、习惯泼冷水",
      core: "一旦看到结果就会主动补位",
      anchor: "表面谨慎，内核是能被结果说服的协作者",
      signature_action: "先质疑，再替主角挡住现场杂音",
      signature_line: "你最好真有把握。",
      first_appearance_chapter: Math.min(chapterNo, 2),
    },
  ];

  return {
    chapter_no: chapterNo,
    display_title: displayTitle,
    opening_hook: openingHook,
    main_event: mainEvent,
    protagonist_action: `${protagonist}不解释概念，先在${scene}里完成一次可见验证。`,
    conflict: "旁人不相信这个机会能落地，规则和资源也在同时施压。",
    cool_point_type: "行动验证爽 + 误判反转爽",
    visible_result: visibleResult,
    tail_hook: tailHook,
    characters_in_scene: [
      { name: protagonist, role: "主角", anchor: characterAnchors[0].anchor },
      { name: partner, role: "协作者/质疑者", anchor: characterAnchors[1].anchor },
    ],
    character_anchors: characterAnchors,
    facts_required: [
      `当前作品：${title}`,
      `核心创意：${idea}`,
      "所有转折必须由正文内的行动和设定支撑，不能凭空开挂。",
    ],
    forbidden_items: [
      "不要套用其他项目的人物名、地点名或固定句子。",
      "不要只讲行业道理，必须写现场冲突和可见结果。",
      "不要出现模板开头复读。",
    ],
    target_words: 2600,
  };
}

function contextMarkers(taskPackage) {
  const context = taskPackage?.context;
  if (!context?.recent_batch_range || !context.batch_state) return [];
  const { from, to } = context.recent_batch_range;
  const characters = (context.batch_state.characters || [])
    .slice(0, 3)
    .map((item) => `STATE-CHARACTER-${item.name}`);
  return [`CHAPTER-CONTEXT-${taskPackage.chapter_no}`, `CONTEXT-RANGE-${from}-${to}`, ...characters, ""];
}

export function makeWeakDraft(card, taskPackage) {
  const protagonist = card.character_anchors?.[0]?.name || "陆川";
  return [
    "CHAPTER-MOCK-DEMO",
    "",
    "这是本地演示模型生成的占位内容，不是正式小说正文。",
    "",
    card.display_title,
    `主角：${protagonist}`,
    "",
    ...contextMarkers(taskPackage),
    `章卡开头：${card.opening_hook}`,
    `本章事件：${card.main_event}`,
    `可见结果：${card.visible_result}`,
    `章尾钩子：${card.tail_hook}`,
  ].join("\n");
}

export function makeStrongDraft(card, taskPackage) {
  const protagonist = card.character_anchors?.[0]?.name || "陆川";
  const testBeats = Array.from({ length: 18 }, (_, index) => {
    const no = index + 1;
    return [
      `测试段落${no}：主角先做出可见行动，旁人再给出即时反应，场景压力继续推进。`,
      `这一拍承接本章事件：${card.main_event}。结果不能靠旁白宣布，必须落在动作、物件、数据和人物反馈里。`,
      `有人质疑，有人沉默，有人开始重新计算利害，${card.visible_result || "可见结果"}因此变成下一步冲突。`,
    ].join("\n");
  });
  const lines = [
    "CHAPTER-MOCK-DEMO",
    "",
    "这是本地演示模型生成的占位内容，不是正式小说正文。请配置真实正文模型后再写作。",
    "",
    card.display_title,
    "陆川",
    "",
    ...contextMarkers(taskPackage),
    `章卡开头：${card.opening_hook}`,
    `本章事件：${card.main_event}`,
    `主角行动：${card.protagonist_action}`,
    `冲突：${card.conflict}`,
    `可见结果：${card.visible_result}`,
    `章尾钩子：${card.tail_hook}`,
    "",
    ...testBeats,
  ];
  return `${lines.join("\n")}\n`;
}

export function reviewText(text, card = {}) {
  const value = String(text || "");
  const explanationHits = AI_TASTE_EXPLANATION_TERMS.filter((term) => value.includes(term)).length;
  const hardRuleViolations = findForbiddenViolations(value, card.forbidden_items);
  const templateLeakTerms = [
    "张明轩",
    `${"后台数字"}先跳了出来`,
    `${"陆"}川`,
    `${"赵"}鹏`,
    `${"老"}周`,
    "梦幻西游",
    "长安城",
  ];
  const hasTemplateLeak = templateLeakTerms.some((term) => value.includes(term));
  const paragraphs = value.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const hasDialogue = /“[^”]{2,80}”/.test(value);
  const hasVisibleResult = card.visible_result ? value.includes(String(card.visible_result).slice(0, 6)) : false;
  const hasTailHook = card.tail_hook ? value.includes(String(card.tail_hook).slice(0, 6)) : false;
  const aiTaste = Math.min(100, explanationHits * 18 + (paragraphs.length < 8 ? 20 : 0));
  const issues = [
    ...hardRuleViolations,
    ...(hasTemplateLeak ? ["检测到其他项目模板词或固定旧句"] : []),
    ...(!hasDialogue ? ["对白不足，人物声音不够清晰"] : []),
    ...(!hasVisibleResult ? ["本章可见结果没有落到正文里"] : []),
    ...(!hasTailHook ? ["章尾钩子没有明确呈现"] : []),
    ...(aiTaste >= 35 ? ["AI解释味偏重，需要减少概念讲解"] : []),
  ];
  const publishable = issues.length === 0;
  return {
    grade: publishable ? "A" : issues.length <= 2 ? "B" : "D",
    scores: {
      opening_hook: value.includes(card.opening_hook?.slice(0, 6) || "___") ? 86 : 72,
      cool_point: hasVisibleResult ? 84 : 62,
      pacing: paragraphs.length >= 10 ? 82 : 64,
      character: hasDialogue ? 80 : 58,
      business_logic: 76,
      tail_hook: hasTailHook ? 86 : 55,
      ai_taste: aiTaste,
    },
    hard_rule_violations: hardRuleViolations,
    issues,
    keep: publishable ? ["现场冲突", "可见结果", "章尾钩子"] : ["保留当前章节目标"],
    remove: hasTemplateLeak ? ["其他项目模板词", "固定旧句"] : [],
    rewrite_direction: publishable
      ? ""
      : "围绕当前章卡定点修补：补强现场冲突、对白、可见结果和章尾钩子，删除任何旧项目模板词。",
    next_action: publishable ? "publish_gate_pass" : "targeted_repair",
  };
}

export function extractStateFromText({ chapterNo, text = "", card = {} }) {
  const protagonist = card.character_anchors?.[0]?.name || "主角";
  const partner = card.character_anchors?.[1]?.name || "同伴";
  const characterVoiceSamples = extractCharacterVoiceSamples({ chapterNo, text, card });
  return {
    meta: {
      source_chapter: chapterNo,
      source_version: "latest",
      extractor: "mock",
    },
    characters: [
      {
        name: protagonist,
        state: card.visible_result || "完成本章关键行动",
        source: `chapter:${chapterNo}`,
        confidence: 0.82,
      },
      {
        name: partner,
        state: "见证主角行动结果，关系进入下一阶段",
        source: `chapter:${chapterNo}`,
        confidence: 0.7,
      },
    ],
    relationships: [
      {
        from: protagonist,
        to: partner,
        change: "由质疑转为有限协作",
        source: `chapter:${chapterNo}`,
        confidence: 0.72,
      },
    ],
    business_state: [
      {
        item: "本章阶段结果",
        change: card.visible_result || "形成可见推进",
        source: `chapter:${chapterNo}`,
        confidence: 0.78,
      },
    ],
    money_orders: [],
    foreshadowing_added: [
      {
        hook: card.tail_hook || "下一章压力",
        source: `chapter:${chapterNo}`,
        confidence: 0.78,
      },
    ],
    foreshadowing_resolved: [],
    timeline: [
      {
        event: card.main_event || "本章事件",
        source: `chapter:${chapterNo}`,
        confidence: 0.8,
      },
    ],
    risks: [],
    character_voice_samples: characterVoiceSamples,
  };
}

function characterNamesForVoice(card = {}) {
  const names = new Set();
  for (const character of card.characters_in_scene || []) {
    if (typeof character === "string") {
      if (character) names.add(character);
    } else if (character?.name) {
      names.add(character.name);
    }
  }
  for (const anchor of card.character_anchors || []) {
    if (anchor?.name) names.add(anchor.name);
  }
  return [...names].filter(Boolean);
}

function voiceNoteForLine(line = "") {
  const notes = [];
  if (String(line).length <= 18) notes.push("短句");
  if (/[!?！？]/.test(line)) notes.push("情绪明确");
  if (/结果|负责|下一步|现在/.test(line)) notes.push("行动导向");
  return notes.join("，") || "代表性台词";
}

function extractCharacterVoiceSamples({ chapterNo, text = "", card = {} }) {
  const samples = [];
  for (const name of characterNamesForVoice(card)) {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`${escaped}[^\\n]{0,20}[：:]?\\s*“([^”]{2,120})”`, "g");
    let match;
    while ((match = pattern.exec(text)) && samples.filter((item) => item.name === name).length < 2) {
      const line = match[1].trim();
      samples.push({
        name,
        line,
        voice_note: voiceNoteForLine(line),
        source: `chapter:${chapterNo}`,
        chapter_no: chapterNo,
        confidence: 0.78,
      });
    }
  }
  return samples.slice(0, 12);
}
