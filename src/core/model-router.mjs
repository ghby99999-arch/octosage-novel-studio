import {
  makeChapterCard,
  makeStrongDraft,
  makeWeakDraft,
  extractStateFromText,
  reviewText,
} from "./mock-model.mjs";
import {
  assertChapterCard,
  assertReview,
  assertStateCandidates,
  completeChapterCardCharacterAnchors,
} from "./schemas.mjs";

const DEFAULT_OPENAI_TIMEOUT_MS = 120000;
const DEFAULT_OPENAI_MAX_RETRIES = 2;
const DEFAULT_OPENAI_RETRY_DELAY_MS = 500;

function sanitizeMockTitle(value = "") {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "")
    .replace(/[。！？,.，、；;：:]/g, "")
    .trim()
    .slice(0, 22);
}

function uniqueMockTitles(items = []) {
  const seen = new Set();
  return items
    .map(sanitizeMockTitle)
    .filter((item) => item.length >= 2)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 3);
}

function makeTitleSuggestions(task = {}) {
  const idea = String(task.idea || "");
  const genre = String(task.genre || "");
  const text = `${idea} ${genre}`;
  const keywords = [
    "大宋", "宋朝", "明朝", "唐朝", "三国", "重生", "穿越", "系统", "外卖", "校园",
    "商战", "创业", "生意", "修仙", "玄幻", "历史", "末世", "赘婿", "神豪", "日常",
    "娱乐", "官场", "种田", "长生", "反派", "高武", "都市", "游戏", "梦幻西游",
    "茶叶", "茶商", "AI", "软件", "程序员", "算法", "短视频", "团购",
  ].filter((item) => text.includes(item));
  const first = keywords.find((item) => !["穿越", "重生", "历史"].includes(item)) || keywords[0] || "逆袭";
  const second = keywords.find((item) => item !== first && !["穿越", "重生", "历史"].includes(item))
    || genre.split(/[\/,，\s]+/).find(Boolean)
    || "人生";
  const year = text.match(/(19|20)\d{2}/)?.[0] || "";
  const hasHistory = /宋朝|大宋|明朝|唐朝|三国|历史|穿越/.test(text);
  const hasBusiness = /外卖|创业|商业|生意|赚钱|首富|公司|商战|茶叶|茶商|团购/.test(text);
  const hasGame = /游戏|梦幻西游|长安城|副本|玩家/.test(text);
  const hasTech = /AI|软件|程序|代码|算法|黑客|人工智能/.test(text);

  if (task.platform === "qidian") {
    if (hasHistory) return uniqueMockTitles([`穿越${first}：从${second}开始改写天下`, `${first}风云：我的时代从一门生意开始`, `回到${first}，我重开山河`]);
    if (hasGame) return uniqueMockTitles([`${first}：长安城里的商业棋局`, `我在${first}里重启人生`, `${first}世界的幕后玩家`]);
    if (hasTech) return uniqueMockTitles([`${year || "重启"}：我的技术商业时代`, `从代码开始重写人生`, `被裁后我用算法翻盘`]);
    if (hasBusiness) return uniqueMockTitles([`${year ? `重启${year}` : "重生"}：商业版图从一单开始`, `都市之从${first}到首富`, `我的商业时代重新开始`]);
  }

  if (hasHistory) return uniqueMockTitles([`穿越${first}：开局从${second}赚钱`, `人在${first}，我靠生意改命`, `回到${first}，从小买卖到权倾天下`]);
  if (hasGame) return uniqueMockTitles([`${first}：开局长安城摆摊`, `梦回长安，我在${first}赚疯了`, `我靠${first}副本逆袭成神`]);
  if (hasTech) return uniqueMockTitles([`${year ? `重生${year}` : "重生"}：从技术翻盘到商业帝国`, `被裁后，我靠代码逆袭`, `开局一套软件，我杀回巅峰`]);
  if (hasBusiness) return uniqueMockTitles([`${year ? `重生${year}` : "重生"}：从${first}到商业帝国`, `开局一单${first}，我成了首富`, `回到过去，我靠${first}逆袭`]);
  return uniqueMockTitles([`${first}重启，我不再低头`, `开局${first}，我逆转人生`, `重来一次，我把${second}写成传奇`]);
}

function createMockProvider() {
  return {
    async invoke(task) {
      if (task.task_type === "title_suggestion") {
        return { titles: makeTitleSuggestions(task) };
      }

      if (task.task_type === "generate_chapter_card") {
        return assertChapterCard(makeChapterCard(task.project, task.chapter_no));
      }

      if (task.task_type === "write_chapter" || task.task_type === "rewrite_chapter") {
        const card = assertChapterCard(task.chapter_card);
        const text = makeStrongDraft(card, task.task_package);
        return { chapter_no: card.chapter_no, text };
      }

      if (task.task_type === "review_chapter") {
        return assertReview(reviewText(task.text || "", task.chapter_card));
      }

      if (task.task_type === "extract_state_candidates") {
        return assertStateCandidates(
          extractStateFromText({
            chapterNo: task.chapter_no,
            text: task.text || "",
            card: task.chapter_card,
          }),
        );
      }

      if (task.task_type === "outline_deepen") {
        const from = Number(task.from || 1);
        const to = Number(task.to || from);
        return {
          chapters: Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => {
            const chapterNo = from + index;
            return `第${chapterNo}章：CHAPTER-MOCK-DEMO outline refresh / 目标承接全局复审 / 冲突升级 / 可见结果 / 章尾新压力`;
          }),
          text: "CHAPTER-MOCK-DEMO outline_deepen",
        };
      }

      if (task.task_type === "global_review") {
        return {
          status: "pass",
          summary: "CHAPTER-MOCK-DEMO global review only validates workflow wiring.",
          cross_chapter_issues: [],
        };
      }

      throw new Error(`Unsupported mock task: ${task.task_type}`);
    },
  };
}

function createReviewOverrideProvider(review) {
  const selectedProvider = createMockProvider();
  return {
    async invoke(task) {
      if (task.task_type === "review_chapter") {
        return assertReview({
          scores: {
            opening_hook: 30,
            cool_point: 30,
            pacing: 30,
            character: 30,
            business_logic: 30,
            tail_hook: 30,
            ai_taste: 80,
          },
          risky_segments: [{ preview: "mock review blocker", reason: "mock_override" }],
          keep: ["current premise"],
          remove: ["weak execution"],
          rewrite_direction: "Mock review override supplies enough detail for publish-gate tests.",
          ...review,
        });
      }
      return selectedProvider.invoke(task);
    },
  };
}

function normalizeEndpointBase(rawBaseUrl = "") {
  return String(rawBaseUrl || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim()
    .replace(/\/+$/, "");
}

function openAiResponsesUrl(rawBaseUrl = "") {
  const value = normalizeEndpointBase(rawBaseUrl);
  if (!value) return "https://api.openai.com/v1/responses";
  if (/\/responses$/i.test(value)) return value;
  if (/\/v1$/i.test(value)) return `${value}/responses`;
  return `${value}/v1/responses`;
}

function compatibleChatCompletionsUrl(rawBaseUrl = "", fallback = "") {
  const value = normalizeEndpointBase(rawBaseUrl || fallback || "");
  if (!value) return "";
  if (/\/chat\/completions$/i.test(value)) return value;
  if (/\/v1$/i.test(value)) return `${value}/chat/completions`;
  return `${value}/v1/chat/completions`;
}

function shouldUseOpenAiResponses(rawBaseUrl = "") {
  const value = normalizeEndpointBase(rawBaseUrl);
  if (!value) return true;
  return /\/responses$/i.test(value);
}

function targetedRewriteRules(rewriteFocus, chapterNo = 0) {
  if (!rewriteFocus) return "";
  const type = String(rewriteFocus.type || "");
  return [
    "",
    "定向返工硬规则：",
    `- 返工类型：${type || "targeted_rewrite"}`,
    "- 必须先处理 rewrite_focus.source_issue 指向的问题；如果问题没有消失，本轮视为失败。",
    type === "historical_logic_repair"
      ? "- 历史/逻辑硬伤必须彻底删除或替换：不得出现不合时代的书名、制度、官职、术语、现代词和后世知识；用当场可见的账册、税单、契约、茶引、钱款、证人反应和行动结果证明主角能力。"
      : "",
    type === "ability_source_repair"
      ? "- 能力来源必须用行动展示：禁止用“他上辈子是……”或“他前世做过……”等直白旁白；改为现场核账、追问细节、指出单据破绽、旁人反应和结果反差。"
      : "",
    type === "first_300_hook_repair"
      ? "- 前300字必须重做：不得粘贴章卡摘要，不得作者介入，不得倒叙解释；直接从当前冲突、压脸物件、人物动作和第一个可见结果开场。"
      : "",
    Number(chapterNo) === 1
      ? "- 第一章返工额外要求：前300字优先保留现场压迫和主角反击，不做设定说明；背景只能通过对话、动作、物件和结果自然露出。"
      : "",
  ].filter(Boolean).join("\n");
}

function targetedRewriteRulesSafe(rewriteFocus, chapterNo = 0) {
  if (!rewriteFocus) return "";
  const type = String(rewriteFocus.type || "");
  return [
    "",
    "TARGETED REWRITE HARD RULES:",
    `- Repair type: ${type || "targeted_rewrite"}`,
    "- Fix rewrite_focus.source_issue first. If that exact issue still remains, this rewrite is a failure.",
    type === "historical_logic_repair"
      ? "- Historical/logic repair: remove or replace every detail that violates this book's era, world rules, profession system, power system, or platform setting. Prove the protagonist's ability with evidence that belongs to THIS book and THIS scene: actions, props, skills, records, contracts, system feedback, combat outcomes, transaction outcomes, witness reactions, or visible consequences. Do not import evidence types from another genre."
      : "",
    type === "ability_source_repair"
      ? "- Ability-source repair: do not explain with direct narration such as 'he did this in his previous life'. Choose visible proof from the current genre and scene: professional action, reasoning process, skill use, prop operation, deal/combat/investigation/social result, other characters' reactions, or environmental change."
      : "",
    type === "structural_scene_repair"
      ? "- Structural-scene repair: the failed draft is missing required scene execution, not just wording. Rewrite the chapter as a complete scene chain while preserving the strongest usable opening, names, era, conflict, and tail-hook direction. It must contain: immediate pressure, concrete obstacle, protagonist action, evidence/prop/data, other-character reaction, visible result, and a new ending pressure. For business/campus-service chapters, put menu/route/cash/ledger/order/reconciliation/merchant trial into on-page action instead of summary."
      : "",
    type === "first_300_hook_repair"
      ? "- First-300 repair: rewrite the opening. Do not paste chapter-card summaries, do not use author commentary, and do not use flashback explanation. Start with the current conflict, a pressure object, character action, and the first visible result."
      : "",
    type === "coolpoint_boost"
      ? "- Coolpoint repair: add at least two visible payoffs inside the current chapter event. Use action, transaction/result data, witness reaction, opponent cost, object evidence, or public reversal. Do not merely explain that the protagonist won. Preserve any already-strong tail hook, natural prose, and low-risk paragraphs."
      : "",
    type === "retention_boost"
      ? "- Retention repair: raise reader pull by adding opening pressure, micro-hooks between beats, a mid-scene turn, and a concrete final must-read-next pressure. Remove slow explanation instead of adding padding."
      : "",
    type === "story_room_contract_repair"
      ? "- Story-room contract repair: the chapter card's public_feedback, cost_residue, relationship_shift, and chapter_debt must land on-page as visible action, dialogue, object evidence, consequence, changed stance, and concrete tail pressure. Do not summarize these items; dramatize them."
      : "",
    type === "micro_hook_boost"
      ? "- Micro-hook repair: insert small unresolved pulls every mobile-screen-length beat: message/call interruption, visible data change, witness reaction, object clue, mistaken assumption, or new cost."
      : "",
    type === "strengthen_tail_hook"
      ? "- Tail-hook repair: change only the ending pressure zone unless continuity requires a tiny setup earlier. End on a concrete event, message, object, person, reversal, or question that forces the next chapter."
      : "",
    type === "drop_risk_repair"
      ? "- Drop-risk repair: replace highlighted/static/explanation-heavy lines with action, dialogue, object handling, scene feedback, or concrete result changes. Do not leave the original risky wording. Do not replace one formula/explanation sentence with another formula/explanation sentence. If the risk is accounting/business-plan speech, show the money/order/cost through physical action such as counting cash, crossing a ledger line, handing over a receipt, merchant reaction, runner fatigue, or a changed order result. Keep at least 85% of the source draft unless the marked risk itself is massive."
      : "",
    type === "remove_explanation"
      ? "- AI-taste repair: delete thesis sentences, strategic summaries, and repeated frames. Let the scene prove meaning through actions, dialogue, objects, numbers, and reactions. Do not weaken existing coolpoint payoff, tail-hook pressure, or retention hooks."
      : "",
    type === "publish_grade_lift" || type === "publish_gate_repair"
      ? "- Publish-gate repair: preserve the strongest solved paragraphs and all metrics that already pass. Repair remaining blockers only: logic, AI taste, risk lines, coolpoints, retention, micro-hooks, and tail hook. The output must still read as one coherent chapter."
      : "",
    Number(chapterNo) === 1
      ? "- Chapter 1 extra rule: keep the first 300 Chinese characters focused on immediate pressure and protagonist counteraction. Expose background only through dialogue, action, objects, and results."
      : "",
  ].filter(Boolean).join("\n");
}

function compactRewriteTaskPackage(taskPackage = {}) {
  const context = taskPackage.context || {};
  const planning = context.project_planning || {};
  const batchState = context.batch_state || {};
  const card = taskPackage.chapter_card || {};
  const stageContract = taskPackage.stage_rule_contract || {};
  return {
    chapter_no: taskPackage.chapter_no,
    chapter_card_digest: compactReviewChapterCard(card),
    story_room_execution: taskPackage.story_room_execution
      ? {
          status: taskPackage.story_room_execution.status,
          public_feedback: compactTextForPrompt(taskPackage.story_room_execution.public_feedback, 140),
          cost_residue: compactTextForPrompt(taskPackage.story_room_execution.cost_residue, 140),
          relationship_shift: compactTextForPrompt(taskPackage.story_room_execution.relationship_shift, 140),
          chapter_debt: compactTextForPrompt(taskPackage.story_room_execution.chapter_debt, 140),
          required_fields: Array.isArray(taskPackage.story_room_execution.required_fields)
            ? taskPackage.story_room_execution.required_fields.slice(0, 4)
            : [],
        }
      : null,
    planning_execution_gaps: compactPromptItems(taskPackage.planning_execution_gaps || [], 3, 90),
    opening_hook_candidates: taskPackage.opening_hook_candidates
      ? {
          use_first_300_chars: taskPackage.opening_hook_candidates.use_first_300_chars,
          candidates: compactPromptItems(taskPackage.opening_hook_candidates.candidates || [], 2, 100),
        }
      : null,
    early_chapter_quality_standard: taskPackage.early_chapter_quality_standard
      ? compactTextForPrompt(JSON.stringify(taskPackage.early_chapter_quality_standard), 220)
      : null,
    rhythm_transfer: taskPackage.rhythm_transfer
      ? compactTextForPrompt(JSON.stringify(taskPackage.rhythm_transfer), 180)
      : null,
    domain_knowledge: compactPromptItems(taskPackage.domain_knowledge || [], 2, 90),
    hard_rules: compactPromptItems([
      ...(stageContract.quality_contract?.hard_blockers || []),
      ...(taskPackage.hard_rules || []),
    ], 6, 80),
    output: taskPackage.output || {},
    context: {
      narrative_context: context.narrative_context || null,
      due_foreshadowing_debts: context.due_foreshadowing_debts || context.foreshadowing_debts || null,
      active_information_gaps: context.active_information_gaps || context.information_gaps || null,
      scene_character_anchors: compactPromptItems(context.scene_character_anchors || [], 3, 100),
      project_planning: {
        title: planning.title,
        idea: planning.idea,
        genre: planning.genre,
        platform: planning.platform,
        target_words: planning.target_words,
        golden_finger: planning.golden_finger || planning.goldenFinger,
        project_bible: compactTextForPrompt(planning.project_bible, 120),
        settings: compactTextForPrompt(planning.settings, 120),
        character_relationships: compactTextForPrompt(planning.character_relationships, 160),
        fine_outline_window: compactTextForPrompt(planning.fine_outline_window || planning.fine_outline, 220),
        forbidden_cross_project_terms: compactPromptItems(planning.forbidden_cross_project_terms || planning.forbidden_terms || [], 5, 60),
      },
      batch_state: {
        timeline: compactPromptItems(batchState.timeline || [], 2, 80),
        characters: compactPromptItems(batchState.characters || [], 3, 80),
        relationships: compactPromptItems(batchState.relationships || [], 3, 80),
        business_state: compactPromptItems(batchState.business_state || [], 2, 80),
        money_orders: compactPromptItems(batchState.money_orders || [], 2, 80),
        foreshadowing_added: compactPromptItems(batchState.foreshadowing_added || [], 2, 80),
        risks: compactPromptItems(batchState.risks || [], 2, 80),
      },
    },
    stage_rule_contract: compactSegmentPatchRuleContract(stageContract),
    context_budget: taskPackage.context_budget || null,
  };
}

function compactWritingTaskPackage(taskPackage = {}, fallbackCard = {}) {
  const context = taskPackage.context || {};
  const planning = context.project_planning || {};
  const batchState = context.batch_state || {};
  const card = taskPackage.chapter_card || fallbackCard || {};
  const stageContract = taskPackage.stage_rule_contract || {};
  return {
    chapter_no: taskPackage.chapter_no,
    chapter_card_digest: compactReviewChapterCard(card),
    story_room_execution: taskPackage.story_room_execution
      ? {
          status: taskPackage.story_room_execution.status,
          public_feedback: compactTextForPrompt(taskPackage.story_room_execution.public_feedback, 140),
          cost_residue: compactTextForPrompt(taskPackage.story_room_execution.cost_residue, 140),
          relationship_shift: compactTextForPrompt(taskPackage.story_room_execution.relationship_shift, 140),
          chapter_debt: compactTextForPrompt(taskPackage.story_room_execution.chapter_debt, 140),
          required_fields: Array.isArray(taskPackage.story_room_execution.required_fields)
            ? taskPackage.story_room_execution.required_fields.slice(0, 4)
            : [],
        }
      : null,
    planning_execution_gaps: compactPromptItems(taskPackage.planning_execution_gaps || [], 3, 90),
    opening_hook_candidates: taskPackage.opening_hook_candidates
      ? {
          use_first_300_chars: taskPackage.opening_hook_candidates.use_first_300_chars,
          candidates: compactPromptItems(taskPackage.opening_hook_candidates.candidates || [], 2, 100),
        }
      : null,
    early_chapter_quality_standard: taskPackage.early_chapter_quality_standard
      ? compactTextForPrompt(JSON.stringify(taskPackage.early_chapter_quality_standard), 260)
      : null,
    rhythm_transfer: taskPackage.rhythm_transfer
      ? compactTextForPrompt(JSON.stringify(taskPackage.rhythm_transfer), 220)
      : null,
    domain_knowledge: compactPromptItems(taskPackage.domain_knowledge || [], 2, 90),
    hard_rules: compactPromptItems([
      ...(stageContract.quality_contract?.hard_blockers || []),
      ...(taskPackage.hard_rules || []),
    ], 6, 80),
    output: taskPackage.output || {},
    context: {
      narrative_context: context.narrative_context || null,
      due_foreshadowing_debts: context.due_foreshadowing_debts || context.foreshadowing_debts || null,
      active_information_gaps: context.active_information_gaps || context.information_gaps || null,
      scene_character_anchors: compactPromptItems(context.scene_character_anchors || [], 3, 100),
      project_planning: {
        title: planning.title,
        idea: planning.idea,
        genre: planning.genre,
        platform: planning.platform,
        target_words: planning.target_words,
        golden_finger: planning.golden_finger || planning.goldenFinger,
        project_bible: compactTextForPrompt(planning.project_bible, 120),
        settings: compactTextForPrompt(planning.settings, 120),
        character_relationships: compactTextForPrompt(planning.character_relationships, 160),
        fine_outline_window: compactTextForPrompt(planning.fine_outline_window || planning.fine_outline, 220),
        anti_cross_project_rules: compactPromptItems(planning.anti_cross_project_rules || [], 2, 80),
        forbidden_cross_project_terms: compactPromptItems(planning.forbidden_cross_project_terms || [], 5, 60),
      },
      batch_state: {
        timeline: compactPromptItems(batchState.timeline || [], 2, 80),
        characters: compactPromptItems(batchState.characters || [], 3, 80),
        relationships: compactPromptItems(batchState.relationships || [], 3, 80),
        business_state: compactPromptItems(batchState.business_state || [], 2, 80),
        money_orders: compactPromptItems(batchState.money_orders || [], 2, 80),
        foreshadowing_added: compactPromptItems(batchState.foreshadowing_added || [], 2, 80),
        risks: compactPromptItems(batchState.risks || [], 2, 80),
      },
    },
    stage_rule_contract: compactSegmentPatchRuleContract(stageContract),
    context_budget: taskPackage.context_budget || null,
  };
}

function openAiSegmentPatchInput(task) {
  const card = task.chapter_card || {};
  const focus = task.rewrite_focus || {};
  const originalSegment = String(task.source_draft_text || task.original_segment || "").trim();
  const localContext = String(task.segment_context || task.local_context || "").trim();
  return [
    "You are a senior Chinese commercial webnovel line editor.",
    "Task: patch ONLY the marked problematic prose segment. Do not rewrite the full chapter.",
    "",
    "Output rules:",
    "- Output only the replacement prose segment.",
    "- Do not output JSON, Markdown, explanation, analysis, labels, or quotes around the answer.",
    "- Keep the same plot fact, character names, era, location, and continuity.",
    "- Replace static explanation, AI-like summary, repeated sentence pattern, or drop-risk wording with visible action, dialogue, object handling, data/result change, scene feedback, or concrete consequence.",
    "- The replacement should usually be close to the original segment length. Do not shrink it into a summary.",
    "- If the segment contains business/accounting exposition, show money/order/cost through physical action such as cash, ledger, receipt, queue, merchant reaction, rider fatigue, or changed order result.",
    "",
    "Chapter digest:",
    JSON.stringify({
      chapter_no: card.chapter_no,
      title: compactTextForPrompt(card.display_title, 80),
      main_event: compactTextForPrompt(card.main_event, 160),
      protagonist_action: compactTextForPrompt(card.protagonist_action, 160),
      visible_result: compactTextForPrompt(card.visible_result, 160),
      tail_hook: compactTextForPrompt(card.tail_hook, 140),
    }, null, 2),
    "",
    "Repair focus:",
    JSON.stringify(compactSegmentPatchFocus(focus), null, 2),
    "",
    "Story-room execution contract:",
    JSON.stringify(task.task_package?.story_room_execution || {}, null, 2),
    "",
    "Stage-specific writing rules:",
    JSON.stringify(compactSegmentPatchRuleContract(task.stage_rule_contract || task.task_package?.stage_rule_contract || {}), null, 2),
    "",
    "Local context:",
    compactTextForPrompt(localContext, 700),
    "",
    "Problem segment to replace:",
    compactTextForPrompt(originalSegment, 900),
    "",
    "Replacement prose segment:",
  ].join("\n");
}

function compactSegmentPatchFocus(focus = {}) {
  const risk = focus.risk_segment || {};
  const storyRoomMissingFields = Array.isArray(focus.story_room_missing_fields)
    ? focus.story_room_missing_fields.slice(0, 4)
    : [];
  const storyRoomMissingLabels = Array.isArray(focus.story_room_missing_labels)
    ? focus.story_room_missing_labels.slice(0, 4)
    : [];
  return {
    type: focus.type,
    source_issue: compactTextForPrompt(focus.source_issue, 220),
    instruction: compactTextForPrompt(focus.instruction, 260),
    patch_scope: focus.patch_scope,
    story_room_missing_fields: storyRoomMissingFields,
    story_room_missing_labels: storyRoomMissingLabels,
    risk_segment: risk
      ? {
          preview: compactTextForPrompt(risk.preview || risk.text || risk.content, 180),
          reason: compactTextForPrompt(risk.reason, 160),
          reasons: compactPromptItems(risk.reasons || [], 3, 100),
          severity: risk.severity,
          scope: risk.scope,
        }
      : undefined,
  };
}

function compactSegmentPatchRuleContract(contract = {}) {
  return {
    task_type: contract.task_type,
    stage: contract.stage,
    platform: contract.platform,
    genre_tags: Array.isArray(contract.genre_tags) ? contract.genre_tags.slice(0, 5) : contract.genre_tags,
    chapter_no: contract.chapter_no,
    rules: compactPromptItems(contract.rules || [], 4, 90),
    quality_contract: contract.quality_contract
      ? {
          hard_blockers: compactPromptItems(contract.quality_contract.hard_blockers || [], 4, 80),
          repair_policy: compactTextForPrompt(contract.quality_contract.repair_policy, 100),
        }
      : undefined,
  };
}

function openAiWriteChapterInput(task) {
  const card = task.chapter_card || {};
  const originalTaskPackage = task.task_package || {};
  const rewriteFocus = task.rewrite_focus;
  const sourceDraftText = String(task.source_draft_text || "");
  if (
    task.rewrite_strategy === "segment_patch"
    || task.patch_mode === "segment"
    || task.patch_mode === "synthetic_segment"
  ) {
    return openAiSegmentPatchInput(task);
  }
  const isRewrite = task.task_type === "rewrite_chapter" || Boolean(sourceDraftText);
  const taskPackage = isRewrite
    ? compactRewriteTaskPackage(originalTaskPackage)
    : compactWritingTaskPackage(originalTaskPackage, card);
  const targetWords = taskPackage.output?.target_words || card.target_words || 2600;
  const chapterNo = Number(card.chapter_no || task.chapter_no || 0);
  const charactersInScene = Array.isArray(card.characters_in_scene)
    ? card.characters_in_scene
        .map((item) => typeof item === "string" ? item : [item?.name, item?.role].filter(Boolean).join(":"))
        .filter(Boolean)
        .join(", ")
    : "";
  const firstChapterLock = chapterNo === 1
    ? [
        "- FIRST_CHAPTER_LOCK: 第一章必须从项目圣经和章卡指定的当场冲突进入，不允许套用旧项目场景、旧职业、旧金手指或旧开头。",
        "- FIRST_CHAPTER_LOCK: 前 300 个中文字符必须完成：当下压力 -> 主角行动 -> 身份/处境锚点 -> 第一个可见结果或反差。",
        "- FIRST_CHAPTER_LOCK: 如果是重写，只修复审稿指出的问题，不得把当前创意改成其他题材或其他项目。",
      ].join("\n")
    : "";
  const cardText = JSON.stringify(card);
  const firstBusinessLock = chapterNo === 1 && /重生|创业|商业|商战|经营|外卖|校园|商户|订单|账册|契约|成本|利润|现金流|食堂|配送/.test(cardText)
    ? [
        "- FIRST_BUSINESS_CONTRACT: 第一章只写低成本现场验证，不写完整创业成功、不写大额押金、不买车、不抵押、不搭平台。",
        "- FIRST_BUSINESS_CONTRACT: 前300字禁止倒叙解释重生过程；可以用一句身体反应或物件错位带出重生，但立刻回到眼前冲突。",
        "- FIRST_BUSINESS_CONTRACT: 交易方式只允许现金、饭票、欠条或当面结算；禁止微信转账、支付宝转账、扫码付款、二维码收款、手机余额。",
        "- FIRST_BUSINESS_CONTRACT: 本章核心道具必须是手写账页/账本/账册，不得写成草稿纸、手机备忘录、订单纸背面或普通路线图。",
        "- FIRST_BUSINESS_CONTRACT: 老周不能立刻信任或正式合作；必须让他核算出餐、配送费、饭凉风险、赔偿责任，再只同意两单试跑或继续观察。",
        "- FIRST_BUSINESS_CONTRACT: 主角能力必须通过现金数额、账页核算、路线试跑、商户/顾客现场反应展示，不用“他前世知道”直接解释。",
      ].join("\n")
    : "";
  const continuityLock = [
    "- CONTINUITY_LOCK: 严格使用章卡和项目规划中的人物姓名、身份、地点、关键物件、时代规则和题材规则，不得替换成旧项目设定。",
    charactersInScene ? `- CONTINUITY_LOCK: Characters in this chapter card: ${charactersInScene}. Keep these names unless the card explicitly introduces another person.` : "",
    "- CONTINUITY_LOCK: 所有能力、资源、商业动作或题材规则必须有来源、成本、限制和可见后果。",
    "- FEASIBILITY_LOCK: 商业、经营、赚钱、供应链、校园服务、历史交易等章节必须写清资金来源、资源获取路径、信息来源、试单/验证步骤、成本风险和利润波动。",
    "- FEASIBILITY_LOCK: 金手指只能帮助判断方向，不能直接生成已经谈好的合同、现成客户、无代价利润或凭空知道的商户信息。",
    "- REWRITE_LOCK: task_type 为 rewrite_chapter 时，只修审稿问题，不改变章卡要求的事件顺序、主角行动、可见结果和章尾钩子。",
    "- PROSE_LOCK: 不用“读者会觉得”“观众会看到”等元叙述；只写动作、对话、物件和后果。",
  ].filter(Boolean).join("\n");
  return [
    "你是中文男频长篇网文写手。",
    "任务：根据章卡、项目规划和任务包，直接写本章正文。",
    "",
    "硬性输出要求：",
    "- 只输出正文。",
    "- 不解释。",
    "- 不输出 JSON。",
    "- 不输出章卡字段名。",
    "- 不写创作说明、分析、总结。",
    "- 开头直接进入事件。",
    "- 前 300 字优先使用任务包 opening_hook_candidates 中评分最高的开头方向；不要用环境描写或身份解释开篇。",
    "- 第一章前 300 字不能粘贴章卡摘要、不能倒叙解释，必须让人物在现场做事，并让一个可见证据出现。",
    "- 段落短，适合手机阅读。",
    "- 对话和行动推进，不靠旁白解释。",
    "- STORY_ROOM_EXECUTION_LOCK: task_package.story_room_execution.public_feedback 必须写成角色当场反应、改口、围观、报价、下单、停顿或其他可见反馈。",
    "- STORY_ROOM_EXECUTION_LOCK: task_package.story_room_execution.cost_residue 必须写成钱、时间、信任、规则、责任、亏损、押注或新风险，不允许胜利无代价落地。",
    "- STORY_ROOM_EXECUTION_LOCK: task_package.story_room_execution.relationship_shift 必须写成对话语气、站位、信任/怀疑/试探/交易变化。",
    "- STORY_ROOM_EXECUTION_LOCK: task_package.story_room_execution.chapter_debt 必须落在章尾具体的人、物、凭证、消息、规则压力或未解决问题上。",
    "- 必须服从任务包里的 project_planning：项目圣经、总纲、设定库、人物关系、全书卷纲、前30章滚动细纲。",
    "- 不得继承其他项目的人名、地名、题材词、固定句式或旧书开头。",
    sourceDraftText
      ? "- 本次是修稿：必须以“原稿正文”为底稿，只改审稿指出的问题。除非原稿已经整体崩坏，否则不得重起炉灶、不得缩写成摘要、不得丢掉已完成的事件链。"
      : "",
    sourceDraftText && rewriteFocus?.type === "strengthen_tail_hook"
      ? "- 章尾修补只允许改最后 200-300 字，正文前中段必须基本保持。"
      : "",
    sourceDraftText && rewriteFocus?.type !== "strengthen_tail_hook"
      ? "- 定向修补后的篇幅原则上不得低于原稿的 85%，除非审稿问题明确要求删除大量模型思考泄露或错题材内容。"
      : "",
    continuityLock,
    firstChapterLock,
    firstBusinessLock,
    targetedRewriteRulesSafe(rewriteFocus, chapterNo),
    `- 目标字数约 ${targetWords} 字。`,
    rewriteFocus ? `- 本次是定向改写，只处理：${rewriteFocus.instruction}` : "",
    task.output_rejection
      ? `- 上一次输出被拒绝，原因：${JSON.stringify(task.output_rejection)}。这次必须直接输出小说正文，不要分析任务，不要复述章卡，不要写创作过程。`
      : "",
    "",
    "章卡：",
    "",
    "",
    "分阶段写作规则：",
    "",
    "",
    "任务包：",
    JSON.stringify(taskPackage, null, 2),
    sourceDraftText ? ["", "原稿正文：", sourceDraftText].join("\n") : "",
    rewriteFocus ? ["", "定向改写层：", JSON.stringify(rewriteFocus, null, 2)].join("\n") : "",
  ].join("\n");
}

function openAiChapterCardInput(task) {
  const planningContext = compactChapterCardPlanningContext(task.planning_context || {});
  const stageRuleContract = compactChapterCardRuleContract(task.stage_rule_contract || {});
  return [
    "你是中文男频长篇网文的章节策划。",
    "任务：根据项目规划、前30章滚动细纲和章节号，生成一张可执行章卡。",
    "",
    "只输出 JSON，不要 Markdown，不要解释。",
    "JSON 必须包含这些字段：",
    "- chapter_no: integer",
    "- display_title: string",
    "- opening_hook: string",
    "- main_event: string",
    "- protagonist_action: string",
    "- conflict: string",
    "- cool_point_type: string",
    "- visible_result: string",
    "- tail_hook: string",
    "- characters_in_scene: array; each item should include name, role, and anchor when possible",
    "- character_anchors: array of {name,surface,core,anchor,signature_action,signature_line,first_appearance_chapter}",
    "- facts_required: string[]",
    "- forbidden_items: string[]",
    "- resource_plan: string",
    "- money_source: string",
    "- supplier_info_path: string",
    "- first_trial_plan: string",
    "- risk_and_cost: string",
    "- tail_hook_info_control: string",
    "",
    "本书写作规则：",
    JSON.stringify(compactPromptItems(task.writing_rules || [], 8, 120), null, 2),
    "",
    "分阶段规则契约：",
    JSON.stringify(stageRuleContract, null, 2),
    "",
    "项目：",
    JSON.stringify(task.project || {}, null, 2),
    "",
    "项目规划上下文：",
    JSON.stringify(planningContext, null, 2),
    "",
    `章节号：${task.chapter_no}`,
    "",
    "章卡质量标准：",
    "- 必须承接当前项目规划和细纲，不得改题材、改时代、改人物姓名、改关键物件。",
    "- 第一章/前三章可以更强钩子、更快兑现，但只能从当前创意和细纲里找冲突，不能套固定模板。",
    "- 每章必须有目标、冲突、主角行动、可见结果和章尾钩子。",
    "- 第一章如果涉及商业/经营/赚钱/供应链/校园服务/历史交易，resource_plan、money_source、supplier_info_path、first_trial_plan、risk_and_cost、tail_hook_info_control 必须写具体，不能写“凭经验”“他知道”“计划很清楚”。",
    "- 未来知识或金手指只能提供候选方向和判断依据，不能让合同、客户、利润、商户信任提前完成；必须安排现场观察、账册/菜单/收据/排队/契约/税单/订单等证据。",
    "- forbidden_items 里写出本章绝不能出现的旧项目词、逻辑违背点或题材漂移风险。",
    "- 额外输出 scene_beats: 至少 6 个场景节拍，每个包含 purpose、pressure、action、evidence、result。",
    "- 额外输出 evidence_chain: 至少 3 个本题材可见证据，说明主角能力如何通过账册、税单、契约、茶引、现场反应、订单数据、道具或行动结果自然展示。",
    "- 额外输出 public_feedback: 本章结果被谁看见、谁改变态度/报价/立场/行动。",
    "- 额外输出 cost_residue: 本章胜利留下的成本、风险、反噬或人情债。",
    "- 额外输出 relationship_shift: 本章后至少一个人物关系如何变化。",
    "- 额外输出 chapter_debt: 章尾必须兑现到下一章的人、物、凭证、消息或规则压力。",
    "- 额外输出 pass_gate_requirements: 至少 5 条本章过发布门禁必须做到的具体要求。",
  ].join("\n");
}

function openAiChapterCardInputCompact(task) {
  const planningContext = compactChapterCardPlanningContext(task.planning_context || {});
  const stageRuleContract = compactChapterCardRuleContract(task.stage_rule_contract || {});
  return [
    "You are the chapter-card planner for a Chinese commercial webnovel.",
    "Return ONLY compact JSON. No Markdown. No explanation.",
    "",
    "Required schema:",
    "{chapter_no,display_title,opening_hook,main_event,protagonist_action,conflict,cool_point_type,visible_result,tail_hook,characters_in_scene,character_anchors,facts_required,forbidden_items,resource_plan,money_source,supplier_info_path,first_trial_plan,risk_and_cost,tail_hook_info_control,public_feedback,cost_residue,relationship_shift,chapter_debt,scene_beats,evidence_chain,pass_gate_requirements}",
    "scene_beats: 6+ items with purpose/pressure/action/evidence/result.",
    "evidence_chain: 3+ visible proofs that fit THIS genre and THIS scene.",
    "",
    "Hard rules:",
    "- Obey the current project plan and rolling outline. Do not change genre, era, names, core object, or protagonist ability source.",
    "- Every chapter needs goal, conflict, protagonist action, visible result, and tail hook.",
    "- Chapter 1 / golden opening: find pressure inside the current idea; do not paste a template opening.",
    "- If business/service/trade is involved, put money, resource path, trial plan, cost/risk, order/ledger/contract/menu/receipt/witness evidence on page.",
    "- Future knowledge or cheat ability only gives direction; trust, profit, contracts, clients, and public proof must be earned through scene action.",
    "- forbidden_items must list old-project terms, logic violations, and genre drift risks that this chapter must avoid.",
    "",
    "writing_rules:",
    JSON.stringify(compactPromptItems(task.writing_rules || [], 5, 80)),
    "",
    "stage_contract:",
    JSON.stringify(stageRuleContract),
    "",
    "project:",
    JSON.stringify(task.project || {}),
    "",
    "planning_context:",
    JSON.stringify(planningContext),
    "",
    `chapter_no:${task.chapter_no}`,
  ].join("\n");
}

function compactChapterCardPlanningContext(context = {}) {
  return {
    project_bible: compactTextForPrompt(context.project_bible, 420),
    settings: compactTextForPrompt(context.settings, 260),
    character_relationships: compactTextForPrompt(context.character_relationships, 260),
    volume_outline: compactTextForPrompt(context.volume_outline, 320),
    fine_outline_window: compactTextForPrompt(context.fine_outline_window, 340),
    use_as_hard_context: Boolean(context.use_as_hard_context),
    anti_cross_project_rules: compactPromptItems(context.anti_cross_project_rules || [], 2, 60),
    forbidden_cross_project_terms: compactPromptItems(context.forbidden_cross_project_terms || [], 6, 40),
  };
}

function compactChapterCardRuleContract(contract = {}) {
  return {
    task_type: contract.task_type,
    stage: contract.stage,
    platform: contract.platform,
    genre_tags: Array.isArray(contract.genre_tags) ? contract.genre_tags.slice(0, 6) : contract.genre_tags,
    chapter_no: contract.chapter_no,
    chapter_range: contract.chapter_range,
    rules: compactPromptItems(contract.rules || [], 8, 110),
    quality_contract: contract.quality_contract
      ? {
          publish_ready: contract.quality_contract.publish_ready,
          hard_blockers: compactPromptItems(contract.quality_contract.hard_blockers || [], 6, 100),
          repair_policy: compactTextForPrompt(contract.quality_contract.repair_policy, 120),
        }
      : undefined,
  };
}

function openAiReviewChapterInput(task) {
  const chapterCard = compactReviewChapterCard(task.chapter_card || {});
  const reviewContext = compactReviewContextForPrompt(task.review_context || {});
  const localQuality = compactLocalQualityForReview(task.local_quality_metrics || task.review_context?.local_quality_summary || {});
  const localGate = task.local_publish_gate || task.review_context?.local_quality_summary?.publish_gate || null;
  const reviewEvidence = compactReviewEvidencePacket({
    text: task.text,
    chapterCard: task.chapter_card || {},
    localQualityMetrics: task.local_quality_metrics || {},
  });
  const stageRuleContract = compactReviewRuleContract(
    task.stage_rule_contract
      || task.publish_gate_contract
      || task.review_context?.stage_rule_contract
      || {},
  );
  return [
    "你是严苛的中文男频网文审稿编辑。",
    "只审本地算法难判的语义硬伤：设定冲突、动机断裂、能力来源不可信、时代/职业/商业逻辑错误、章卡偏离、跨项目串味。",
    "本地算法已算开头、微钩、弃读、AI味、爽点、追读；不要重复报告，只有证据证明语义硬伤才阻断。",
    "只输出短 JSON：{grade,next_action,issues,scores:{logic_consistency,publish_readiness},risky_segments,keep,remove,rewrite_direction,publish_gate}",
    "判级：A=优秀可投稿候选；B=可发布有小问题；C=需自动润色；D=正文失败；E=章卡/大纲失败。A/B 不等于精品。",
    "硬规则：不确定则不能 A/B 或 publish_ready=true；risky_segments 只放 medium/high 原文证据。",
    "",
    "本地质量算法摘要：",
    JSON.stringify({ local_quality: localQuality, local_publish_gate: localGate }),
    "",
    "章卡：",
    JSON.stringify(chapterCard),
    "",
    "审稿上下文：",
    JSON.stringify(reviewContext),
    "",
    "分阶段审查规则契约：",
    JSON.stringify(stageRuleContract),
    "",
    "审查证据包：",
    JSON.stringify(reviewEvidence),
  ].join("\n");
}

function compactTextForPrompt(value = "", maxChars = 1200) {
  const text = String(value || "").trim();
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.65);
  const tail = maxChars - head - 24;
  const tailText = tail > 0 ? text.slice(-tail) : "";
  return `${text.slice(0, head)}\n...${tailText ? `\n${tailText}` : ""}`;
}

function estimatePromptTokens(value = "") {
  const text = String(value || "");
  const cjkMatches = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || [];
  const cjkChars = cjkMatches.length;
  const nonCjkChars = Math.max(0, text.length - cjkChars);
  return Math.max(1, Math.ceil(cjkChars * 1.5 + nonCjkChars / 4));
}

function compactReviewEvidencePacket({ text = "", chapterCard = {}, localQualityMetrics = {} } = {}) {
  const body = String(text || "").replace(/\r\n/g, "\n").trim();
  const riskSegments = Array.isArray(localQualityMetrics?.drop_risk_segments?.segments)
    ? localQualityMetrics.drop_risk_segments.segments
    : [];
  const riskyWindows = riskSegments
    .filter((segment) => segment?.high_risk || segment?.risk_score >= 60)
    .slice(0, 3)
    .map((segment) => ({
      index: segment.index,
      preview: compactTextForPrompt(segment.preview || segment.text || segment.segment || "", 180),
      reasons: compactPromptItems(segment.reasons || segment.issues || [], 3, 50),
      risk_score: segment.risk_score ?? null,
    }))
    .filter((segment) => segment.preview);
  const semanticWindows = selectSemanticEvidenceWindows(body, chapterCard, riskyWindows.length ? 2 : 3);
  return {
    policy: "Evidence-window review: only block when windows prove a semantic hard issue.",
    full_text_chars: body.length,
    first_300_chars: compactTextForPrompt(body.slice(0, 330), 330),
    ending_chars: compactTextForPrompt(body.slice(Math.max(0, body.length - 360)), 360),
    risky_windows: riskyWindows,
    semantic_windows: semanticWindows,
  };
}

function selectSemanticEvidenceWindows(text = "", chapterCard = {}, maxWindows = 4) {
  const body = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!body) return [];
  const paragraphWindows = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length >= 12);
  const cardTerms = [
    chapterCard.main_event,
    chapterCard.protagonist_action,
    chapterCard.conflict,
    chapterCard.visible_result,
    ...(Array.isArray(chapterCard.facts_required) ? chapterCard.facts_required : []),
  ]
    .flatMap((item) => String(typeof item === "string" ? item : JSON.stringify(item || "")).match(/[\u4e00-\u9fffA-Za-z0-9]{2,}/g) || [])
    .filter((term) => term.length >= 2)
    .slice(0, 16);
  const semanticPattern = /账|税|契|茶引|收据|订单|菜单|排队|合同|利润|成本|价格|金额|商户|客户|数据|日期|时间|动机|解释|因为|所以|证据|能力|金手指|系统|重生|穿越|201\d|202\d/;
  const scored = paragraphWindows.map((paragraph, index) => {
    const termHits = cardTerms.filter((term) => paragraph.includes(term)).length;
    const semanticHits = (paragraph.match(semanticPattern) || []).length;
    return {
      index,
      score: termHits * 4 + semanticHits + Math.min(3, Math.floor(paragraph.length / 160)),
      text: paragraph,
    };
  });
  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(0, maxWindows))
    .sort((a, b) => a.index - b.index)
    .map((item) => ({
      index: item.index,
      preview: compactTextForPrompt(item.text, 240),
    }));
}

function compactPromptItems(items = [], maxItems = 6, maxChars = 180) {
  return (Array.isArray(items) ? items : [])
    .slice(0, maxItems)
    .map((item) => {
      if (typeof item === "string") return compactTextForPrompt(item, maxChars);
      if (!item || typeof item !== "object") return item;
      const compacted = {};
      for (const [key, value] of Object.entries(item)) {
        if (typeof value === "string") {
          compacted[key] = compactTextForPrompt(value, maxChars);
        } else if (Array.isArray(value)) {
          compacted[key] = compactPromptItems(value, 4, Math.min(120, maxChars));
        } else if (value && typeof value === "object") {
          compacted[key] = compactTextForPrompt(JSON.stringify(value), maxChars);
        } else {
          compacted[key] = value;
        }
      }
      return compacted;
    });
}

function compactReviewChapterCard(card = {}) {
  return {
    chapter_no: card.chapter_no,
    display_title: card.display_title || card.title || "",
    opening_hook: compactTextForPrompt(card.opening_hook, 120),
    main_event: compactTextForPrompt(card.main_event, 150),
    protagonist_action: compactTextForPrompt(card.protagonist_action, 150),
    conflict: compactTextForPrompt(card.conflict, 130),
    visible_result: compactTextForPrompt(card.visible_result, 130),
    tail_hook: compactTextForPrompt(card.tail_hook, 120),
    facts_required: compactPromptItems(card.facts_required || [], 4, 80),
    forbidden_items: compactPromptItems(card.forbidden_items || [], 4, 70),
    evidence_chain: compactPromptItems(card.evidence_chain || [], 3, 90),
  };
}

function compactReviewRuleContract(contract = {}) {
  return {
    stage: contract.stage,
    platform: contract.platform,
    genre_tags: Array.isArray(contract.genre_tags) ? contract.genre_tags.slice(0, 4) : contract.genre_tags,
    chapter_no: contract.chapter_no,
    rules: compactPromptItems(contract.rules || [], 3, 70),
    quality_contract: contract.quality_contract
      ? {
          publish_ready: contract.quality_contract.publish_ready,
          hard_blockers: compactPromptItems(contract.quality_contract.hard_blockers || [], 4, 70),
          repair_policy: compactTextForPrompt(contract.quality_contract.repair_policy, 80),
        }
      : undefined,
    first_300_chars_required_for_chapter_1: contract.first_300_chars_required_for_chapter_1,
    direct_review_without_context_is_forbidden: contract.direct_review_without_context_is_forbidden,
    must_check_logic_against_project_memory: contract.must_check_logic_against_project_memory,
  };
}

function compactLocalQualityForReview(metrics = {}) {
  const summary = metrics.local_quality ? metrics.local_quality : metrics;
  return {
    opening_hook_score: summary.opening_hook_score?.score ?? summary.opening_hook_score ?? null,
    tail_hook_score: summary.tail_hook_score?.score ?? summary.tail_hook_score ?? null,
    micro_hook_density: summary.micro_hook_density?.density ?? summary.micro_hook_density ?? null,
    coolpoint_count: summary.coolpoint_delivered?.effective_count ?? summary.coolpoint_count ?? null,
    drop_risk_segments: summary.drop_risk_segments?.risky_segment_count ?? summary.drop_risk_segments ?? null,
    retention_score: summary.retention_prediction?.score ?? summary.retention_score ?? null,
    ai_taste_score: summary.ai_taste_score?.score ?? summary.ai_taste_score ?? null,
    reader_behavior_score: summary.reader_behavior_score?.score ?? summary.reader_behavior_score ?? null,
  };
}

function compactReviewContextForPrompt(context = {}) {
  const summary = context.chapter_context_summary || {};
  return {
    mode: context.mode,
    project: context.project,
    writing_rules: compactPromptItems(context.writing_rules || [], 3, 70),
    chapter_no: context.chapter_no,
    project_bible: compactTextForPrompt(context.project_bible, 160),
    character_relationships: compactTextForPrompt(context.character_relationships, 140),
    volume_outline: compactTextForPrompt(context.volume_outline, 160),
    recent_chapters: compactPromptItems(context.recent_chapters || [], 1, 90),
    chapter_context_summary: {
      chapter_no: summary.chapter_no,
      batch_position: summary.batch_position,
      recent_batch_range: summary.recent_batch_range,
      hard_rules: compactPromptItems(summary.hard_rules || [], 3, 70),
      narrative_context: compactTextForPrompt(summary.narrative_context, 120),
      due_foreshadowing_debts: compactPromptItems(summary.due_foreshadowing_debts || [], 2, 70),
      active_information_gaps: compactPromptItems(summary.active_information_gaps || [], 2, 70),
      scene_character_anchors: compactPromptItems(summary.scene_character_anchors || [], 2, 70),
      batch_state_summary: compactTextForPrompt(summary.batch_state_summary, 120),
    },
    first_300_chars: compactTextForPrompt(context.first_300_chars, 220),
  };
}

function openAiStateCandidatesInput(task) {
  return [
    "你是长篇小说真相数据库提取器。",
    "任务：从正文中提取明确写出的状态候选，宁可漏提，不要脑补。",
    "",
    "只输出 JSON，不要 Markdown，不要解释。",
    "JSON 必须包含：",
    "- meta: { source_chapter: integer }",
    "- characters: array",
    "- relationships: array",
    "- business_state: array",
    "- money_orders: array",
    "- foreshadowing_added: array",
    "- foreshadowing_resolved: array",
    "- timeline: array",
    "- risks: array",
    "",
    "每个候选事实尽量带 confidence，范围 0-1。",
    "",
    "章节号：",
    String(task.chapter_no),
    "",
    "章卡：",
    JSON.stringify(task.chapter_card || {}, null, 2),
    "",
    "正文：",
    task.text || "",
  ].join("\n");
}

function openAiGlobalReviewInput(task) {
  return [
    "你是中文长篇网文总编辑，负责每 10 章跨章复审。",
    "任务：只检查跨章逻辑、人物一致性、伏笔回收、节奏复读、能力/商业规则是否自洽。",
    "只输出 JSON，不要 Markdown，不要解释。",
    "JSON 格式：",
    '{"status":"pass|needs_attention|blocked","summary":"一句总结","cross_chapter_issues":[{"chapter_no":1,"type":"character_logic|plot_logic|forgotten_hook|rhythm_repeat|world_rule","severity":"info|warn|blocker","issue":"问题","fix":"修法"}],"forgotten_hooks":[],"repeated_patterns":[],"character_consistency":[],"publish_gate":{"status":"pass|needs_repair|blocked"}}',
    "",
    "复审范围：",
    `第 ${task.from} 章到第 ${task.to} 章`,
    "",
    "项目：",
    JSON.stringify(task.project || {}, null, 2),
    "",
    "项目规划/记忆：",
    JSON.stringify(task.project_memory || {}, null, 2),
    "",
    "全局复审规则契约：",
    JSON.stringify(task.stage_rule_contract || {}, null, 2),
    "",
    "章节材料：",
    JSON.stringify(task.chapters || [], null, 2),
  ].join("\n");
}

function openAiProjectPlanningInput(task) {
  const project = task.project || {};
  const exactIdea = String(project.idea || "").trim();
  const protagonistName = String(project.protagonist_name || project.protagonistName || "").trim();
  const supportingCharacters = String(project.supporting_characters || project.supportingCharacters || "").trim();
  const goldenFinger = String(project.golden_finger || project.goldenFinger || "").trim();
  const ideaKeywords = exactIdea
    .match(/[\u4e00-\u9fa5A-Za-z0-9]{2,}/g)
    ?.filter((word) => word.length >= 2)
    .slice(0, 18)
    .join("、") || "";
  return [
    "你是中文商业网文开书总编辑。现在只为下面这一本文书做开书规划。",
    "必须使用中文输出。必须只根据用户当前创意生成，禁止借用旧项目、旧样例、相似题材模板或你熟悉的默认故事。",
    "",
    "当前用户创意原文，必须逐字保留核心设定：",
    exactIdea || "未填写",
    "",
    "强制锚点规则：",
    "- 不得改变创意里的时代、地点、职业身份、关键物件、核心矛盾和故事路线。",
    "- 创意里出现的关键词必须进入 premise、selling_points、characters、stages 和 chapter_beats。",
    ideaKeywords ? `- 当前创意关键词：${ideaKeywords}` : "",
    protagonistName ? `- 主角姓名必须原样使用：${protagonistName}` : "- 如果未填写主角姓名，生成符合时代的中文姓名。",
    supportingCharacters ? `- 核心配角姓名必须原样使用，并安排功能位：${supportingCharacters}` : "- 如果未填写配角姓名，生成符合时代且有功能位的中文姓名。",
    goldenFinger ? `- 金手指/核心优势必须原样纳入：${goldenFinger}` : "- 如果项目未给金手指，必须生成一个与题材强相关、有限制、有代价、可通过行动展示的核心优势。",
    "- 金手指必须进入 premise、selling_points、logic_constraints 和 chapter_beats；不能只是设定库里一句话。",
    "- 如果涉及商业/经营/赚钱/供应链/校园服务/历史交易，logic_constraints 必须包含：资金来源、资源获取路径、信息来源、低成本试单、成本风险、利润波动。",
    "- 第1章 chapter_beats 必须包含：前300字现场动作、资金/成本来源、第一家商户或客户的信息路径、低成本试单、章尾只露一个新变量。",
    "- 未来知识或金手指只能帮助选择方向，不能直接让合同、客户、利润或商户信任在开局前已经完成。",
    "- 禁止旧项目泄漏：不要出现与当前创意无关的人名、地名、职业、系统设定、固定句式或旧书开头。",
    "",
    "本书规则库：",
    JSON.stringify(task.writing_rules || [], null, 2),
    "",
    "分阶段规划规则契约：",
    JSON.stringify(task.stage_rule_contract || {}, null, 2),
    "",
    "输出规则：",
    "- 只输出一个 JSON 对象，不要 Markdown，不要解释。",
    "- 必须输出中文。",
    "- 必须包含字段：premise, selling_points, logic_constraints, characters, relationships, stages, chapter_beats。",
    "- 所有字符串都用短句，禁止长段落。",
    "- premise 80字以内，必须包含当前创意锚点。",
    "- selling_points 只写3项，每项35字以内。",
    "- logic_constraints 写6项以内，每项45字以内。",
    "- characters 只输出字符串数组，4项以内，格式为“姓名:功能位/动机/首次出场”，每项35字以内。",
    "- relationships 只输出字符串数组，4项以内，每项35字以内。",
    "- stages 只输出字符串数组，6项以内，每项35字以内。",
    "- chapter_beats 只输出字符串数组，只写第1-5章，每项70字以内；后端会扩展到前30章。",
    "- 不要输出嵌套对象。不要输出多余字段。",
    "- 整个 JSON 必须在900个中文字符以内，并确保闭合。",
    "",
    "项目 JSON：",
    JSON.stringify(project, null, 2),
    "",
    "补充指令：",
    task.instruction || "",
  ].join("\n");
}

function openAiInputForTask(task) {
  if (task.task_type === "title_suggestion") {
    return [
      task.instruction || "根据创意生成 3 个中文网文书名。只输出 JSON：{\"titles\":[\"书名1\",\"书名2\",\"书名3\"]}",
      "",
      "创意：",
      task.idea || "",
      "",
      "平台：",
      task.platform || "fanqie",
      "",
      "题材：",
      task.genre || "",
    ].join("\n");
  }
  if (task.task_type === "outline_deepen") {
    return [
      "你是中文商业网文细纲编辑。任务是把指定章节范围补成可直接生成章卡的短细纲。",
      "必须只根据当前项目创意、人物关系、阶段弧和已有前文细纲深化，不能改题材、改时代、改人名或引入旧项目。",
      "",
      "输出要求：",
      "- 只输出 JSON，不要 Markdown，不要解释。",
      "- JSON 格式：{\"chapters\":[\"第6章：事件/目标/冲突/爽点/章尾\", \"第7章：...\"]}",
      "- 每章一个字符串，必须包含事件、目标、冲突、爽点、章尾五项信息。",
      "- 每章 60 字以内。",
      "- 不要输出嵌套对象，不要多余字段。",
      "",
      `章节范围：第 ${task.from} 章到第 ${task.to} 章`,
      "",
      "项目：",
      JSON.stringify(task.project || {}, null, 2),
      "",
      "分阶段规则契约：",
      JSON.stringify(task.stage_rule_contract || {}, null, 2),
      "",
      "规划上下文：",
      JSON.stringify(task.planning_context || {}, null, 2),
    ].join("\n");
  }
  if (task.task_type === "write_chapter" || task.task_type === "rewrite_chapter") {
    return openAiWriteChapterInput(task);
  }
  if (task.task_type === "generate_chapter_card") {
    return openAiChapterCardInputCompact(task);
  }
  if (task.task_type === "review_chapter") {
    return openAiReviewChapterInput(task);
  }
  if (task.task_type === "extract_state_candidates") {
    return openAiStateCandidatesInput(task);
  }
  if (task.task_type === "global_review") {
    return openAiGlobalReviewInput(task);
  }
  if (task.task_type === "project_planning") {
    return openAiProjectPlanningInput(task);
  }
  return [
    `task_type: ${task.task_type}`,
    "Return only the requested artifact. For review_chapter, return JSON.",
    JSON.stringify(task),
  ].join("\n");
}

function parseJsonOutput(outputText) {
  const text = String(outputText || "").trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  const jsonText = fenced ? fenced[1].trim() : text;
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    const repaired = repairJsonOutputText(jsonText);
    if (repaired && repaired !== jsonText) {
      return JSON.parse(repaired);
    }
    throw error;
  }
}

function repairJsonOutputText(text = "") {
  let value = String(text || "").trim();
  const firstObject = value.indexOf("{");
  const lastObject = value.lastIndexOf("}");
  const firstArray = value.indexOf("[");
  const lastArray = value.lastIndexOf("]");
  if (firstObject >= 0 && lastObject > firstObject) {
    value = value.slice(firstObject, lastObject + 1);
  } else if (firstArray >= 0 && lastArray > firstArray) {
    value = value.slice(firstArray, lastArray + 1);
  }
  return value
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'");
}

function parseOpenAiOutput(task, data) {
  const outputText = data.output_text
    || data.output?.[0]?.content?.[0]?.text
    || data.choices?.[0]?.message?.content
    || "";
  if (task.task_type === "title_suggestion") {
    try {
      const parsed = parseJsonOutput(outputText);
      if (Array.isArray(parsed)) return { titles: parsed };
      if (Array.isArray(parsed?.titles)) return { titles: parsed.titles };
    } catch {
      // Fall through to raw text so callers can use local parsing/fallback.
    }
    return { text: outputText };
  }
  if (task.task_type === "outline_deepen") {
    try {
      const parsed = parseJsonOutput(outputText);
      return {
        chapters: Array.isArray(parsed?.chapters) ? parsed.chapters : Array.isArray(parsed) ? parsed : [],
        text: outputText,
      };
    } catch {
      return { chapters: [], text: outputText };
    }
  }
  if (task.task_type === "project_planning") {
    return {
      text: outputText,
      raw: JSON.stringify(data).slice(0, 4000),
    };
  }
  if (task.task_type === "write_chapter" || task.task_type === "rewrite_chapter") {
    return { chapter_no: task.chapter_card?.chapter_no, text: outputText };
  }
  if (task.task_type === "review_chapter") {
    return assertReview(parseJsonOutput(outputText));
  }
  if (task.task_type === "generate_chapter_card") {
    return assertChapterCard(completeChapterCardCharacterAnchors(parseJsonOutput(outputText)));
  }
  if (task.task_type === "extract_state_candidates") {
    return assertStateCandidates(parseJsonOutput(outputText));
  }
  if (task.task_type === "global_review") {
    try {
      const parsed = parseJsonOutput(outputText);
      return parsed && typeof parsed === "object"
        ? parsed
        : { status: "needs_attention", summary: outputText, cross_chapter_issues: [] };
    } catch {
      return { status: "needs_attention", summary: outputText, cross_chapter_issues: [] };
    }
  }
  throw new Error(`Unsupported OpenAI task: ${task.task_type}`);
}

function parseChatOutput(task, data) {
  const message = data.choices?.[0]?.message || {};
  const outputText = message.content
    || data.output_text
    || data.output?.[0]?.content?.[0]?.text
    || "";
  return parseOpenAiOutput(task, { ...data, output_text: outputText });
}

function supportsTextStream(task = {}) {
  return ["write_chapter", "rewrite_chapter"].includes(String(task.task_type || ""))
    && typeof task.onTextDelta === "function";
}

function parseChatStreamDelta(data = {}) {
  const choice = data.choices?.[0] || {};
  const delta = choice.delta || {};
  return delta.content || "";
}

async function parseCompatibleChatStream(task, response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    return parseChatOutput(task, await response.json());
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let outputText = "";
  let firstDeltaReported = false;
  while (true) {
    if (task.abortSignal?.aborted || task.signal?.aborted) {
      await reader.cancel?.().catch?.(() => undefined);
      throw new Error("Compatible chat stream aborted by task timeout");
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\n\n/);
    buffer = events.pop() || "";
    for (const event of events) {
      const lines = event.split(/\n/).map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let parsed = null;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = parseChatStreamDelta(parsed);
        if (delta) {
          if (!firstDeltaReported) {
            firstDeltaReported = true;
            await task.onModelDiagnostics?.({
              event: "stream_first_delta",
              stream_first_delta_ms: Number.isFinite(task._requestStartedAt)
                ? Date.now() - task._requestStartedAt
                : null,
            });
          }
          outputText += delta;
          await task.onTextDelta?.({
            delta,
            text: outputText,
            task_type: task.task_type,
          });
        }
      }
    }
  }
  return parseOpenAiOutput(task, { output_text: outputText });
}

function compatibleRequestOptionsForTask(task = {}, { providerName = "" } = {}) {
  const taskType = String(task.task_type || "");
  const options = {};
  if (taskType === "project_planning") {
    options.response_format = { type: "json_object" };
    options.max_tokens = 7000;
    options.temperature = 0.25;
  } else if (taskType === "generate_chapter_card" || taskType === "review_chapter" || taskType === "extract_state_candidates" || taskType === "global_review" || taskType === "outline_deepen") {
    options.response_format = { type: "json_object" };
    options.temperature = 0.2;
    if (taskType === "review_chapter") options.max_tokens = 1200;
  } else if (taskType === "title_suggestion") {
    options.response_format = { type: "json_object" };
    options.max_tokens = 500;
    options.temperature = 0.75;
  }
  if (/deepseek/i.test(providerName) && (taskType === "project_planning" || taskType === "generate_chapter_card" || taskType === "extract_state_candidates")) {
    // DeepSeek compatible endpoints differ on `thinking`; omit it here to avoid silent empty-content responses.
  }
  return options;
}

function sleep(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function combineAbortSignals(...signals) {
  const activeSignals = signals.filter(Boolean);
  if (!activeSignals.length) return null;
  const controller = new AbortController();
  const abort = (signal) => {
    if (!controller.signal.aborted) {
      controller.abort(signal?.reason || new Error("Aborted"));
    }
  };
  for (const signal of activeSignals) {
    if (signal.aborted) {
      abort(signal);
      break;
    }
    signal.addEventListener("abort", () => abort(signal), { once: true });
  }
  return controller.signal;
}

function retryAfterMs(response) {
  const value = response?.headers?.get?.("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

function retryDelayFor(response, retryDelayMs, attempt) {
  return retryAfterMs(response) ?? retryDelayMs * (attempt + 1);
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

function openAiError(message, { retryable = false } = {}) {
  const error = new Error(message);
  error.retryable = retryable;
  return error;
}

function compactHttpErrorBody(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (/<!doctype html|<html[\s>]/i.test(raw)) {
    const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/\s+/g, " ")
      .trim();
    return title || "上游返回 HTML 错误页";
  }
  try {
    const parsed = JSON.parse(raw);
    const message = parsed?.error?.message || parsed?.message || parsed?.error;
    if (message) return String(message).replace(/\s+/g, " ").trim().slice(0, 220);
  } catch {
    // Fall through to plain text compaction.
  }
  return raw.replace(/\s+/g, " ").slice(0, 220);
}

function modelHttpErrorMessage(providerName, status, errorBody = "") {
  const body = compactHttpErrorBody(errorBody);
  if (status === 502 || status === 503 || status === 504) {
    return `${providerName} 服务或中转暂时不可用（${status}）。请稍后重试，或更换 Base URL。${body ? ` ${body}` : ""}`;
  }
  if (status === 401 || status === 403) {
    return `${providerName} 鉴权失败（${status}）。请检查 API Key、Base URL、账号权限或模型开通状态。${body ? ` ${body}` : ""}`;
  }
  if (status === 429) {
    return `${providerName} 额度或频率受限（429）。请稍后重试，或换一个可用账号。${body ? ` ${body}` : ""}`;
  }
  return `${providerName} API 请求失败（${status}）。${body || "请检查 Base URL、网络和模型配置。"}`;
}

async function responseText(response) {
  if (typeof response.text !== "function") return "";
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function createOpenAiProvider({
  model,
  allowNetwork = false,
  env = process.env,
  fetch: fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_OPENAI_TIMEOUT_MS,
  maxRetries = DEFAULT_OPENAI_MAX_RETRIES,
  retryDelayMs = DEFAULT_OPENAI_RETRY_DELAY_MS,
  minIntervalMs = 0,
  sleep: sleepImpl = sleep,
  baseUrl,
} = {}) {
  return {
    async invoke(task) {
      if (!allowNetwork) {
        throw new Error(
          `OpenAI provider is configured but real API calls are disabled. model=${model || "unset"}`,
        );
      }
      const apiKey = env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required for OpenAI provider");
      }
      if (typeof fetchImpl !== "function") {
        throw new Error("fetch is required for OpenAI provider");
      }
      const rawBaseUrl = baseUrl || env.OPENAI_BASE_URL || "";
      const useResponses = shouldUseOpenAiResponses(rawBaseUrl);
      const endpoint = useResponses
        ? openAiResponsesUrl(rawBaseUrl)
        : compatibleChatCompletionsUrl(rawBaseUrl, "https://api.openai.com/v1/chat/completions");
      const body = JSON.stringify(useResponses
        ? {
            model: model || "gpt-5.1",
            input: openAiInputForTask(task),
          }
        : {
            model: model || "gpt-5.1",
            messages: [{ role: "user", content: openAiInputForTask(task) }],
          });
      let lastError;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        await sleepImpl(minIntervalMs);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const signal = combineAbortSignals(controller.signal, task.abortSignal, task.signal);
        try {
          const response = await fetchImpl(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body,
            signal,
          });
          if (response.ok) {
            const data = await response.json();
            return useResponses ? parseOpenAiOutput(task, data) : parseChatOutput(task, data);
          }
          const errorBody = await responseText(response);
          const retryable = isRetryableStatus(response.status);
          const error = openAiError(
            modelHttpErrorMessage("OpenAI", response.status, errorBody),
            { retryable },
          );
          lastError = error;
          if (!retryable || attempt >= maxRetries) {
            throw error;
          }
          await sleepImpl(retryDelayFor(response, retryDelayMs, attempt));
        } catch (error) {
          if (task.abortSignal?.aborted || task.signal?.aborted) {
            lastError = new Error("OpenAI API request aborted by task timeout");
          } else if (error.name === "AbortError" || controller.signal.aborted) {
            lastError = new Error(`OpenAI API request timeout after ${timeoutMs}ms`);
          } else {
            lastError = error;
          }
          if (error.retryable === false || attempt >= maxRetries) {
            throw lastError;
          }
          await sleepImpl(retryDelayMs * (attempt + 1));
        } finally {
          clearTimeout(timeout);
        }
      }
      throw lastError;
    },
  };
}

function createCompatibleChatProvider({
  providerName,
  defaultBaseUrl,
  apiKeyEnv,
  baseUrlEnv,
  defaultModel,
} = {}) {
  return function createProvider({
    model,
    allowNetwork = false,
    env = process.env,
    fetch: fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_OPENAI_TIMEOUT_MS,
    maxRetries = DEFAULT_OPENAI_MAX_RETRIES,
    retryDelayMs = DEFAULT_OPENAI_RETRY_DELAY_MS,
    minIntervalMs = 0,
    sleep: sleepImpl = sleep,
    baseUrl,
  } = {}) {
    return {
      async invoke(task) {
        if (!allowNetwork) {
          throw new Error(`${providerName} provider is configured but real API calls are disabled. model=${model || "unset"}`);
        }
        const apiKey = env[apiKeyEnv];
        if (!apiKey) {
          throw new Error(`${apiKeyEnv} is required for ${providerName} provider`);
        }
        if (typeof fetchImpl !== "function") {
          throw new Error("fetch is required for compatible chat provider");
        }
        const endpoint = compatibleChatCompletionsUrl(baseUrl || env[baseUrlEnv] || "", defaultBaseUrl);
        const shouldStream = supportsTextStream(task);
        const input = openAiInputForTask(task);
        await task.onModelDiagnostics?.({
          event: "request_prepared",
          input_chars: input.length,
          input_tokens: estimatePromptTokens(input),
          source_draft_chars: String(task.source_draft_text || "").length,
          task_package_chars: task.task_package ? JSON.stringify(task.task_package).length : 0,
          rewrite_focus_chars: task.rewrite_focus ? JSON.stringify(task.rewrite_focus).length : 0,
          stream_requested: shouldStream,
        });
        const body = JSON.stringify({
          model: model || defaultModel,
          messages: [{ role: "user", content: input }],
          ...(shouldStream ? { stream: true } : {}),
          ...compatibleRequestOptionsForTask(task, { providerName }),
        });
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
          await sleepImpl(minIntervalMs);
          const startedAt = Date.now();
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);
          const signal = combineAbortSignals(controller.signal, task.abortSignal, task.signal);
          try {
            const response = await fetchImpl(endpoint, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body,
              signal,
            });
            if (response.ok) {
              const responseTask = { ...task, _requestStartedAt: startedAt };
              return shouldStream
                ? await parseCompatibleChatStream(responseTask, response)
                : parseChatOutput(responseTask, await response.json());
            }
            const errorBody = await responseText(response);
            const retryable = isRetryableStatus(response.status);
            const error = openAiError(
              modelHttpErrorMessage(providerName, response.status, errorBody),
              { retryable },
            );
            lastError = error;
            if (!retryable || attempt >= maxRetries) throw error;
            await sleepImpl(retryDelayFor(response, retryDelayMs, attempt));
          } catch (error) {
            if (task.abortSignal?.aborted || task.signal?.aborted) {
              lastError = new Error(`${providerName} API request aborted by task timeout`);
            } else if (error.name === "AbortError" || controller.signal.aborted) {
              lastError = new Error(`${providerName} API request timeout after ${timeoutMs}ms`);
            } else {
              lastError = error;
            }
            if (error.retryable === false || attempt >= maxRetries) throw lastError;
            await sleepImpl(retryDelayMs * (attempt + 1));
          } finally {
            clearTimeout(timeout);
          }
        }
        throw lastError;
      },
    };
  };
}

const PROVIDERS = {
  mock: createMockProvider,
  openai: createOpenAiProvider,
  deepseek: createCompatibleChatProvider({
    providerName: "DeepSeek",
    defaultBaseUrl: "https://api.deepseek.com/chat/completions",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    defaultModel: "deepseek-v4-flash",
  }),
  doubao: createCompatibleChatProvider({
    providerName: "Doubao",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    apiKeyEnv: "DOUBAO_API_KEY",
    baseUrlEnv: "DOUBAO_BASE_URL",
    defaultModel: "doubao-seed-1-6",
  }),
  wenxin: createCompatibleChatProvider({
    providerName: "Wenxin",
    defaultBaseUrl: "https://qianfan.baidubce.com/v2/chat/completions",
    apiKeyEnv: "QIANFAN_API_KEY",
    baseUrlEnv: "QIANFAN_BASE_URL",
    defaultModel: "ernie-5.1",
  }),
  qwen: createCompatibleChatProvider({
    providerName: "Qwen",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    apiKeyEnv: "DASHSCOPE_API_KEY",
    baseUrlEnv: "DASHSCOPE_BASE_URL",
    defaultModel: "qwen3.6-plus",
  }),
  kimi: createCompatibleChatProvider({
    providerName: "Kimi",
    defaultBaseUrl: "https://api.moonshot.cn/v1/chat/completions",
    apiKeyEnv: "MOONSHOT_API_KEY",
    baseUrlEnv: "MOONSHOT_BASE_URL",
    defaultModel: "kimi-k2.6",
  }),
  "mock-e": () =>
    createReviewOverrideProvider({
      grade: "E",
      next_action: "rollback_card_or_outline",
      issues: ["章卡/大纲层面无法支撑本章"],
    }),
  "mock-always-d": () =>
    createReviewOverrideProvider({
      grade: "D",
      next_action: "rewrite_chapter",
      issues: ["持续不达标"],
    }),
};

export function createModelRouter({
  provider = "mock",
  model,
  allowNetwork,
  env,
  fetch,
  timeoutMs,
  maxRetries,
  retryDelayMs,
  minIntervalMs,
  sleep,
  baseUrl,
} = {}) {
  const createProvider = PROVIDERS[provider];
  if (!createProvider) {
    throw new Error(`Provider not configured: ${provider}`);
  }
  const selectedProvider = createProvider({
    model,
    allowNetwork,
    env,
    fetch,
    timeoutMs,
    maxRetries,
    retryDelayMs,
    minIntervalMs,
    sleep,
    baseUrl,
  });
  return {
    async invoke(task) {
      return selectedProvider.invoke(task);
    },
  };
}
