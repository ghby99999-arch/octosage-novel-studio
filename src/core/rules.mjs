export const UNIVERSAL_STORY_RULES = [
  "严格服从本书创意、题材、平台、时代、主角姓名、配角姓名、世界规则和当前章细纲，不得借用旧项目设定。",
  "每章必须有现场目标、明确阻力、主角行动、可见结果、关系变化或新压力，不能只写总结和分析。",
  "主角能力必须通过本题材里的行动证据展示，例如账册、订单、契约、技能操作、战斗结果、现场反应、数据变化或人物态度变化。",
  "第一章前三百字必须进入当下压力、反常事件、目标或动作，不得粘贴章卡摘要、倒叙解释或作者说明。",
  "爽点必须在场景里兑现：误判被结果打脸、资源被撬动、规则被利用、收益落袋、对手付出代价或关系被推进。",
  "章尾必须留下具体的新压力、新人、新消息、新物件、新结果或未兑现问题，不能用主题总结收尾。",
  "所有新增人物必须有信息路径、行动路径和当前动机，不能为了剧情突然出现。",
  "每章写完必须同步人物、关系、伏笔、资源、金钱/订单/战力/权势状态和下一章债务。",
];

export const PLATFORM_RULES = {
  fanqie: [
    "番茄男频优先强钩子、短段落、快反馈、连续小胜和章尾追读压力。",
    "开局三章必须尽快证明主角优势和题材卖点，避免慢热世界观铺陈。",
    "对白要短，人物反应要密，读者每个手机屏都应看到动作、冲突、信息差或结果变化。",
  ],
  qidian: [
    "起点风格允许更强设定感和格局，但每章仍必须有场景推进和信息增量。",
    "世界观、体系、职业规则必须通过事件逐步露出，不得一次性说明书式灌输。",
  ],
  default: [
    "目标平台未明确时，按商业网文通用标准执行：强开局、强动作、强反馈、低解释。",
  ],
};

export const GENRE_RULES = {
  都市: [
    "都市题材必须让钱、人情、规则、职场、家庭压力或商业机会落在真实场面中。",
    "商业动作必须写清成本、资源、执行难点和可见回报，不能凭空成功。",
  ],
  重生: [
    "重生优势来自信息差、经验、避坑和时机选择，不能写成无来源全知全能。",
    "当前时间线不能提前出现未来才会发生的结果；未来记忆只能影响选择和判断。",
  ],
  历史: [
    "历史题材能力来源必须通过账册、税单、契约、文书、现场交易、官府规则或旁人反应展示。",
    "不得出现不合时代的制度、物件、语言、职业和现代术语，除非本书设定明确允许。",
  ],
  玄幻: [
    "玄幻题材必须锁定修炼体系、战力层级、代价和资源稀缺性，不能无成本升级。",
    "战斗爽点要落在招式、规则、反制、伤势、旁观者反应和战后代价上。",
  ],
  游戏: [
    "游戏题材必须写清规则、数值、装备、任务、玩家行为和可验证收益。",
    "优势来自机制理解、操作、市场判断或团队协作，不靠作者旁白判定主角厉害。",
  ],
  仙侠: [
    "仙侠题材要锁定宗门、资源、境界、因果和人情债，机缘必须有代价或风险。",
  ],
  悬疑: [
    "悬疑题材每章必须提供线索、误导、验证和新疑问，不能只靠解释推进。",
  ],
};

function splitGenreTags(genre = "") {
  return String(genre || "")
    .split(/[、,，/\\\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function writingRulesForProject(project = {}) {
  const platform = String(project.platform || "").toLowerCase();
  const genreText = `${project.genre || ""} ${project.idea || ""} ${project.title || ""}`;
  const genreTags = new Set(splitGenreTags(project.genre));
  for (const key of Object.keys(GENRE_RULES)) {
    if (genreText.includes(key)) genreTags.add(key);
  }
  const genreRules = [...genreTags].flatMap((tag) => GENRE_RULES[tag] || []);
  return [
    ...UNIVERSAL_STORY_RULES,
    ...(PLATFORM_RULES[platform] || PLATFORM_RULES.default),
    ...genreRules,
  ];
}

export const PROJECT_HARD_RULES = UNIVERSAL_STORY_RULES;

export const CONTEXT_HARD_RULES = [
  ...UNIVERSAL_STORY_RULES,
  "废弃草稿事实不得进入任务包；被回退版本只能作为反面记录，不能污染正文连续性。",
];

export const AI_TASTE_EXPLANATION_TERMS = [
  "\u5546\u4e1a\u4ef7\u503c",
  "\u6838\u5fc3\u6218\u573a",
  "\u9ad8\u901f\u53d1\u5c55",
  "\u5fc5\u987b\u628a\u63e1",
  "\u672a\u6765\u7684\u5165\u53e3",
  "\u5e73\u53f0\u9700\u8981\u6570\u636e",
  "\u672c\u5730\u751f\u6d3b\u670d\u52a1\u4f1a\u6210\u4e3a",
  "\u5e73\u53f0\u7ade\u4e89",
];

export const AI_PREFIX_PATTERNS = [
  /^\u597d\u7684[\uff0c,\u3002]?\u8fd9\u662f.*\u7ae0\u8282[:\uff1a]?$/,
  /^\u4ee5\u4e0b\u662f.*\u6b63\u6587[:\uff1a]?$/,
  /^\u4e0b\u9762\u662f.*\u6b63\u6587[:\uff1a]?$/,
];

export const AI_SUFFIX_PATTERNS = [
  /^\u4ee5\u4e0a\u5c31\u662f\u672c\u7ae0\u5185\u5bb9[\u3002.]?$/,
  /^\u672c\u7ae0\u5b8c[\u3002.]?$/,
];

export const AI_PROCESS_LEAK_PATTERNS = [
  /\u8ba9\u6211(?:\u4ed4\u7ec6)?(?:\u5206\u6790|\u601d\u8003|\u7406\u89e3|\u6784\u601d|\u5f00\u59cb\u5199)/,
  /\u6211\u9700\u8981(?:\u91cd\u5199|\u5199|\u5206\u6790|\u89e3\u51b3|\u6309\u7167|\u7ee7\u7eed)/,
  /\u4efb\u52a1(?:\u8bf4\u660e|\u8981\u6c42|\u5305|\u662f)/,
  /\u8bc4\u5206\u6700\u9ad8\u7684.*\u5019\u9009/,
  /\u6838\u5fc3\u4e8b\u4ef6\u662f/,
  /\u6839\u636e\u7ae0\u8282\u5185\u5bb9/,
  /\u73b0\u5728\u6211\u9700\u8981/,
  /\u8fd9\u5c31\u662f\u5f00\u5934/,
  /\u6309\u7167\u7ae0\u8282\u5927\u7eb2/,
  /\u5f00\u5934\uff08?\u524d\s*300\s*\u5b57/,
  /Let me (?:analyze|think|understand|write)/i,
  /I need to (?:rewrite|write|analyze|fix)/i,
  /task (?:instructions?|requirements?|package)/i,
  /according to the (?:outline|chapter card|instructions?)/i,
];

export const AI_MARKDOWN_PATTERNS = [
  /^```/,
];

const FORBIDDEN_STOPWORDS = new Set([
  "do",
  "not",
  "mention",
  "write",
  "appear",
  "avoid",
  "forbidden",
  "\u4e0d\u8981",
  "\u4e0d\u80fd",
  "\u51fa\u73b0",
  "\u5199",
]);

export function hasAiExplanation(text) {
  return AI_TASTE_EXPLANATION_TERMS.some((term) => String(text || "").includes(term));
}

export function hasAiProcessLeak(text) {
  const sample = String(text || "").slice(0, 4000);
  return AI_PROCESS_LEAK_PATTERNS.some((pattern) => pattern.test(sample));
}

export function isAiWrapperLine(line) {
  const value = String(line || "").trim();
  return [...AI_PREFIX_PATTERNS, ...AI_SUFFIX_PATTERNS, ...AI_MARKDOWN_PATTERNS].some((pattern) =>
    pattern.test(value),
  );
}

export function forbiddenKeywords(rule) {
  if (typeof rule !== "string") return [];
  const asciiWords = rule.match(/[A-Za-z][A-Za-z0-9_-]{3,}/g) || [];
  const cjkWords = rule.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const cjkCoreWords = cjkWords
    .map((word) =>
      word
        .replace(/^\u4e0d\u8981\u5199/, "")
        .replace(/^\u4e0d\u8981\u8ba9/, "")
        .replace(/^\u4e0d\u80fd\u51fa\u73b0/, "")
        .replace(/^\u4e0d\u51fa\u73b0/, "")
        .replace(/^\u7981\u6b62/, "")
        .replace(/^\u907f\u514d/, "")
        .replace(/^\u4e0d\u8981/, "")
        .replace(/^\u4e0d\u80fd/, "")
        .replace(/^\u51fa\u73b0/, "")
        .replace(/^\u5199/, ""),
    )
    .filter((word) => word.length >= 2);
  return [...asciiWords, ...cjkWords, ...cjkCoreWords]
    .map((word) => word.trim())
    .filter((word) => word && !FORBIDDEN_STOPWORDS.has(word.toLowerCase()));
}

export function findForbiddenViolations(text, forbiddenItems = []) {
  const violations = [];
  for (const forbidden of forbiddenItems) {
    for (const keyword of forbiddenKeywords(forbidden)) {
      if (text.includes(keyword)) {
        violations.push(`Forbidden item appears: ${keyword}`);
      }
    }
  }
  return [...new Set(violations)];
}
