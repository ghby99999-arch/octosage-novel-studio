import { getWorkspaceRoot, JsonRecord, safeText } from "@/views/PixsoAppShell";
import type { BookPlatform, ChapterListItem, ChapterReview, EditorReport, PublishGate } from "@/views/novel/types";

export const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error || response.statusText));
  return payload as T;
};

export const postJson = async <T,>(url: string, body: JsonRecord): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error || response.statusText));
  return payload as T;
};

export const postTask = async <T extends JsonRecord = JsonRecord>(url: string, body: JsonRecord): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    try {
      const payload = JSON.parse(text);
      throw new Error(String(payload?.error || response.statusText));
    } catch {
      throw new Error(text || response.statusText);
    }
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/data:\s*(\{[\s\S]*\})/);
    if (match) return JSON.parse(match[1]) as T;
    return {} as T;
  }
};

export const platformOptions = [
  { value: "fanqie", label: "番茄小说" },
  { value: "qidian", label: "起点中文网" },
  { value: "17k", label: "17K 小说网" },
] as const;

export const genreTagMap = {
  都市: ["重生", "商战", "创业", "神豪", "日常", "娱乐", "恋爱", "家庭", "职场", "外卖", "校园", "年代", "官场", "鉴宝", "医生", "直播", "短视频", "科技", "AI", "系统"],
  脑洞: ["系统", "规则怪谈", "无限流", "反派", "幕后流", "全民转职", "天灾", "灵气复苏", "直播整活", "高概念", "克苏鲁", "聊天群", "模拟器", "词条"],
  玄幻: ["升级", "废柴流", "宗门", "家族", "高武", "异世大陆", "无敌流", "反派流", "长生", "杀伐果断", "苟道", "天才流", "御兽"],
  仙侠: ["修仙", "凡人流", "宗门", "长生", "苟道", "剑修", "丹药", "阵法", "灵田", "家族修仙", "幕后流", "洪荒", "西游"],
  奇幻: ["领主", "西幻", "魔法", "骑士", "种田", "地下城", "冒险团", "龙族", "神明", "王国经营", "蒸汽朋克", "巫师"],
  武侠: ["江湖", "门派", "镖局", "朝堂", "复仇", "刀剑", "侠客", "武馆", "群像", "旧派武侠", "新派武侠"],
  历史: ["穿越", "种田", "经营", "争霸", "寒门", "科举", "权谋", "架空", "两宋", "大明", "唐朝", "三国", "茶商", "盐商", "基建"],
  游戏: ["网游", "梦幻西游", "电竞", "副本", "生活职业", "公会", "游戏制作", "主播", "开服", "版本", "交易行", "卡牌", "模拟经营"],
  科幻: ["末世", "星际", "机甲", "赛博", "基因", "人工智能", "废土", "宇宙文明", "时间循环", "灾变", "基地建设", "硬科幻"],
  悬疑: ["刑侦", "推理", "诡秘", "民俗", "探案", "心理", "都市异闻", "法医", "单元案", "长线谜团"],
  现实: ["职场", "创业", "家庭", "乡村", "行业文", "年代", "校园", "治愈", "烟火气", "小人物逆袭"],
  军事: ["特种兵", "谍战", "战争", "雇佣兵", "军工", "抗战", "现代战争", "指挥官", "后勤", "热血"],
  体育: ["足球", "篮球", "电竞体育", "教练", "青训", "重生运动员", "商业联盟", "热血竞技", "冠军路"],
  轻小说: ["校园", "恋爱", "日常", "异世界", "搞笑", "社团", "群像", "青春", "超能力"],
  现言: ["豪门", "职场", "甜宠", "先婚后爱", "破镜重圆", "娱乐圈", "带球跑", "追妻", "女性成长", "都市情感"],
  古言: ["宫斗", "宅斗", "权谋", "种田", "医妃", "女强", "重生", "穿越", "侯府", "庶女", "经商", "探案"],
} as const;

export const genreOptions = Object.keys(genreTagMap);
export const subgenreOptions = Array.from(new Set(Object.values(genreTagMap).flat()));
export const tagsForGenre = (genre = "") => genreTagMap[genre as keyof typeof genreTagMap] || subgenreOptions;

export const openingRuleProfiles = [
  {
    key: "history_business",
    label: "历史经营",
    match: /历史|宋朝|北宋|南宋|大宋|临安|茶引|茶商|茶铺|账册|契约|盐商|供应链|明朝|唐朝|三国|穿越|种田|茶|寒门|科举|争霸|权谋/,
    targetWords: 1800000,
    rules: ["时代约束", "技术可得性", "权力成本", "经营链路", "人物信息路径"],
  },
  {
    key: "rebirth_business",
    label: "重生商战",
    match: /重生|商战|创业|外卖|生意|商业|首富|程序员|软件|AI|科技|职场/,
    targetWords: 2000000,
    rules: ["时间线可信", "能力来源", "第一桶金路径", "公开验证", "每章可见结果"],
  },
  {
    key: "fantasy_upgrade",
    label: "玄幻升级",
    match: /玄幻|修仙|高武|升级|宗门|灵气|仙侠|废柴|家族|御兽/,
    targetWords: 2500000,
    rules: ["境界体系", "资源闭环", "敌我阶梯", "功法代价", "阶段地图"],
  },
  {
    key: "wuxia_chivalry",
    label: "武侠江湖",
    match: /武侠|江湖|门派|镖局|刀剑|侠客|武馆|朝堂/,
    targetWords: 1500000,
    rules: ["江湖规矩", "门派利益", "人物恩怨", "武力边界", "朝堂牵引"],
  },
  {
    key: "military_action",
    label: "军事行动",
    match: /军事|特种兵|谍战|战争|军工|雇佣兵|抗战|指挥官/,
    targetWords: 1600000,
    rules: ["任务目标", "战术可信", "组织纪律", "装备边界", "牺牲代价"],
  },
  {
    key: "game_system",
    label: "游戏系统",
    match: /游戏|系统|副本|玩家|梦幻西游|网游|面板|电竞|开服|公会/,
    targetWords: 1800000,
    rules: ["系统规则", "数值边界", "副本目标", "玩家生态", "奖励代价"],
  },
  {
    key: "sports_growth",
    label: "体育竞技",
    match: /体育|足球|篮球|青训|教练|运动员|冠军|竞技/,
    targetWords: 1500000,
    rules: ["训练闭环", "比赛目标", "数据成长", "队友对手", "商业赛事"],
  },
  {
    key: "urban_daily",
    label: "都市日常",
    match: /都市|日常|娱乐|神豪|恋爱|家庭|现实|治愈|烟火气/,
    targetWords: 1500000,
    rules: ["生活锚点", "关系张力", "短周期爽点", "误会转化", "角色口吻"],
  },
  {
    key: "romance_growth",
    label: "情感成长",
    match: /现言|古言|豪门|甜宠|先婚后爱|破镜重圆|宫斗|宅斗|女强|女性成长|追妻|医妃/,
    targetWords: 1200000,
    rules: ["情感契约", "关系拉扯", "身份压力", "女性成长线", "阶段性误会和修复"],
  },
] as const;

export const openingRuleProfileFor = (genre = "", subgenre = "", idea = "") => {
  const ideaText = String(idea || "");
  const genreText = `${genre} ${subgenre}`;
  const scoreProfile = (profile: typeof openingRuleProfiles[number]) => {
    let score = 0;
    if (profile.match.test(ideaText)) score += 100;
    if (profile.match.test(genreText)) score += 10;
    if (profile.key === "history_business" && /北宋|南宋|宋朝|大宋|临安|茶引|茶商|茶铺|账册|契约|盐商|供应链/.test(ideaText)) score += 40;
    if (profile.key === "rebirth_business" && /重生/.test(ideaText) && !/外卖|创业|商业|商战|程序员|软件|AI|科技|职场|首富/.test(ideaText)) score -= 20;
    return score;
  };
  return [...openingRuleProfiles]
    .sort((left, right) => scoreProfile(right) - scoreProfile(left))
    .find((profile) => scoreProfile(profile) > 0)
    || openingRuleProfiles[0];
};

export const openingGenreSuggestionFor = (genre = "", subgenre = "", idea = "") => {
  const profile = openingRuleProfileFor(genre, subgenre, idea);
  const ideaText = String(idea || "");
  if (profile.key === "history_business") {
    if (/茶引|茶商|茶铺|盐商/.test(ideaText)) return { genre: "历史", subgenre: "茶商" };
    if (/科举|寒门/.test(ideaText)) return { genre: "历史", subgenre: "科举" };
    if (/争霸|权谋|官府|朝堂/.test(ideaText)) return { genre: "历史", subgenre: "权谋" };
    return { genre: "历史", subgenre: "经营" };
  }
  if (profile.key === "game_system") {
    if (/梦幻西游/.test(ideaText)) return { genre: "游戏", subgenre: "梦幻西游" };
    if (/电竞/.test(ideaText)) return { genre: "游戏", subgenre: "电竞" };
    return { genre: "游戏", subgenre: "网游" };
  }
  if (profile.key === "fantasy_upgrade") {
    if (/修仙|仙侠/.test(ideaText)) return { genre: "仙侠", subgenre: "修仙" };
    if (/御兽/.test(ideaText)) return { genre: "玄幻", subgenre: "御兽" };
    return { genre: "玄幻", subgenre: "升级" };
  }
  if (profile.key === "rebirth_business") {
    if (/外卖/.test(ideaText)) return { genre: "都市", subgenre: "外卖" };
    if (/程序员|软件|AI|科技/.test(ideaText)) return { genre: "都市", subgenre: "科技" };
    if (/创业/.test(ideaText)) return { genre: "都市", subgenre: "创业" };
    return { genre: "都市", subgenre: "商战" };
  }
  return { genre, subgenre };
};

export const fallbackWorkspaceRoot = "";
export const effectiveWorkspaceRoot = (value?: string) => String(value || getWorkspaceRoot() || fallbackWorkspaceRoot).trim();

const uniqueTitles = (items: string[]) => {
  const seen = new Set<string>();
  return items
    .map((item) => String(item || "")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, "")
      .replace(/[。！？，、；;.]/g, "")
      .trim())
    .filter((item) => item.length >= 2)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 3);
};

const keywordCandidates = (text: string) => {
  const keywords = [
    "北宋", "南宋", "大宋", "临安", "茶引", "茶商", "茶铺", "账册", "契约", "盐商",
    "宋朝", "明朝", "唐朝", "三国", "梦幻西游", "外卖", "校园", "创业", "生意",
    "供应链", "商战", "官场", "种田", "长生", "反派", "高武", "游戏", "茶叶",
    "团购", "短视频", "AI", "软件", "程序员", "算法", "系统", "重生", "穿越",
    "玄幻", "历史", "末世", "赘婿", "神豪", "日常", "娱乐", "都市", "修仙",
  ];
  return keywords.filter((item) => text.includes(item));
};

export const titleCandidatesFallback = (idea: string, platform: BookPlatform | string, genre = "") => {
  const ideaText = String(idea || "").trim();
  const text = `${ideaText} ${genre}`.trim();
  const keywords = keywordCandidates(text);
  const genreWords = new Set(genre.split(/[\/,\s]+/).filter(Boolean));
  const first = keywords.find((item) => ideaText.includes(item) && !["穿越", "重生", "历史", "都市"].includes(item))
    || keywords.find((item) => !genreWords.has(item) && !["穿越", "重生", "历史", "都市"].includes(item))
    || keywords.find((item) => !["穿越", "重生", "历史"].includes(item))
    || keywords[0]
    || "逆袭";
  const second = keywords.find((item) => item !== first && ideaText.includes(item) && !["穿越", "重生", "历史", "都市"].includes(item))
    || keywords.find((item) => item !== first && !genreWords.has(item) && !["穿越", "重生", "历史", "都市"].includes(item))
    || genre.split(/[\/,\s]+/).find((item) => item && item !== "都市")
    || "人生";
  const year = text.match(/(19|20)\d{2}/)?.[0] || "";
  const hasHistory = /北宋|南宋|宋朝|大宋|临安|茶引|明朝|唐朝|三国|历史|穿越/.test(text);
  const hasBusiness = /外卖|创业|商业|生意|赚钱|首富|公司|商战|茶叶|茶商|茶铺|茶引|账册|契约|供应链|商号|团购/.test(text);
  const hasGame = /游戏|梦幻西游|长安城|副本|玩家/.test(text);
  const hasTech = /AI|软件|程序|代码|算法|黑客|人工智能/.test(text);
  const hasSystem = /系统|面板|签到|词条/.test(text);

  if (platform === "qidian") {
    if (hasHistory && hasBusiness) return uniqueTitles([`重生${first}：从${second}开始改写商路`, `${first}商路：一纸契约定江南`, `回到${first}，我用账册改命`]);
    if (hasHistory) return uniqueTitles([`穿越${first}：从${second}开始改写天下`, `${first}风云：我的时代从一局生意开始`, `回到${first}，我重开山河`]);
    if (hasGame) return uniqueTitles([`${first}：长安城里的商业棋局`, `我在${first}里重启人生`, `${first}世界的幕后玩家`]);
    if (hasTech) return uniqueTitles([`${year ? `重启${year}` : "重生"}：我的技术商业时代`, `从代码开始重写人生`, `被裁后我用算法翻盘`]);
    if (hasBusiness) return uniqueTitles([`${year ? `重启${year}` : "重生"}：商业版图从一单开始`, `都市之从${first}到首富`, `我的商业时代重新开始`]);
    return uniqueTitles([`${first}之后，我重写人生剧本`, `从低谷开始的${second}时代`, `我的时代重新开始`]);
  }

  if (hasHistory && hasBusiness) return uniqueTitles([`重生${first}：开局用${second}救茶铺`, `人在${first}，我靠账册改命`, `回到${first}，一纸契约定江南`]);
  if (hasHistory) return uniqueTitles([`穿越${first}：开局从${second}赚钱`, `人在${first}，我靠生意改命`, `回到${first}，从小买卖到权倾天下`]);
  if (hasGame) return uniqueTitles([`${first}：开局长安城摆摊`, `梦回长安，我在${first}赚疯了`, `我靠${first}副本逆袭成神`]);
  if (hasTech) return uniqueTitles([`${year ? `重生${year}` : "重生"}：从技术翻盘到商业帝国`, `被裁后，我靠代码逆袭`, `开局一套软件，我杀回巅峰`]);
  if (hasBusiness) return uniqueTitles([`${year ? `重生${year}` : "重生"}：从${first}到商业帝国`, `开局一单${first}，我成了首富`, `回到过去，我靠${first}逆袭`]);
  if (hasSystem) return uniqueTitles([`开局觉醒${first}系统，我杀疯了`, `${first}系统：我把人生刷成神作`, `绑定${first}后，我一路逆袭`]);
  return uniqueTitles([`${first}重启，我不再低头`, `开局${first}，我逆转人生`, `重来一次，我把${second}写成传奇`]);
};

export const chapterBadge = (chapter: ChapterListItem) => {
  if (chapter.is_mock || chapter.status === "mock") return "!";
  if (chapter.status === "ready") return chapter.publish_ready ? "发" : "修";
  if (chapter.is_next) return "...";
  return "-";
};

export const gradeText = (grade?: string | null) => {
  const value = safeText(grade, "");
  return value ? `${value}级质检` : "待审";
};

export const blockerText = (value?: string) => ({
  reviewer_invalid: "审查员无效",
  weak_review_fallback: "审查员输出过薄",
  review_grade_below_publish: "质检等级未到发布线",
  hard_quality_flag_active: "命中硬规则",
  ai_process_leak: "过程说明泄露",
  drop_risk_segments_remaining: "仍有弃读风险段",
  tail_hook_below_publish: "章尾钩子不够强",
  micro_hook_density_below_publish: "微钩子密度不足",
  coolpoint_density_below_publish: "爽点兑现不足",
  retention_prediction_below_publish: "追读预测不足",
  story_room_contract_not_delivered: "章卡承诺未落正文",
  ai_taste_below_publish: "AI味偏重",
  fact_consistency_violation: "设定事实冲突",
  publish_gate_not_ready: "发布门禁未通过",
  template_opening_inertia: "模板开头复读",
  inline_risk_segments: "正文存在风险句",
}[String(value || "")] || safeText(value, "待优化"));

export const gateFrom = (
  content?: { publish_gate?: PublishGate | null } | null,
  review?: { publish_gate?: PublishGate | null } | null,
  editorReport?: { publish_gate?: PublishGate | null } | null,
  chapter?: { publish_gate?: PublishGate | null } | null,
) => editorReport?.publish_gate || review?.publish_gate || content?.publish_gate || chapter?.publish_gate || null;

export const metricScore = (editorReport: EditorReport | null | undefined, key: string) => {
  const metrics = (editorReport?.quality_metrics || {}) as JsonRecord;
  const value = metrics[key] as JsonRecord | undefined;
  const score = Number(value?.score ?? value?.value ?? value);
  return Number.isFinite(score) ? score : null;
};

export const publishLabel = (gate?: PublishGate | null, fallback = "待审") => {
  if (!gate) return fallback;
  if (gate.failure_type === "reviewer_invalid" || gate.status === "reviewer_invalid") return "审查员无效";
  if (gate.publish_ready) return "可发布";
  return safeText(gate.label, "需自动优化");
};

export const chapterClass = (chapter: ChapterListItem, selected: boolean) => {
  const parts = ["octo-chapter-row"];
  if (selected) parts.push("active");
  if (chapter.status === "ready") parts.push("ready");
  if (chapter.is_next) parts.push("next");
  if (chapter.is_mock) parts.push("mock");
  return parts.join(" ");
};

export const wordCount = (value = "") => String(value || "").replace(/\s/g, "").length;

export const riskTokens = (text = "", segments: ChapterReview["risky_segments"] = []) => {
  const matches = (segments || [])
    .map((segment, index) => {
      const rawPreview = String(segment.preview || "").trim();
      const preview = rawPreview.length > 180 ? rawPreview.slice(0, 180) : rawPreview;
      if (!preview) return null;
      let at = text.indexOf(preview);
      let matchedText = preview;
      if (at < 0 && rawPreview.length > 30) {
        const shortPreview = rawPreview.slice(0, 60);
        at = text.indexOf(shortPreview);
        matchedText = shortPreview;
      }
      if (at < 0) return null;
      return { index, at, end: at + matchedText.length, segment };
    })
    .filter(Boolean)
    .sort((a, b) => (a?.at || 0) - (b?.at || 0)) as Array<{
      index: number;
      at: number;
      end: number;
      segment: NonNullable<ChapterReview["risky_segments"]>[number];
    }>;

  const tokens: Array<{ text: string; risk?: boolean; segment?: NonNullable<ChapterReview["risky_segments"]>[number] }> = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.at < cursor) continue;
    if (match.at > cursor) tokens.push({ text: text.slice(cursor, match.at) });
    tokens.push({ text: text.slice(match.at, match.end), risk: true, segment: match.segment });
    cursor = match.end;
  }
  if (cursor < text.length) tokens.push({ text: text.slice(cursor) });
  return tokens.length ? tokens : [{ text }];
};

export const factText = (item: JsonRecord | undefined, fallback = "未命名") => safeText(
  item?.summary || item?.state || item?.anchor || item?.hook || item?.name,
  fallback,
);
