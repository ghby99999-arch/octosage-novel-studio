const TASK_STAGE = {
  project_planning: "project_planning",
  title_suggestion: "project_planning",
  outline_deepen: "outline_deepen",
  generate_chapter_card: "chapter_card",
  write_chapter: "drafting",
  review_chapter: "review",
  rewrite_chapter: "rewrite",
  segment_patch: "segment_patch",
  extract_state_candidates: "memory",
  global_review: "global_review",
  reference_analysis: "reference_analysis",
  domain_knowledge: "domain_knowledge",
  dialogue_tuner: "dialogue_tuning",
  screenplay_adaptation: "screenplay",
  storyboard: "storyboard",
  video_prompt: "video_prompt",
};

const STAGE_RULES = {
  project_planning: [
    "Lock this book's contract first: premise, platform, genre, target length, protagonist, golden finger, core contradiction, and commercial promise.",
    "For long books, do not pretend to write every later detail at once. Build a stable macro arc, first 30 chapters in detail, next 70 in medium detail, and later arcs as refreshable blocks.",
    "Generate character relationships together with the outline. Every important character needs motive, information path, action path, first appearance, and future use.",
    "If the premise contains business, craft, game, combat, history, or investigation, define the evidence system that proves ability on page.",
  ],
  outline_deepen: [
    "Detailed outline is binding law for the next drafting batch. Each chapter must contain event, goal, conflict, protagonist action, visible evidence, payoff, cost, and tail pressure.",
    "Deepen in rolling batches. Never use generic filler for later chapters just to fill numbers.",
    "Preserve the exact current book premise, time, place, names, golden finger, and genre. Do not import old project facts or template openings.",
  ],
  chapter_card: [
    "A chapter card is an executable scene plan, not a summary. It must tell the writer what happens on screen and what visible result proves progress.",
    "Include at least six scene beats and at least three visible evidence items for the protagonist's ability.",
    "For the first three chapters, the first 300 Chinese characters must start from pressure, anomaly, action, or a visible result. No pasted outline summary or retrospective explanation.",
  ],
  drafting: [
    "Draft from the chapter card and project physics. Do not change the book's premise, names, era, golden finger, or current detailed outline.",
    "Write scenes through action, dialogue, objects, numbers, documents, messages, witnesses, and consequences. Avoid thesis-like explanation.",
    "Every chapter must contain a readable opening hook, at least one mid-scene turn, a delivered payoff, a cost/residue, and a concrete tail hook.",
    "If logic needs background, reveal it through current-scene evidence instead of pausing for author explanation.",
  ],
  review: [
    "Review is a publish-gate job, not praise. A/B only means publishable. A/S-level premium readiness needs separate evidence.",
    "Judge against project bible, character relationships, volume outline, recent memory, chapter card, and first-300-char opening standard.",
    "Separate hard blockers from improvement suggestions. Only hard blockers may trigger forced rewrite.",
    "Return specific risky segments and exact reasons, otherwise the repair queue cannot work.",
  ],
  rewrite: [
    "Repair only the diagnosed blockers. Preserve all solved scenes, strong paragraphs, continuity, chapter event order, and passed metrics.",
    "Do not shrink a full chapter into a summary. If only a sentence or paragraph is broken, use local repair instead of full rewrite.",
    "After repair, the same blocker must be gone. Replacing one formula sentence with another formula sentence is failure.",
  ],
  segment_patch: [
    "Patch only the marked segment. Keep surrounding plot facts, names, era, and continuity unchanged.",
    "Replace AI-like explanation or drop-risk wording with concrete action, dialogue, object handling, visible data, witness reaction, or consequence.",
    "Keep the replacement close to the original length unless the marked segment is pure process leak.",
  ],
  memory: [
    "Extract only facts actually written in the chapter. Do not infer future plot or repair missing logic by imagination.",
    "Track character state, relationship state, money/resource state, foreshadowing added/resolved, timeline, and risks.",
  ],
  global_review: [
    "Global review checks cross-chapter continuity, repeated rhythm, character motivation, forgotten debts, ability-source drift, and premise drift.",
    "Report the exact chapter and exact repair target. Do not make vague editorial comments without a repair path.",
  ],
  reference_analysis: [
    "Extract structure only: opening engine, chapter function, conflict ladder, payoff mechanism, character route, platform rhythm, and tail-hook pattern.",
    "Do not copy protected prose, distinctive sentences, character names, or proprietary worksheet text.",
    "One-click imitation must convert learned structure into this book's own premise, characters, rules, and evidence system.",
  ],
  domain_knowledge: [
    "Build usable writing knowledge: era constraints, profession rules, cost paths, documents, tools, institutions, slang, and common failure points.",
    "Flag uncertain knowledge separately. Do not let low-confidence facts enter the draft as truth.",
  ],
  dialogue_tuning: [
    "Dialogue repair changes voice and rhythm only. Do not change plot facts, decisions, or continuity.",
    "Make characters interrupt, misunderstand, joke, hide, push back, and reveal motive through speech behavior.",
  ],
  screenplay: [
    "Adapt scenes into visible action, conflict, location, character entrance, line purpose, and episode hook. Do not just summarize prose.",
  ],
  storyboard: [
    "Storyboard must include shot number, scale, camera movement, duration, visual focus, action, and emotional turn.",
  ],
  video_prompt: [
    "Video prompts must be concrete and tool-ready: subject, action, lens, camera motion, lighting, style, negative constraints, and continuity references.",
  ],
};

const PLATFORM_RULES_BY_STAGE = {
  fanqie: {
    project_planning: [
      "Fanqie male-channel planning prioritizes fast hooks, short feedback loops, visible payoff, and serial pull over slow literary setup.",
      "Golden three chapters must prove premise, protagonist advantage, and reader reward quickly.",
    ],
    drafting: [
      "Use mobile-readable paragraphs, dense feedback, short dialogue, and frequent scene turns.",
      "Each phone-screen beat should contain action, conflict, information gap, result change, or a new question.",
    ],
    review: [
      "Check drop-off risk harshly: static explanation, slow opening, weak payoff, unclear tail pressure, and AI-taste sentences are publish blockers.",
    ],
  },
  qidian: {
    project_planning: [
      "Qidian planning may carry more worldview and long game, but the opening still needs an event engine and forward pressure.",
    ],
    drafting: [
      "Allow more setting density than Fanqie, but every exposition beat must be paid by scene pressure or discovery.",
    ],
  },
};

const GENRE_RULES_BY_STAGE = {
  rebirth: {
    project_planning: [
      "Lock the return date and make the present-world state match that date. Future damage cannot already exist unless the premise explicitly says so.",
      "Future knowledge is timing, positioning, avoidance, and people-reading, not omniscient free profit.",
    ],
    chapter_card: [
      "Early rebirth chapter cards need shock, confirmation, current situation audit, cut-loss action, strategic choice, and low-cost first validation.",
    ],
    drafting: [
      "Show the protagonist reacting like a person before acting like a strategist. Do not jump straight from waking up to a finished business plan.",
    ],
    review: [
      "Check timeline causality and future-knowledge abuse. If ability appears without current-scene evidence, block publication.",
    ],
  },
  urban_business: {
    project_planning: [
      "Define money path, first customer path, merchant/resource path, cost risk, and public validation route before drafting.",
      "Business growth must move through visible proof: orders, ledgers, contracts, receipts, queues, screenshots, merchant reactions, or platform data.",
    ],
    drafting: [
      "Money-making scenes cannot feel like ordinary hard labor unless it is a brief setup for a smarter lever.",
      "A business win must leave residue: delivery pressure, refund risk, competitor attention, merchant demand, policy rule, or relationship cost.",
    ],
    review: [
      "Block chapters where business success is explained but not proven by action, numbers, contracts, traffic, witnesses, or cost.",
    ],
  },
  campus_business: {
    project_planning: [
      "Campus is a trust and traffic system, not just a chore list. Plan how students, teachers, dorms, merchants, and campus rules create leverage.",
    ],
    drafting: [
      "Use campus life as pressure and credibility: classes, counselors, dorm logistics, student groups, merchant coupons, notice boards, and queues.",
    ],
  },
  historical_business: {
    project_planning: [
      "Lock dynasty, institutions, taxation, trade documents, guild rules, money units, road limits, and official pressure.",
    ],
    drafting: [
      "Ability must be shown through ledgers, tax slips, contracts, tea permits, shop accounts, witnesses, official documents, or trade-site reactions.",
      "No modern business jargon unless translated into era-plausible behavior and documents.",
    ],
    review: [
      "Block anachronistic systems, objects, language, institutions, and ability proof that does not belong to the era.",
    ],
  },
  game: {
    project_planning: [
      "Lock rules, values, equipment, skill limits, player behavior, market rules, and verifiable gains.",
    ],
    drafting: [
      "Game advantage must come from mechanism understanding, operation, timing, team play, or market judgment, not author-side declaration.",
    ],
  },
  fantasy: {
    project_planning: [
      "Lock power levels, cultivation/combat cost, resource scarcity, factions, and consequence rules before drafting.",
    ],
    drafting: [
      "Combat payoff should land on moves, counters, injuries, resource use, witness reaction, and after-cost.",
    ],
  },
  suspense: {
    drafting: [
      "Each chapter must provide clue, misdirection, verification, and a new question. Do not advance only through explanation.",
    ],
    review: [
      "Check clue fairness and whether the new mystery is visible rather than author-hidden.",
    ],
  },
};

const CHAPTER_RANGE_RULES = {
  chapter_1: [
    "Chapter 1 has a hard opening gate: first 300 Chinese characters must contain current pressure, anomaly, action, or visible result.",
    "Chapter 1 must prove the premise without dumping the whole backstory. Use one immediate problem and one visible counteraction.",
  ],
  golden_three: [
    "Chapters 1-3 must establish protagonist advantage, emotional wound or desire, world rule, first payoff, and next-chapter pull.",
    "Do not spend the golden-three window on generic setup, static environment, or detached strategy explanation.",
  ],
  early_1_30: [
    "Chapters 1-30 must build the reader contract, recurring cast, repeatable rule system, first public validation, and a durable conflict ladder.",
  ],
  middle: [
    "Middle chapters need escalation and variation: new costs, stronger opponents, rule pressure, relationship movement, and delayed debt payoff.",
  ],
  late: [
    "Late chapters must close long debts, upgrade original objects/relationships, and return to the book's emotional core.",
  ],
};

const GENRE_PATTERNS = [
  ["rebirth", /重生|回到|重回|再来|前世|未来记忆/],
  ["urban_business", /都市|商业|创业|赚钱|外卖|首富|公司|商战|生意|团购|平台|流量|软件|程序|AI|短视频/],
  ["campus_business", /校园|大学|宿舍|食堂|学生|辅导员|社团|校内/],
  ["historical_business", /历史|穿越|宋朝|大宋|明朝|唐朝|三国|茶引|税单|契约|账册|商号|掌柜/],
  ["game", /游戏|玩家|副本|梦幻西游|长安城|装备|技能|数值/],
  ["fantasy", /玄幻|修仙|仙侠|宗门|境界|灵石|功法|战力/],
  ["suspense", /悬疑|推理|诡异|案件|线索|凶手|调查/],
];

export function taskStageForTask(taskType = "") {
  return TASK_STAGE[String(taskType || "")] || String(taskType || "general");
}

export function chapterRangeForChapter(chapterNo = 0) {
  const n = Number(chapterNo || 0);
  if (n === 1) return "chapter_1";
  if (n >= 1 && n <= 3) return "golden_three";
  if (n >= 1 && n <= 30) return "early_1_30";
  if (n >= 31 && n <= 1200) return "middle";
  if (n > 1200) return "late";
  return "unknown";
}

export function genreTagsForProject(project = {}) {
  const text = [
    project.genre,
    project.subgenre,
    project.tags,
    project.idea,
    project.title,
    project.platform,
  ].flat().filter(Boolean).join(" ");
  const tags = new Set();
  for (const [tag, pattern] of GENRE_PATTERNS) {
    if (pattern.test(text)) tags.add(tag);
  }
  if (!tags.size) tags.add("commercial_webnovel");
  return [...tags];
}

function platformKey(project = {}) {
  const value = String(project.platform || "").toLowerCase();
  if (/fanqie|番茄/.test(value)) return "fanqie";
  if (/qidian|起点/.test(value)) return "qidian";
  return value || "default";
}

function collectStageRules(source = {}, stage = "") {
  return [
    ...(source[stage] || []),
    ...(stage === "segment_patch" ? source.rewrite || [] : []),
  ];
}

function unique(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function writingRulesForTask(project = {}, taskType = "", options = {}) {
  const stage = options.stage || taskStageForTask(taskType);
  const chapterNo = Number(options.chapterNo || options.chapter_no || 0);
  const chapterRange = chapterRangeForChapter(chapterNo);
  const platform = platformKey(project);
  const genreTags = genreTagsForProject(project);
  const rules = [
    ...(STAGE_RULES[stage] || []),
    ...collectStageRules(PLATFORM_RULES_BY_STAGE[platform] || {}, stage),
    ...genreTags.flatMap((tag) => collectStageRules(GENRE_RULES_BY_STAGE[tag] || {}, stage)),
    ...(CHAPTER_RANGE_RULES[chapterRange] || []),
  ];
  if (options.rewriteFocus?.type) {
    rules.push(`Repair priority: fix "${options.rewriteFocus.type}" first. Do not touch unrelated solved content unless required for continuity.`);
  }
  return {
    version: 1,
    task_type: taskType,
    stage,
    platform,
    genre_tags: genreTags,
    chapter_no: chapterNo || null,
    chapter_range: chapterRange,
    rules: unique(rules),
    quality_contract: {
      publish_ready: "B means publishable; A/S means premium candidate only if premium gate also passes.",
      hard_blockers: [
        "premise drift",
        "timeline or world-rule contradiction",
        "ability without on-page evidence",
        "first-300 opening failure for chapter 1",
        "AI process leak or thesis-like explanation",
        "drop-risk segment remaining",
        "weak tail hook",
      ],
      repair_policy: "Repair hard blockers until publish-ready or report the exact reason repair cannot safely continue.",
    },
  };
}

export function modelLedgerTagsForTask(project = {}, task = {}) {
  const chapterNo = Number(
    task.chapter_no
      || task.chapter_card?.chapter_no
      || task.task_package?.chapter_no
      || task.review_context?.chapter_no
      || 0,
  );
  return {
    stage: taskStageForTask(task.task_type),
    platform: platformKey(project),
    genre_tags: genreTagsForProject(project),
    chapter_no: chapterNo || null,
    chapter_range: chapterRangeForChapter(chapterNo),
    target_words: Number(
      task.task_package?.output?.target_words
        || task.chapter_card?.target_words
        || project.target_words
        || 0,
    ) || null,
  };
}

export function diagnoseModelCall({
  status = "",
  task_type = "",
  duration_ms = 0,
  timeout_ms = 0,
  diagnostics = {},
  error = "",
} = {}) {
  const duration = Number(duration_ms || 0);
  const timeout = Number(timeout_ms || 0);
  const inputChars = Number(diagnostics.input_chars || 0);
  const sourceDraftChars = Number(diagnostics.source_draft_chars || 0);
  const firstDeltaMs = Number(diagnostics.stream_first_delta_ms || 0);
  const timedOut = /timeout|timed out|aborted|超时/i.test(String(error || ""))
    || (timeout > 0 && duration >= timeout * 0.96 && status === "error");
  let category = "normal";
  let root_cause = "call completed within expected runtime";
  const fixes = [];

  if (timedOut && diagnostics.stream_requested && !firstDeltaMs) {
    category = "no_first_token_timeout";
    root_cause = "provider did not return the first stream token before the task timeout";
    fixes.push("reduce prompt size or split task before retrying");
    fixes.push("prefer segment_patch for local repairs");
    fixes.push("mark this route slower for the same task/genre/chapter range");
  } else if (timedOut && firstDeltaMs) {
    category = "generation_timeout_after_stream_started";
    root_cause = "model started streaming but total generation exceeded timeout";
    fixes.push("use idle timeout plus max generation budget");
    fixes.push("lower target words for repair or split output into sections");
  } else if (inputChars >= 30000) {
    category = "prompt_too_large";
    root_cause = "input prompt is too large for reliable latency";
    fixes.push("compact context, use rolling memory, or split outline/rewrite task");
  } else if (sourceDraftChars >= 7000 && String(task_type) === "rewrite_chapter") {
    category = "full_rewrite_prompt_heavy";
    root_cause = "rewrite contains a long source draft; local repair should be preferred";
    fixes.push("use segment_patch for sentence/paragraph blockers");
  } else if (firstDeltaMs >= 30000) {
    category = "slow_first_token";
    root_cause = "provider first-token latency is high for this task";
    fixes.push("record route as slow and compare with alternate configured model");
  } else if (String(status) === "error") {
    category = "provider_error";
    root_cause = String(error || "provider call failed").slice(0, 160);
    fixes.push("check API key, base URL, quota, model name, and provider status");
  }

  return {
    category,
    root_cause,
    timed_out: timedOut,
    input_chars: inputChars || null,
    source_draft_chars: sourceDraftChars || null,
    stream_first_delta_ms: firstDeltaMs || null,
    recommended_fixes: fixes,
  };
}
