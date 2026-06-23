function textValue(value, fallback = "") {
  return String(value || fallback || "").trim();
}

function listValue(value) {
  if (Array.isArray(value)) return value.map((item) => textValue(item)).filter(Boolean);
  return textValue(value)
    .split(/[、，,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function phaseForChapter(chapterNo) {
  if (chapterNo <= 3) return "开局钩子";
  if (chapterNo <= 10) return "第一结果";
  if (chapterNo <= 20) return "规则扩张";
  return "第一卷反转";
}

export const STORY_ROOM_REQUIRED_FIELDS = [
  "章节功能",
  "触发事件",
  "主角欲望",
  "行动选择",
  "可见证据",
  "公开反馈",
  "代价残留",
  "关系推进",
  "章尾债务",
];

export function auditStoryRoomChapterPlan(chapterPlan = "") {
  const text = String(chapterPlan || "");
  const chapterBlocks = [];
  for (const match of text.matchAll(/##\s*第\s*(\d+)\s*章([\s\S]*?)(?=\n##\s*第\s*\d+\s*章|$)/g)) {
    chapterBlocks.push({
      chapter_no: Number(match[1]),
      text: String(match[2] || ""),
    });
  }
  const genericPatterns = [
    /让主角通过可信能力和选择解决问题/,
    /用可信能力和选择解决问题/,
    /留下下一章必须点开的新变量/,
    /本章必须完成一个读者可感知的小结果/,
    /资源、规则、人物关系或时间压力/,
  ];
  const genericHits = genericPatterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
  const inspected = chapterBlocks.slice(0, 30).map((block) => {
    const missing = STORY_ROOM_REQUIRED_FIELDS.filter((field) => !block.text.includes(field));
    return {
      chapter_no: block.chapter_no,
      missing,
      field_coverage: Number(((STORY_ROOM_REQUIRED_FIELDS.length - missing.length) / STORY_ROOM_REQUIRED_FIELDS.length).toFixed(2)),
    };
  });
  const completeChapters = inspected.filter((item) => item.missing.length === 0).length;
  const averageCoverage = inspected.length
    ? Number((inspected.reduce((sum, item) => sum + item.field_coverage, 0) / inspected.length).toFixed(2))
    : 0;
  const weakChapters = inspected.filter((item) => item.field_coverage < 0.85);
  return {
    chapter_count: chapterBlocks.length,
    inspected_count: inspected.length,
    complete_chapters: completeChapters,
    average_coverage: averageCoverage,
    generic_hits: genericHits,
    weak_chapters: weakChapters,
    missing_fields: [...new Set(weakChapters.flatMap((item) => item.missing))],
    status: chapterBlocks.length >= 25 && completeChapters >= 25 && averageCoverage >= 0.9 && genericHits === 0
      ? "pass"
      : "fail",
  };
}

function domainObjects(project = {}) {
  const text = `${project.idea || ""} ${project.genre || ""} ${project.golden_finger || ""}`;
  if (/茶|茶叶|茶铺|茶引|汴京|宋/.test(text)) {
    return {
      field: "茶叶生意",
      object: "账册、茶引、税单、契约和茶样",
      place: "茶铺、码头、税关或商户柜台",
      firstTrial: "一笔小茶单或一份茶引核验",
      publicSignal: "掌柜改口、客商围观、账册对上或税单露出破绽",
      risk: "茶价波动、税引限制、货色掺假、契约反噬",
    };
  }
  if (/外卖|校园|订单|商户|配送/.test(text)) {
    return {
      field: "校园本地生活",
      object: "菜单、订单、现金、路线图和商户账本",
      place: "食堂后门、宿舍楼下或商户档口",
      firstTrial: "一条路线上的小样本试单",
      publicSignal: "商户愿意再试、室友改变态度、订单签收或账本对上",
      risk: "履约超时、退单、商户压价、宿管规则",
    };
  }
  if (/娱乐|明星|短剧|直播|视频/.test(text)) {
    return {
      field: "内容生意",
      object: "脚本、账号后台、合同、播放数据和现场反应",
      place: "片场、直播间、公司会议室或校园活动现场",
      firstTrial: "一次低成本内容验证",
      publicSignal: "评论转向、播放曲线抬头、合作方追加资源",
      risk: "舆论反噬、合同陷阱、平台规则变化",
    };
  }
  return {
    field: "主线事业",
    object: "账册、契约、凭证、物件、订单或现场结果",
    place: "冲突发生的现场",
    firstTrial: "一次低成本验证",
    publicSignal: "旁人态度变化、资源方给出回应、结果被公开看见",
    risk: "成本、规则、关系或时间压力反噬",
  };
}

function chapterFunction(chapterNo, project = {}) {
  const domain = domainObjects(project);
  if (chapterNo === 1) return `用${domain.object}把创意落成第一场可见冲突，前300字必须先有动作和现场压力`;
  if (chapterNo === 2) return "承接首章结果，让第一次试探出现真实成本和旁人误判";
  if (chapterNo === 3) return "把第一轮小结果公开化，让主角能力第一次被外部角色重新评估";
  if (chapterNo <= 10) return `围绕${domain.field}连续验证小闭环，每章兑现一个可见结果并留下新成本`;
  if (chapterNo <= 20) return "把单点验证推成可复制规则，引入资源、关系和外部竞争的双线压力";
  return "集中回收前20章伏笔，完成第一卷成果，同时抬出更高层级对手或规则";
}

function chapterTrigger(chapterNo, project = {}, event = "") {
  const domain = domainObjects(project);
  if (event) return event;
  if (chapterNo === 1) return `主角在${domain.place}撞见一个可以立刻验证的痛点，手里只有${domain.object}能证明判断`;
  if (chapterNo === 2) return `上一章的小结果引来质疑，${domain.risk}第一次压到现场`;
  if (chapterNo === 3) return `第一次试验结果被更多人看见，资源方或对手开始改变报价和态度`;
  if (chapterNo <= 10) return `上一章留下的订单、凭证或人情债发酵，逼主角继续扩一步`;
  if (chapterNo <= 20) return `早期规则开始被模仿、阻拦或误解，主角必须补上制度漏洞`;
  return `第一卷前面埋下的账、人情或规则债集中回头，迫使主角做取舍`;
}

export function buildStoryRoomChapterOutlineBlock(project = {}, chapterNo = 1, options = {}) {
  const title = textValue(project.title, "新书");
  const idea = textValue(project.idea, title);
  const protagonist = textValue(project.protagonist_name, "主角");
  const supporting = listValue(project.supporting_characters);
  const partner = supporting[(chapterNo - 1) % Math.max(1, supporting.length)] || "关键配角";
  const domain = domainObjects(project);
  const phase = textValue(options.phase, phaseForChapter(chapterNo));
  const event = textValue(options.event || options.main_event || options.core_event);
  const trigger = textValue(options.trigger || options.opening || options.hook, chapterTrigger(chapterNo, project, event));
  const goal = textValue(options.goal, chapterNo === 1
    ? `让${protagonist}用现场行动证明${idea}不是口号`
    : `把上一章结果推进成一个新的可见成果`);
  const conflict = textValue(options.conflict, `${domain.risk}与人物误判同时出现，不能靠解释解决`);
  const action = textValue(options.action || options.protagonist_action, chapterNo === 1
    ? `${protagonist}先做${domain.firstTrial}，用${domain.object}当场留下证据`
    : `${protagonist}选择一个更聪明但有代价的行动，先解决现场最硬的问题`);
  const evidence = textValue(options.evidence || options.visible_result, `${domain.object}、人物反应和现场结果必须至少出现两项`);
  const publicFeedback = textValue(options.public_feedback, domain.publicSignal);
  const residue = textValue(options.residue || options.cost, `${domain.risk}留下下一章必须处理的后果`);
  const relationship = textValue(options.relationship, `${partner}因为本章结果改变对${protagonist}的判断、立场或利益关系`);
  const tailDebt = textValue(options.tail_hook || options.next_hook, `一个人、一张凭证、一通消息或一条规则把${protagonist}推向下一章`);
  const coolPoint = textValue(options.payoff || options.cool_point, "爽点不靠旁白夸聪明，必须落在证据、反应和结果变化上");
  return [
    `## 第 ${chapterNo} 章`,
    "",
    `- 所属段落：${phase}。`,
    `- 章节功能：${chapterFunction(chapterNo, project)}。`,
    `- 触发事件：${trigger}。`,
    `- 主角欲望：${goal}。`,
    `- 核心冲突：${conflict}。`,
    `- 行动选择：${action}。`,
    `- 可见证据：${evidence}。`,
    `- 公开反馈：${publicFeedback}。`,
    `- 爽点兑现：${coolPoint}。`,
    `- 代价残留：${residue}。`,
    `- 关系推进：${relationship}。`,
    `- 章尾债务：${tailDebt}。`,
    chapterNo === 1
      ? "- 前300字门禁：禁止粘贴章卡摘要、倒叙解释或作者说明；必须直接写动作、物件、冲突和第一处现场反应。"
      : "- 开头门禁：承接上一章章尾债务，先写现场动作，不用总结式过渡。",
    "",
  ].join("\n");
}

export function buildOpeningThirtyChapterPlan(project = {}, options = {}) {
  const title = textValue(project.title, "新书");
  const targetChapters = Number(options.estimatedChapters || 30);
  return [
    `# ${title} · 前 30 章滚动细纲`,
    "",
    `本细纲先锁定开局 30 章，用于支撑约 ${targetChapters || 30} 章的长篇连载。后续每写完 10 章自动复审并滚动刷新下一段细纲。`,
    "",
    ...Array.from({ length: 30 }, (_, index) => buildStoryRoomChapterOutlineBlock(project, index + 1)),
  ].join("\n");
}
