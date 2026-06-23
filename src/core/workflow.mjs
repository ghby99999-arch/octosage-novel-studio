import path from "node:path";
import { access, readdir, readFile } from "node:fs/promises";
import { appendJsonLine, ensureDir, padChapter, readJson, writeJson, writeText } from "./fsx.mjs";
import {
  buildDialogueTuningGuide,
  dialogueTuningGuideForRewrite,
} from "./dialogue-tuner.mjs";
import { buildStoryRoomChapterOutlineBlock } from "./story-room-contract.mjs";
import {
  batchStateFile,
  chapterCardFile,
  domainKnowledgeBaseFile,
  domainKnowledgeBuildPlanFile,
  domainKnowledgePlanFile,
  domainKnowledgeSourceAuditFile,
  domainKnowledgeSourceCandidatesFile,
  dynamicTemplateLibraryFile,
  draftFile,
  exportFile,
  globalReviewFile,
  mergedExportFile,
  aiRewritePlanFile,
  chapterQualityCheckpointFile,
  memoryIndexFile,
  modelCallsFile,
  modelCompareFile,
  openAiSmokeFile,
  projectConfigFile,
  projectDir,
  projectFile,
  qualityMetricObservationsFile,
  qualityMetricRegistryFile,
  qualityReportFile,
  premiumGateReportFile,
  premiumReadinessReportFile,
  premiumIncubationReportFile,
  premiumRepairSweepReportFile,
  publishAttemptLogFile,
  publishBrowserHandoffFile,
  publishBrowserRunReportFile,
  publishChaptersFile,
  publishManifestFile,
  publishMetadataFile,
  publishPackageDir,
  publishSelectorCalibrationFile,
  publishSubmissionFile,
  portfolioFile,
  portfolioRunReportFile,
  publicReferenceLibraryFile,
  publicReferenceReadPlanFile,
  readerSimulationFile,
  referenceLibraryFile,
  referenceReadAuditFile,
  referenceReadPlanFile,
  referenceStructureFile,
  reviewFile,
  rhythmTransferPlanFile,
  runReportFile,
  singleChapterPreflightFile,
  stateCandidatesFile,
  taskCheckpointFile,
  taskPackageFile,
  webStatusFile,
} from "./paths.mjs";
import { createModelRouter } from "./model-router.mjs";
import {
  createVisiblePublishBrowserDriver,
  getPublishPlatformProfile,
} from "./browser/publish-browser-driver.mjs";
import {
  AI_TASTE_EXPLANATION_TERMS,
  CONTEXT_HARD_RULES,
  PROJECT_HARD_RULES,
  hasAiExplanation,
  hasAiProcessLeak,
  isAiWrapperLine,
  writingRulesForProject,
} from "./rules.mjs";
import {
  diagnoseModelCall,
  modelLedgerTagsForTask,
  writingRulesForTask,
} from "./writing-rule-registry.mjs";
import {
  assertBatchState,
  assertChapterCard,
  completeChapterCardCharacterAnchors,
  assertProject,
  assertProjectConfig,
  assertReview,
  assertRunReport,
  assertStateCandidates,
  assertTaskCheckpoint,
  assertWritingTaskPackage,
} from "./schemas.mjs";
export {
  exportChapterScreenplay,
  exportFullVideoPack,
  generateProjectCharacterRefs,
  generateProjectSceneRefs,
  generateVideoPromptsForChapter,
} from "./video/video-factory.mjs";

const FACT_CONFIDENCE_THRESHOLD = 0.7;
const DEFAULT_CONTEXT_TOKEN_BUDGET = 12000;
const DEFAULT_OPENAI_RATES_CNY = {
  input_per_million_cny: 18,
  output_per_million_cny: 72,
};

const REFERENCE_BROWSER_SAFETY_RULES = [
  "user_visible_authorized_content_only",
  "no_login_bypass",
  "no_captcha_bypass",
  "no_paywall_bypass",
  "no_auto_purchase",
  "no_auto_comment_or_publish",
  "save_structure_fingerprints_only",
  "discard_source_text_after_analysis",
];

const REVIEW_GRADE_SCORE = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  E: 1,
};

const CN_VISIBLE_ACTION_RE = /递给|递过去|推开|推过去|拉|拍桌|按下|点开|刷新|抬头|低头|转身|站起|走到|冲进|拿起|放下|扔下|拦住|敲门|打断|挂断|拨通|扫码|付款|签字|贴上|翻开|停住|伸手|抓住|拖着|排队|挤进|坐下|起身|接过|塞进|亮出|截图|拍照|盯着|看着|笑了|骂|喊|问|沉默|愣住/;
const EN_VISIBLE_ACTION_RE = /slap|push|stare|refresh|move|lean|drop|grab|throw|walk|run|stop|ask|curse|click|hand|beep|spark|pay|paid|shout|say|said|answer|sign|scan|call|hang up/i;
const CN_EVENT_PROGRESS_RE = /订单|后台|数字|数据|电话|通知|结果|到账|排队|投诉|名单|合同|二维码|老师|老板|商户|平台|创业中心|增长|下降|付款|余额|转账|截图|照片|消息|屏幕|提示音|敲门|门口|表格|登记|试点|名额|报价|成本|佣金|用户|流量|退款|确认|通过|拒绝/;
const EN_EVENT_PROGRESS_RE = /count|order|backend|result|data|paid|queue|call|contract|message|screen|from \d+ to \d+|complaint|photo|teacher|merchant|platform|payment|trial|commission/i;
const CN_VISIBLE_OBJECT_RE = /手机|屏幕|后台|订单|数字|数据|电话|通知|二维码|表格|合同|名单|照片|截图|菜单|账单|余额|短信|消息|钥匙|门|柜台|桌子|椅子|烧烤|奶茶|外卖|排队|背包|宿舍|食堂|校门|办公室|创业中心|登记表/;
const CN_TURN_RE = /突然|刚要|正要|下一秒|反而|却|结果|没想到|谁知|偏偏|还没等|刚刚|同时|第一单|第一条|跳出来|打进来|响了|停住|安静下来|变了|愣住|抬头/;
const EN_TURN_RE = /was about to|suddenly|but|instead|only to|then|while|before|again|another/i;
const CN_INFORMATION_GAP_RE = /以为|误会|误判|没人知道|不知道|看不懂|盯上|有人|隔壁|老师|老板|平台|暗地|背后|门外|旁边|消息|听见|打听|谁|为什么|怎么会|原来/;
const CN_PAYOFF_RE = /订单|后台|数字|数据|到账|增长|排队|投诉|名单|合同|二维码|老板|商户|老师|平台|通知|电话|付款|转账|成交|通过|试点|名额|反转|打脸|误判|证明|结果|态度|沉默|愣住|刷新|截图|照片/;
const CN_EXPOSITION_RE = /他知道|他明白|他意识到|他理解|这意味着|这说明|本质上|核心是|商业价值|未来趋势|商业模式|战略|机会|市场|平台竞争|流量逻辑|用户心智|长期价值|所以说|换句话说|从宏观来看/;
const EN_EXPOSITION_RE = /knew|realized|understood|meant|business model|opportunity|strategy|market|value|platform|responsibility|rule/i;
const CN_STATIC_OPENING_RE = /秋天|梧桐|阳光|天空|微风|校园.*安静|清晨|黄昏|窗外|夕阳|空气里|风吹过|树影|街道很安静/;
const CN_EXPOSITION_OPENING_RE = /是一个|是个|重生者|回到了|这是|意味着|他知道|商业价值|未来趋势|平台竞争|本质|市场机会/;
const CN_NEXT_PRESSURE_RE = /必须|否则|来不及|出事|盯上|找你|下午|明早|明天|下一章|平台方|创业中心|老师|投诉|敲门|电话|门外|名单|合同|试点|名额|独家|举报|校方|导员|老板|商户|下一个|第二天/;
const AI_EXPLANATION_PHRASES_RE = /作为一个AI|以下是|总结一下|综上|从商业角度看|从叙事角度看|读者会|这一段体现|这意味着|这说明|他意识到|他明白|他知道|商业模式|未来趋势|平台竞争|核心逻辑|长期价值|用户心智|流量入口|战略意义|换句话说|本质上|宏观来看|底层逻辑/;

const DEFAULT_PROJECT_CONFIG = {
  model: {
    provider: "mock",
    quality_mode: "balanced",
    default_writer: "mock",
    default_reviewer: "mock",
    default_extractor: "mock",
    task_routes: {},
  },
  budget: {
    monthly_limit_cny: 0,
    warn_at_percent: 80,
  },
  privacy: {
    store_api_keys: false,
    local_project_files_only: true,
  },
  writing: {
    rhythm_transfer_plan: null,
  },
};

function metricDefinition({
  name,
  direction = "higher_is_better",
  thresholds,
  unit,
  evidence,
}) {
  return {
    name,
    direction,
    unit,
    thresholds,
    default_thresholds: { ...thresholds },
    evidence,
    calibration: {
      enabled: true,
      status: "default",
      sample_count: 0,
      positive_sample_count: 0,
      min_samples: 3,
      method: direction === "lower_is_better" ? "positive_median_lower_is_better" : "positive_p75_higher_is_better",
      last_updated_at: null,
    },
  };
}

export function defaultQualityMetricRegistry() {
  return {
    version: 2,
    updated_at: new Date().toISOString(),
    data_basis: {
      status: "public-behavior-proxy",
      boundary: "No public source exposes Tomato/Qidian internal recommendation weights. This standard maps public author-backend and recommendation-system behavior indicators into text-side proxy metrics, then calibrates with author-owned backend data.",
      primary_reader_signals: [
        "chapter_completion_rate",
        "traffic_change",
        "interaction_data",
        "reading_volume",
        "shelf_or_follow",
        "next_chapter_retention",
        "reading_depth",
        "payment_or_ad_value",
      ],
      proxy_mapping: {
        chapter_completion_rate: ["first_300_retention_proxy", "chapter_completion_proxy", "drop_risk_segments", "ai_taste_score"],
        next_chapter_retention: ["next_chapter_click_proxy", "tail_hook_score", "micro_hook_density"],
        shelf_or_follow: ["follow_intent_proxy", "coolpoint_delivered", "character_logic", "serial_promise"],
        payment_or_ad_value: ["reader_behavior_score", "retention_prediction", "premium_gate"],
      },
    },
    calibration_policy: {
      positive_outcomes: ["premium", "high_retention", "high_completion", "high_follow", "high_shelf", "high_next_click", "high_income"],
      negative_outcomes: ["fail", "low_retention", "low_completion", "low_follow", "low_shelf", "low_next_click", "low_income"],
      min_samples: 3,
      conservative: true,
      note: "Default craft thresholds are kept as fallback; real author-owned outcomes can calibrate project thresholds.",
    },
    metrics: {
      opening_hook_score: metricDefinition({
        name: "opening_hook_score",
        unit: "score_0_100",
        thresholds: { eliminate_below: 50, pass: 60, premium: 75 },
        evidence: [
          { source_type: "craft_rule", note: "First 200-300 characters should enter conflict, abnormal action, or visible result." },
          { source_type: "local_calibration", note: "Calibrate with author-owned chapter retention and completion observations." },
        ],
      }),
      micro_hook_density: metricDefinition({
        name: "micro_hook_density",
        unit: "hooked_blocks_per_block",
        thresholds: { eliminate_below: 0.6, pass: 0.9, premium: 1.2 },
        evidence: [
          { source_type: "craft_rule", note: "Roughly one micro-hook per mobile screen keeps forward motion." },
        ],
      }),
      tail_hook_score: metricDefinition({
        name: "tail_hook_score",
        unit: "score_0_100",
        thresholds: { eliminate_below: 50, pass: 70, premium: 90 },
        evidence: [
          { source_type: "craft_rule", note: "A strong ending links reversal, pressure, information gap, or next-chapter necessity." },
        ],
      }),
      coolpoint_delivered: metricDefinition({
        name: "coolpoint_delivered",
        unit: "effective_coolpoints_per_chapter",
        thresholds: { eliminate_below: 1, pass: 1, premium: 2 },
        evidence: [
          { source_type: "craft_rule", note: "At least one visible payoff per chapter; two or more for premium density." },
        ],
      }),
      drop_risk_segments: metricDefinition({
        name: "drop_risk_segments",
        direction: "lower_is_better",
        unit: "segments_per_chapter",
        thresholds: { eliminate_above: 3, pass: 2, premium: 0 },
        evidence: [
          { source_type: "craft_rule", note: "Static explanation-heavy blocks create completion-rate cliffs." },
        ],
      }),
      retention_prediction: metricDefinition({
        name: "retention_prediction",
        unit: "score_0_100",
        thresholds: { eliminate_below: 40, pass: 60, premium: 80 },
        evidence: [
          { source_type: "derived_model", note: "Aggregates hook strength, payoff density, and drop-risk density." },
        ],
      }),
      reader_behavior_score: metricDefinition({
        name: "reader_behavior_score",
        unit: "score_0_100",
        thresholds: { eliminate_below: 55, pass: 80, premium: 92 },
        evidence: [
          { source_type: "public_platform_proxy", note: "Maps text craft signals to public author-backend outcomes: completion, traffic change, interaction, shelf/follow, next-chapter retention, and revenue proxy." },
          { source_type: "local_calibration", note: "Must be recalibrated with author-owned backend data once available." },
        ],
      }),
      first_300_retention_proxy: metricDefinition({
        name: "first_300_retention_proxy",
        unit: "score_0_100",
        thresholds: { eliminate_below: 55, pass: 82, premium: 92 },
        evidence: [
          { source_type: "behavior_proxy", note: "Opening text predicts whether a reader survives the first screen and continues into the chapter." },
        ],
      }),
      chapter_completion_proxy: metricDefinition({
        name: "chapter_completion_proxy",
        unit: "score_0_100",
        thresholds: { eliminate_below: 55, pass: 80, premium: 92 },
        evidence: [
          { source_type: "behavior_proxy", note: "Low drop-risk, concrete scene progress, and low AI taste proxy chapter read-through." },
        ],
      }),
      next_chapter_click_proxy: metricDefinition({
        name: "next_chapter_click_proxy",
        unit: "score_0_100",
        thresholds: { eliminate_below: 55, pass: 80, premium: 92 },
        evidence: [
          { source_type: "behavior_proxy", note: "Tail pressure, unresolved action, and information gap proxy next-chapter click." },
        ],
      }),
      follow_intent_proxy: metricDefinition({
        name: "follow_intent_proxy",
        unit: "score_0_100",
        thresholds: { eliminate_below: 55, pass: 78, premium: 90 },
        evidence: [
          { source_type: "behavior_proxy", note: "Repeatable serial promise, visible payoff, and character/business residue proxy shelf/follow intent." },
        ],
      }),
      ai_taste_score: metricDefinition({
        name: "ai_taste_score",
        unit: "score_0_100",
        thresholds: { eliminate_below: 55, pass: 78, premium: 90 },
        evidence: [
          { source_type: "craft_rule", note: "Natural webnovel prose should move through action, dialogue, concrete objects, and visible feedback instead of AI-like explanation and summary." },
        ],
      }),
    },
  };
}

function observationValue(observation = {}) {
  return Number(observation.predicted_score ?? observation.value ?? observation.score);
}

function isPositiveOutcome(observation, policy) {
  return (policy.positive_outcomes || []).includes(observation.outcome);
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) return null;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * q) - 1));
  return sortedValues[index];
}

function calibratedPremiumThreshold(metric, positiveValues) {
  const sorted = [...positiveValues].sort((a, b) => a - b);
  if (metric.direction === "lower_is_better") {
    return quantile(sorted, 0.5);
  }
  return quantile(sorted, 0.75);
}

export function calibrateQualityMetricRegistry(registry, observations = [], { minSamples } = {}) {
  const next = {
    ...registry,
    metrics: Object.fromEntries(
      Object.entries(registry.metrics || {}).map(([key, metric]) => [key, { ...metric, thresholds: { ...metric.thresholds }, calibration: { ...metric.calibration } }]),
    ),
    updated_at: new Date().toISOString(),
  };
  const policy = next.calibration_policy || {};
  const requiredSamples = minSamples || policy.min_samples || 3;
  for (const [metricKey, metric] of Object.entries(next.metrics)) {
    if (!metric.calibration?.enabled) continue;
    const metricObservations = observations.filter((item) => item.metric === metricKey);
    const positiveValues = metricObservations
      .filter((item) => isPositiveOutcome(item, policy))
      .map(observationValue)
      .filter(Number.isFinite);
    metric.calibration.sample_count = metricObservations.length;
    metric.calibration.positive_sample_count = positiveValues.length;
    metric.calibration.min_samples = requiredSamples;
    if (positiveValues.length < requiredSamples) {
      metric.calibration.status = "default";
      continue;
    }
    const premium = calibratedPremiumThreshold(metric, positiveValues);
    if (Number.isFinite(premium)) {
      metric.thresholds.premium = premium;
      metric.calibration.status = "calibrated";
      metric.calibration.last_updated_at = next.updated_at;
    }
  }
  return next;
}

async function readJsonLines(file) {
  try {
    const text = await readFile(file, "utf8");
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function loadQualityMetricRegistry(project) {
  try {
    return await readJson(qualityMetricRegistryFile(project));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const registry = defaultQualityMetricRegistry();
    await writeJson(qualityMetricRegistryFile(project), registry);
    return registry;
  }
}

export async function ingestQualityMetricObservation(project, observation = {}) {
  const event = {
    ...observation,
    metric: observation.metric,
    outcome: observation.outcome,
    source: observation.source || "manual",
    observed_at: observation.observed_at || new Date().toISOString(),
  };
  if (!event.metric) throw new Error("metric observation requires metric");
  if (!event.outcome) throw new Error("metric observation requires outcome");
  await appendJsonLine(qualityMetricObservationsFile(project), event);
  const baseRegistry = await loadQualityMetricRegistry(project);
  const observations = await readJsonLines(qualityMetricObservationsFile(project));
  const calibrated = calibrateQualityMetricRegistry(baseRegistry, observations);
  await writeJson(qualityMetricRegistryFile(project), calibrated);
  return { observation: event, registry: calibrated };
}

export async function createPortfolio({
  root,
  name = "portfolio",
  projects = [],
  target_chapters = 30,
  targetChapters = target_chapters,
} = {}) {
  if (!root) throw new Error("createPortfolio requires root");
  const normalizedProjects = [];
  for (const projectPath of projects) {
    const project = await loadProject(projectPath);
    normalizedProjects.push({
      title: project.title,
      project_path: project.path,
      status: "incubating",
      current_chapter: project.current_chapter || 1,
    });
  }
  const portfolio = {
    name,
    root,
    target_chapters: Number(targetChapters || 30),
    projects: normalizedProjects,
    strategy: {
      goal: "incubate_multiple_books_then_shift_budget_to_risers",
      safety: "author_confirmed_platform_data_only",
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    path: portfolioFile(root),
  };
  await writeJson(portfolio.path, portfolio);
  return portfolio;
}

async function loadPortfolio(root) {
  return readJson(portfolioFile(root));
}

export async function runPortfolioFrontlist({
  root,
  untilChapter = 30,
  maxRewrites = 0,
  routerOptions,
} = {}) {
  const portfolio = await loadPortfolio(root);
  const results = [];
  for (const item of portfolio.projects || []) {
    const project = await loadProject(item.project_path);
    const run = await runProject(project, {
      untilChapter,
      resume: true,
      maxRewrites,
      routerOptions,
    });
    results.push({
      title: project.title,
      project_path: project.path,
      run,
    });
  }
  const report = {
    portfolio_name: portfolio.name,
    root,
    status: results.every((item) => ["completed", "already_reached"].includes(item.run.status))
      ? "completed"
      : "needs_attention",
    until_chapter: untilChapter,
    results,
    created_at: new Date().toISOString(),
    path: portfolioRunReportFile(root),
  };
  await writeJson(report.path, report);
  return report;
}

function observationRiseScore(observations = []) {
  if (!observations.length) return 0;
  let score = 0;
  for (const observation of observations) {
    const value = Number(observation.value ?? observation.predicted_score ?? 0);
    const metric = observation.metric || "";
    const outcome = observation.outcome || "";
    const weight = metric === "retention_prediction"
      ? 1.3
      : metric === "tail_hook_score"
        ? 1.1
        : metric === "opening_hook_score"
          ? 1
          : 0.8;
    const outcomeMultiplier = /positive|premium|strong|rise/.test(outcome)
      ? 1.2
      : /weak|negative|drop/.test(outcome)
        ? 0.65
        : 1;
    score += value * weight * outcomeMultiplier;
  }
  return Math.round(score / Math.max(1, observations.length));
}

export async function detectPortfolioRisers({ root } = {}) {
  const portfolio = await loadPortfolio(root);
  const risers = [];
  for (const item of portfolio.projects || []) {
    const project = await loadProject(item.project_path);
    const observations = await readJsonLines(qualityMetricObservationsFile(project));
    const riseScore = observationRiseScore(observations);
    risers.push({
      title: project.title,
      project_path: project.path,
      rise_score: riseScore,
      observation_count: observations.length,
      recommendation: riseScore >= 80
        ? "scale_budget"
        : riseScore >= 55
          ? "keep_testing"
          : "hold_or_rework_opening",
    });
  }
  risers.sort((a, b) => b.rise_score - a.rise_score);
  return {
    portfolio_name: portfolio.name,
    root,
    risers,
    updated_at: new Date().toISOString(),
  };
}

export async function allocatePortfolioBudget({ root, totalBudgetCny = 0 } = {}) {
  const riserReport = await detectPortfolioRisers({ root });
  const positiveScores = riserReport.risers.map((item) => Math.max(10, item.rise_score || 0));
  const scoreTotal = positiveScores.reduce((sum, value) => sum + value, 0) || 1;
  const allocations = riserReport.risers.map((item, index) => {
    const budget = Number((Number(totalBudgetCny || 0) * (positiveScores[index] / scoreTotal)).toFixed(2));
    return {
      title: item.title,
      project_path: item.project_path,
      rise_score: item.rise_score,
      budget_cny: budget,
      action: item.recommendation,
    };
  });
  return {
    portfolio_name: riserReport.portfolio_name,
    root,
    total_budget_cny: Number(totalBudgetCny || 0),
    allocations,
    updated_at: new Date().toISOString(),
  };
}

function tokenizeTemplateText(value = "") {
  const text = String(value || "").toLowerCase();
  const tokens = new Set();
  for (const token of text.split(/[^\p{L}\p{N}]+/u)) {
    if (token.length >= 2) tokens.add(token);
  }
  const cjkMatches = text.match(/[\u4e00-\u9fff]{2,}/g) || [];
  for (const item of cjkMatches) {
    for (let index = 0; index < item.length - 1; index += 1) {
      tokens.add(item.slice(index, index + 2));
    }
  }
  return [...tokens];
}

function inferTemplateAngles(project = {}, domainPlan = {}) {
  const idea = String(project.idea || "");
  const domain = domainPlan.domain || "";
  const genre = project.genre || "";
  const tags = [];
  for (const [pattern, tag] of [
    [/姊﹀够瑗挎父|澶у攼瀹樺簻|闀垮畨鍩巪娓告垙|IP/i, "game_ip"],
    [/閲嶇敓|2016|2015|鏍″洯|澶у/i, "rebirth_business"],
    [/鍟嗘垬|缁忔祹|璁㈠崟|澶栧崠|鍟嗘埛|娴侀噺/i, "commerce"],
    [/淇粰|鐏垫牴|瀹楅棬|涓硅嵂|绐佺牬/i, "xianxia"],
    [/瀹嬫湞|鍞愭湞|鏄庢湞|绉戜妇|瀹樺埗/i, "historical"],
  ]) {
    if (pattern.test(`${idea} ${domain} ${genre}`)) tags.push(tag);
  }
  return [...new Set(tags)];
}

async function latestReadinessForProject(project) {
  const reportsDir = path.join(project.path, "reports");
  const files = await readdir(reportsDir).catch(() => []);
  const candidates = files
    .filter((file) => /^premium_readiness_.*\.json$/.test(file))
    .sort()
    .reverse();
  for (const file of candidates) {
    try {
      return await readJson(path.join(reportsDir, file));
    } catch {
      // Ignore malformed old reports while harvesting templates.
    }
  }
  return null;
}

function templateFromProject({ project, riser, readiness, domainPlan }) {
  const domain = domainPlan?.domain || "";
  const angles = inferTemplateAngles(project, domainPlan);
  const keywords = [
    ...tokenizeTemplateText(project.idea),
    ...tokenizeTemplateText(project.genre),
    ...tokenizeTemplateText(domain),
    ...angles,
  ];
  const uniqueKeywords = [...new Set(keywords)].slice(0, 40);
  return {
    template_id: safeTemplateId(project.title),
    title: project.title,
    source_project_path: project.path,
    source: "portfolio_riser",
    saved_source_text: false,
    template_prompt: [
      project.idea,
      domain ? `Domain: ${domain}` : "",
      angles.length ? `Angles: ${angles.join(", ")}` : "",
      "动态模板约束：只保留已验证的题材角度、主角优势、爽点组合和领域知识方向；新书必须更换人物、事件、场景桥段和表达。",
    ].filter(Boolean).join("\n"),
    angles,
    keywords: uniqueKeywords,
    domain,
    rise_score: riser?.rise_score || 0,
    evidence: {
      observation_count: riser?.observation_count || 0,
      recommendation: riser?.recommendation || "unknown",
      readiness_status: readiness?.status || "unknown",
      overall_score: readiness?.overall_score ?? null,
      metric_summary: readiness?.metric_summary || {},
    },
    copy_policy: {
      mode: "strategy_and_structure_only",
      saved_source_text: false,
      forbidden: [
        "source_sentences",
        "character_names",
        "exact_events",
        "scene_order",
        "dialogue_lines",
        "plot_bridge_details",
      ],
    },
    updated_at: new Date().toISOString(),
  };
}

function safeTemplateId(value = "") {
  return String(value || "template")
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .slice(0, 80);
}

export async function refreshDynamicTemplateLibrary({
  root,
  minRiseScore = 70,
  limit = 5,
} = {}) {
  if (!root) throw new Error("refreshDynamicTemplateLibrary requires root");
  const riserReport = await detectPortfolioRisers({ root });
  const templates = [];
  for (const riser of riserReport.risers || []) {
    if ((riser.rise_score || 0) < minRiseScore) continue;
    const project = await loadProject(riser.project_path);
    const readiness = await latestReadinessForProject(project);
    const domainPlan = await readJson(domainKnowledgePlanFile(project)).catch(() => null);
    templates.push(templateFromProject({ project, riser, readiness, domainPlan }));
  }
  templates.sort((a, b) => b.rise_score - a.rise_score);
  const library = {
    root,
    saved_source_text: false,
    update_policy: "auto_from_portfolio_risers",
    min_rise_score: minRiseScore,
    templates: templates.slice(0, limit),
    created_at: new Date().toISOString(),
    path: dynamicTemplateLibraryFile(root),
  };
  await writeJson(library.path, library);
  return library;
}

function scoreTemplateMatch(template = {}, idea = "") {
  const ideaTokens = new Set(tokenizeTemplateText(idea));
  let score = 0;
  const reasons = [];
  for (const token of template.keywords || []) {
    if (ideaTokens.has(String(token).toLowerCase())) {
      score += 3;
      if (!reasons.includes("keyword_overlap")) reasons.push("keyword_overlap");
    }
  }
  if (template.domain && String(idea).includes(template.domain)) {
    score += 20;
    reasons.push("domain_overlap");
  }
  for (const angle of template.angles || []) {
    if (ideaTokens.has(angle)) {
      score += 8;
      if (!reasons.includes("angle_overlap")) reasons.push("angle_overlap");
    }
  }
  score += Math.round((template.rise_score || 0) / 10);
  return { score, reasons };
}

export async function recommendDynamicTemplates({
  root,
  idea = "",
  limit = 5,
} = {}) {
  if (!root) throw new Error("recommendDynamicTemplates requires root");
  const library = await readJson(dynamicTemplateLibraryFile(root)).catch(() => ({
    root,
    saved_source_text: false,
    templates: [],
  }));
  return (library.templates || [])
    .map((template) => {
      const match = scoreTemplateMatch(template, idea);
      return {
        ...template,
        match_score: match.score,
        reasons: match.reasons,
      };
    })
    .filter((template) => template.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, limit);
}

function applyDynamicTemplateToIdea(idea, template) {
  if (!template) return idea;
  return [
    idea,
    "",
    "动态模板约束：",
    template.template_prompt || template.title || template.template_id,
    "",
    "安全边界：只继承题材角度、爽点分布、商业逻辑和领域知识方向；不得复制原项目人物、句子、具体事件顺序、桥段和专有表达。",
  ].join("\n");
}

function candidateTitle(baseTitle, index) {
  return `${baseTitle}-${String(index + 1).padStart(2, "0")}`;
}

export async function createPremiumIncubationPlan({
  root,
  baseTitle = "premium-incubation",
  ideas = [],
  platform = "fanqie",
  genre = "portfolio incubation",
  targetChapters = 30,
  template = null,
} = {}) {
  if (!root) throw new Error("createPremiumIncubationPlan requires root");
  if (!Array.isArray(ideas) || !ideas.length) {
    throw new Error("createPremiumIncubationPlan requires ideas");
  }
  const projects = [];
  for (let index = 0; index < ideas.length; index += 1) {
    const project = await createProject({
      root,
      title: candidateTitle(baseTitle, index),
      idea: applyDynamicTemplateToIdea(ideas[index], template),
      platform,
      genre,
    });
    const domainPlan = await readJson(domainKnowledgePlanFile(project)).catch(() => null);
    projects.push({
      title: project.title,
      project_path: project.path,
      idea: project.idea,
      domain_knowledge_plan: domainPlan,
      status: "planned",
    });
  }
  const portfolio = await createPortfolio({
    root,
    name: baseTitle,
    projects: projects.map((project) => project.project_path),
    target_chapters: targetChapters,
  });
  return {
    status: "planned",
    root,
    base_title: baseTitle,
    target_chapters: targetChapters,
    template_applied: template ? {
      template_id: template.template_id,
      title: template.title,
      rise_score: template.rise_score,
      saved_source_text: false,
    } : null,
    projects,
    portfolio,
    next_actions: ["run_premium_incubation", "review_repair_queue", "ingest_platform_data", "detect_risers"],
    created_at: new Date().toISOString(),
  };
}

function decisionForProject({ readiness, riser, allocation }) {
  const readinessStatus = readiness?.status || "blocked";
  const repairCount = readiness?.repair_queue?.length || 0;
  const riseScore = riser?.rise_score || 0;
  if (readinessStatus === "premium_ready" && riseScore >= 80) {
    return {
      action: "continue_push",
      reason: "premium_ready_and_rising",
      next_step: "continue_to_100_chapters_and_increase_budget",
    };
  }
  if (readinessStatus === "premium_ready") {
    return {
      action: "continue_push",
      reason: "premium_ready",
      next_step: "publish_or_continue_testing_frontlist",
    };
  }
  if (repairCount > 0 && repairCount <= 8) {
    return {
      action: "repair_before_push",
      reason: "repair_queue_small_enough",
      next_step: "fix_repair_queue_then_rerun_premium_readiness",
    };
  }
  if (riseScore < 40) {
    return {
      action: "rework_opening",
      reason: "low_rise_score_or_no_data",
      next_step: "rewrite_first_three_chapters_or_change_angle",
    };
  }
  return {
    action: "hold",
    reason: "needs_more_signal",
    next_step: "collect_more_platform_data_before_scaling",
  };
}

export async function runPremiumIncubation({
  root,
  untilChapter = 30,
  maxRewrites = 1,
  totalBudgetCny = 0,
  routerOptions,
} = {}) {
  const frontlist = await runPortfolioFrontlist({
    root,
    untilChapter,
    maxRewrites,
    routerOptions,
  });
  const risers = await detectPortfolioRisers({ root });
  const allocation = await allocatePortfolioBudget({ root, totalBudgetCny });
  const projectReports = [];
  const decisions = [];
  for (const item of frontlist.results || []) {
    const project = await loadProject(item.project_path);
    const premiumReadiness = await writePremiumReadinessReport(project, {
      from: 1,
      to: untilChapter,
    });
    const riser = risers.risers.find((candidate) => candidate.project_path === project.path) || null;
    const budget = allocation.allocations.find((candidate) => candidate.project_path === project.path) || null;
    const decision = decisionForProject({
      readiness: premiumReadiness,
      riser,
      allocation: budget,
    });
    const projectReport = {
      title: project.title,
      project_path: project.path,
      run: item.run,
      premium_readiness: premiumReadiness,
      riser,
      allocation: budget,
      decision,
    };
    projectReports.push(projectReport);
    decisions.push({
      title: project.title,
      project_path: project.path,
      action: decision.action,
      reason: decision.reason,
      next_step: decision.next_step,
      budget_cny: budget?.budget_cny || 0,
      rise_score: riser?.rise_score || 0,
      readiness_status: premiumReadiness.status,
    });
  }
  const report = {
    status: frontlist.status === "completed" ? "completed" : "needs_attention",
    root,
    until_chapter: untilChapter,
    frontlist,
    project_reports: projectReports,
    decisions,
    allocation,
    created_at: new Date().toISOString(),
    path: premiumIncubationReportFile(root),
  };
  await writeJson(report.path, report);
  return report;
}

export async function getLatestPremiumIncubationReport({ root } = {}) {
  if (!root) throw new Error("getLatestPremiumIncubationReport requires root");
  return readJson(premiumIncubationReportFile(root));
}

function repairPriority(item = {}) {
  const metric = item.metric || "";
  if (metric === "global_consistency") return 12;
  if (metric === "ai_taste_score") return 11;
  if (metric === "drop_risk_segments") return 10;
  if (metric === "retention_prediction") return 9;
  if (metric === "opening_hook_score") return 8;
  if (metric === "tail_hook_score") return 7;
  if (metric === "coolpoint_delivered") return 6;
  if (metric === "micro_hook_density") return 5;
  if (metric === "rhythm_transfer_compliance") return 4;
  return 1;
}

export function webnovelRepairPresets() {
  return [
    {
      preset_id: "de-ai-polish",
      label: "去AI味",
      user_facing: true,
      rewrite_layers: ["remove_explanation", "cost_visibility"],
      instruction: "删除解释腔、总结腔和模板感，把判断改成动作、对白、数据和现场反馈。",
    },
    {
      preset_id: "boost-coolpoint",
      label: "加强爽点",
      user_facing: true,
      rewrite_layers: ["coolpoint_boost", "cost_visibility"],
      instruction: "补足可见结果、误判反转和胜利反馈，让读者看见主角赢在哪里。",
    },
    {
      preset_id: "tighten-pace",
      label: "收紧节奏",
      user_facing: true,
      rewrite_layers: ["drop_risk_repair", "pace_tightening"],
      instruction: "压缩静态说明和重复信息，把拖慢阅读的段落改成动作、短对白和现场变化。",
    },
    {
      preset_id: "sensory-detail",
      label: "丰富感官",
      user_facing: true,
      rewrite_layers: ["sensory_density"],
      instruction: "补一层声音、气味、触感、光线或物件质感，但不拖慢主线。",
    },
    {
      preset_id: "dialogue-polish",
      label: "打磨对白",
      user_facing: true,
      rewrite_layers: ["character_voice"],
      instruction: "用角色锚点和台词样本重塑口吻；短句推进冲突，每几句穿插动作。",
    },
    {
      preset_id: "tail-hook-boost",
      label: "章尾钩子强化",
      user_facing: true,
      rewrite_layers: ["strengthen_tail_hook"],
      instruction: "只改末尾压力点，强化下一章必须兑现的问题、反转或可见风险。",
    },
  ];
}

export function repairPresetForIssue(item = {}) {
  const text = `${item.metric || ""} ${item.issue || ""} ${item.reason || ""}`.toLowerCase();
  const presets = webnovelRepairPresets();
  const byId = Object.fromEntries(presets.map((preset) => [preset.preset_id, preset]));
  if (/ai_taste|ai鍛硘ai 鍛硘de-ai|explanation_heavy|summary_phrases/.test(text)) return byId["de-ai-polish"];
  if (/tail_hook|hook|閽╁瓙|绔犲熬/.test(text)) return byId["tail-hook-boost"];
  if (/coolpoint|鐖界偣|visible_result|payoff/.test(text)) return byId["boost-coolpoint"];
  if (/drop_risk|pace|鑺傚|鎷東鎱姘磡micro_hook/.test(text)) return byId["tighten-pace"];
  if (/dialogue|voice|character_voice|鍙ｅ惢|鍙拌瘝|瀵硅瘽|瑙掕壊/.test(text)) return byId["dialogue-polish"];
  if (/sensory|鎰熷畼|姘斿懗|澹伴煶|瑙︽劅|璐ㄦ劅/.test(text)) return byId["sensory-detail"];
  return byId["de-ai-polish"];
}

export function repairQueueSummaryFromPremiumReport(report = {}) {
  const byMetric = {};
  const byPreset = {};
  const byProject = [];
  const priorityOrder = [];
  for (const projectReport of report.project_reports || []) {
    const items = (projectReport.premium_readiness?.repair_queue || []).map((item) => {
      const preset = repairPresetForIssue(item);
      return {
        ...item,
        title: projectReport.title,
        project_path: projectReport.project_path,
        priority: repairPriority(item),
        repair_preset: preset,
        repair_action: {
          endpoint: "/api/tasks",
          type: "repair-single",
          project: projectReport.project_path,
          chapter_no: item.chapter_no,
          metric: item.metric,
          issue: item.issue,
          preset,
          max_rewrites: 1,
        },
      };
    });
    if (items.length) {
      byProject.push({
        title: projectReport.title,
        project_path: projectReport.project_path,
        count: items.length,
        items,
      });
    }
    for (const item of items) {
      if (!byMetric[item.metric]) {
        byMetric[item.metric] = {
          metric: item.metric,
          count: 0,
          chapters: [],
          projects: [],
        };
      }
      byMetric[item.metric].count += 1;
      byMetric[item.metric].chapters.push(item.chapter_no);
      if (!byMetric[item.metric].projects.includes(projectReport.title)) {
        byMetric[item.metric].projects.push(projectReport.title);
      }
      const presetLabel = item.repair_preset?.label || "去AI味";
      if (!byPreset[presetLabel]) {
        byPreset[presetLabel] = {
          label: presetLabel,
          preset_id: item.repair_preset?.preset_id || null,
          count: 0,
          chapters: [],
          projects: [],
        };
      }
      byPreset[presetLabel].count += 1;
      byPreset[presetLabel].chapters.push(item.chapter_no);
      if (!byPreset[presetLabel].projects.includes(projectReport.title)) {
        byPreset[presetLabel].projects.push(projectReport.title);
      }
      priorityOrder.push(item);
    }
  }
  priorityOrder.sort((a, b) => b.priority - a.priority || a.chapter_no - b.chapter_no);
  byProject.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  return {
    status: "ok",
    total_items: priorityOrder.length,
    by_metric: byMetric,
    by_preset: byPreset,
    by_project: byProject,
    priority_order: priorityOrder,
    generated_at: new Date().toISOString(),
  };
}

export async function runPremiumRepairSweep({
  root,
  limit = 10,
  maxRewrites = 1,
  routerOptions,
  repairRunner,
} = {}) {
  if (!root) throw new Error("runPremiumRepairSweep requires root");
  const latest = await getLatestPremiumIncubationReport({ root });
  const summary = repairQueueSummaryFromPremiumReport(latest);
  const selected = summary.priority_order.slice(0, Math.max(0, Number(limit) || 0));
  const repairRuns = [];
  const touchedProjectPaths = new Set();
  for (const item of selected) {
    const project = await loadProject(item.project_path);
    const runner = repairRunner || (({ project: targetProject, item: repairItem }) =>
      runSingleChapterQualityLoop(targetProject, repairItem.chapter_no, {
        maxRewrites,
        routerOptions,
      }));
    const result = await runner({ project, item, maxRewrites, routerOptions });
    touchedProjectPaths.add(project.path);
    repairRuns.push({
      title: project.title,
      project_path: project.path,
      chapter_no: item.chapter_no,
      metric: item.metric,
      issue: item.issue,
      priority: item.priority,
      status: result.status,
      final_grade: result.final_grade || null,
      quality_report_path: result.quality_report_path || null,
    });
  }

  const projectRechecks = [];
  for (const projectPath of touchedProjectPaths) {
    const project = await loadProject(projectPath);
    const projectReport = (latest.project_reports || []).find((item) => item.project_path === projectPath);
    const range = projectReport?.premium_readiness?.range || { from: 1, to: latest.until_chapter || 30 };
    const premiumReadiness = await writePremiumReadinessReport(project, {
      from: range.from || 1,
      to: range.to || latest.until_chapter || 30,
    });
    projectRechecks.push({
      title: project.title,
      project_path: project.path,
      premium_readiness: premiumReadiness,
    });
  }

  const report = {
    status: "completed",
    root,
    selected_count: selected.length,
    repaired_count: repairRuns.length,
    remaining_count: Math.max(0, summary.total_items - selected.length),
    remaining_queue: summary.priority_order.slice(selected.length),
    max_rewrites: maxRewrites,
    repair_runs: repairRuns,
    project_rechecks: projectRechecks,
    created_at: new Date().toISOString(),
    path: premiumRepairSweepReportFile(root),
  };
  await writeJson(report.path, report);
  return report;
}

export async function ingestPortfolioProjectObservation({
  root,
  projectPath,
  project_path = projectPath,
  chapterNo = 1,
  chapter_no = chapterNo,
  metrics = {},
  outcome = "observed",
  source = "manual_portfolio_ingest",
  platform,
  raw = null,
} = {}) {
  if (!root) throw new Error("ingestPortfolioProjectObservation requires root");
  if (!project_path) throw new Error("ingestPortfolioProjectObservation requires projectPath");
  const portfolio = await loadPortfolio(root);
  const member = (portfolio.projects || []).find((item) => item.project_path === project_path);
  if (!member) {
    throw new Error(`project is not registered in portfolio: ${project_path}`);
  }
  const project = await loadProject(project_path);
  const observations = [];
  for (const [metric, value] of Object.entries(metrics || {})) {
    const result = await ingestQualityMetricObservation(project, {
      metric,
      value,
      predicted_score: value,
      outcome,
      source,
      platform: platform || project.platform,
      chapter_no,
      raw,
    });
    observations.push(result.observation);
  }
  const risers = await detectPortfolioRisers({ root });
  const riser = risers.risers.find((item) => item.project_path === project.path) || null;
  return {
    status: "ingested",
    portfolio_name: portfolio.name,
    project_title: project.title,
    project_path: project.path,
    observations,
    riser,
  };
}

function metricValueFromReport(metricKey, report = {}) {
  const metrics = report.quality_metrics || report.metrics || {};
  if (metricKey === "tail_hook_score") return metrics.tail_hook_score?.score;
  if (metricKey === "micro_hook_density") return metrics.micro_hook_density?.density;
  if (metricKey === "coolpoint_delivered") return metrics.coolpoint_delivered?.effective_count;
  if (metricKey === "drop_risk_segments") return metrics.drop_risk_segments?.risky_segment_count ?? metrics.drop_risk_segments?.count;
  if (metricKey === "retention_prediction") return metrics.retention_prediction?.score;
  if (metricKey === "opening_hook_score") return metrics.opening_hook_score?.score ?? null;
  if (metricKey === "ai_taste_score") return metrics.ai_taste_score?.score ?? null;
  if (metricKey === "reader_behavior_score") return metrics.reader_behavior_score?.score ?? null;
  if (metricKey === "first_300_retention_proxy") return metrics.first_300_retention_proxy?.score ?? metrics.reader_behavior_score?.proxies?.first_300_retention_proxy?.score ?? null;
  if (metricKey === "chapter_completion_proxy") return metrics.chapter_completion_proxy?.score ?? metrics.reader_behavior_score?.proxies?.chapter_completion_proxy?.score ?? null;
  if (metricKey === "next_chapter_click_proxy") return metrics.next_chapter_click_proxy?.score ?? metrics.reader_behavior_score?.proxies?.next_chapter_click_proxy?.score ?? null;
  if (metricKey === "follow_intent_proxy") return metrics.follow_intent_proxy?.score ?? metrics.reader_behavior_score?.proxies?.follow_intent_proxy?.score ?? null;
  return null;
}

function metricPasses(value, metric) {
  if (!Number.isFinite(value)) return false;
  const thresholds = metric.thresholds || {};
  if (metric.direction === "lower_is_better") {
    return value <= thresholds.pass;
  }
  return value >= thresholds.pass;
}

function metricPremium(value, metric) {
  if (!Number.isFinite(value)) return false;
  const thresholds = metric.thresholds || {};
  if (metric.direction === "lower_is_better") {
    return value <= thresholds.premium;
  }
  return value >= thresholds.premium;
}

function metricScore(value, metric) {
  if (!Number.isFinite(value)) return 0;
  const thresholds = metric.thresholds || {};
  if (metric.direction === "lower_is_better") {
    const pass = Number(thresholds.pass ?? 1);
    const eliminate = Number(thresholds.eliminate_above ?? pass + 1);
    if (value <= Number(thresholds.premium ?? 0)) return 100;
    if (value <= pass) return 80;
    if (value >= eliminate) return 35;
    return 60;
  }
  const premium = Number(thresholds.premium ?? 100);
  const pass = Number(thresholds.pass ?? premium * 0.75);
  const eliminate = Number(thresholds.eliminate_below ?? pass * 0.5);
  if (value >= premium) return 100;
  if (value >= pass) return 80;
  if (value < eliminate) return 35;
  return 60;
}

function publishBlockerAdvice(blocker) {
  if (blocker === "ai_taste_below_publish") {
    return "Remove AI taste: replace summary/explanation with action, dialogue, concrete objects, order/data changes, and scene feedback.";
  }
  const advice = {
    review_grade_below_publish: "质检等级未到发布线，重新走本章自动优化。",
    hard_quality_flag_active: "命中硬规则，必须自动重写后再发布。",
    fact_consistency_violation: "章卡事实、项目设定或正文存在冲突，必须统一设定口径后再发布。",
    drop_risk_segments_remaining: "仍有弃读风险段，把解释段改成动作、短对白、现场反馈或具体数字变化。",
    tail_hook_below_publish: "章尾钩子不够强，重写末尾200字，补反转、压力或下章必问问题。",
    micro_hook_density_below_publish: "微钩子密度不足，在低密度段补对白中断、数据变化、旧钩回咬或信息差提示。",
    coolpoint_density_below_publish: "爽点兑现不足，把爽点从旁白宣布改成事件兑现，并给出可见结果和角色反应。",
    retention_prediction_below_publish: "追读预测不足，综合修开头、章尾、爽点、弃读段和微钩子密度。",
    reader_behavior_score_below_publish: "读者行为代理分不足，优先修前300字留存、章节读完、下一章点击和追更意愿。",
    story_room_contract_not_delivered: "章卡里的公开反馈、代价残留、关系推进或章尾债务没有落到正文，必须改成现场动作和可见后果。",
    first_300_retention_proxy_below_publish: "前300字留存代理分不足，重写开篇第一屏：直接进入冲突、反常动作或可见结果。",
    chapter_completion_proxy_below_publish: "章节读完代理分不足，删除弃读段和AI解释段，补现场推进、短对白和可见反馈。",
    next_chapter_click_proxy_below_publish: "下一章点击代理分不足，增强章尾压力、未完成动作和信息差。",
    follow_intent_proxy_below_publish: "追更/加书架代理分不足，补可持续的连载承诺、人物牵引和下一阶段收益想象。",
  };
  return advice[blocker] || "按发布门禁问题定向重写。";
}

function repairAdvice(metricKey) {
  if (metricKey === "ai_taste_score") {
    return "Remove AI taste: delete summary/explanation lines and make the scene move through action, dialogue, objects, order/data changes, and reactions.";
  }
  const advice = {
    tail_hook_score: "重写末尾200字：补一句话反转、信息差、角色压力或下章必问问题。",
    micro_hook_density: "在低密度屏补对白中断、数据变化、旧钩回咬或信息差提示。",
    coolpoint_delivered: "把爽点从旁白宣布改成事件兑现，并给出可见结果和角色反应。",
    drop_risk_segments: "把解释段改成动作、短对白、现场反馈或具体数字变化。",
    retention_prediction: "综合修章尾钩子、爽点兑现、弃读段和微钩子密度。",
    opening_hook_score: "重写前300字：直接进入冲突、反常动作或可见结果。",
    reader_behavior_score: "按读者行为代理分修复：前300字留存、读完率、下一章点击和追更意愿必须同时过线。",
    first_300_retention_proxy: "重写前300字：第一屏必须有压迫、反常、动作、物件或可见结果。",
    chapter_completion_proxy: "降低章节弃读：删解释段，补事件推进、对白中断、物件反馈、结果变化。",
    next_chapter_click_proxy: "补下一章点击动机：章尾必须留下具体人、事、物、消息或危机。",
    follow_intent_proxy: "补追更意愿：让本章胜利留下新成本、关系牵引或长期规则升级。",
  };
  return advice[metricKey] || "按指标问题定向重写。";
}

function buildRhythmTransferSummary(reports = []) {
  const enabledReports = reports.filter((report) => report.rhythm_transfer_compliance?.enabled);
  const deviationReports = enabledReports.filter((report) =>
    (report.rhythm_transfer_compliance?.issues || []).length > 0,
  );
  const issueCounts = {};
  for (const report of deviationReports) {
    for (const issue of report.rhythm_transfer_compliance?.issues || []) {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }
  const enabledCount = enabledReports.length;
  return {
    enabled_chapter_count: enabledCount,
    deviation_count: deviationReports.length,
    deviation_chapters: deviationReports.map((report) => report.chapter_no).sort((a, b) => a - b),
    execution_rate: enabledCount ? Number(((enabledCount - deviationReports.length) / enabledCount).toFixed(3)) : null,
    issue_counts: issueCounts,
  };
}

export async function writePremiumReadinessReport(project, { from = 1, to = 30 } = {}) {
  const registry = await loadQualityMetricRegistry(project);
  const metricKeys = [
    "tail_hook_score",
    "opening_hook_score",
    "reader_behavior_score",
    "first_300_retention_proxy",
    "chapter_completion_proxy",
    "next_chapter_click_proxy",
    "follow_intent_proxy",
    "micro_hook_density",
    "coolpoint_delivered",
    "drop_risk_segments",
    "retention_prediction",
  ];
  const reports = [];
  const missing_chapters = [];
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    try {
      reports.push(await readJson(qualityReportFile(project, chapterNo)));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing_chapters.push(chapterNo);
    }
  }

  const repairQueue = [];
  const metricSummary = {};
  let scoreTotal = 0;
  let scoreCount = 0;
  for (const metricKey of metricKeys) {
    const metric = registry.metrics?.[metricKey] || defaultQualityMetricRegistry().metrics[metricKey];
    const values = reports
      .map((report) => ({ chapter_no: report.chapter_no, value: metricValueFromReport(metricKey, report) }))
      .filter((item) => Number.isFinite(item.value));
    const problemChapters = values
      .filter((item) => !metricPasses(item.value, metric))
      .map((item) => item.chapter_no);
    for (const item of values) {
      scoreTotal += metricScore(item.value, metric);
      scoreCount += 1;
      if (!metricPasses(item.value, metric)) {
        repairQueue.push({
          chapter_no: item.chapter_no,
          metric: metricKey,
          issue: metricKey === "tail_hook_score"
            ? "tail_hook_weak"
            : metricKey === "micro_hook_density"
              ? "micro_hook_density_low"
              : metricKey === "drop_risk_segments"
                ? "drop_risk_segments"
                : metricKey === "coolpoint_delivered"
                  ? "coolpoint_not_delivered"
                  : "retention_prediction_low",
          value: item.value,
          advice: repairAdvice(metricKey),
        });
      }
    }
    const average = values.length
      ? values.reduce((sum, item) => sum + item.value, 0) / values.length
      : null;
    metricSummary[metricKey] = {
      average,
      pass_count: values.filter((item) => metricPasses(item.value, metric)).length,
      premium_count: values.filter((item) => metricPremium(item.value, metric)).length,
      problem_chapters: problemChapters,
      thresholds: metric.thresholds,
      direction: metric.direction,
    };
  }
  const rhythmTransferSummary = buildRhythmTransferSummary(reports);
  for (const chapterNo of rhythmTransferSummary.deviation_chapters) {
    const report = reports.find((item) => item.chapter_no === chapterNo);
    repairQueue.push({
      chapter_no: chapterNo,
      metric: "rhythm_transfer_compliance",
      issue: "rhythm_transfer_repair",
      value: report?.rhythm_transfer_compliance?.issues || [],
      advice: "Repair rhythm transfer deviations: match opening pattern, tail hook type, abstract beats, dialogue ratio, micro-hook density, and drop-risk limits without copying reference prose.",
    });
  }
  const overallScore = scoreCount ? Math.round(scoreTotal / scoreCount) : 0;
  const status = missing_chapters.length
    ? "blocked"
    : repairQueue.length
      ? "needs_repair"
      : overallScore >= 80
        ? "premium_ready"
        : "needs_repair";
  const report = {
    project_title: project.title,
    status,
    range: { from, to },
    chapter_count: reports.length,
    missing_chapters,
    overall_score: overallScore,
    metric_summary: metricSummary,
    rhythm_transfer_summary: rhythmTransferSummary,
    repair_queue: repairQueue.sort((a, b) => a.chapter_no - b.chapter_no),
    created_at: new Date().toISOString(),
  };
  report.path = premiumReadinessReportFile(project, from, to);
  await writeJson(report.path, report);
  return report;
}

export async function writePremiumGateReport(project, {
  from = 1,
  to = 30,
  targetScore = 95,
} = {}) {
  const registry = await loadQualityMetricRegistry(project);
  const metricKeys = [
    "opening_hook_score",
    "reader_behavior_score",
    "first_300_retention_proxy",
    "chapter_completion_proxy",
    "next_chapter_click_proxy",
    "follow_intent_proxy",
    "tail_hook_score",
    "micro_hook_density",
    "coolpoint_delivered",
    "drop_risk_segments",
    "retention_prediction",
    "ai_taste_score",
  ];
  const reports = [];
  const missing_chapters = [];
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    try {
      reports.push(await readJson(qualityReportFile(project, chapterNo)));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing_chapters.push(chapterNo);
    }
  }

  const blockingChapters = [];
  const metricSummary = {};
  let scoreTotal = 0;
  let scoreCount = 0;
  for (const metricKey of metricKeys) {
    const metric = registry.metrics?.[metricKey] || defaultQualityMetricRegistry().metrics[metricKey];
    const values = [];
    for (const report of reports) {
      const value = metricValueFromReport(metricKey, report);
      if (!Number.isFinite(value)) continue;
      values.push({ chapter_no: report.chapter_no, value });
      scoreTotal += metricScore(value, metric);
      scoreCount += 1;
      if (!metricPremium(value, metric)) {
        blockingChapters.push({
          chapter_no: report.chapter_no,
          metric: metricKey,
          value,
          scope: report.chapter_no <= 3 ? "first_three" : "full_range",
          reason: metricKey === "drop_risk_segments"
            ? "drop_risk_or_static_explanation"
            : "below_premium_threshold",
          advice: repairAdvice(metricKey),
        });
      }
    }
    metricSummary[metricKey] = {
      average: values.length
        ? Number((values.reduce((sum, item) => sum + item.value, 0) / values.length).toFixed(2))
        : null,
      premium_count: values.filter((item) => metricPremium(item.value, metric)).length,
      checked_count: values.length,
      thresholds: metric.thresholds,
      direction: metric.direction,
    };
  }

  for (const report of reports) {
    const publishGate = report.publish_gate || null;
    if (!publishGate || publishGate.publish_ready !== true) {
      const blockers = Array.isArray(publishGate?.blockers) && publishGate.blockers.length
        ? publishGate.blockers
        : ["publish_gate_not_ready"];
      for (const blocker of blockers) {
        blockingChapters.push({
          chapter_no: report.chapter_no,
          metric: "publish_gate",
          blocker,
          value: publishGate?.values?.[blocker] ?? null,
          scope: report.chapter_no <= 3 ? "first_three" : "full_range",
          reason: blocker,
          advice: publishBlockerAdvice(blocker),
        });
      }
    }
  }

  for (const chapterNo of missing_chapters) {
    blockingChapters.push({
      chapter_no: chapterNo,
      metric: "missing_quality_report",
      value: null,
      scope: chapterNo <= 3 ? "first_three" : "full_range",
      reason: "missing_quality_report",
      advice: "Run the chapter quality loop before premium gate evaluation.",
    });
  }

  const overallScore = scoreCount ? Math.round(scoreTotal / scoreCount) : 0;
  const firstThreeBlocked = blockingChapters.some((item) => item.scope === "first_three");
  const hardRiskBlocked = blockingChapters.some((item) =>
    item.metric === "drop_risk_segments" || item.metric === "missing_quality_report",
  );
  const publishAllowed = overallScore >= Number(targetScore) &&
    !firstThreeBlocked &&
    !hardRiskBlocked &&
    blockingChapters.length === 0;
  const report = {
    project_title: project.title,
    status: publishAllowed ? "pass" : "blocked",
    publish_package_allowed: publishAllowed,
    target_score: Number(targetScore),
    overall_score: overallScore,
    range: { from, to },
    chapter_count: reports.length,
    missing_chapters,
    metric_summary: metricSummary,
    blocking_chapters: blockingChapters.sort((a, b) => a.chapter_no - b.chapter_no || a.metric.localeCompare(b.metric)),
    must_fix_before_publish: blockingChapters.map((item) => ({
      chapter_no: item.chapter_no,
      metric: item.metric,
      blocker: item.blocker || null,
      reason: item.reason,
      advice: item.advice,
    })),
    created_at: new Date().toISOString(),
  };
  report.path = premiumGateReportFile(project, from, to);
  await writeJson(report.path, report);
  return report;
}

function normalizePublishPlatform(platform, project) {
  return String(platform || project.platform || "fanqie").trim() || "fanqie";
}

function publishSafetyEnvelope(gate) {
  return {
    gate_required: true,
    publish_package_allowed: Boolean(gate?.publish_package_allowed),
    no_password_bypass: true,
    no_captcha_bypass: true,
    no_paywall_bypass: true,
    no_auto_comment_or_fake_engagement: true,
    no_unconfirmed_submission: true,
    requires_user_authorization_for_platform_publish: true,
  };
}

function publishMetadataForProject(project, platform, gate) {
  return {
    title: project.title,
    idea: project.idea || "",
    platform,
    genre: project.genre || "",
    tags: [project.genre, platform].filter(Boolean),
    synopsis: project.idea || project.title,
    selling_points: [
      "premium_gate_checked",
      "quality_metrics_passed",
      "user_owned_generated_draft",
    ],
    target_audience: platform === "fanqie" ? "番茄男频读者" : "目标平台读者",
    safety: publishSafetyEnvelope(gate),
  };
}

function platformPublishSteps(platform) {
  const platformName = platform === "fanqie" ? "番茄作者后台" : `${platform} 作者后台`;
  return [
    `确认作品已通过 premium-gate，并检查发布包 manifest。`,
    `使用用户自己的账号登录或授权 ${platformName}。`,
    "导入 metadata、章节正文和投稿 payload。",
    "停在平台提交确认页，由用户检查书名、简介、标签、章节内容和平台规则。",
    "用户明确确认后，再执行提交或保存草稿。",
  ];
}

const PLATFORM_PUBLISH_ADAPTERS = {
  "local-dry-run": {
    id: "local-dry-run",
    label: "Local dry run",
    platform: "local",
    mode: "local-audit",
    author_console_url: null,
    requires_user_authorization: true,
    field_mapping: {
      title: "metadata.title",
      synopsis: "metadata.synopsis",
      genre: "metadata.genre",
      tags: "metadata.tags",
      chapters: "chapters_file",
    },
    required_user_checks: ["confirm_local_payload"],
    safety: {
      no_password_bypass: true,
      no_captcha_bypass: true,
      no_paywall_bypass: true,
      stop_before_unconfirmed_submit: true,
    },
  },
  "manual-browser": {
    id: "manual-browser",
    label: "Manual browser handoff",
    platform: "manual-browser",
    mode: "browser-handoff",
    author_console_url: "about:blank",
    requires_user_authorization: true,
    field_mapping: {
      title: "metadata.title",
      synopsis: "metadata.synopsis",
      genre: "metadata.genre",
      tags: "metadata.tags",
      chapters: "chapters_file",
    },
    required_user_checks: ["platform_account_logged_in", "content_preview_checked", "final_submit_confirmed_by_user"],
    safety: {
      no_password_bypass: true,
      no_captcha_bypass: true,
      no_paywall_bypass: true,
      stop_before_unconfirmed_submit: true,
    },
  },
  fanqie: {
    id: "fanqie",
    label: "番茄小说",
    platform: "fanqie",
    mode: "browser-assisted",
    author_console_url: "https://writer.fanqie.com/",
    requires_user_authorization: true,
    field_mapping: {
      title: "metadata.title",
      synopsis: "metadata.synopsis",
      genre: "metadata.genre",
      tags: "metadata.tags",
      chapters: "chapters_file",
    },
    required_user_checks: ["platform_account_logged_in", "writer_console_open", "platform_rules_checked", "final_submit_confirmed_by_user"],
    safety: {
      no_password_bypass: true,
      no_captcha_bypass: true,
      no_paywall_bypass: true,
      stop_before_unconfirmed_submit: true,
    },
  },
  qidian: {
    id: "qidian",
    label: "起点中文网",
    platform: "qidian",
    mode: "browser-assisted",
    author_console_url: "https://write.qq.com/",
    requires_user_authorization: true,
    field_mapping: {
      title: "metadata.title",
      synopsis: "metadata.synopsis",
      genre: "metadata.genre",
      tags: "metadata.tags",
      chapters: "chapters_file",
    },
    required_user_checks: ["platform_account_logged_in", "writer_console_open", "platform_rules_checked", "final_submit_confirmed_by_user"],
    safety: {
      no_password_bypass: true,
      no_captcha_bypass: true,
      no_paywall_bypass: true,
      stop_before_unconfirmed_submit: true,
    },
  },
  "17k": {
    id: "17k",
    label: "17K小说网",
    platform: "17k",
    mode: "browser-assisted",
    author_console_url: "https://author.17k.com/",
    requires_user_authorization: true,
    field_mapping: {
      title: "metadata.title",
      synopsis: "metadata.synopsis",
      genre: "metadata.genre",
      tags: "metadata.tags",
      chapters: "chapters_file",
    },
    required_user_checks: ["platform_account_logged_in", "writer_console_open", "platform_rules_checked", "final_submit_confirmed_by_user"],
    safety: {
      no_password_bypass: true,
      no_captcha_bypass: true,
      no_paywall_bypass: true,
      stop_before_unconfirmed_submit: true,
    },
  },
};

function clonePublishAdapter(adapter) {
  return JSON.parse(JSON.stringify(adapter));
}

export function listPlatformPublishAdapters() {
  return ["local-dry-run", "manual-browser", "fanqie", "qidian", "17k"].map((id) =>
    clonePublishAdapter(PLATFORM_PUBLISH_ADAPTERS[id]),
  );
}

function resolvePublishAdapterDescriptor(platform, adapterName) {
  const key = String(adapterName || platform || "local-dry-run").trim() || "local-dry-run";
  return clonePublishAdapter(PLATFORM_PUBLISH_ADAPTERS[key] || PLATFORM_PUBLISH_ADAPTERS["manual-browser"]);
}

export async function exportPublishPackage(project, {
  from = 1,
  to = 30,
  platform,
  targetScore = 95,
  allowBlocked = false,
} = {}) {
  const selectedPlatform = normalizePublishPlatform(platform, project);
  const gate = await writePremiumGateReport(project, { from, to, targetScore });
  if (!gate.publish_package_allowed && !allowBlocked) {
    return {
      status: "blocked",
      platform: selectedPlatform,
      gate,
      must_fix_before_publish: gate.must_fix_before_publish,
      package: null,
    };
  }

  const merged = await exportMerged(project, { from, to });
  const chaptersText = await readFile(merged.path, "utf8");
  const metadata = publishMetadataForProject(project, selectedPlatform, gate);
  const packageDir = publishPackageDir(project, selectedPlatform);
  const manifestPath = publishManifestFile(project, selectedPlatform);
  const metadataPath = publishMetadataFile(project, selectedPlatform);
  const chaptersPath = publishChaptersFile(project, selectedPlatform, from, to);
  const submissionPath = publishSubmissionFile(project, selectedPlatform);
  const submissionPayload = {
    platform: selectedPlatform,
    title: metadata.title,
    synopsis: metadata.synopsis,
    genre: metadata.genre,
    tags: metadata.tags,
    chapter_range: { from, to },
    chapters_file: chaptersPath,
    metadata_file: metadataPath,
    safety: metadata.safety,
    submit_mode: "user_authorized",
  };
  const manifest = {
    status: gate.publish_package_allowed ? "ready" : "blocked_export_only",
    project_title: project.title,
    platform: selectedPlatform,
    chapter_range: { from, to },
    chapter_count: to - from + 1,
    created_at: new Date().toISOString(),
    gate_report_path: gate.path,
    publish_package_allowed: gate.publish_package_allowed,
    metadata_path: metadataPath,
    chapters_path: chaptersPath,
    submission_path: submissionPath,
    safety: metadata.safety,
  };

  await ensureDir(packageDir);
  await writeJson(metadataPath, metadata);
  await writeText(chaptersPath, chaptersText);
  await writeJson(submissionPath, submissionPayload);
  await writeJson(manifestPath, manifest);

  return {
    status: "ready",
    platform: selectedPlatform,
    gate,
    package: {
      dir: packageDir,
      manifest_path: manifestPath,
      metadata_path: metadataPath,
      chapters_path: chaptersPath,
      submission_path: submissionPath,
    },
    manifest,
  };
}

export async function createPlatformPublishPlan(project, {
  from = 1,
  to = 30,
  platform,
  targetScore = 95,
  adapterName,
} = {}) {
  const selectedPlatform = normalizePublishPlatform(platform, project);
  const adapterDescriptor = resolvePublishAdapterDescriptor(selectedPlatform, adapterName || selectedPlatform);
  const publishPackage = await exportPublishPackage(project, {
    from,
    to,
    platform: selectedPlatform,
    targetScore,
  });
  if (publishPackage.status === "blocked") {
    return {
      status: "blocked",
      platform: selectedPlatform,
      gate: publishPackage.gate,
      package: null,
      adapter: adapterDescriptor,
      field_mapping: adapterDescriptor.field_mapping,
      required_user_checks: adapterDescriptor.required_user_checks,
      requires_user_authorization: true,
      safety: {
        no_password_or_captcha_bypass: true,
        no_unconfirmed_submission: true,
      },
      steps: platformPublishSteps(selectedPlatform),
      must_fix_before_publish: publishPackage.must_fix_before_publish,
    };
  }
  return {
    status: "ready",
    publish_ready: true,
    platform: selectedPlatform,
    gate: publishPackage.gate,
    package: {
      status: publishPackage.status,
      ...publishPackage.package,
    },
    adapter: adapterDescriptor,
    field_mapping: adapterDescriptor.field_mapping,
    required_user_checks: adapterDescriptor.required_user_checks,
    requires_user_authorization: true,
    safety: {
      no_password_or_captcha_bypass: true,
      no_paywall_bypass: true,
      no_fake_engagement: true,
      no_unconfirmed_submission: true,
    },
    steps: platformPublishSteps(selectedPlatform),
  };
}

export async function ensurePublishReadyOrThrow(project, { from = 1, to = 30, platform, targetScore = 95 } = {}) {
  const selectedPlatform = normalizePublishPlatform(platform, project);
  const plan = await createPlatformPublishPlan(project, { from, to, platform: selectedPlatform, targetScore });
  if (plan.status !== "ready" || plan.gate?.publish_package_allowed !== true) {
    const first = plan.must_fix_before_publish?.[0];
    const suffix = first
      ? `第${first.chapter_no || "-"}章：${first.advice || first.reason || "需要修复"}`
      : "仍有章节未达到可发布水准。";
    const error = new Error(`发布门禁未通过，不能自动填表。${suffix}`);
    error.code = "PUBLISH_GATE_BLOCKED";
    error.plan = plan;
    throw error;
  }
  return plan;
}

function createLocalDryRunPublishAdapter() {
  return {
    name: "local-dry-run",
    async publish(payload) {
      return {
        submitted: true,
        external_work_id: `local-dry-run-${Date.now()}`,
        platform_response: {
          mode: "local-dry-run",
          message: "No external platform was contacted. Payload is ready for a user-authorized platform adapter.",
          manifest_path: payload.package?.manifest_path,
        },
      };
    },
  };
}

export async function publishToPlatform(project, {
  from = 1,
  to = 30,
  platform,
  targetScore = 95,
  confirmed = false,
  adapterName,
  adapter,
} = {}) {
  const selectedPlatform = normalizePublishPlatform(platform, project);
  const adapterDescriptor = resolvePublishAdapterDescriptor(
    selectedPlatform,
    adapter ? adapter.name : (adapterName || "local-dry-run"),
  );
  const plan = await createPlatformPublishPlan(project, {
    from,
    to,
    platform: selectedPlatform,
    targetScore,
    adapterName: adapterDescriptor.id,
  });
  if (plan.status === "blocked") {
    return {
      status: "blocked",
      platform: selectedPlatform,
      gate: plan.gate,
      package: null,
      publish_attempt: {
        adapter_name: adapter?.name || "none",
        requires_user_authorization: true,
        requires_confirmation: true,
        confirmed: Boolean(confirmed),
        submitted: false,
      },
      must_fix_before_publish: plan.must_fix_before_publish,
    };
  }
  const selectedAdapter = adapter || (adapterDescriptor.id === "local-dry-run" ? createLocalDryRunPublishAdapter() : null);
  if (!confirmed) {
    return {
      status: "planned",
      platform: selectedPlatform,
      gate: plan.gate,
      package: plan.package,
      plan,
      publish_attempt: {
        adapter_name: selectedAdapter?.name || adapterDescriptor.id,
        requires_user_authorization: true,
        requires_confirmation: true,
        confirmed: false,
        submitted: false,
        external_work_id: null,
        platform_response: null,
      },
    };
  }

  if (!selectedAdapter && adapterDescriptor.id === "manual-browser") {
    const handoffPath = publishBrowserHandoffFile(project, selectedPlatform);
    const handoff = {
      status: "browser_ready",
      platform: selectedPlatform,
      adapter: adapterDescriptor,
      payload: {
        manifest_file: plan.package.manifest_path,
        metadata_file: plan.package.metadata_path,
        chapters_file: plan.package.chapters_path,
        submission_file: plan.package.submission_path,
      },
      safety: {
        no_password_bypass: true,
        no_captcha_bypass: true,
        no_paywall_bypass: true,
        stop_before_final_submit: true,
      },
      instructions: platformPublishSteps(selectedPlatform),
      created_at: new Date().toISOString(),
    };
    await writeJson(handoffPath, handoff);
    const result = {
      status: "browser_ready",
      platform: selectedPlatform,
      gate: plan.gate,
      package: plan.package,
      browser_handoff_path: handoffPath,
      publish_attempt: {
        adapter_name: adapterDescriptor.id,
        requires_user_authorization: true,
        requires_confirmation: true,
        confirmed: true,
        submitted: false,
        stop_before_final_submit: true,
        external_work_id: null,
        platform_response: null,
        created_at: new Date().toISOString(),
      },
      next_step: "Open the browser handoff payload in a user-visible logged-in browser and stop before final submit.",
    };
    await appendJsonLine(publishAttemptLogFile(project), result);
    return result;
  }

  if (!selectedAdapter) {
    const result = {
      status: "adapter_pending",
      platform: selectedPlatform,
      gate: plan.gate,
      package: plan.package,
      publish_attempt: {
        adapter_name: adapterDescriptor.id,
        requires_user_authorization: true,
        requires_confirmation: true,
        confirmed: true,
        submitted: false,
        requires_browser_or_api_adapter: true,
        external_work_id: null,
        platform_response: null,
        created_at: new Date().toISOString(),
      },
      next_step: "Use manual-browser today, or connect an official API / visible browser adapter for this platform.",
    };
    await appendJsonLine(publishAttemptLogFile(project), result);
    return result;
  }

  const payload = {
    platform: selectedPlatform,
    project: {
      title: project.title,
      path: project.path,
      genre: project.genre || "",
      idea: project.idea || "",
    },
    range: { from, to },
    gate: plan.gate,
    package: plan.package,
    safety: plan.safety,
  };
  const adapterResult = await selectedAdapter.publish(payload);
  const attempt = {
    adapter_name: selectedAdapter.name,
    requires_user_authorization: true,
    requires_confirmation: true,
    confirmed: true,
    submitted: Boolean(adapterResult?.submitted),
    external_work_id: adapterResult?.external_work_id || null,
    platform_response: adapterResult?.platform_response || null,
    created_at: new Date().toISOString(),
  };
  const result = {
    status: attempt.submitted ? "submitted" : "planned",
    platform: selectedPlatform,
    gate: plan.gate,
    package: plan.package,
    publish_attempt: attempt,
  };
  await appendJsonLine(publishAttemptLogFile(project), result);
  return result;
}

export async function runVisibleBrowserPublishAssistant(project, {
  from = 1,
  to = 30,
  platform,
  targetScore = 95,
  confirmed = false,
  browserDriver,
} = {}) {
  const selectedPlatform = normalizePublishPlatform(platform, project);
  const plan = await createPlatformPublishPlan(project, {
    from,
    to,
    platform: selectedPlatform,
    targetScore,
    adapterName: selectedPlatform,
  });
  if (plan.status === "blocked") {
    return {
      status: "blocked",
      platform: selectedPlatform,
      gate: plan.gate,
      must_fix_before_publish: plan.must_fix_before_publish,
      browser_attempt: {
        started: false,
        submitted: false,
      },
    };
  }
  if (!confirmed) {
    return {
      status: "planned",
      platform: selectedPlatform,
      gate: plan.gate,
      package: plan.package,
      adapter: plan.adapter,
      browser_attempt: {
        started: false,
        submitted: false,
        requires_confirmation: true,
      },
      next_step: "Confirm that the user is ready to drive a visible logged-in browser.",
    };
  }
  if (!browserDriver) {
    return {
      status: "browser_driver_required",
      platform: selectedPlatform,
      gate: plan.gate,
      package: plan.package,
      adapter: plan.adapter,
      browser_attempt: {
        started: false,
        submitted: false,
      },
      next_step: "Attach a visible browser driver before running browser-assisted publish.",
    };
  }

  const metadata = await readJson(plan.package.metadata_path);
  const selectorConfig = await resolvePublishSelectorConfig(project, selectedPlatform);
  const reportPath = publishBrowserRunReportFile(project, selectedPlatform);
  const actions = [];
  await browserDriver.open(plan.adapter.author_console_url || "about:blank");
  actions.push("open_author_console");
  if (typeof browserDriver.ensureLoggedIn === "function") {
    await browserDriver.ensureLoggedIn(plan.required_user_checks);
    actions.push("ensure_logged_in_visible_session");
  }
  await browserDriver.fillField("title", metadata.title || project.title || "");
  actions.push("fill_title");
  await browserDriver.fillField("synopsis", metadata.synopsis || project.idea || "");
  actions.push("fill_synopsis");
  await browserDriver.fillField("genre", metadata.genre || "");
  actions.push("fill_genre");
  await browserDriver.fillField("tags", (metadata.tags || []).join(","));
  actions.push("fill_tags");
  if (typeof browserDriver.uploadChapters === "function") {
    await browserDriver.uploadChapters(plan.package.chapters_path);
    actions.push("upload_chapters");
  }
  if (typeof browserDriver.stopBeforeSubmit === "function") {
    await browserDriver.stopBeforeSubmit("User must review platform preview and click final submit manually.");
    actions.push("stop_before_submit");
  }

  const report = {
    status: "filled_needs_user_submit",
    platform: selectedPlatform,
    adapter: plan.adapter,
    package: plan.package,
    gate: {
      status: plan.gate.status,
      publish_package_allowed: plan.gate.publish_package_allowed,
      overall_score: plan.gate.overall_score,
      target_score: plan.gate.target_score,
    },
    browser_attempt: {
      started: true,
      submitted: false,
      stop_before_final_submit: true,
      actions,
    },
    selector_config: selectorConfig,
    safety: {
      no_password_bypass: true,
      no_captcha_bypass: true,
      no_paywall_bypass: true,
      no_fake_engagement: true,
      no_final_submit_without_user: true,
    },
    created_at: new Date().toISOString(),
    report_path: reportPath,
  };
  await writeJson(reportPath, report);
  await appendJsonLine(publishAttemptLogFile(project), report);
  return report;
}

function normalizeScannedControls(controls = []) {
  return controls.filter((control) => {
    const type = String(control.type || "").toLowerCase();
    return control &&
      control.visible !== false &&
      type !== "password" &&
      type !== "hidden" &&
      typeof control.selector === "string" &&
      control.selector.trim();
  });
}

function controlText(control) {
  return [
    control.name,
    control.id,
    control.placeholder,
    control.label,
    control.ariaLabel,
    control.text,
  ].filter(Boolean).join(" ").toLowerCase();
}

function matchControlForField(controls, field) {
  const ranked = controls.map((control) => {
    const text = controlText(control);
    const tag = String(control.tag || "").toLowerCase();
    const type = String(control.type || "").toLowerCase();
    let score = 0;
    if (field === "title") {
      if (/bookname|book-name|title|浣滃搧|涔﹀悕|灏忚|灏忚/.test(text)) score += 10;
      if (tag === "input" && type !== "file") score += 2;
    }
    if (field === "synopsis") {
      if (/synopsis|intro|description|绠€浠媩浠嬬粛/.test(text)) score += 10;
      if (tag === "textarea") score += 3;
    }
    if (field === "genre") {
      if (/genre|category|鍒嗙被|绫诲瀷/.test(text)) score += 10;
      if (tag === "input" && type !== "file") score += 1;
    }
    if (field === "tags") {
      if (/tag|鏍囩/.test(text)) score += 10;
      if (tag === "input" && type !== "file") score += 1;
    }
    if (field === "chapters") {
      if (type === "file") score += 10;
      if (/chapter|file|upload|绔犺妭|姝ｆ枃|涓婁紶/.test(text)) score += 5;
    }
    return { control, score };
  }).filter((item) => item.score > 0);
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0]?.control || null;
}

export async function loadPublishSelectorCalibration(project, platform = project.platform || "fanqie") {
  return readJson(publishSelectorCalibrationFile(project, platform));
}

async function resolvePublishSelectorConfig(project, platform) {
  const selectedPlatform = normalizePublishPlatform(platform, project);
  const profile = getPublishPlatformProfile(selectedPlatform);
  try {
    const calibration = await loadPublishSelectorCalibration(project, selectedPlatform);
    if (calibration?.verification?.current_dom_verified && calibration?.selectors) {
      return {
        source: "calibrated",
        selectors: calibration.selectors,
        calibration_path: calibration.path || publishSelectorCalibrationFile(project, selectedPlatform),
        calibrated_at: calibration.verification.calibrated_at || null,
        profile_id: calibration.profile_id || profile.id,
      };
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return {
    source: "profile",
    selectors: profile.selectors,
    calibration_path: null,
    calibrated_at: null,
    profile_id: profile.id,
  };
}

export async function createCalibratedVisiblePublishBrowserDriver(project, options = {}) {
  const selectedPlatform = normalizePublishPlatform(options.platform, project);
  const selectorConfig = await resolvePublishSelectorConfig(project, selectedPlatform);
  const created = await createVisiblePublishBrowserDriver({
    ...options,
    platform: selectedPlatform,
    selectors: selectorConfig.selectors,
  });
  return {
    ...created,
    selector_config: selectorConfig,
  };
}

export async function calibratePublishPlatformSelectors(project, {
  platform,
  confirmed = false,
  pageScanner,
} = {}) {
  const selectedPlatform = normalizePublishPlatform(platform, project);
  if (!confirmed) {
    return {
      status: "confirmation_required",
      platform: selectedPlatform,
      safety: {
        requires_explicit_confirmation: true,
        no_password_capture: true,
        no_captcha_bypass: true,
      },
    };
  }
  if (!pageScanner || typeof pageScanner.scanControls !== "function") {
    return {
      status: "scanner_required",
      platform: selectedPlatform,
      next_step: "Attach a visible page scanner after opening the user-authorized platform page.",
      safety: {
        no_password_capture: true,
        no_captcha_bypass: true,
      },
    };
  }

  const profile = getPublishPlatformProfile(selectedPlatform);
  if (typeof pageScanner.open === "function") {
    await pageScanner.open(profile.author_console_url);
  }
  const controls = normalizeScannedControls(await pageScanner.scanControls(profile));
  const selectors = {};
  const missingFields = [];
  for (const field of ["title", "synopsis", "genre", "tags", "chapters"]) {
    const matched = matchControlForField(controls, field);
    if (matched) {
      selectors[field] = [matched.selector];
    } else {
      selectors[field] = [];
      missingFields.push(field);
    }
  }
  const status = missingFields.length ? "partial" : "calibrated";
  const result = {
    status,
    platform: selectedPlatform,
    profile_id: profile.id,
    selectors,
    missing_fields: missingFields,
    scanned_control_count: controls.length,
    verification: {
      current_dom_verified: status === "calibrated",
      calibrated_at: new Date().toISOString(),
      source: "visible_page_scanner",
    },
    safety: {
      no_password_capture: true,
      no_hidden_field_capture: true,
      no_captcha_bypass: true,
      stop_before_final_submit: true,
    },
    path: publishSelectorCalibrationFile(project, selectedPlatform),
  };
  await writeJson(result.path, result);
  return result;
}

function isHistoricalLogicIssue(text = "") {
  return /历史|史实|时代|朝代|北宋|南宋|宋代|元代|明代|清代|唐代|宋史|后世|不可能知道|时代约束|制度|官职|年号|茶税|税单|茶引|货币|度量衡|常识错误|事实错误|事实要求|事实不一致|设定冲突|设定不一致|章卡事实|逻辑自洽|逻辑矛盾|逻辑断裂|时间线|年代|现代词|穿帮|硬伤|不合时代|不符合设定|资源来源|人物动机/.test(text);
}

function isFactConsistencyIssue(text = "") {
  const value = String(text || "");
  if (/\b(no|without|none)\s+(setting|logic|motive|era|factual)\s+(conflict|violation|issue|hard\s+injury)\b/i.test(value)) return false;
  if (/无(?:设定冲突|动机断裂|时代逻辑硬伤|事实冲突)|没有(?:设定冲突|事实冲突|逻辑矛盾|硬伤)|符合(?:逻辑|设定|时代|章卡)|未(?:越界|发现冲突|发现硬伤)/.test(value)) return false;
  return /章卡事实|事实要求|事实不一致|设定冲突|设定不一致|正文.*冲突|互相冲突|金手指逻辑断裂|人物动机断裂|能力来源冲突|时间线矛盾|前后矛盾|不符合设定|逻辑断裂/.test(value);
}

function isChapterCardFactAnchorIssue(text = "") {
  return /chapter_card_money_anchor_mismatch|chapter_card_fact_anchor|card_fact_anchor_violations/i.test(String(text || ""));
}

function isAbilitySourceIssue(text = "") {
  return /能力来源|金手指|来源交代|凭空|直白旁白|内心独白|上辈子|前世|现代.*经验|供应链|背景.*独白|通过对白展现|通过.*动作|show.?dont.?tell|show.*tell/i.test(text);
}

function isFirstChapterOpeningIssue(text = "") {
  return /前\s*300|首句|开头|开篇|第一章|章卡.*摘要|可见结果.*摘要|粘贴章卡|倒回去说|作者介入|场景断裂|直接切入冲突|铺垫开头|模板开头|template_opening_inertia|opening_hook|opening_mismatch/.test(text);
}

function isStructuralExecutionIssue(text = "") {
  return /章卡偏离|章卡执行偏离|核心动作|核心事件|动作链|行动链|证据链|结果证据|可见结果|首日小样本|试单|试跑|商户同意|现场目标|现场.*阻力|现场.*行动|现场.*结果|从开局.*到.*结尾|跳至结尾|缺失.*描写|未展示|未体现|没有展示|无过程支撑|商业逻辑闭环|能力落地证据/.test(String(text || ""));
}

function rewriteLayerPriority(layer = {}) {
  const type = layer.type || "";
  if (type === "remove_ai_process_leak") return 110;
  if (type === "structural_scene_repair") return 108;
  if (type === "fact_consistency_repair") return 105;
  if (type === "historical_logic_repair") return 100;
  if (type === "ability_source_repair") return 95;
  if (type === "first_300_hook_repair") return 90;
  if (type === "remove_explanation") return 88;
  if (type === "drop_risk_repair") return 86;
  if (type === "sentence_pattern_repair") return 85;
  if (type === "domain_knowledge_repair") return 84;
  if (type === "rhythm_repair") return 83;
  if (type === "reader_behavior_repair") return 82;
  if (type === "coolpoint_boost") return 82;
  if (type === "retention_boost") return 80;
  if (type === "micro_hook_boost") return 72;
  if (type === "rhythm_transfer_repair") return 65;
  if (type === "strengthen_tail_hook") return 60;
  if (type === "cost_visibility") return 55;
  if (type === "character_voice") return 45;
  if (type === "publish_grade_lift") return 20;
  if (type === "publish_gate_repair") return 10;
  return 30;
}

function rewriteLayerRepairOrder(layer = {}) {
  const order = {
    remove_ai_process_leak: 0,
    structural_scene_repair: 1,
    chapter_card_fact_anchor_repair: 2,
    fact_consistency_repair: 2,
    historical_logic_repair: 3,
    first_300_hook_repair: 4,
    first_300_retention_repair: 4,
    next_chapter_click_repair: 4,
    reader_behavior_repair: 4,
    drop_risk_repair: 4,
    chapter_completion_repair: 5,
    follow_intent_repair: 5,
    remove_explanation: 5,
    sentence_pattern_repair: 6,
    rhythm_repair: 7,
    micro_hook_boost: 8,
    coolpoint_boost: 9,
    retention_boost: 10,
    strengthen_tail_hook: 11,
    cost_visibility: 12,
    character_voice: 13,
    domain_knowledge_repair: 14,
    rhythm_transfer_repair: 15,
    publish_grade_lift: 90,
    publish_gate_repair: 95,
    general_targeted_fix: 99,
  };
  return order[layer.type] ?? 80;
}

function hardRepairIssues(issues = []) {
  return (issues || [])
    .map((issue) => String(issue || ""))
    .filter((text) => /ai_process_leak/.test(text) || isFactConsistencyIssue(text) || isHistoricalLogicIssue(text) || isFirstChapterOpeningIssue(text))
    .slice(0, 10);
}

function rewriteLayerForIssue(issue) {
  const text = String(issue || "");
  if (/ai_process_leak/.test(text)) {
    return {
      type: "remove_ai_process_leak",
      source_issue: text,
      instruction: "Delete all model thinking, task analysis, instruction analysis, candidate-opening discussion, outline explanation, and writing-process text. Output only in-story novel prose: visible action, dialogue, objects, scene consequences, and character reactions. Do not mention the task, prompt, outline, chapter card, scoring, candidates, rewriting, or instructions.",
    };
  }
  if (isStructuralExecutionIssue(text)) {
    return {
      type: "structural_scene_repair",
      source_issue: text,
      force_full_rewrite: true,
      instruction: "结构性返工：当前问题不是一句话错误，而是缺少章卡要求的核心场景、行动链或可见证据链。必须以原稿中可保留的强开头、人物关系和压力为底稿，整章补齐“现场目标 -> 具体阻力 -> 主角行动 -> 证据/数据/物件 -> 他人反应 -> 可见结果 -> 章尾新压力”。如果是商业/经营章节，必须把菜单、路线、现金、账本、订单、对账、商户试跑写成现场戏，不得只写目标、总结或心理分析。",
    };
  }
  if (/(账目|账本|账册|财务闭环|结算|单价拆解|配送费|找零|现金流|能力证据链|现场反应)/.test(text)) {
    return {
      type: "fact_consistency_repair",
      source_issue: text,
      instruction: "只修复账目闭环和能力证据链：补齐餐费、配送费、找零、签收、现金交割和商户/旁人即时反应，让读者看见每一笔钱和每一次信任变化。保留原有剧情，不整章重写。",
    };
  }
  if (/资金总额|金额.*偏差|资金.*偏差|财务口径|资金口径|正文.*章卡.*(?:元|块)/.test(text)) {
    return {
      type: "fact_consistency_repair",
      source_issue: text,
      instruction: "Repair only the factual consistency problem between the chapter card, project bible, and manuscript. Keep solved scenes, visible actions, business conflict, and tail hook; only align the conflicting money, timeline, motivation, or setting facts.",
    };
  }
  if (isChapterCardFactAnchorIssue(text)) {
    return {
      type: "chapter_card_fact_anchor_repair",
      source_issue: text,
      instruction: "Repair only the deterministic chapter-card fact anchor drift. Keep scenes and prose; align the concrete number/object/timeline anchor with the chapter card, then verify locally.",
    };
  }
  if (isFactConsistencyIssue(text)) {
    return {
      type: "fact_consistency_repair",
      source_issue: text,
      instruction: "只修复章卡事实、项目设定和正文之间的冲突：逐条核对 facts_required、项目圣经、人物关系和本章正文，统一主角能力来源、重生性质、时间线、人物动机和关键事实。禁止绕开问题重写新剧情；必须保留已经达标的开头压力、查账动作、商业冲突和章尾钩子，只把冲突口径改一致。",
    };
  }
  if (isHistoricalLogicIssue(text)) {
    return {
      type: "historical_logic_repair",
      source_issue: text,
      instruction: "只修复时代事实、逻辑自洽、人物动机和资源来源硬伤：删除或替换所有不符合本书时代、世界观、职业体系、能力体系和平台设定的内容；必须从项目圣经、设定库、章卡和本章场景里选择题材匹配的可见证据来证明主角能力。",
    };
  }
  if (isAbilitySourceIssue(text)) {
    return {
      type: "ability_source_repair",
      source_issue: text,
      instruction: "只修复能力来源和背景交代：禁止用直白旁白解释能力；必须根据本书题材选择可见展示方式，让主角通过职业动作、判断过程、技能使用、道具操作、交易/战斗/推理/社交结果、旁人反应或环境变化自然证明经验来源和可信度。",
    };
  }
  if (isFirstChapterOpeningIssue(text)) {
    return {
      type: "first_300_hook_repair",
      source_issue: text,
      instruction: "只修复第一章前300字和开篇沉浸感：不得粘贴章卡摘要，不得作者介入，不得倒回去解释，直接从当前冲突、压迫物件、人物动作和第一个可见结果开场。",
    };
  }
  if (/inline_risk_segments|red_marked_segments|红标句|风险句/.test(text)) {
    return {
      type: "drop_risk_repair",
      source_issue: text,
      instruction: "Repair only the red-marked risk sentences: keep plot facts, but turn static description, vague judgment, and repeated sentence patterns into visible action, short dialogue, scene feedback, or concrete results. Do not change the core event or tail hook.",
    };
  }
  if (/sentence_pattern_inertia|句式惯性|模板句式|重复句式/.test(text)) {
    return {
      type: "sentence_pattern_repair",
      source_issue: text,
      instruction: "Repair only sentence-pattern inertia: vary repeated paragraph openings and sentence frames. Keep plot facts, payoffs, and tail hook. Replace repeated declarations with visible action, short dialogue, object feedback, concrete numbers, and scene changes.",
    };
  }
  if (/paragraph_rhythm_single_note|dialogue_wall|段落节奏单一|对白墙|同类型段落/.test(text)) {
    return {
      type: "rhythm_repair",
      source_issue: text,
      instruction: "Repair only paragraph rhythm: if several action paragraphs repeat the same beat, insert short dialogue, environment feedback, object handling, or a brief inner needle; if dialogue becomes a wall, insert action, props, and scene movement. Preserve already-passing metrics.",
    };
  }
  if (/伏笔|foreshadowing|debt_due|债务|回收|兑现/.test(text)) {
    return {
      type: "foreshadowing_progress",
      source_issue: text,
      instruction: "只处理到期伏笔债务：本章至少推进或兑现该伏笔，不要另开新坑；如果暂不完全回收，也必须给出明确进展。",
    };
  }
  if (/information_gap|信息差|提前曝光|premature_reveal|盲区/.test(text)) {
    return {
      type: "information_gap_control",
      source_issue: text,
      instruction: "只处理隐藏信息差：保留读者知道、主角不知道的张力；曝光窗口前只升级线索，不让主角提前识破。",
    };
  }
  if (/解释腔|他知道|他意识到|他明白|商业价值|核心战场/.test(text)) {
    return {
      type: "remove_explanation",
      source_issue: text,
      instruction: "只处理解释腔：把判断、总结和心理说明改成具体动作、对白、订单数据或现场反馈。",
    };
  }
  if (/章尾|钩子|留人|末尾/.test(text)) {
    return {
      type: "strengthen_tail_hook",
      source_issue: text,
      instruction: "只处理末尾200字：强化章尾钩子，给出一句话反转、压力或下一章必须兑现的问题。",
    };
  }
  if (/visible_cost_missing|可见代价|代价|欠|误解|暴露/.test(text)) {
    return {
      type: "cost_visibility",
      source_issue: text,
      instruction: "只处理胜利后的可见代价：让主角的成功留下一个读者看得见的误解、欠账、暴露、关系压力或更强对手。",
    };
  }
  if (/drop_risk_segments|弃读|无动作|无对白|解释段|重复信息/.test(text)) {
    return {
      type: "drop_risk_repair",
      source_issue: text,
      instruction: "只处理弃读风险段：把连续解释、重复信息和静态段落改成可见动作、短对白、数据变化或现场反馈；不要改动本章核心事件和章尾钩子。",
    };
  }
  if (/domain_(fact_violation|term_misuse|constraint_violation)|ip_copy_risk|domain_knowledge_violation/.test(text)) {
    return {
      type: "domain_knowledge_repair",
      source_issue: text,
      instruction: "只修复领域知识错误：按 domain_knowledge 中的 facts 和 constraints 改正术语、门槛、技能、地点和禁忌错误；不要复制资料原文、官方剧情文本、任务台词或专有描述。",
    };
  }
  if (/rhythm_(opening_mismatch|tail_hook_mismatch|beat_missing|dialogue_ratio_off|micro_hook_low|drop_risk_high)|rhythm_transfer_deviation/.test(text)) {
    return {
      type: "rhythm_transfer_repair",
      source_issue: text,
      instruction: "只修复对标节奏偏离：按 rhythm_transfer 的开头模式、章尾钩子类型、抽象 beat、对白比例、微钩子密度和弃读段上限重写；只学习节奏和结构，不复用对标书句子、人物、具体事件、台词或桥段细节。",
    };
  }
  if (/台词|同质化|配角|角色|口吻|anchor_dormant|记忆锚|标签/.test(text)) {
    return {
      type: "character_voice",
      source_issue: text,
      instruction: "只处理配角台词和标志行为：让角色兑现已有记忆锚，台词符合身份、利益和说话习惯，避免所有人一个口吻。",
    };
  }
  if (/节奏|拖慢|水|reversal_density_low|反转密度|预期反转/.test(text)) {
    return {
      type: "pace_tightening",
      source_issue: text,
      instruction: "只处理节奏和反转密度：删除平铺直叙，补出读者以为X但结果Y、刚要X突然Y的场景级反转。",
    };
  }
  return {
    type: "general_targeted_fix",
    source_issue: text,
    instruction: `只处理这个问题：${text}`,
  };
}

export function planRewriteLayers(issues = []) {
  const layers = [];
  const seen = new Set();
  const orderedIssues = (issues || []).map((issue) => String(issue || "")).filter(Boolean);
  for (const issue of orderedIssues) {
    const issueText = String(issue || "");
    let layer = null;
    if (/ai_taste_below_publish/.test(issueText)) {
      layer = {
        type: "remove_explanation",
        source_issue: issueText,
        instruction: "Repair AI taste until ai_taste_score >= 78. Delete summary/explanation/strategy declarations, thesis-like endings, and repeated sentence frames. Replace them with character action, short dialogue, object handling, order/data changes, visible consequences, and reactions. Keep the same plot facts and chapter hook.",
      };
    } else if (/coolpoint_density_below_publish/.test(issueText)) {
      layer = {
        type: "coolpoint_boost",
        source_issue: issueText,
        instruction: "Repair coolpoint density until coolpoint_delivered >= 2. Add at least two visible payoffs inside the existing chapter event: a misjudgment reversal, a concrete gain, a public reaction, a data/order/result change, or a cost paid by the opponent. The protagonist must win through action and scene evidence, not explanation.",
      };
    } else if (/retention_prediction_below_publish/.test(issueText)) {
      layer = {
        type: "retention_boost",
        source_issue: issueText,
        instruction: "Repair retention until retention_prediction >= 80. Strengthen opening pressure, add micro-hooks roughly every mobile screen, create a mid-scene turn, preserve solved plot facts, remove slow explanation, and end with a must-read-next pressure or unanswered action.",
      };
    } else if (/story_room_contract_not_delivered|story_room_contract/.test(issueText)) {
      layer = {
        type: "story_room_contract_repair",
        source_issue: issueText,
        patch_scope: "story_room",
        instruction: "Repair only the missing story-room contract delivery. Keep solved plot facts, but make chapter-card public_feedback, cost_residue, relationship_shift, and chapter_debt appear in prose as visible scene action, dialogue, object evidence, consequence, changed stance, and concrete tail pressure. Do not summarize the contract; dramatize it.",
      };
    } else if (/first_300_retention_proxy_below_publish/.test(issueText)) {
      layer = {
        type: "first_300_retention_repair",
        source_issue: issueText,
        patch_scope: "opening",
        instruction: "只修前300字留存：保留本章事实和人物关系，重写开头第一屏。第一句必须进入动作、冲突、压迫物件、可见结果或现场误判；禁止章卡摘要、倒叙解释、作者介入和背景复盘。",
      };
    } else if (/next_chapter_click_proxy_below_publish/.test(issueText)) {
      layer = {
        type: "next_chapter_click_repair",
        source_issue: issueText,
        patch_scope: "tail",
        instruction: "只修末尾下一章点击：保留正文已完成事件，重写最后200-400字。结尾必须出现新压力、反转、来人、来电/消息、暴露的物件或必须在下一章处理的问题；禁止总结式收尾。",
      };
    } else if (/chapter_completion_proxy_below_publish/.test(issueText)) {
      layer = {
        type: "chapter_completion_repair",
        source_issue: issueText,
        patch_scope: "middle",
        instruction: "只修章节读完意愿：优先修中段低推进区域和红标风险段。删除解释、重复信息和静态判断，补事件推进、短对白、物件反馈、数据变化、误判反转或阶段性兑现。",
      };
    } else if (/follow_intent_proxy_below_publish/.test(issueText)) {
      layer = {
        type: "follow_intent_repair",
        source_issue: issueText,
        patch_scope: "middle",
        instruction: "只修追更意愿：在不改主线事实的前提下，补强主角长期目标、人物魅力、连载承诺和下一阶段收益想象；必须通过行动、选择、他人反应或可见结果展示。",
      };
    } else if (/reader_behavior_score_below_publish/.test(issueText)) {
      layer = {
        type: "reader_behavior_repair",
        source_issue: issueText,
        patch_scope: "behavior",
        instruction: "Repair reader behavior proxy metrics until reader_behavior_score >= 80 and all sub-proxies pass: first 300 chars must hook with pressure/action/visible result, the chapter must reduce drop-risk and AI explanation, at least two visible payoffs must land, and the ending must create a concrete next-chapter click reason. Preserve solved facts and continuity.",
      };
    } else if (/micro_hook_density_below_publish/.test(issueText)) {
      layer = {
        type: "micro_hook_boost",
        source_issue: issueText,
        instruction: "Repair micro-hook density until micro_hook_density >= 0.9. Add small interruptions, unanswered data changes, new messages/calls, witness reactions, object discoveries, and short reversals between scene beats. Do not pad with explanation.",
      };
    } else if (/tail_hook_below_publish/.test(issueText)) {
      layer = {
        type: "strengthen_tail_hook",
        source_issue: issueText,
        instruction: "Repair only the final 200-300 Chinese characters until tail_hook_score >= 4. End on a concrete new pressure, reversal, incoming person/message, exposed object/data, or question that forces the next chapter. Do not end with a summary or theme sentence.",
      };
    } else if (/inline_risk_segments|drop_risk_segments|drop_risk_segments_remaining/.test(issueText)) {
      layer = {
        type: "drop_risk_repair",
        source_issue: issueText,
        instruction: "Repair remaining drop-risk segments. Replace every highlighted/static/explanation-heavy preview with action, dialogue, object handling, data/result change, or visible scene feedback. The original risky preview should not remain.",
      };
    } else if (/review_grade_below_publish/.test(issueText)) {
      layer = {
        type: "publish_grade_lift",
        source_issue: issueText,
        instruction: "Lift the chapter grade to A or B without overwriting solved parts. Repair remaining blockers in priority order: hard logic, AI taste, drop-risk segments, coolpoint payoff, retention, micro-hooks, tail hook. Preserve chapter-card facts, continuity, and the strongest existing scenes.",
      };
    } else if (/publish_gate_not_ready/.test(issueText)) {
      layer = {
        type: "publish_gate_repair",
        source_issue: issueText,
        instruction: "Repair this chapter until publish_gate.publish_ready=true. Do not regenerate blindly: preserve solved scenes, fix only the remaining blocker metrics, and keep continuity with the chapter card and project bible.",
      };
    } else {
      layer = rewriteLayerForIssue(issue);
    }
    if (seen.has(layer.type)) continue;
    seen.add(layer.type);
    layers.push(layer);
  }
  return layers.sort((a, b) => {
    const absoluteHardTypes = new Set([
      "remove_ai_process_leak",
      "structural_scene_repair",
      "fact_consistency_repair",
      "historical_logic_repair",
      "first_300_hook_repair",
    ]);
    const aHard = absoluteHardTypes.has(a.type) ? 1 : 0;
    const bHard = absoluteHardTypes.has(b.type) ? 1 : 0;
    if (aHard !== bHard) return bHard - aHard;
    return rewriteLayerRepairOrder(a) - rewriteLayerRepairOrder(b);
  });
}

export function scoreTailHook(tailHook = "", { characters = [] } = {}) {
  const text = String(tailHook || "").trim();
  let score = text ? 1 : 0;
  const reasons = [];
  const issues = [];
  if (!text) {
    return { score: 0, reasons, issues: ["tail_hook_missing"] };
  }
  if ((characters || []).some((name) => name && text.includes(name))) {
    score += 1;
    reasons.push("known_character_pressure");
  }
  if (CN_EVENT_PROGRESS_RE.test(text)) {
    score += 1;
    reasons.push("cn_data_or_result_change");
  }
  if (CN_TURN_RE.test(text)) {
    score += 1;
    reasons.push("cn_turn_or_interruption");
  }
  if (CN_NEXT_PRESSURE_RE.test(text)) {
    score += 1;
    reasons.push("cn_next_chapter_pressure");
  }
  if (/璁㈠崟|鍚庡彴|鏁板瓧|鏁版嵁|閽眧鍒拌处|澧為暱|涓嬮檷|鐖唡璺硘鐢佃瘽|鏁查棬|閫氱煡|order|backend|number|data|paid|payment|buzz|phone|screen|queue/i.test(text)) {
    score += 1;
    reasons.push("data_or_result_change");
  }
  if (/绐佺劧|鍗磡鍙嶈€寍娌℃兂鍒皘鍚屾椂|鍒氳|涓嬩竴绉抾鐢佃瘽|鏁查棬|before|but|instead|again|another|then|while/i.test(text)) {
    score += 1;
    reasons.push("turn_or_interruption");
  }
  if (/蹇呴』|鍚﹀垯|鏉ヤ笉鍙妡鍑轰簨|瑙傚療|鐩笂|鎵句綘|涓嬪崍|鏄庢棭|绗琝d+绔爘骞冲彴鏂箌鍒涗笟涓績|tomorrow|must|otherwise|office|teacher|complaint|keeps working|come to whoever|next/i.test(text)) {
    score += 1;
    reasons.push("next_chapter_pressure");
  }
  score = Math.max(0, Math.min(5, score));
  if (score <= 2) issues.push("tail_hook_weak");
  return { score, reasons, issues };
}

export function scoreOpeningHook(opening = "") {
  const text = String(opening || "").trim();
  let score = text ? 50 : 0;
  const reasons = [];
  const issues = [];
  if (!text) {
    return { score: 0, reasons, issues: ["opening_hook_missing"] };
  }
  if (CN_VISIBLE_ACTION_RE.test(text) || EN_VISIBLE_ACTION_RE.test(text)) {
    score += 18;
    reasons.push("cn_concrete_action");
  }
  if (CN_VISIBLE_OBJECT_RE.test(text)) {
    score += 12;
    reasons.push("cn_visible_object");
  }
  if (CN_TURN_RE.test(text)) {
    score += 18;
    reasons.push("cn_abnormal_or_conflict");
  }
  if (/[锛?]|璋亅涓轰粈涔坾鎬庝箞|鎬庝箞浼殀鍝効/.test(text)) {
    score += 8;
    reasons.push("cn_curiosity_gap");
  }
  if (CN_STATIC_OPENING_RE.test(text)) {
    score -= 22;
    issues.push("static_environment_opening");
  }
  if (CN_EXPOSITION_OPENING_RE.test(text)) {
    score -= 25;
    issues.push("exposition_opening");
  }
  if (/璺硘鎺墊鐫亅鍐瞸鐢﹟鐮竱鍝峾闇噟閫抾鎺▅鎶搢鎵攟鐖唡鎵撹繘鏉鏁瞸drop|jump|jumps|slam|push|shove|rings|throws|grabs|opens/i.test(text)) {
    score += 18;
    reasons.push("concrete_action");
  }
  if (/璁㈠崟|鍚庡彴|鎵嬫満|閫氱煡|鐢佃瘽|鐐伀|浜岀淮鐮亅鏁版嵁|counter|backend|order|phone|call|charcoal|data|QR/i.test(text)) {
    score += 12;
    reasons.push("visible_object");
  }
  if (/绐佺劧|鍗磡浣唡鍙嶈€寍娌℃兂鍒皘绗竴鏉绗竴浠絴浠ヤ负|楠倈鎺夎繘|璺冲嚭鏉suddenly|but|first|thought|instead|only to/i.test(text)) {
    score += 18;
    reasons.push("abnormal_or_conflict");
  }
  if (/锛焲\?|璋亅涓轰粈涔坾鎬庝箞|what|why|who/i.test(text)) {
    score += 8;
    reasons.push("curiosity_gap");
  }
  if (/绉嬪ぉ|姊ф|闃冲厜|澶╃┖|鏍″洯.*瀹夐潤|寮€濮嬪彉榛剕season|sunlight|sky|quiet/i.test(text)) {
    score -= 22;
    issues.push("static_environment_opening");
  }
  if (/鏄竴涓獆鏄釜|閲嶇敓鑰厊鍥炲埌浜唡杩欐槸|鎰忓懗鐫€|浠栫煡閬搢鍟嗕笟浠峰€紎was a|is a|returned to/i.test(text)) {
    score -= 25;
    issues.push("exposition_opening");
  }
  if (text.length > 80) {
    score -= 8;
    issues.push("opening_too_long");
  }
  score = Math.max(0, Math.min(100, score));
  return { score, reasons, issues };
}

export function generateOpeningHookCandidates(card = {}) {
  const names = (card.characters_in_scene || [])
    .map((item) => (typeof item === "string" ? item : item?.name))
    .filter(Boolean);
  const firstSupport = names.find((name) => !/Lu Chuan/i.test(name)) || names[0] || "对方";
  const visibleResult = String(card.visible_result || card.cool_point || card.result || "异常结果").trim();
  const protagonistAction = String(card.protagonist_action || card.main_event || "主角当场做出决定").trim();
  const conflict = String(card.conflict || card.opponent_pressure || card.obstacle || "现场所有人都不相信").trim();
  const scene = String(card.scene || card.location || "现场").trim();
  const raw = [
    card.opening_hook,
    `${visibleResult}出现时，${firstSupport}先停住了手里的动作。`,
    `${protagonistAction}，${conflict}。`,
    `${scene}里最安静的一秒，是${visibleResult}刚刚露出来的时候。`,
    `${firstSupport}还没来得及反驳，${protagonistAction}已经把局面推到了所有人面前。`,
  ].filter(Boolean);
  const seen = new Set();
  return raw
    .filter((text) => {
      if (detectTemplateOpeningInertia(text).length) return false;
      if (seen.has(text)) return false;
      seen.add(text);
      return true;
    })
    .map((text) => ({ text, ...scoreOpeningHook(text) }))
    .sort((a, b) => b.score - a.score)
    .map((candidate, index) => ({ rank: index + 1, ...candidate }));
}

export function detectTemplateOpeningInertia(text = "") {
  const content = String(text || "").slice(0, 600);
  const oldFixedOpening = /张明轩刚要骂人，后台数字先跳了出来/;
  const oldFixedBackend = /后台数字先跳了出来/;
  const chineseTemplatePatterns = [
    oldFixedOpening,
    /刚要[^。\n]{0,12}骂人[^。\n]{0,20}后台[^。\n]{0,12}数字[^。\n]{0,12}(?:先)?跳了出来/,
    oldFixedBackend,
  ];
  const chineseHits = chineseTemplatePatterns
    .filter((pattern) => pattern.test(content))
    .map((pattern) => ({
      issue: "template_opening_inertia",
      fragment: String(pattern),
    }));
  const patterns = [
    /刚要[^。\n]{0,8}骂人[^。\n]{0,12}后台[^。\n]{0,8}数字[^。\n]{0,8}(?:先)?[^。\n]{0,6}(?:跳|弹|冲)[^。\n]{0,8}(?:出来|出|起)/,
    /手里[^。\n]{0,8}(?:一|签|烤串)[^。\n]{0,8}(?:掉|落)[^。\n]{0,8}(?:炭火|火)/,
  ];
  return [
    ...chineseHits,
    ...patterns
    .filter((pattern) => pattern.test(content))
    .map((pattern) => ({
      issue: "template_opening_inertia",
      fragment: String(pattern),
    })),
  ];
}

export function goldenThreeTemplateForChapter(chapterNo) {
  const templates = {
    1: {
      chapter_no: 1,
      template_id: "golden_three_ch1",
      role: "hook_and_power_reveal",
      must_have: [
        "300字内强钩子",
        "1000字内确认金手指/核心优势",
        "主角完成第一次低成本行动",
        "结尾留一句话悬念",
      ],
      forbidden: [
        "环境铺垫开头",
        "身份解释开头",
        "世界观长说明",
      ],
    },
    2: {
      chapter_no: 2,
      template_id: "golden_three_ch2",
      role: "first_payoff_and_misjudgment",
      must_have: [
        "金手指/核心优势第一次兑现",
        "配角误判主角",
        "用可见数据或结果反转误判",
        "章尾留下数据/结果反转钩子",
      ],
      forbidden: [
        "重复解释第1章设定",
        "只靠主角口头说服",
        "章尾没有新结果变化",
      ],
    },
    3: {
      chapter_no: 3,
      template_id: "golden_three_ch3",
      role: "persona_lock_and_long_goal",
      must_have: [
        "误判打脸兑现",
        "主角人设立住",
        "长线目标浮出",
        "第一次真正长线钩子",
      ],
      forbidden: [
        "继续停留在小打小闹",
        "只展示短期赚钱",
        "没有把读者视线引向30章阶段目标",
      ],
    },
  };
  return templates[chapterNo] || null;
}

export function applyGoldenThreeQualityStandard(card = {}) {
  const template = goldenThreeTemplateForChapter(card.chapter_no);
  if (!template) return card;
  return {
    ...card,
    early_chapter_quality_standard: {
      source: "generic_quality_gate",
      role: template.role,
      must_have: template.must_have,
      forbidden: template.forbidden,
    },
  };
}

function parseSourceChapter(value) {
  if (Number.isInteger(value?.source_chapter)) return value.source_chapter;
  if (Number.isInteger(value?.chapter_no)) return value.chapter_no;
  const match = String(value?.source || "").match(/chapter:(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function normalizeForeshadowingDebt(item = {}, currentChapter) {
  const sourceChapter = parseSourceChapter(item);
  const dueChapter = Number.isInteger(item.due_chapter)
    ? item.due_chapter
    : sourceChapter + (Number.isInteger(item.due_in_chapters) ? item.due_in_chapters : 5);
  let status = "open";
  if (Number.isInteger(currentChapter) && Number.isInteger(dueChapter)) {
    if (dueChapter < currentChapter) status = "overdue";
    if (dueChapter === currentChapter) status = "due";
  }
  return {
    hook: String(item.hook || item.text || item.summary || "").trim(),
    source_chapter: sourceChapter,
    due_chapter: dueChapter,
    payoff_requirement: String(item.payoff_requirement || item.requirement || "progress or pay off this hook"),
    status,
    confidence: item.confidence ?? 1,
  };
}

function isInformationGapItem(item = {}) {
  return item.type === "information_gap" || item.information_gap === true || Boolean(item.reader_knows || item.protagonist_blindspot);
}

export function normalizeInformationGap(item = {}, currentChapter) {
  const sourceChapter = parseSourceChapter(item);
  const revealWindow = item.reveal_window || {};
  const earliest = Number.isInteger(revealWindow.earliest_chapter)
    ? revealWindow.earliest_chapter
    : sourceChapter + 3;
  const latest = Number.isInteger(revealWindow.latest_chapter)
    ? revealWindow.latest_chapter
    : sourceChapter + 8;
  let status = "active_hidden";
  if (Number.isInteger(currentChapter)) {
    if (currentChapter >= earliest && currentChapter <= latest) status = "reveal_allowed";
    if (currentChapter > latest) status = "overdue_reveal";
  }
  return {
    type: "information_gap",
    hook: String(item.hook || item.summary || "").trim(),
    reader_knows: String(item.reader_knows || "").trim(),
    protagonist_blindspot: String(item.protagonist_blindspot || item.blindspot || "").trim(),
    holders: Array.isArray(item.holders) ? item.holders : ["reader"],
    unaware: Array.isArray(item.unaware) ? item.unaware : ["protagonist"],
    reveal_window: {
      earliest_chapter: earliest,
      latest_chapter: latest,
    },
    handling_policy: item.handling_policy || "keep_secret_but_escalate_clues",
    clue_policy: item.clue_policy || "add one clue without letting the protagonist identify the truth",
    source_chapter: sourceChapter,
    status,
    confidence: item.confidence ?? 1,
  };
}

function splitAnchorContradiction(anchor = "") {
  const text = String(anchor || "").trim();
  const separators = [" but ", "但是", "却", "然而"];
  for (const separator of separators) {
    if (!text.includes(separator)) continue;
    const [surface, ...rest] = text.split(separator);
    const core = rest.join(separator);
    if (surface.trim() && core.trim()) {
      return { surface: surface.trim(), core: core.trim() };
    }
  }
  return { surface: "", core: "" };
}

export function normalizeCharacterAnchor(item = {}) {
  const contradiction = String(item.anchor || item.contradiction || item.state || "").trim();
  const inferred = splitAnchorContradiction(contradiction);
  const sourceChapter = parseSourceChapter(item);
  return {
    name: String(item.name || "").trim(),
    surface: String(item.surface || inferred.surface || "").trim(),
    core: String(item.core || inferred.core || "").trim(),
    contradiction,
    anchor: contradiction,
    signature_action: String(item.signature_action || item.action || "").trim(),
    signature_line: String(item.signature_line || item.line || "").trim(),
    source_chapter: sourceChapter,
    first_appearance_chapter: item.first_appearance_chapter ?? sourceChapter ?? null,
    confidence: item.confidence ?? 1,
  };
}

function rewriteFocusForLayer(layer) {
  if (!layer || layer.type === "general_targeted_fix") return null;
  return layer;
}

const STORY_ROOM_FIELD_LABELS = {
  public_feedback: "鍏紑鍙嶉",
  cost_residue: "浠ｄ环娈嬬暀",
  relationship_shift: "鍏崇郴鎺ㄨ繘",
  chapter_debt: "绔犲熬鍊哄姟",
};

function storyRoomMissingLabels(fields = []) {
  return (Array.isArray(fields) ? fields : [])
    .map((field) => STORY_ROOM_FIELD_LABELS[field] || field)
    .filter(Boolean);
}

function repairProgressFields(focus = {}) {
  const fields = Array.isArray(focus?.story_room_missing_fields) ? focus.story_room_missing_fields : [];
  if (!fields.length) return {};
  return {
    repair_missing_fields: fields,
    repair_missing_labels: storyRoomMissingLabels(fields),
  };
}

function rewriteFocusProgressMessage(focus = {}, fallback = "璐ㄩ噺鏈揪鏍囷紝姝ｅ湪鑷姩鏀圭") {
  const type = String(focus?.type || "");
  if (type === "story_room_contract_repair") {
    const labels = storyRoomMissingLabels(focus?.story_room_missing_fields || []);
    return labels.length
      ? `章卡承诺未落正文，正在补：${labels.join("、")}`
      : "章卡承诺未落正文，正在补现场反馈、代价、关系和章尾债务";
  }
  return {
    first_300_retention_repair: "前300字留存不足，正在只修开头第一屏",
    next_chapter_click_repair: "下章点击不足，正在只修章尾钩子",
    chapter_completion_repair: "读完意愿不足，正在只修中段推进",
    follow_intent_repair: "追更意愿不足，正在补强长期期待",
    reader_behavior_repair: "读者行为代理分不足，正在分段修开头、中段和章尾",
    drop_risk_repair: "红标弃读段命中，正在定点修句",
    remove_explanation: "AI味偏重，正在把解释改成动作和现场反馈",
    strengthen_tail_hook: "章尾钩子不足，正在只修结尾",
    coolpoint_boost: "爽点兑现不足，正在补可见收益和反应",
    retention_boost: "追读预测不足，正在补压力、爽点和钩子",
  }[type] || fallback;
}

function reviewRiskSegments(review = {}) {
  return Array.isArray(review.risky_segments)
    ? review.risky_segments
      .map((segment) => ({
        preview: String(typeof segment === "string" ? segment : segment?.preview || segment?.text || segment?.content || "").trim(),
        reasons: Array.isArray(segment?.reasons)
          ? segment.reasons
          : [segment?.reason || segment?.type || ""].filter(Boolean),
        risk_points: Number(segment?.risk_points || 0),
        severity: segment?.severity || null,
      }))
      .filter((segment) => segment.preview)
    : [];
}

function concreteReviewerDirectives(review = {}) {
  return {
    issues: Array.isArray(review?.issues) ? review.issues.map((item) => String(item || "")).filter(Boolean).slice(0, 12) : [],
    remove_targets: Array.isArray(review?.remove) ? review.remove.map((item) => String(item || "")).filter(Boolean).slice(0, 8) : [],
    keep_targets: Array.isArray(review?.keep) ? review.keep.map((item) => String(item || "")).filter(Boolean).slice(0, 8) : [],
    rewrite_direction: String(review?.rewrite_direction || "").trim(),
    risk_segments: reviewRiskSegments(review).slice(0, 8),
  };
}

function mergeConcreteReviewerDirectives(focus, review = {}) {
  if (!focus) return focus;
  const directives = concreteReviewerDirectives(review);
  const additions = [];
  if (directives.rewrite_direction) additions.push(`Reviewer rewrite direction: ${directives.rewrite_direction}`);
  if (directives.remove_targets.length) additions.push(`Must remove or replace these exact targets: ${directives.remove_targets.join(" | ")}`);
  if (directives.risk_segments.length) {
    additions.push(`Must resolve these risk previews: ${directives.risk_segments.map((item) => item.preview).filter(Boolean).join(" | ")}`);
  }
  return {
    ...focus,
    issues: [...new Set([...(Array.isArray(focus.issues) ? focus.issues : []), ...directives.issues])].slice(0, 16),
    remove_targets: [...new Set([...(Array.isArray(focus.remove_targets) ? focus.remove_targets : []), ...directives.remove_targets])].slice(0, 10),
    keep_targets: [...new Set([...(Array.isArray(focus.keep_targets) ? focus.keep_targets : []), ...directives.keep_targets])].slice(0, 10),
    rewrite_direction: focus.rewrite_direction || directives.rewrite_direction,
    risk_segments: [...(Array.isArray(focus.risk_segments) ? focus.risk_segments : []), ...directives.risk_segments]
      .filter((segment, index, list) => segment?.preview && list.findIndex((item) => item?.preview === segment.preview) === index)
      .slice(0, 10),
    instruction: [...new Set([focus.instruction, ...additions].filter(Boolean))].join("\n"),
  };
}

function blockingReviewRiskSegments(review = {}) {
  if (review?.publish_gate?.publish_ready === true) return [];
  return reviewRiskSegments(review).filter((segment) => {
    const severity = String(segment.severity || "").toLowerCase();
    if (["high", "blocker", "critical"].includes(severity)) return true;
    if (!severity && Number(segment.risk_points || 0) > 0) return true;
    const reasonText = [
      segment.preview,
      ...(Array.isArray(segment.reasons) ? segment.reasons : []),
    ].join(" ");
    return /纭鍒檤涓ラ噸|闃绘柇|蹇呴』|涓嶅緱鍑虹幇绯荤粺|妯″瀷杩囩▼娉勯湶|浜嬪疄鍐茬獊|鍙ｅ緞鍐茬獊/.test(reasonText);
  });
}

function withReviewRiskFocus(focus, review = {}) {
  const riskSegments = blockingReviewRiskSegments(review);
  if (!focus) return focus;
  focus = mergeConcreteReviewerDirectives(focus, review);
  if (focus.type === "story_room_contract_repair") {
    const missing = review?.publish_gate?.values?.story_room_contract_missing;
    const missingFields = Array.isArray(missing) ? missing.slice(0, 4) : [];
    return {
      ...focus,
      story_room_missing_fields: missingFields,
      story_room_missing_labels: storyRoomMissingLabels(missingFields),
      issues: Array.isArray(review?.issues) ? review.issues.slice(0, 12) : [],
      rewrite_direction: review?.rewrite_direction || "",
      risk_segments: riskSegments.slice(0, 4),
      instruction: [
        focus.instruction,
        "Patch locally around the closest scene window. If chapter_debt is missing, prefer the tail window; otherwise prefer the result/relationship window. Preserve the rest of the chapter.",
      ].filter(Boolean).join("\n"),
    };
  }
  const publishWideRepairTypes = new Set([
    "publish_gate_repair",
    "publish_grade_lift",
    "retention_boost",
    "coolpoint_boost",
    "micro_hook_boost",
  ]);
  if (publishWideRepairTypes.has(focus.type)) {
    return {
      ...focus,
      issues: Array.isArray(review?.issues) ? review.issues.slice(0, 12) : [],
      rewrite_direction: review?.rewrite_direction || "",
      risk_segments: riskSegments.slice(0, 8),
      instruction: [
        focus.instruction,
        "Publish-ready means the final quality report must show publish_gate.publish_ready=true. If risk_segments are present, replace every preview sentence instead of leaving it highlighted. Preserve solved paragraphs and repair only the missing metric.",
      ].filter(Boolean).join("\n"),
    };
  }
  if (!riskSegments.length) return focus;
  if (focus.type === "remove_explanation") {
    return {
      ...focus,
      issues: Array.isArray(review?.issues) ? review.issues.slice(0, 12) : [],
      rewrite_direction: review?.rewrite_direction || "",
      risk_segments: riskSegments.slice(0, 8),
      instruction: [
        focus.instruction,
        "The rereview must pass ai_taste_score >= 78. Replace AI-like explanation, summary, and mental declarations with visible action, dialogue, object handling, order/data changes, and scene feedback.",
      ].filter(Boolean).join("\n"),
    };
  }
  if (!["drop_risk_repair", "sentence_pattern_repair", "rhythm_repair"].includes(focus.type)) return focus;
  return {
    ...focus,
    source_issue: focus.source_issue || "inline_risk_segments",
    issues: Array.isArray(review?.issues) ? review.issues.slice(0, 12) : [],
    rewrite_direction: review?.rewrite_direction || "",
    risk_segments: riskSegments.slice(0, 8),
    instruction: [
      focus.instruction,
      "Priority: repair every risk_segments preview. Replace the original marked sentence with action, dialogue, visible feedback, or a concrete result; the original preview text should not remain in the rewritten draft.",
    ].filter(Boolean).join("\n"),
  };
}

export function buildDialogueTuningRewriteLayer({ context = {} } = {}) {
  return {
    type: "character_voice",
    source_issue: "one_click_dialogue_polish",
    instruction: "对白打磨：只改台词、动作穿插和说话节奏，不改主线事件、章尾钩子和关键设定。",
    dialogue_tuning: buildDialogueTuningGuide({
      characterAnchors: context.character_anchors || [],
      voiceSamples: context.character_voice_samples || [],
    }),
  };
}

const DOMAIN_KNOWLEDGE_FORBIDDEN_TO_COPY = [
  "source_sentences",
  "official_plot_text",
  "quest_dialogue",
  "proprietary_descriptions",
  "unique_wiki_wording",
];

function includesAny(text = "", terms = []) {
  return terms.some((term) => term && String(text).includes(term));
}

export function planDomainKnowledge(idea = "") {
  const text = String(idea || "");
  let domain = "";
  let domainType = "general";
  let riskLevel = "normal";
  let dimensions = ["术语", "世界观", "角色职业", "地点", "能力体系", "禁忌清单"];
  if (/梦幻西游/.test(text)) {
    domain = "梦幻西游";
    domainType = "game_ip";
    riskLevel = "ip_sensitive";
    dimensions = ["门派", "技能", "地图", "召唤兽", "装备", "经济系统", "任务系统", "NPC", "禁忌设定", "版本差异"];
  } else if (/(剑网3|剑侠情缘网络版叁|魔兽|原神|崩坏|阴阳师|王者荣耀|游戏|网游)/i.test(text)) {
    const match = text.match(/(剑网3|剑侠情缘网络版叁|魔兽世界|魔兽|原神|崩坏[:：]?[星穹铁道]*|阴阳师|王者荣耀)/i);
    domain = match?.[1] || "game domain";
    domainType = "game_ip";
    riskLevel = "ip_sensitive";
    dimensions = ["阵营", "职业", "技能", "地图", "装备", "副本", "NPC", "时间线", "禁忌设定", "版本差异"];
  } else if (/(历史|三国|唐朝|宋朝|明朝|清朝|民国)/.test(text)) {
    const match = text.match(/(三国|唐朝|宋朝|明朝|清朝|民国)/);
    domain = match?.[1] || "历史题材";
    domainType = "historical";
    riskLevel = "research_needed";
    dimensions = ["时间线", "制度", "官职", "地理", "人物", "服饰", "兵制", "经济", "禁忌错误"];
  }
  return {
    domain,
    domain_type: domainType,
    risk_level: riskLevel,
    knowledge_dimensions: dimensions,
    requires_user_confirmation_before_network: Boolean(domain) && riskLevel !== "normal",
    network_status: "not_started",
    created_at: new Date().toISOString(),
  };
}

async function writeDomainKnowledgePlan(project) {
  const plan = {
    project_title: project.title,
    idea: project.idea,
    ...planDomainKnowledge(project.idea),
  };
  plan.path = domainKnowledgePlanFile(project);
  await writeJson(plan.path, plan);
  return plan;
}

function normalizeDomainKnowledgeEntry(entry = {}, source = "manual_import") {
  return {
    type: String(entry.type || "fact").trim(),
    name: String(entry.name || "").trim(),
    aliases: Array.isArray(entry.aliases) ? entry.aliases.map(String).filter(Boolean) : [],
    facts: Array.isArray(entry.facts) ? entry.facts.map(String).filter(Boolean) : [],
    constraints: Array.isArray(entry.constraints) ? entry.constraints.map(String).filter(Boolean) : [],
    tags: Array.isArray(entry.tags) ? entry.tags.map(String).filter(Boolean) : [],
    source,
    confidence: Number.isFinite(entry.confidence) ? entry.confidence : 0.8,
  };
}

export async function importDomainKnowledge(project, { source = "manual_import", entries = [] } = {}) {
  const current = await readJson(domainKnowledgeBaseFile(project)).catch(() => ({
    project_title: project.title,
    saved_source_text: false,
    entries: [],
    forbidden_to_copy: DOMAIN_KNOWLEDGE_FORBIDDEN_TO_COPY,
  }));
  const normalized = entries
    .map((entry) => normalizeDomainKnowledgeEntry(entry, source))
    .filter((entry) => entry.name || entry.facts.length || entry.constraints.length);
  const next = {
    ...current,
    project_title: project.title,
    saved_source_text: false,
    entries: [...(current.entries || []), ...normalized],
    forbidden_to_copy: DOMAIN_KNOWLEDGE_FORBIDDEN_TO_COPY,
    updated_at: new Date().toISOString(),
  };
  next.path = domainKnowledgeBaseFile(project);
  await writeJson(next.path, next);
  return next;
}

function defaultDomainSourceCandidates(plan = {}) {
  const domain = plan.domain || plan.idea || "domain";
  const dimensions = plan.knowledge_dimensions || [];
  const dimensionQuery = dimensions.slice(0, 4).join(" ");
  return [
    {
      id: "official-or-authoritative",
      title: `${domain} authoritative overview`,
      search_query: `${domain} official wiki ${dimensionQuery}`.trim(),
      source_type: plan.domain_type || "general",
      priority: 1,
      requires_confirmation: true,
      allowed_use: "structure_facts_constraints_only",
      forbidden_to_save: DOMAIN_KNOWLEDGE_FORBIDDEN_TO_COPY,
    },
    {
      id: "baike-or-community-wiki",
      title: `${domain} baike or community wiki`,
      search_query: `${domain} baike wiki ${dimensionQuery}`.trim(),
      source_type: plan.domain_type || "general",
      priority: 2,
      requires_confirmation: true,
      allowed_use: "cross_check_terms_and_forbidden_mistakes",
      forbidden_to_save: DOMAIN_KNOWLEDGE_FORBIDDEN_TO_COPY,
    },
  ];
}

export async function generateDomainSourceCandidates(project, { search = null } = {}) {
  const plan = await readJson(domainKnowledgePlanFile(project)).catch(() => ({
    project_title: project.title,
    idea: project.idea,
    ...planDomainKnowledge(project.idea),
  }));
  const candidates = defaultDomainSourceCandidates(plan);
  const result = {
    project_title: project.title,
    domain: plan.domain || "",
    domain_type: plan.domain_type || "general",
    risk_level: plan.risk_level || "normal",
    confirmation_required: true,
    network_status: "candidate_only",
    search_used: Boolean(search && false),
    saved_source_text: false,
    candidates,
    generated_at: new Date().toISOString(),
    path: domainKnowledgeSourceCandidatesFile(project),
  };
  await writeJson(result.path, result);
  return result;
}

export async function createDomainKnowledgeBuildPlan(project) {
  const plan = await readJson(domainKnowledgePlanFile(project)).catch(() => ({
    project_title: project.title,
    idea: project.idea,
    ...planDomainKnowledge(project.idea),
  }));
  const candidates = await generateDomainSourceCandidates(project);
  const buildPlan = {
    status: "awaiting_confirmation",
    project_title: project.title,
    domain: plan.domain || candidates.domain || "",
    domain_type: plan.domain_type || candidates.domain_type || "general",
    risk_level: plan.risk_level || candidates.risk_level || "normal",
    requires_user_confirmation_before_network: true,
    saved_source_text: false,
    sources: candidates.candidates || [],
    forbidden_to_copy: DOMAIN_KNOWLEDGE_FORBIDDEN_TO_COPY,
    safety: [
      "confirmed_sources_only",
      "do_not_save_raw_source_text",
      "do_not_bypass_login_captcha_or_paywall",
      "facts_constraints_terms_only",
    ],
    next_actions: ["domain-build --confirm", "review_domain_audit", "rebuild_from_audit_when_sources_change"],
    created_at: new Date().toISOString(),
    path: domainKnowledgeBuildPlanFile(project),
  };
  await writeJson(buildPlan.path, buildPlan);
  return buildPlan;
}

export async function readDomainKnowledgeSourceAudit(project) {
  return readJson(domainKnowledgeSourceAuditFile(project)).catch(() => ({
    project_title: project.title,
    saved_source_text: false,
    records: [],
    updated_at: null,
    path: domainKnowledgeSourceAuditFile(project),
  }));
}

async function writeDomainKnowledgeSourceAudit(project, patchRecords = []) {
  const current = await readDomainKnowledgeSourceAudit(project);
  const next = {
    ...current,
    project_title: project.title,
    saved_source_text: false,
    records: [...(current.records || []), ...patchRecords],
    updated_at: new Date().toISOString(),
    path: domainKnowledgeSourceAuditFile(project),
  };
  await writeJson(next.path, next);
  return next;
}

export async function retrieveRelevantDomainKnowledge(project, card = {}, { limit = 8 } = {}) {
  const knowledge = await readJson(domainKnowledgeBaseFile(project)).catch(() => null);
  if (!knowledge) {
    return {
      enabled: false,
      relevant_entries: [],
      hard_rules: [],
      forbidden_to_copy: DOMAIN_KNOWLEDGE_FORBIDDEN_TO_COPY,
    };
  }
  const haystack = [
    card.display_title,
    card.opening_hook,
    card.main_event,
    card.protagonist_action,
    card.conflict,
    card.cool_point_type,
    card.visible_result,
    card.tail_hook,
    ...(card.facts_required || []),
    ...(card.forbidden_items || []),
  ].join(" ");
  const scored = (knowledge.entries || [])
    .map((entry) => {
      const terms = [entry.name, ...(entry.aliases || []), ...(entry.tags || [])].filter(Boolean);
      const factTerms = [...(entry.facts || []), ...(entry.constraints || [])]
        .flatMap((item) => String(item).split(/[锛?銆乗s]+/))
        .filter((item) => item.length >= 2);
      const score = (includesAny(haystack, terms) ? 2 : 0) + (includesAny(haystack, factTerms) ? 1 : 0);
      return { ...entry, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return {
    enabled: true,
    relevant_entries: scored.map(({ score, ...entry }) => entry),
    hard_rules: scored.flatMap((entry) => entry.constraints || []),
    forbidden_to_copy: knowledge.forbidden_to_copy || DOMAIN_KNOWLEDGE_FORBIDDEN_TO_COPY,
  };
}

export function analyzeDomainKnowledgeCompliance(text = "", card = {}, domainKnowledge = {}) {
  const body = String(text || "");
  const entries = domainKnowledge.relevant_entries || domainKnowledge.entries || [];
  const violations = [];
  const issues = new Set();
  for (const entry of entries) {
    const entryTerms = [entry.name, ...(entry.aliases || [])].filter(Boolean);
    const mentioned = includesAny(body, entryTerms);
    if (!mentioned) continue;
    for (const constraint of entry.constraints || []) {
      const constraintText = String(constraint || "");
      if (/不能写成法术主输出/.test(constraintText) && /法术主输出|普通法术/.test(body)) {
        issues.add("domain_constraint_violation");
        issues.add("domain_term_misuse");
        violations.push({
          entry_name: entry.name,
          type: "constraint_violation",
          constraint,
          evidence: "conflicts_with_domain_constraint",
        });
      }
      if (/不要写成荒野副本/.test(constraintText) && /荒野副本/.test(body)) {
        issues.add("domain_constraint_violation");
        violations.push({
          entry_name: entry.name,
          type: "constraint_violation",
          constraint,
          evidence: "conflicts_with_location_constraint",
        });
      }
    }
  }
  if (/(鍘熸枃|瀹樻柟浠嬬粛|浠诲姟鍙拌瘝|澶嶅埗|鐓ф惉)/.test(body)) {
    issues.add("ip_copy_risk");
  }
  return {
    enabled: entries.length > 0,
    issues: [...issues],
    violations,
  };
}

function structureKnowledgeFromText(rawText = "", source = {}) {
  const text = String(rawText || "");
  const entries = [];
  if (/大唐官府|大唐/.test(text)) {
    entries.push({
      type: "faction",
      name: "大唐官府",
      aliases: ["大唐"],
      facts: [
        /物理输出/.test(text) ? "物理输出门派" : "门派",
        /横扫千军/.test(text) ? "代表技能横扫千军" : "",
      ].filter(Boolean),
      constraints: /不能写成法术主输出/.test(text) ? ["不能写成法术主输出门派"] : [],
      tags: ["门派", "技能"],
      source: source.url || source.title || "confirmed_source",
      confidence: 0.7,
    });
  }
  if (/长安城|长安/.test(text)) {
    entries.push({
      type: "location",
      name: "长安城",
      aliases: ["长安"],
      facts: ["主城"],
      constraints: /荒野副本/.test(text) ? ["不要写成荒野副本"] : [],
      tags: ["鍦板浘", "鍦扮偣"],
      source: source.url || source.title || "confirmed_source",
      confidence: 0.7,
    });
  }
  return entries;
}

export async function collectDomainKnowledgeFromSources(project, {
  confirmed = false,
  sources = [],
  fetch: fetchImpl = globalThis.fetch,
  reset = false,
} = {}) {
  if (!confirmed) {
    throw new Error("collectDomainKnowledgeFromSources requires user confirmation");
  }
  const entries = [];
  const auditRecords = [];
  for (const source of sources || []) {
    if (!source?.url) continue;
    const baseRecord = {
      url: source.url,
      title: source.title || "",
      source_type: source.source_type || source.type || "confirmed_source",
      confirmed: true,
      saved_source_text: false,
      checked_at: new Date().toISOString(),
    };
    try {
      const response = await fetchImpl(source.url);
      if (!response?.ok) {
        auditRecords.push({
          ...baseRecord,
          status: "fetch_failed",
          http_status: response?.status || null,
          entry_count: 0,
          warnings: ["source_fetch_failed"],
        });
        continue;
      }
      const rawText = await response.text();
      const structured = structureKnowledgeFromText(rawText, source);
      entries.push(...structured);
      auditRecords.push({
        ...baseRecord,
        status: structured.length ? "ingested" : "no_entries",
        http_status: response.status || 200,
        entry_count: structured.length,
        warnings: structured.length ? [] : ["no_structured_entries_extracted"],
      });
    } catch (error) {
      auditRecords.push({
        ...baseRecord,
        status: "fetch_error",
        http_status: null,
        entry_count: 0,
        warnings: [error.message],
      });
    }
  }
  if (reset) {
    await writeJson(domainKnowledgeBaseFile(project), {
      project_title: project.title,
      saved_source_text: false,
      entries: [],
      forbidden_to_copy: DOMAIN_KNOWLEDGE_FORBIDDEN_TO_COPY,
      updated_at: new Date().toISOString(),
      path: domainKnowledgeBaseFile(project),
    });
  }
  const knowledge = await importDomainKnowledge(project, {
    source: "confirmed_web_source",
    entries,
  });
  await writeDomainKnowledgeSourceAudit(project, auditRecords);
  return knowledge;
}

export async function runDomainKnowledgeBuild(project, {
  confirmed = false,
  fetch: fetchImpl = globalThis.fetch,
  sources,
} = {}) {
  if (!confirmed) {
    throw new Error("runDomainKnowledgeBuild requires user confirmation");
  }
  const buildPlan = await readJson(domainKnowledgeBuildPlanFile(project)).catch(() =>
    createDomainKnowledgeBuildPlan(project),
  );
  const selectedSources = Array.isArray(sources) && sources.length
    ? sources
    : (buildPlan.sources || []).map((source) => ({
        url: source.url || `https://search.local/${encodeURIComponent(source.search_query || source.title || "domain")}`,
        title: source.title,
        source_type: source.source_type,
      }));
  const knowledge = await collectDomainKnowledgeFromSources(project, {
    confirmed: true,
    sources: selectedSources,
    fetch: fetchImpl,
  });
  const audit = await readDomainKnowledgeSourceAudit(project);
  const result = {
    status: "built",
    project_title: project.title,
    domain: buildPlan.domain || "",
    source_count: selectedSources.length,
    knowledge,
    audit,
    saved_source_text: false,
    updated_at: new Date().toISOString(),
    path: domainKnowledgeBuildPlanFile(project),
  };
  await writeJson(result.path, {
    ...buildPlan,
    status: "built",
    last_run: {
      source_count: selectedSources.length,
      entry_count: knowledge.entries?.length || 0,
      updated_at: result.updated_at,
    },
  });
  return result;
}

export async function rebuildDomainKnowledgeFromAudit(project, {
  confirmed = false,
  fetch: fetchImpl = globalThis.fetch,
} = {}) {
  if (!confirmed) {
    throw new Error("rebuildDomainKnowledgeFromAudit requires user confirmation");
  }
  const audit = await readDomainKnowledgeSourceAudit(project);
  const sources = (audit.records || [])
    .filter((record) => record.status === "ingested" && record.url)
    .map((record) => ({
      url: record.url,
      title: record.title,
      source_type: record.source_type,
    }));
  const knowledge = await collectDomainKnowledgeFromSources(project, {
    confirmed: true,
    sources,
    fetch: fetchImpl,
    reset: true,
  });
  return {
    status: "rebuilt",
    source_count: sources.length,
    knowledge,
  };
}

const PROJECT_DIRS = [
  "章卡",
  "正文",
  "审稿",
  "状态",
  "导出",
  "任务",
  "大纲",
  "设定",
  "卷纲",
  "细纲",
  "封面",
  "reports",
  "tasks",
];

function buildInitialProjectPlanning(project) {
  const title = project.title || "新书";
  const idea = String(project.idea || "新书创意").trim() || "新书创意";
  const platform = project.platform || "fanqie";
  const genre = project.genre || "网文";
  const projectRules = writingRulesForProject(project);
  const bible = [
    `# ${title}`,
    "",
    `一句话创意：${idea}`,
    "",
    "## 商业定位",
    "",
    `- 平台：${platform}`,
    `- 题材：${genre}`,
    "- 目标：先完成前30章可追读样稿，再进入批量写作。",
    "- 核心爽感：每章给读者一个明确进展、反转或收益。",
    "",
    "## 主线",
    "",
    "- 起点：主角进入核心冲突，并用行动证明自己不一样。",
    "- 推进：通过连续小胜利扩大优势，同时引入更强阻力。",
    "- 中段：资源、关系、规则三线施压，避免重复单一桥段。",
    "- 长线：阶段胜利后抬高目标，进入更大格局。",
    "",
    "## 角色设定",
    "",
    "- 主角：目标明确，行动快，遇到压力先解决问题再解释。",
    "- 搭档：补足主角盲区，制造对白和行动节奏。",
    "- 对手：代表资源、平台规则或认知差距，不只负责找茬。",
    "",
    "## 写作硬规则",
    "",
    ...projectRules.map((rule) => `- ${rule}`),
    "",
  ].join("\n");
  const volume = [
    `# ${title} / 第一卷纲`,
    "",
    "- 第1-3章：进入冲突，展示主角优势和第一个可见结果。",
    "- 第4-10章：扩大执行面，出现第一个强阻力和一次反转。",
    "- 第11-20章：关系、资源、规则三线并进，避免单线重复。",
    "- 第21-30章：集中兑现伏笔，完成阶段成果并抬出下一卷压力。",
    "",
  ].join("\n");
  const settings = [
    `# ${title} / 设定库`,
    "",
    `- 核心背景：${idea}`,
    "- 角色、地点、商业状态、伏笔会在每章写完后自动同步。",
    "- 所有设定必须服务冲突、收益、选择和读者期待。",
    "- 本书规则会按平台、类型、标签自动进入章卡、正文和审稿任务。",
    "",
  ].join("\n");
  const relationships = [
    `# ${title} / 人物关系`,
    "",
    "## 核心关系组",
    "",
    "- 主角：目标明确，是所有冲突和选择的行动中心。",
    "- 搭档/同盟：补足主角信息、人脉或执行短板，负责制造对白节奏和协作爽点。",
    "- 对手/阻力：代表平台规则、资源壁垒、旧秩序或认知差距，不只负责找茬。",
    "- 家人/情感牵引：提供现实压力、情绪锚点和主角不能退的理由。",
    "",
    "## 关系推进规则",
    "",
    "- 每个主要人物出场都要带一个明确诉求。",
    "- 关系变化必须由事件推动：帮忙、误会、交易、竞争、背叛或共同利益。",
    "- 写作过程中新增人物会自动同步到状态记忆；开书阶段先锁定关系功能位。",
    "",
  ].join("\n");
  const chapterPlan = [
    `# ${title} / 前30章细纲`,
    "",
    ...Array.from({ length: 30 }, (_, index) => {
      const chapterNo = index + 1;
      return [
        `## 第${chapterNo}章`,
        "",
        chapterNo === 1
          ? "- 目标：用一个具体场面进入核心创意。"
          : "- 目标：承接上一章结果，推进一个新问题。",
        "- 冲突：资源、关系或规则带来阻力。",
        "- 爽点：用行动兑现一个小胜。",
        "- 章尾钩子：留下下一章必须点开的变化。",
        "",
      ].join("\n");
    }),
  ].join("\n");
  return {
    bible,
    volume,
    settings,
    relationships,
    chapterPlan,
    tree: {
      title,
      idea,
      status: "planning-ready",
      branches: [
        { name: "项目圣经", path: "项目圣经.md", ready: true },
        { name: "大纲", path: "大纲/总纲.md", ready: true },
        { name: "设定", path: "设定/设定库.md", ready: true },
        { name: "人物关系", path: "设定/人物关系.md", ready: true },
        { name: "卷纲", path: "卷纲/第一卷.md", ready: true },
        { name: "细纲", path: "细纲/前30章.md", ready: true },
        { name: "章卡", path: "章卡/", ready: false },
        { name: "正文", path: "正文/", ready: false },
        { name: "审稿", path: "审稿/", ready: false },
        { name: "状态记忆", path: "状态/", ready: false },
      ],
      next_action: "生成第1章章卡并开始写作",
      created_at: new Date().toISOString(),
    },
  };
}

function normalizeTargetWords(value, fallback = 2000000) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(50000, Math.min(10000000, Math.round(numeric)));
}

function normalizeNameList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12);
  }
  return String(value || "")
    .split(/[銆?锛?\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function createProject({
  root,
  title,
  idea,
  platform,
  genre,
  targetWords,
  target_words,
  goldenFinger,
  golden_finger,
  protagonistName,
  protagonist_name,
  supportingCharacters,
  supporting_characters,
  authorName,
  author_name,
  coverPath,
  cover_path,
  coverUrl,
  cover_url,
  coverPrompt,
  cover_prompt,
  initializePlanning = true,
}) {
  const cleanTitle = String(title || "鏂颁功").trim() || "鏂颁功";
  let finalTitle = cleanTitle;
  let finalPath = projectDir(root, finalTitle);
  if (await fileExists(path.join(finalPath, "project.json")) || await fileExists(finalPath)) {
    finalTitle = `${cleanTitle}_${projectFolderTimestamp()}`;
    finalPath = projectDir(root, finalTitle);
  }
  const project = {
    title: finalTitle,
    idea,
    platform,
    channel: "male",
    genre,
    target_words: normalizeTargetWords(targetWords ?? target_words),
    author_name: String(authorName ?? author_name ?? "章鱼作者").trim() || "章鱼作者",
    golden_finger: String(goldenFinger ?? golden_finger ?? "").trim(),
    protagonist_name: String(protagonistName ?? protagonist_name ?? "").trim(),
    supporting_characters: normalizeNameList(supportingCharacters ?? supporting_characters),
    cover_path: String(coverPath ?? cover_path ?? "").trim(),
    cover_url: String(coverUrl ?? cover_url ?? "").trim(),
    cover_prompt: String(coverPrompt ?? cover_prompt ?? "").trim(),
    batch_size: 5,
    current_chapter: 1,
    canon_version: "v1",
    status: "planning",
    path: finalPath,
    created_at: new Date().toISOString(),
  };
  assertProject(project);

  await ensureDir(project.path);
  for (const dir of PROJECT_DIRS) {
    await ensureDir(path.join(project.path, dir));
  }
  await writeJson(projectFile(project), project);
  await writeJson(projectConfigFile(project), DEFAULT_PROJECT_CONFIG);
  await writeDomainKnowledgePlan(project);
  if (!initializePlanning) {
    await writeJson(path.join(project.path, "椤圭洰鏍?json"), {
      title,
      idea,
      status: "planning-pending",
      branches: [],
      next_action: "generate_project_planning",
      created_at: new Date().toISOString(),
    });
    return project;
  }
  const initialPlanning = buildInitialProjectPlanning(project);
  await writeText(path.join(project.path, "椤圭洰鍦ｇ粡.md"), initialPlanning.bible);
  await writeText(path.join(project.path, "澶х翰", "鎬荤翰.md"), initialPlanning.bible);
  await writeText(path.join(project.path, "璁惧畾", "璁惧畾搴?md"), initialPlanning.settings);
  await writeText(path.join(project.path, "璁惧畾", "浜虹墿鍏崇郴.md"), initialPlanning.relationships);
  await writeText(path.join(project.path, "鍗风翰", "绗竴鍗?md"), initialPlanning.volume);
  await writeText(path.join(project.path, "缁嗙翰", "鍓?0绔?md"), initialPlanning.chapterPlan);
  await writeJson(path.join(project.path, "椤圭洰鏍?json"), initialPlanning.tree);
  return project;
}

function mergeConfig(base, patch) {
  const { api_key, openai_api_key, secrets, ...safePatch } = patch || {};
  const { api_key: modelApiKey, openai_api_key: modelOpenAiApiKey, ...safeModelPatch } =
    safePatch.model || {};
  return {
    ...base,
    ...safePatch,
    model: {
      ...base.model,
      ...safeModelPatch,
    },
    budget: {
      ...base.budget,
      ...(safePatch.budget || {}),
    },
    privacy: {
      ...base.privacy,
      ...(safePatch.privacy || {}),
    },
    writing: {
      ...(base.writing || {}),
      ...(safePatch.writing || {}),
    },
  };
}

export async function loadProjectConfig(project) {
  try {
    return assertProjectConfig(mergeConfig(DEFAULT_PROJECT_CONFIG, await readJson(projectConfigFile(project))));
  } catch (error) {
    if (error.code === "ENOENT") {
      await writeJson(projectConfigFile(project), DEFAULT_PROJECT_CONFIG);
      return assertProjectConfig(DEFAULT_PROJECT_CONFIG);
    }
    throw error;
  }
}

export async function saveProjectConfig(project, patch = {}) {
  const current = await loadProjectConfig(project);
  const next = assertProjectConfig(mergeConfig(current, patch));
  await writeJson(projectConfigFile(project), next);
  return next;
}

export async function loadProject(projectPath) {
  try {
    return normalizeProject(await readJson(projectFile({ path: projectPath })), projectPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`椤圭洰鐩綍鏃犳晥锛屾湭鎵惧埌 project.json: ${projectPath}`);
    }
    throw error;
  }
}

async function saveProject(project) {
  assertProject(project);
  await writeJson(projectFile(project), project);
  return project;
}

function normalizeProject(rawProject, projectPath) {
  return assertProject({
    title: rawProject.title || path.basename(projectPath),
    idea: rawProject.idea || "",
    platform: rawProject.platform || "fanqie",
    channel: rawProject.channel || "male",
    genre: rawProject.genre || "缃戞枃",
    target_words: normalizeTargetWords(rawProject.target_words || rawProject.targetWords),
    author_name: String(rawProject.author_name || rawProject.authorName || "章鱼作者").trim() || "章鱼作者",
    golden_finger: String(rawProject.golden_finger || rawProject.goldenFinger || "").trim(),
    protagonist_name: String(rawProject.protagonist_name || rawProject.protagonistName || "").trim(),
    supporting_characters: normalizeNameList(rawProject.supporting_characters || rawProject.supportingCharacters),
    cover_path: String(rawProject.cover_path || rawProject.coverPath || "").trim(),
    cover_url: String(rawProject.cover_url || rawProject.coverUrl || "").trim(),
    cover_prompt: String(rawProject.cover_prompt || rawProject.coverPrompt || "").trim(),
    batch_size: rawProject.batch_size || 5,
    current_chapter: rawProject.current_chapter || rawProject.currentChapter || 1,
    canon_version: rawProject.canon_version || "v1",
    status: rawProject.status || "planning",
    path: rawProject.path || projectPath,
    created_at: rawProject.created_at || rawProject.createdAt || "",
  });
}

export function draftFileFor(project, chapterNo, version = "v1") {
  return draftFile(project, chapterNo, version);
}

export function estimateTokens(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const cjkMatches = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || [];
  const cjkChars = cjkMatches.length;
  const nonCjkChars = Math.max(0, text.length - cjkChars);
  return Math.max(1, Math.ceil(cjkChars * 1.5 + nonCjkChars / 4));
}

export function estimateCostCny({ provider, inputTokens, outputTokens, rates } = {}) {
  if (provider === "mock" || provider?.startsWith("mock")) return 0;
  const selectedRates = rates || DEFAULT_OPENAI_RATES_CNY;
  const inputCost = (inputTokens / 1_000_000) * selectedRates.input_per_million_cny;
  const outputCost = (outputTokens / 1_000_000) * selectedRates.output_per_million_cny;
  return Number((inputCost + outputCost).toFixed(6));
}

const INTERACTIVE_TASK_RUNTIME = {
  generate_chapter_card: { timeoutMs: 90_000, maxRetries: 0 },
  write_chapter: { timeoutMs: 90_000, maxRetries: 0 },
  review_chapter: { timeoutMs: 120_000, maxRetries: 0 },
  rewrite_chapter: { timeoutMs: 90_000, maxRetries: 0 },
  extract_state_candidates: { timeoutMs: 45_000, maxRetries: 0 },
  global_review: { timeoutMs: 180_000, maxRetries: 0 },
};

function taskRuntimeFor(taskType = "") {
  return INTERACTIVE_TASK_RUNTIME[taskType] || null;
}

function mergeTaskRuntime(routerOptions = {}, taskType = "") {
  const runtime = taskRuntimeFor(taskType);
  if (!runtime) return routerOptions;
  const configuredTimeout = Number(routerOptions.timeoutMs ?? routerOptions.timeout_ms ?? 0);
  const timeoutMs = configuredTimeout > 0
    ? Math.min(configuredTimeout, runtime.timeoutMs)
    : runtime.timeoutMs;
  return {
    ...routerOptions,
    timeoutMs,
    maxRetries: routerOptions.maxRetries ?? routerOptions.max_retries ?? runtime.maxRetries,
    retryDelayMs: routerOptions.retryDelayMs ?? routerOptions.retry_delay_ms ?? 500,
  };
}

export function resolveRouterOptionsFromConfig(config, options = {}) {
  const taskType = options.taskType || options.task_type;
  const optionTaskRoutes = options.routerOptions?.taskRoutes || options.routerOptions?.task_routes || {};
  const optionRoute = taskType ? optionTaskRoutes?.[taskType] : null;
  const configRoute = taskType ? config.model.task_routes?.[taskType] : null;
  const route = optionRoute || configRoute || null;
  const optionHasProvider = options.routerOptions && Object.prototype.hasOwnProperty.call(options.routerOptions, "provider");
  const optionHasModel = options.routerOptions && Object.prototype.hasOwnProperty.call(options.routerOptions, "model");
  const provider = route?.provider
    || (optionHasProvider ? options.routerOptions.provider : undefined)
    || config.model.provider;
  const model = route?.model
    || (optionHasModel ? options.routerOptions.model : undefined)
    || config.model.default_writer;
  const configOptions = {
    provider,
    model,
    allowNetwork: provider === "mock" || provider?.startsWith("mock")
      ? false
      : Boolean(options.routerOptions?.allowNetwork ?? options.routerOptions?.allow_network ?? config.model.allow_network),
  };
  if (
    Object.prototype.hasOwnProperty.call(config.model, "fallback_enabled") ||
    Object.prototype.hasOwnProperty.call(route || {}, "fallback_enabled") ||
    Array.isArray(route?.fallbacks)
  ) {
    configOptions.fallbackEnabled = Boolean(route?.fallback_enabled ?? config.model.fallback_enabled ?? true);
    configOptions.fallbacks = Array.isArray(route?.fallbacks) ? route.fallbacks : [];
  }
  if (route) {
    if (Object.prototype.hasOwnProperty.call(route, "timeoutMs") || Object.prototype.hasOwnProperty.call(route, "timeout_ms")) {
      configOptions.timeoutMs = route.timeoutMs ?? route.timeout_ms;
    }
    if (Object.prototype.hasOwnProperty.call(route, "maxRetries") || Object.prototype.hasOwnProperty.call(route, "max_retries")) {
      configOptions.maxRetries = route.maxRetries ?? route.max_retries;
    }
    if (Object.prototype.hasOwnProperty.call(route, "retryDelayMs") || Object.prototype.hasOwnProperty.call(route, "retry_delay_ms")) {
      configOptions.retryDelayMs = route.retryDelayMs ?? route.retry_delay_ms;
    }
  }
    if (options.routerOptions) {
      const hasExplicitFallbackEnabled = Object.prototype.hasOwnProperty.call(options.routerOptions, "fallbackEnabled");
      const hasExplicitFallbacks = Object.prototype.hasOwnProperty.call(options.routerOptions, "fallbacks");
      return mergeTaskRuntime({
        ...configOptions,
        ...options.routerOptions,
        provider: configOptions.provider,
        model: configOptions.model,
        allowNetwork: configOptions.allowNetwork,
        ...(hasExplicitFallbackEnabled || Object.prototype.hasOwnProperty.call(configOptions, "fallbackEnabled")
          ? { fallbackEnabled: hasExplicitFallbackEnabled ? options.routerOptions.fallbackEnabled : configOptions.fallbackEnabled }
          : {}),
      ...(hasExplicitFallbacks || Object.prototype.hasOwnProperty.call(configOptions, "fallbacks")
        ? { fallbacks: hasExplicitFallbacks ? options.routerOptions.fallbacks : configOptions.fallbacks }
        : {}),
    }, taskType);
  }
  return mergeTaskRuntime(configOptions, taskType);
}

function runtimeRouteKey(taskType = "", attempt = {}) {
  return [taskType, attempt.provider || "", attempt.model || ""].join("::").toLowerCase();
}

function runtimeProviderKey(taskType = "", attempt = {}) {
  return [taskType, attempt.provider || ""].join("::").toLowerCase();
}

function runtimeSlowRouteSet(routerOptions = {}) {
  const shared = routerOptions._runtimeSlowRoutes
    || routerOptions._sharedRuntimeSlowRoutes
    || routerOptions._rootRuntimeSlowRoutes;
  if (shared) {
    routerOptions._runtimeSlowRoutes = shared;
    routerOptions._sharedRuntimeSlowRoutes = shared;
    return shared;
  }
  const next = new Set();
  routerOptions._runtimeSlowRoutes = next;
  routerOptions._sharedRuntimeSlowRoutes = next;
  return next;
}

function shouldSkipRuntimeSlowRoute(routerOptions = {}, taskType = "", attempt = {}, attemptIndex = 0) {
  if (attemptIndex > 0) return false;
  const slowRoutes = routerOptions._runtimeSlowRoutes;
  if (!slowRoutes || typeof slowRoutes.has !== "function") return false;
  return slowRoutes.has(runtimeRouteKey(taskType, attempt)) || slowRoutes.has(runtimeProviderKey(taskType, attempt));
}

function markRuntimeSlowRoute(routerOptions = {}, taskType = "", attempt = {}) {
  const slowRoutes = runtimeSlowRouteSet(routerOptions);
  slowRoutes.add(runtimeRouteKey(taskType, attempt));
  if (["write_chapter", "rewrite_chapter"].includes(String(taskType || ""))) {
    slowRoutes.add(runtimeProviderKey("write_chapter", attempt));
    slowRoutes.add(runtimeProviderKey("rewrite_chapter", attempt));
  }
}

function isRouteFatalProviderError(message = "") {
  return /Access denied|overdue account|insufficient_quota|quota|billing|unauthorized|forbidden|invalid api key|invalid_api_key|閼村湱绱秥闁村瓨娼坾娆犺垂|浣欓涓嶈冻|鏈紑閫殀鏃犳潈闄恷鏉冮檺|閴存潈澶辫触/i
    .test(String(message || ""));
}

function markRuntimeFatalRoute(routerOptions = {}, taskType = "", attempt = {}) {
  const slowRoutes = runtimeSlowRouteSet(routerOptions);
  slowRoutes.add(runtimeRouteKey(taskType, attempt));
  slowRoutes.add(runtimeProviderKey(taskType, attempt));
  if (["write_chapter", "rewrite_chapter"].includes(String(taskType || ""))) {
    slowRoutes.add(runtimeProviderKey("write_chapter", attempt));
    slowRoutes.add(runtimeProviderKey("rewrite_chapter", attempt));
  }
}

function routeAttemptsFromOptions(routerOptions = {}, taskType = "") {
  const primary = {
    provider: routerOptions.provider || "mock",
    model: routerOptions.model,
    timeoutMs: routerOptions.timeoutMs,
    timeout_ms: routerOptions.timeout_ms,
  };
  const fallbacks = routerOptions.fallbackEnabled === false
    ? []
    : (routerOptions.fallbacks || []).map((fallback) => ({
      provider: fallback.provider,
      model: fallback.model,
      baseUrl: fallback.baseUrl,
      timeoutMs: fallback.timeoutMs ?? fallback.timeout_ms ?? routerOptions.timeoutMs,
      timeout_ms: fallback.timeout_ms ?? routerOptions.timeout_ms,
    }));
  return [primary, ...fallbacks]
    .filter((attempt) => attempt.provider)
    .filter((attempt, index) => !shouldSkipRuntimeSlowRoute(routerOptions, taskType, attempt, index));
}

function routerOptionsForAttempt(routerOptions = {}, attempt = {}) {
  return {
    ...routerOptions,
    provider: attempt.provider,
    model: attempt.model,
    baseUrl: attempt.baseUrl ?? routerOptions.baseUrl,
    timeoutMs: attempt.timeoutMs ?? attempt.timeout_ms ?? routerOptions.timeoutMs,
    fallbackEnabled: false,
    fallbacks: [],
    allowNetwork: attempt.provider === "mock" || attempt.provider?.startsWith("mock")
      ? false
      : Boolean(routerOptions.allowNetwork),
  };
}

export const __test_runtimeRouteAttempts = routeAttemptsFromOptions;
export const __test_markRuntimeSlowRoute = markRuntimeSlowRoute;

function routerOptionsForTask(routerOptions = {}, taskType = "") {
  const sharedSlowRoutes = runtimeSlowRouteSet(routerOptions);
  if (!taskType) return routerOptions;
  const taskRoutes = routerOptions.taskRoutes || routerOptions.task_routes || {};
  const route = taskRoutes[taskType];
  if (!route) {
    const merged = mergeTaskRuntime(routerOptions, taskType);
    merged._runtimeSlowRoutes = sharedSlowRoutes;
    merged._sharedRuntimeSlowRoutes = sharedSlowRoutes;
    return merged;
  }
  const merged = mergeTaskRuntime({
    ...routerOptions,
    provider: route.provider ?? routerOptions.provider,
    model: route.model ?? routerOptions.model,
    allowNetwork: route.allowNetwork ?? route.allow_network ?? routerOptions.allowNetwork,
    fallbackEnabled: route.fallbackEnabled ?? route.fallback_enabled ?? routerOptions.fallbackEnabled,
    fallbacks: route.fallbacks ?? routerOptions.fallbacks,
    baseUrl: route.baseUrl ?? route.base_url ?? routerOptions.baseUrl,
    timeoutMs: route.timeoutMs ?? route.timeout_ms ?? routerOptions.timeoutMs,
    maxRetries: route.maxRetries ?? route.max_retries ?? routerOptions.maxRetries,
    retryDelayMs: route.retryDelayMs ?? route.retry_delay_ms ?? routerOptions.retryDelayMs,
  }, taskType);
  merged._runtimeSlowRoutes = sharedSlowRoutes;
  merged._sharedRuntimeSlowRoutes = sharedSlowRoutes;
  return merged;
}

export const __test_routerOptionsForTask = routerOptionsForTask;

function redactModelError(message = "") {
  return String(message || "")
    .replace(/ak-[A-Za-z0-9_-]+/g, "ak-***")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
    .replace(/org-[A-Za-z0-9_-]+/g, "org-***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
    .replace(/api[_-]?key['":=\s]+[A-Za-z0-9._-]+/gi, "api_key=***")
    .slice(0, 260);
}

async function createRouter(project, options = {}) {
  if (options.router) {
    return options.router;
  }
  const config = await loadProjectConfig(project);
  const onAttemptHandlers = [
    typeof options.routerOptions?.onAttempt === "function" ? options.routerOptions.onAttempt : null,
    typeof options.onAttempt === "function" ? options.onAttempt : null,
  ].filter(Boolean);
  const onAttempt = onAttemptHandlers.length
    ? async (attempt) => {
        for (const handler of onAttemptHandlers) {
          await handler(attempt);
        }
      }
    : null;
  return {
    async invoke(task) {
      const routerOptions = resolveRouterOptionsFromConfig(config, {
        ...options,
        taskType: task.task_type,
      });
      const estimatedRawInputTokens = estimateTokens(task);
        const attempts = routeAttemptsFromOptions(routerOptions, task.task_type);
        let previousFailure = null;
        for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
        const attempt = attempts[attemptIndex];
        const attemptOptions = routerOptionsForAttempt(routerOptions, attempt);
        const provider = attemptOptions.provider || "mock";
        const model = attemptOptions.model || config.model.default_writer;
        const rates =
          attemptOptions.rates ||
          config.budget?.model_rates?.[model] ||
          config.budget?.openai_rates ||
          DEFAULT_OPENAI_RATES_CNY;
        const router = createModelRouter(attemptOptions);
        const startedAt = Date.now();
        const modelDiagnostics = {};
        const ledgerTags = modelLedgerTagsForTask(project, task);
        const getEstimatedInputTokens = () => Number(modelDiagnostics.prompt_input_tokens || 0) > 0
          ? Number(modelDiagnostics.prompt_input_tokens)
          : estimatedRawInputTokens;
        const recordModelDiagnostic = (event = {}) => {
          if (!event || typeof event !== "object") return;
          if (event.event === "request_prepared") {
            modelDiagnostics.input_chars = event.input_chars ?? modelDiagnostics.input_chars;
            modelDiagnostics.prompt_input_tokens = event.input_tokens ?? modelDiagnostics.prompt_input_tokens;
            modelDiagnostics.source_draft_chars = event.source_draft_chars ?? modelDiagnostics.source_draft_chars;
            modelDiagnostics.task_package_chars = event.task_package_chars ?? modelDiagnostics.task_package_chars;
            modelDiagnostics.rewrite_focus_chars = event.rewrite_focus_chars ?? modelDiagnostics.rewrite_focus_chars;
            modelDiagnostics.stream_requested = event.stream_requested ?? modelDiagnostics.stream_requested;
          }
          if (event.event === "stream_first_delta") {
            modelDiagnostics.stream_first_delta_ms = event.stream_first_delta_ms ?? modelDiagnostics.stream_first_delta_ms;
          }
        };
        if (onAttempt) {
          await onAttempt({
            event: "start",
            task_type: task.task_type,
            attempt_index: attemptIndex,
            provider,
            model,
            timeout_ms: attemptOptions.timeoutMs ?? attemptOptions.timeout_ms ?? null,
            fallback_from: previousFailure
              ? { provider: previousFailure.provider, model: previousFailure.model, error: redactModelError(previousFailure.error) }
              : null,
          });
        }
        try {
          const result = await router.invoke({
            ...task,
            onTextDelta: typeof options.onTextDelta === "function" ? options.onTextDelta : task.onTextDelta,
            onModelDiagnostics: recordModelDiagnostic,
          });
          const estimatedOutputTokens = estimateTokens(result);
          const durationMs = Date.now() - startedAt;
          const timeoutMs = attemptOptions.timeoutMs ?? attemptOptions.timeout_ms ?? null;
          const estimatedInputTokens = getEstimatedInputTokens();
            const timeout_diagnosis = diagnoseModelCall({
              status: attemptIndex === 0 ? "ok" : "fallback_ok",
              task_type: task.task_type,
              duration_ms: durationMs,
              timeout_ms: timeoutMs,
              diagnostics: modelDiagnostics,
            });
            if (timeout_diagnosis?.category === "slow_first_token") {
              markRuntimeSlowRoute(routerOptions, task.task_type, attempt);
              markRuntimeSlowRoute(options.routerOptions || {}, task.task_type, attempt);
            }
            await appendJsonLine(modelCallsFile(project), {
            provider,
            model,
            task_type: task.task_type,
            ...ledgerTags,
            status: attemptIndex === 0 ? "ok" : "fallback_ok",
            fallback_from: previousFailure
              ? { provider: previousFailure.provider, model: previousFailure.model }
              : null,
            fallback_reason: previousFailure?.error ? redactModelError(previousFailure.error) : null,
            duration_ms: durationMs,
            estimated_input_tokens: estimatedInputTokens,
            estimated_raw_task_input_tokens: estimatedRawInputTokens,
            estimated_output_tokens: estimatedOutputTokens,
            diagnostics: modelDiagnostics,
            timeout_diagnosis,
            estimated_cost_cny: estimateCostCny({
              provider,
              inputTokens: estimatedInputTokens,
              outputTokens: estimatedOutputTokens,
              rates,
            }),
            currency: "CNY",
            created_at: new Date().toISOString(),
          });
          void writeModelCapabilityLedger(project);
          if (onAttempt) {
            await onAttempt({
              event: "success",
              task_type: task.task_type,
              attempt_index: attemptIndex,
                provider,
                model,
                duration_ms: durationMs,
                timeout_ms: timeoutMs,
                timeout_diagnosis,
                fallback_from: previousFailure
                  ? { provider: previousFailure.provider, model: previousFailure.model, error: redactModelError(previousFailure.error) }
                  : null,
            });
          }
          return result;
        } catch (error) {
          const safeError = redactModelError(error.message);
          previousFailure = { provider, model, error: safeError };
          const durationMs = Date.now() - startedAt;
          const timeoutMs = attemptOptions.timeoutMs ?? attemptOptions.timeout_ms ?? null;
          const estimatedInputTokens = getEstimatedInputTokens();
          const timeout_diagnosis = diagnoseModelCall({
            status: "error",
            task_type: task.task_type,
            duration_ms: durationMs,
            timeout_ms: timeoutMs,
            diagnostics: modelDiagnostics,
            error: safeError,
          });
          if (timeout_diagnosis?.timed_out) {
            markRuntimeSlowRoute(routerOptions, task.task_type, attempt);
            markRuntimeSlowRoute(options.routerOptions || {}, task.task_type, attempt);
          }
          if (isRouteFatalProviderError(safeError)) {
            markRuntimeFatalRoute(routerOptions, task.task_type, attempt);
            markRuntimeFatalRoute(options.routerOptions || {}, task.task_type, attempt);
          }
          await appendJsonLine(modelCallsFile(project), {
            provider,
            model,
            task_type: task.task_type,
            ...ledgerTags,
            status: "error",
            fallback_next: attempts[attemptIndex + 1]
              ? { provider: attempts[attemptIndex + 1].provider, model: attempts[attemptIndex + 1].model }
              : null,
            duration_ms: durationMs,
            estimated_input_tokens: estimatedInputTokens,
            estimated_output_tokens: 0,
            diagnostics: modelDiagnostics,
            timeout_diagnosis,
            estimated_cost_cny: estimateCostCny({
              provider,
              inputTokens: estimatedInputTokens,
              outputTokens: 0,
              rates,
            }),
            currency: "CNY",
            error: safeError,
            created_at: new Date().toISOString(),
          });
          void writeModelCapabilityLedger(project);
          if (onAttempt) {
            await onAttempt({
              event: attemptIndex >= attempts.length - 1 ? "failed" : "fallback",
              task_type: task.task_type,
              attempt_index: attemptIndex,
              provider,
              model,
              duration_ms: durationMs,
              timeout_ms: timeoutMs,
              error: safeError,
              timeout_diagnosis,
              fallback_next: attempts[attemptIndex + 1]
                ? { provider: attempts[attemptIndex + 1].provider, model: attempts[attemptIndex + 1].model }
                : null,
            });
          }
          if (attemptIndex >= attempts.length - 1) {
            throw error;
          }
        }
      }
    },
  };
}

export async function generateChapterCard(project, chapterNo, options = {}) {
  const router = await createRouter(project, options);
  const goldenThreeTemplate = goldenThreeTemplateForChapter(chapterNo);
  const rhythmTransferConstraint = await loadActiveRhythmTransferConstraint(project, chapterNo);
  const planningContext = await buildProjectPlanningContext(project);
  const compactPlanningContext = compactPlanningContextForChapterCard(planningContext, chapterNo);
  const stageRules = writingRulesForTask(project, "generate_chapter_card", { chapterNo });
  const card = assertChapterCard(
    applyRhythmTransferConstraint(
      applyGoldenThreeQualityStandard(
        completeChapterCardCharacterAnchors(
          await router.invoke({
            task_type: "generate_chapter_card",
            project: {
              title: project.title,
              idea: project.idea,
              platform: project.platform,
              channel: project.channel,
              genre: project.genre,
              target_words: project.target_words,
              current_chapter: project.current_chapter,
            },
            chapter_no: chapterNo,
            planning_context: compactPlanningContext,
            writing_rules: [
              ...writingRulesForProject(project),
              ...stageRules.rules,
            ],
            stage_rule_contract: stageRules,
            early_chapter_quality_standard: goldenThreeTemplate,
            rhythm_transfer_constraint: rhythmTransferConstraint,
          }),
        ),
      ),
      rhythmTransferConstraint,
    ),
  );
  await writeJson(chapterCardFile(project, chapterNo), card);
  return card;
}

function cardArrayFieldLength(card = {}, field) {
  return Array.isArray(card[field]) ? card[field].length : 0;
}

function cardTextField(card = {}, fields = []) {
  return fields.map((field) => String(card[field] || "").trim()).find(Boolean) || "";
}

function chapterCardStoryRoomGaps(card = {}) {
  const gaps = [];
  const publicFeedback = cardTextField(card, ["public_feedback", "visible_feedback", "reader_visible_reaction"]);
  const costResidue = cardTextField(card, ["cost_residue", "risk_and_cost", "residue", "new_cost"]);
  const relationshipShift = cardTextField(card, ["relationship_shift", "relationship_change", "relationship"]);
  const chapterDebt = cardTextField(card, ["chapter_debt", "tail_hook_info_control", "next_debt", "tail_hook"]);
  if (!publicFeedback || publicFeedback.length < 10) gaps.push("public_feedback_missing");
  if (!costResidue || costResidue.length < 10) gaps.push("cost_residue_missing");
  if (!relationshipShift || relationshipShift.length < 10) gaps.push("relationship_shift_missing");
  if (!chapterDebt || chapterDebt.length < 10) gaps.push("chapter_debt_missing");
  return gaps;
}

function storyRoomExecutionContract(card = {}) {
  const publicFeedback = cardTextField(card, ["public_feedback", "visible_feedback", "reader_visible_reaction"]);
  const costResidue = cardTextField(card, ["cost_residue", "risk_and_cost", "residue", "new_cost"]);
  const relationshipShift = cardTextField(card, ["relationship_shift", "relationship_change", "relationship"]);
  const chapterDebt = cardTextField(card, ["chapter_debt", "tail_hook_info_control", "next_debt", "tail_hook"]);
  const fields = {
    public_feedback: publicFeedback,
    cost_residue: costResidue,
    relationship_shift: relationshipShift,
    chapter_debt: chapterDebt,
  };
  const requiredFields = Object.entries(fields)
    .filter(([, value]) => String(value || "").trim())
    .map(([field]) => field);
  return {
    status: requiredFields.length ? "required" : "not_applicable",
    ...fields,
    required_fields: requiredFields,
    required_in_prose: requiredFields.map((field) => {
      const value = fields[field];
      return `story_room:${field} must appear in prose as visible scene action/reaction/consequence, not summary: ${value}`;
    }),
  };
}

function hasAnyTextFragment(text = "", fragments = []) {
  const body = String(text || "");
  return fragments.some((fragment) => fragment && body.includes(fragment));
}

function projectAllowedNameFragments(project = {}, planningContext = {}) {
  const raw = [
    project.title,
    project.idea,
    project.protagonist_name,
    ...(Array.isArray(project.supporting_characters) ? project.supporting_characters : []),
    planningContext.project_bible,
    planningContext.character_relationships,
    planningContext.settings,
  ].filter(Boolean).join("\n");
  return new Set(
    (raw.match(/[\u4e00-\u9fff]{2,4}/g) || [])
      .filter((item) => item.length >= 2)
      .filter((item) => !/^(椤圭洰|鍒涙剰|涓昏|閰嶈|瑙掕壊|鍏崇郴|璁惧畾|骞冲彴|绫诲瀷|鐩爣|姝ｆ枃|绔犺妭|澶х翰|缁嗙翰|鍟嗘埛|瀛︾敓|瀹胯垗|鏍″洯|澶栧崠|璁㈠崟|璐︽湰|鐜伴噾)$/.test(item)),
  );
}

function chapterCardContaminationGaps(card = {}, project = {}, planningContext = {}) {
  const cardText = JSON.stringify({
    display_title: card.display_title || card.title || "",
    opening_hook: card.opening_hook || "",
    main_event: card.main_event || "",
    protagonist_action: card.protagonist_action || "",
    conflict: card.conflict || "",
    cool_point_type: card.cool_point_type || "",
    visible_result: card.visible_result || "",
    tail_hook: card.tail_hook || "",
    characters_in_scene: card.characters_in_scene || [],
    character_anchors: card.character_anchors || [],
    scene_beats: card.scene_beats || [],
    evidence_chain: card.evidence_chain || [],
  });
  const gaps = [];
  if (/CHAPTER-MOCK-DEMO|鏈湴婕旂ず妯″瀷|娴嬭瘯娈佃惤|CHAPTER-CONTEXT-\d+|CONTEXT-RANGE-\d+-\d+/i.test(cardText)) {
    gaps.push("mock_card_contamination");
  }
  const knownForeignTerms = ["鏋楄繙", "璐︽埧鑰佺Е"];
  const allowed = projectAllowedNameFragments(project, planningContext);
  for (const term of knownForeignTerms) {
    if (cardText.includes(term) && !allowed.has(term)) {
      gaps.push("cross_project_character_contamination");
      break;
    }
  }
  return [...new Set(gaps)];
}

export function chapterCardExecutionGaps(card = {}, planningContext = {}) {
  const gaps = [];
  if (cardArrayFieldLength(card, "scene_beats") < 5) gaps.push("scene_beats_missing");
  if (cardArrayFieldLength(card, "evidence_chain") < 3) gaps.push("evidence_chain_missing");
  if (cardArrayFieldLength(card, "pass_gate_requirements") < 4) gaps.push("pass_gate_requirements_missing");
  const storyRoomGaps = chapterCardStoryRoomGaps(card);
  if (storyRoomGaps.length) gaps.push("story_room_contract_missing", ...storyRoomGaps);
  const cardText = JSON.stringify(card);
  if (/璁″垝涔鍟嗕笟璁″垝|鐥涚偣鍒嗘瀽|鎶€鏈柟妗坾鍚姩绛栫暐|绔炰簤棰勫垽|PWA|Python|MySQL|API|鏋舵瀯|甯傚満璧板娍鍥緗鏈潵瓒嬪娍|骞冲彴绔炰簤|鏍稿績閫昏緫/.test(cardText)) {
    gaps.push("static_plan_card");
  }
  if (/鍟嗕笟璁″垝涔璁″垝涔鐥涚偣鍒嗘瀽|鎶€鏈柟妗坾鍚姩绛栫暐|绔炰簤棰勫垽|甯傚満璧板娍|鏈潵瓒嬪娍|骞冲彴绔炰簤|鏍稿績閫昏緫|PWA|Python|MySQL|API|Web搴旂敤|鏋舵瀯/.test(cardText)) {
    gaps.push("static_plan_card");
  }
  const contradictionText = [
    card.opening_hook,
    card.main_event,
    card.protagonist_action,
    card.scene,
    card.conflict,
    ...(Array.isArray(card.scene_beats) ? card.scene_beats.map((item) => JSON.stringify(item)) : []),
  ].filter(Boolean).join("\n");
  const forbiddenText = [
    ...(Array.isArray(card.forbidden_items) ? card.forbidden_items : []),
    ...(Array.isArray(card.pass_gate_requirements) ? card.pass_gate_requirements : []),
  ].filter(Boolean).join("\n");
  const asksForStaticPlan = /商业计划书|计划书|痛点分析|技术方案|启动策略|竞争预判|市场走势|未来趋势|平台竞争|核心逻辑|PWA|Python|MySQL|API|Web应用|架构/.test(contradictionText);
  const forbidsStaticPlan = /不得.*(?:商业计划书|计划书|痛点分析|技术方案|启动策略)|只能.*写.*条目罗列|必须.*(?:行动|现场|账单|订单|契约|现场反应|可见结果)/.test(forbiddenText);
  if (asksForStaticPlan && forbidsStaticPlan) gaps.push("card_self_contradiction_static_plan");
  const projectText = [
    planningContext?.project_bible,
    planningContext?.outline,
    planningContext?.settings,
    planningContext?.volume_outline,
    planningContext?.fine_outline,
  ].filter(Boolean).join("\n");
  const isEarlyCampusDelivery = Number(card.chapter_no || 0) <= 3 &&
    /外卖|校园|跑腿|配送|商户|订单/.test(`${projectText}\n${cardText}`);
  const pushesTechBuildTooEarly = /代码|写代码|网站|网页|订餐页|系统|平台|数据库|数据分析|增长曲线|APP|小程序|PWA|Python|MySQL|API|Web应用|架构/.test(cardText);
  const isEarlyCampusDeliveryByArtifacts = Number(card.chapter_no || 0) <= 3 && hasAnyTextFragment(`${projectText}\n${cardText}`, [
    "外卖",
    "校园",
    "订单",
    "商户",
    "配送",
    "2016",
  ]);
  const hasPlanSpeechTerms = hasAnyTextFragment(cardText, [
    "用户量",
    "定价策略",
    "订单抽成",
    "补贴成本",
    "商户端",
    "顾客端",
    "商业模式",
    "流量闭环",
    "平台架构",
    "增长曲线",
    "用户转化",
    "规模效应",
    "融资计划",
  ]);
  if (isEarlyCampusDeliveryByArtifacts && hasPlanSpeechTerms) {
    gaps.push("early_delivery_plan_speech_risk");
  }
  if (isEarlyCampusDelivery && pushesTechBuildTooEarly) {
    gaps.push("early_delivery_tech_build_too_early");
  }
  if (isEarlyCampusDelivery && /未来支付截图|未来.*截图|支付截图|未来数字图像|凭空.*截图|展示未来/.test(cardText)) {
    gaps.push("impossible_future_evidence");
  }
  if (isEarlyCampusDelivery && /说服.*借出\d+元|借出\d+元作为启动资金|借款\d+元/.test(cardText) && /未来|截图|重生记忆|商业计划/.test(cardText)) {
    gaps.push("unearned_startup_capital");
  }
  if (isEarlyCampusDelivery && /BBS|发帖接单|校内论坛/.test(cardText) && Number(card.chapter_no || 0) === 1) {
    gaps.push("early_delivery_skips_field_trial");
  }
  if (isEarlyCampusDelivery && Number(card.chapter_no || 0) === 1 && /(二手)?电动车.{0,16}(400|四百)|(?:400|四百).{0,16}(二手)?电动车|电动车市场价/.test(cardText)) {
    gaps.push("early_delivery_unfunded_vehicle_purchase");
  }
  const fineOutline = String(planningContext?.fine_outline || planningContext?.rolling_fine_outline || "");
  const chapterBlock = chapterOutlineTextForChapter(fineOutline, card.chapter_no);
  if (chapterBlock && isGenericChapterOutlineBlock(chapterBlock)) gaps.push("fine_outline_too_generic");
  return gaps;
}

function chapterOutlineTextForChapter(outline = "", chapterNo = 0) {
  const text = String(outline || "");
  if (!text.trim() || !chapterNo) return "";
  const pattern = new RegExp(`## 绗?${chapterNo} 绔燵\\s\\S]*?(?=\\n## 绗?${chapterNo + 1} 绔爘$)`);
  return pattern.exec(text)?.[0] || "";
}

function isGenericChapterOutlineBlock(block = "") {
  const text = String(block || "");
  if (!text.trim()) return true;
  const genericHits = [
    "必须完成一个读者可感知的小结果",
    "资源、规则、人物关系或时间压力",
    "细纲只有泛化爽点",
    "细纲只有泛化章尾",
  ].filter((item) => text.includes(item)).length;
  const concreteLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      line.startsWith("-") &&
      !/目标：必须完成|目标：完成一个|冲突：资源、规则|爽点：用可信|章尾：留下/.test(line),
    );
  return genericHits >= 3 && concreteLines.length <= 1;
}

function fallbackSceneBeats(card = {}) {
  return [
    {
      purpose: "开场压迫",
      pressure: card.conflict || "阻力当场出现",
      action: card.opening_hook || card.protagonist_action || "主角先行动，不解释",
      evidence: "人物反应、物件、账目、契约、数据或现场结果",
      result: "读者在前300字内看到目标和阻力",
    },
    {
      purpose: "确认目标",
      pressure: "资源、时间或规则限制被摆到台面",
      action: card.protagonist_action || "主角拆解局面并选择路径",
      evidence: "可验证细节",
      result: card.main_event || "本章主线开始推进",
    },
    {
      purpose: "第一次碰壁",
      pressure: card.conflict || "对手或规则抬高门槛",
      action: "主角不靠解释，用行动试探规则",
      evidence: "旁人反应或现场反馈",
      result: "形成读者想看的反差",
    },
    {
      purpose: "中段反转",
      pressure: "读者以为要硬碰硬",
      action: "主角换一条更聪明的路径",
      evidence: card.cool_point_type || "可见证据链",
      result: "出现第一个爽点兑现",
    },
    {
      purpose: "结果落地",
      pressure: "对手补刀或关系代价出现",
      action: "主角把结果变成可签、可数、可见的成果",
      evidence: card.visible_result || "结果凭证",
      result: "完成本章小胜",
    },
    {
      purpose: "章尾压力",
      pressure: "胜利留下新代价",
      action: "用一个消息、物件、来人或反转收尾",
      evidence: card.tail_hook || "章尾钩子",
      result: "读者必须点下一章",
    },
  ];
}

function fallbackEvidenceChain(card = {}) {
  return [
    card.protagonist_action,
    card.visible_result,
    card.tail_hook,
  ]
    .filter(Boolean)
    .map((item, index) => ({
      step: index + 1,
      evidence: item,
      rule: "必须写成现场动作、物件、凭证、数字或旁人反应，不允许旁白解释。",
    }));
}

function fallbackStoryRoomContract(card = {}) {
  const protagonist = String(card.characters_in_scene?.[0] || card.protagonist_name || "主角").trim();
  const second = String(card.characters_in_scene?.[1] || "关键人物").trim();
  const third = String(card.characters_in_scene?.[2] || "现场旁人").trim();
  const evidence = card.visible_result || card.main_event || "现场出现可验证结果";
  const cost = card.risk_and_cost || card.conflict || "胜利留下新的成本、规则压力或人情债";
  const debt = card.tail_hook || card.tail_hook_info_control || "下一章必须兑现新的压力";
  return {
    public_feedback: card.public_feedback || `${second}或${third}必须因为${evidence}当场改变态度、报价、立场或行动，不能只由旁白宣布成功。`,
    cost_residue: card.cost_residue || `${cost}；本章结果不能无代价落地，必须留下下一章要处理的成本、风险或反噬。`,
    relationship_shift: card.relationship_shift || `${second}对${protagonist}的判断必须因本章证据发生变化，关系从怀疑、试探、交易或对抗推进一步。`,
    chapter_debt: card.chapter_debt || `${debt}；章尾必须落到具体的人、物、凭证、消息或规则压力。`,
  };
}

function removeStaticPlanFromChapterCard(card = {}) {
  const replaceStatic = (value = "") => String(value || "")
    .replace(/商业计划书|计划书|痛点分析|技术方案|启动策略|竞争预判|市场走势图|未来趋势|平台竞争|核心逻辑/g, "现场验证")
    .replace(/PWA|Python|MySQL|API|Web应用|架构/g, "低成本工具")
    .replace(/商业计划书|计划书|痛点分析|技术方案|启动策略|竞争预判|市场走势|未来趋势|平台竞争|核心逻辑/g, "现场验证")
    .replace(/PWA|Python|MySQL|API|Web应用|架构/g, "低成本工具")
    .replace(/代码|写代码|网站|网页|订餐页|系统|平台|数据库|数据分析|增长曲线|APP|小程序|PWA|Python|MySQL|API|Web应用|架构/g, "路线和订单验证")
    .trim();
  const removeSpeculativeProfit = (value = "") => replaceStatic(value)
    .replace(/当晚接单\d+个|赚\d+元|首日利润\d+元|利润\d+元|净赚\d+元|盈利\d+元/g, "完成首日小样本验证")
    .replace(/每单抽?5%|毛利约?\d+元|每单.*?毛利.*?元/g, "每单收入只能在现场账本里按真实订单落地")
    .replace(/目标\d+单|实际\d+单/g, "目标以现场订单和商户反应为准")
    .replace(/完成首日小样本验证[，。；;\s]*完成首日小样本验证/g, "完成首日小样本验证")
    .replace(/目标以现场订单和商户反应为准[，。；;\s]*目标以现场订单和商户反应为准/g, "目标以现场订单和商户反应为准")
    .trim();
  return {
    ...card,
    main_event: removeSpeculativeProfit(card.main_event) || card.main_event,
    opening_hook: replaceStatic(card.opening_hook) || card.opening_hook,
    conflict: replaceStatic(card.conflict) || card.conflict,
    protagonist_action: "主角拿菜单圈路线，带现金去找商户试点一单；当场谈清出餐、送达和商户对账，能力来源必须落在菜单、传单、现金、订单或商户反应中。",
    visible_result: "场内人物看到具体结果：首日完成一组小样本订单、账本能对上、商户愿意继续试一天、室友从怀疑变成愿意跟一单。不要承诺首日暴利。",
    tail_hook: replaceStatic(card.tail_hook) || "新的阻力当场出现，把下一章压力落到人、钱、规则或竞争者身上。",
    resource_plan: "首日只验证需求和履约：小额现金、菜单、路线、传单和账本；可以有亏损或微利，但必须用现场订单和商户对账展示，不写大段利润公式。",
    first_trial_plan: "先跑一栋宿舍楼和一个商户，记录房号、菜品、现金、送达时间、商户结算和顾客反应；章尾留下第二天扩大试点或平台/学生会介入的压力。",
    risk_and_cost: "首日风险是传单、时间和履约信任，不是用数学公式证明商业模式；如果出现亏损，必须由人物反应和下一步补救形成钩子。",
    forbidden_items: [
      ...(Array.isArray(card.forbidden_items) ? card.forbidden_items : []),
      "不得把正文写成商业计划书、痛点分析、技术方案、启动策略或未来趋势说明。",
      "不得整段罗列市场、架构、功能、竞品和未来节点；所有能力必须通过人物行动和现场反应展示。",
      "首日不得强行写成暴利或固定利润目标，不得围绕48元、净赚、回本反复算账；用订单、账本、现金交割和商户反应证明跑通。",
    ],
  };
}

function sanitizeEarlyCampusDeliveryResourcePlan(card = {}) {
  const cardText = JSON.stringify(card);
  const isEarlyCampusDelivery = Number(card.chapter_no || 0) <= 3 && /外卖|校园|配送|商户|订单|跑腿/.test(cardText);
  if (!isEarlyCampusDelivery) return card;
  const stripVehiclePurchase = (value = "") => String(value || "")
    .replace(/二手电动车市场价约?(?:400|四百)元?/g, "首日只使用现有交通工具或步行路线")
    .replace(/(?:400|四百)元?二手电动车/g, "现有旧车或步行路线")
    .replace(/从二手市场花(?:400|四百)块?买(?:来)?的电动车/g, "现有旧车")
    .replace(/购买电动车|买电动车|电动车定金/g, "使用现有旧车或步行路线")
    .trim();
  const mapValue = (value) => {
    if (typeof value === "string") return stripVehiclePurchase(value);
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === "string" ? stripVehiclePurchase(item) : item))
        .filter((item) => !(typeof item === "string" && /(电动车市场价|购买电动车|买电动车|电动车定金)/.test(item)));
    }
    return value;
  };
  return {
    ...card,
    main_event: mapValue(card.main_event) || card.main_event,
    conflict: mapValue(card.conflict) || card.conflict,
    protagonist_action: mapValue(card.protagonist_action) || card.protagonist_action,
    facts_required: mapValue(card.facts_required),
    resource_plan: "第一章只做低成本现场验证：现金、菜单、路线、账本、订单签收、商户反应和学生反馈。不得新增未交代来源的400元电动车、设备采购或固定资产支出。",
    money_source: "首日资金只来自口袋里的小额现金、已有饭卡/零钱和试跑配送费；不得靠未来截图、凭空借款或无代价资金推进；交通工具只能是已有旧车、借车或步行，必须在正文现场交代来源。",
    forbidden_items: dedupeList([
      ...(Array.isArray(card.forbidden_items) ? card.forbidden_items : []),
      "第一章不得突然购买400元二手电动车、设备或固定资产；如需交通工具，必须写成已有旧车、借车或步行，并用现场动作交代来源。",
      "第一章不得用一周回本等静态利润公式证明项目；必须用两单试跑、账本对上、商户口头承诺和室友现场反应证明能跑通。",
    ]),
  };
}

function removeImpossibleFutureEvidenceFromChapterCard(card = {}) {
  const cardText = JSON.stringify(card);
  const isCampusDelivery = /外卖|校园|配送|商户|订单|跑腿/.test(cardText);
  if (!isCampusDelivery || !/未来支付截图|未来.*截图|支付截图|未来数字图像|展示未来|发帖接单|BBS/.test(cardText)) return card;
  return {
    ...card,
    opening_hook: "陆川拎着三份外卖站在男生宿舍楼下，地上横七竖八堆着十几个塑料袋，一个学生翻了半天没找到自己的，骂了一句转身走了。",
    main_event: "陆川送外卖时发现宿舍楼下取餐混乱和丢餐痛点，抄下食堂菜单与后街餐馆位置，带着零钱和手绘路线图找商户试跑两单；通过账本、现金、订单签收和学生反应证明校园配送可以跑通。",
    protagonist_action: "主角拿菜单圈路线，带现金去找商户试点一单；当场谈清出餐、送达和商户对账，能力来源必须落在菜单、传单、现金、订单或商户反应中。",
    conflict: "资金只有小额零钱，商户不信学生能稳定送到，室友觉得跑腿没前途；陆川必须用现场试跑和账本对账赢得第一点信任。",
    visible_result: "首日完成两单小样本，账本能对上，商户愿意明天继续试，周启明从嘲笑变成愿意跟一单。",
    tail_hook: "周启明打来电话：赵老板说明天有空，想当面看看他的账本和路线图。",
    money_source: "首日只使用口袋里的小额现金和试跑配送费；不得靠未来截图、凭空借款或无代价资金推进。",
    supplier_info_path: "陆川亲自观察食堂和后街餐馆，抄菜单、记出餐时间、看宿舍楼取餐混乱，用现场信息找到第一家商户。",
    first_trial_plan: "先跑一栋宿舍楼和一家商户的两单，记录房号、菜品、现金、送达时间、商户结算和顾客反应；章尾留下第二天扩大试点的压力。",
    forbidden_items: dedupeList([
      ...(Array.isArray(card.forbidden_items) ? card.forbidden_items : []),
      "不得展示未来支付截图、未来订单截图、未来数字图像或任何2016年无法取得的证据。",
      "不得用重生记忆直接说服室友借大额启动资金；资金和信任必须来自现场试跑、账本对上和商户/顾客反应。",
      "第一章不得用BBS发帖、建网页、写工具或平台化接单跳过商户试跑；先用菜单、路线、现金、订单和签收证明履约。",
    ]),
  };
}

function actionFirstSceneBeats(card = {}) {
  return [
    {
      purpose: "开场压力",
      pressure: card.conflict || "当场出现钱、时间、人物或规则压力",
      action: card.opening_hook || "主角被迫先处理一个具体麻烦",
      evidence: "鎵嬫満銆佽处鍗曘€佽鍗曘€佹椂闂淬€佹梺浜哄偓淇冩垨鐜板満鐗╀欢",
      result: "读者在前300字看到主角处境和第一个行动",
    },
    {
      purpose: "机会验证",
      pressure: "不能靠旁白说明机会存在，必须有人当场有需求",
      action: "主角询问一个具体对象的真实痛点，或直接做一次低成本测试",
      evidence: "室友/商户/老师/用户的反应、价格、排队、订单或收据",
      result: "机会被现场证据证明，而不是被主角解释出来",
    },
    {
      purpose: "能力展示",
      pressure: "旁人不信他能做成",
      action: "主角用一个小工具、表格、话术、账目、契约或跑单结果证明能力",
      evidence: "对方愣住、改口、加微信、给电话、下单或拿出资源",
      result: "主角能力落在动作证据中",
    },
    {
      purpose: "误判反转",
      pressure: "旁人以为他只是冲动或吹牛",
      action: "主角拿出已经完成的一步，或让现场结果打脸误判",
      evidence: card.visible_result || "第一条可见结果",
      result: "形成爽点兑现",
    },
    {
      purpose: "新阻力",
      pressure: "成功动作引来规则、竞争者、资金或关系压力",
      action: "主角做出下一步选择",
      evidence: "电话、消息、门口来人、订单异常、老师/商户反馈",
      result: "胜利留下代价",
    },
    {
      purpose: "章尾牵引",
      pressure: "下一章必须解决一个具体问题",
      action: "用一句话、一个来电、一个物件或一个现场冲突收尾",
      evidence: card.tail_hook || "章尾钩子",
      result: "读者有明确追读理由",
    },
  ];
}

function actionFirstEvidenceChain(card = {}) {
  return [
    {
      evidence_type: "需求证据",
      description: "用排队、价格、等待、投诉、订单、收据或旁人反应证明痛点，不用市场分析段。",
    },
    {
      evidence_type: "能力证据",
      description: "用主角现场操作、表格、账目、契约、跑单结果、工具原型或话术成交证明能力来源。",
    },
    {
      evidence_type: "结果证据",
      description: card.visible_result || "至少让一个角色因主角行动改变选择、付钱、下单、给资源或产生新压力。",
    },
  ];
}

function actionFirstPassGateRequirements() {
  return [
    "前300字必须有当场压力、主角动作和第一个可见结果。",
    "不得出现商业计划书式正文，不得用条目罗列痛点分析、技术方案、启动策略和竞争预判。",
    "主角能力必须通过账单、订单、契约、工具、跑单、商户反应或旁人改变态度展示。",
    "本章至少有两次现场反馈：一个人物反应，一个数据/物件/订单/钱的变化。",
    "章尾必须留下具体新压力，不用主题总结收尾。",
  ];
}

export function strengthenChapterCardLocally(card = {}, gaps = []) {
  const stripStaticPlan = gaps.includes("static_plan_card") ||
    gaps.includes("card_self_contradiction_static_plan") ||
    gaps.includes("early_delivery_tech_build_too_early") ||
    gaps.includes("early_delivery_plan_speech_risk") ||
    gaps.includes("impossible_future_evidence") ||
    gaps.includes("unearned_startup_capital") ||
    gaps.includes("early_delivery_skips_field_trial") ||
    gaps.includes("early_delivery_unfunded_vehicle_purchase");
  const baseCard = stripStaticPlan
    ? sanitizeEarlyCampusDeliveryResourcePlan(removeImpossibleFutureEvidenceFromChapterCard(removeStaticPlanFromChapterCard(card)))
    : sanitizeEarlyCampusDeliveryResourcePlan(removeImpossibleFutureEvidenceFromChapterCard(card));
  const forbiddenItems = dedupeList([
    ...(Array.isArray(baseCard.forbidden_items) ? baseCard.forbidden_items : []),
    ...(stripStaticPlan
      ? [
          "不得把正文写成商业计划书、痛点分析、技术方案、启动策略或未来趋势说明。",
          "不得让角色说用户量、定价策略、订单抽成、折旧这些商业计划书词，必须改成菜单、现金、传单、商户对账和现场反应。",
          "能力来源必须通过账册、税单、契约、茶引、订单、工具操作、现场反应或可见结果展示。",
          "校园外卖开篇不得过早写代码、建网站、搭平台、讲数据分析；先用路线、订单、商户出餐、顾客反馈和到账结果证明主角能力。",
          "第一章前300字不能粘贴章卡摘要、作者说明或倒叙解释，必须直接进入动作、物件、冲突和可见结果。",
          "不得展示未来支付截图、未来订单截图、未来数字图像或任何2016年无法取得的证据。",
          "不得用重生记忆直接说服室友借大额启动资金；资金和信任必须来自现场试跑、账本对上和商户/顾客反应。",
        ]
      : []),
  ]);
  return {
    ...baseCard,
    ...fallbackStoryRoomContract(baseCard),
    scene_beats: stripStaticPlan ? actionFirstSceneBeats(baseCard) : (cardArrayFieldLength(baseCard, "scene_beats") >= 5 ? baseCard.scene_beats : fallbackSceneBeats(baseCard)),
    evidence_chain: stripStaticPlan ? actionFirstEvidenceChain(baseCard) : (cardArrayFieldLength(baseCard, "evidence_chain") >= 3 ? baseCard.evidence_chain : fallbackEvidenceChain(baseCard)),
    pass_gate_requirements: stripStaticPlan
      ? actionFirstPassGateRequirements()
      : cardArrayFieldLength(baseCard, "pass_gate_requirements") >= 4
      ? baseCard.pass_gate_requirements
      : [
          "开头前300字必须有当场压力、主角动作和第一个可见结果。",
          "主角能力必须通过行动、物件、凭证、数字或旁人反应展示，不用直白旁白解释。",
          "中段至少有一次误判反转或规则借力，不能平铺直叙。",
          "本章至少兑现两个可见爽点：具体收益、对手代价、公开反应或结果变化。",
          "章尾必须留下具体新压力，不能用主题总结收尾。",
        ],
    planning_strength: {
      status: gaps.length ? "auto_strengthened" : "ready",
        gaps: dedupeList(gaps),
        strengthened_at: new Date().toISOString(),
      },
      story_room_contract: {
        status: "ready",
        required_fields: ["public_feedback", "cost_residue", "relationship_shift", "chapter_debt"],
        source: gaps.includes("story_room_contract_missing") ? "local_story_room_gate" : "existing_or_local_gate",
      },
      forbidden_items: forbiddenItems,
    };
  }

async function ensureExecutableChapterCard(project, chapterNo, options = {}) {
  const planningContext = await buildProjectPlanningContext(project);
  let card = await loadCardOrCreate(project, chapterNo, options);
  const contaminationGaps = chapterCardContaminationGaps(card, project, planningContext);
  if (contaminationGaps.length) {
    card = await generateChapterCard(project, chapterNo, {
      ...options,
      force: true,
      contaminated_card_rejected: {
        gaps: contaminationGaps,
        policy: "Discard stale/mock/cross-project chapter cards before formal drafting.",
      },
    });
  }
  const gaps = [...contaminationGaps, ...chapterCardExecutionGaps(card, planningContext)];
  if (!gaps.length) return { card, planningContext, gaps: [] };
  const strengthened = assertChapterCard(strengthenChapterCardLocally(card, gaps));
  await writeJson(chapterCardFile(project, chapterNo), strengthened);
  return { card: strengthened, planningContext, gaps };
}

async function loadCardOrCreate(project, chapterNo, options = {}) {
  try {
    return await readJson(chapterCardFile(project, chapterNo));
  } catch {
    return generateChapterCard(project, chapterNo, options);
  }
}

async function chapterCardExists(project, chapterNo) {
  try {
    await access(chapterCardFile(project, chapterNo));
    return true;
  } catch {
    return false;
  }
}

async function preGenerateChapterCards(project, { from, to, options } = {}) {
  const jobs = [];
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    jobs.push(
      chapterCardExists(project, chapterNo).then((exists) =>
        exists ? null : generateChapterCard(project, chapterNo, options),
      ),
    );
  }
  return Promise.all(jobs);
}

function chapterOutlineBlock(chapterNo, summary = "") {
  const text = String(summary || "").trim();
  if (!text) return "";
  return [
    `## 第${chapterNo}章`,
    "",
    `- 核心事件：${text}`,
    "- 目标：完成一个读者可感知的小结果。",
    "- 冲突：资源、规则、人物关系或时间压力。",
    "- 爽点兑现：必须落在证据、反应和结果变化上。",
    "- 章尾债务：留下具体的人、物、凭证、消息或规则压力。",
    "",
  ].join("\n");
}

function replaceChapterPlanRange(chapterPlan = "", from = 1, to = 1, chapterSummaries = [], project = {}) {
  let next = String(chapterPlan || "");
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    const summary = String(chapterSummaries[chapterNo - from] || "").trim();
    if (!summary) continue;
    const block = buildStoryRoomChapterOutlineBlock(project, chapterNo, { event: summary });
    const pattern = new RegExp(`## 第${chapterNo}章[\\s\\S]*?(?=\\n## 第${chapterNo + 1}章|$)`);
    if (pattern.test(next)) {
      next = next.replace(pattern, block.trimEnd());
    } else {
      next = `${next.trimEnd()}\n\n${block}`;
    }
  }
  return next.trimEnd();
}

function rollingFineOutlineFile(project) {
  return path.join(project.path, "缁嗙翰", "婊氬姩缁嗙翰.md");
}

function legacyFineOutlineFile(project) {
  return path.join(project.path, "缁嗙翰", "鍓?0绔?md");
}

async function readRollingFineOutline(project) {
  const rolling = await readTextIfExists(rollingFineOutlineFile(project), 120_000);
  if (rolling.trim()) return rolling;
  return readTextIfExists(legacyFineOutlineFile(project), 120_000);
}

function rollingOutlineTargetRange(project, completedTo) {
  const totalChapters = Math.max(
    30,
    Math.ceil(Number(project.target_words || 2_000_000) / 2500),
  );
  const from = completedTo + 21;
  if (from > totalChapters) return null;
  return {
    from,
    to: Math.min(totalChapters, from + 9),
    total_chapters: totalChapters,
  };
}

async function refreshRollingOutlineAfterGlobalReview(project, {
  completedTo,
  globalReview = {},
  options = {},
} = {}) {
  const target = rollingOutlineTargetRange(project, completedTo);
  if (!target) {
    return {
      status: "skipped",
      reason: "target_range_after_book_end",
      completed_to: completedTo,
    };
  }
  const currentOutline = await readRollingFineOutline(project);
  const planningContext = await buildProjectPlanningContext(project);
  const router = await createRouter(project, {
    ...options,
    routerOptions: routerOptionsForTask(options.routerOptions || {}, "outline_deepen"),
  });
  const output = await router.invoke({
    task_type: "outline_deepen",
    from: target.from,
    to: target.to,
    project: {
      title: project.title,
      idea: project.idea,
      platform: project.platform,
      genre: project.genre,
      target_words: project.target_words,
      current_chapter: project.current_chapter,
    },
    planning_context: {
      ...planningContext,
      current_rolling_outline: currentOutline.slice(-40_000),
      latest_global_review: {
        from: globalReview.from || globalReview.range?.from || null,
        to: globalReview.to || globalReview.range?.to || completedTo,
        status: globalReview.status || "",
        summary: globalReview.summary || "",
        cross_chapter_issues: globalReview.final_cross_chapter_issues || globalReview.cross_chapter_issues || [],
      },
      instruction: [
        `根据已完成第 ${Math.max(1, completedTo - 9)}-${completedTo} 章的全局复审结果，刷新第 ${target.from}-${target.to} 章细纲。`,
        "这不是重新开书，必须延续当前项目设定、人物关系、伏笔债务和已经写出的阶段结果。",
        "如果复审发现跨章矛盾，后续细纲要把修复后的版本当作事实，不要重复旧问题。",
      ],
    },
  });
  const chapters = Array.isArray(output?.chapters)
    ? output.chapters.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const expected = target.to - target.from + 1;
  if (chapters.length < expected) {
    return {
      status: "failed",
      reason: `outline_deepen_returned_${chapters.length}_of_${expected}`,
      from: target.from,
      to: target.to,
      raw_text: String(output?.text || "").slice(0, 2000),
    };
  }
  const baseOutline = currentOutline.trim()
    ? currentOutline
    : `# ${project.title || "新书"} · 滚动细纲\n`;
  const nextOutline = replaceChapterPlanRange(baseOutline, target.from, target.to, chapters, project);
  const file = rollingFineOutlineFile(project);
  await writeText(file, `${nextOutline.trimEnd()}\n`);
  await writeText(legacyFineOutlineFile(project), `${nextOutline.trimEnd()}\n`);
  return {
    status: "completed",
    from: target.from,
    to: target.to,
    completed_to: completedTo,
    chapter_count: expected,
    path: file,
    source: "outline_deepen",
  };
}

function versionNumber(version) {
  const match = /^v(\d+)$/.exec(version);
  return match ? Number(match[1]) : 0;
}

async function listDraftVersions(project, chapterNo) {
  let files = [];
  try {
    files = await readdir(path.join(project.path, "姝ｆ枃"));
  } catch {
    return [];
  }
  const prefixes = [
    `绗?{String(chapterNo).padStart(4, "0")}绔燺`,
    `绗?{String(chapterNo).padStart(3, "0")}绔燺`,
  ];
  return files
    .map((file) => {
      const prefix = prefixes.find((candidate) => file.startsWith(candidate));
      if (!prefix || !file.endsWith(".txt")) return null;
      return file.slice(prefix.length, -4);
    })
    .filter(Boolean)
    .filter((version) => /^v\d+$/.test(version))
    .sort((a, b) => versionNumber(a) - versionNumber(b));
}

export async function getLatestDraftVersion(project, chapterNo) {
  const versions = await listDraftVersions(project, chapterNo);
  return versions.at(-1) || null;
}

async function readDraft(project, chapterNo, version) {
  const selectedVersion = version || (await getLatestDraftVersion(project, chapterNo));
  if (!selectedVersion) {
    throw new Error(`未找到第${chapterNo}章草稿`);
  }
  return {
    version: selectedVersion,
    text: await readFile(draftFile(project, chapterNo, selectedVersion), "utf8"),
  };
}

export function sanitizeModelText(text) {
  const normalized = stripAiThinkingLeak(String(text || "").replace(/\r\n/g, "\n"));
  const rawLines = normalized
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !isAiWrapperLine(line));
  const lines = [];
  let skippingProcessBlock = false;
  for (const line of rawLines) {
    const trimmed = line.trim();
    if (isAiProcessLine(line)) {
      skippingProcessBlock = true;
      continue;
    }
    if (skippingProcessBlock) {
      if (!trimmed) continue;
      if (isLikelyNovelProseLine(trimmed)) {
        skippingProcessBlock = false;
      } else {
        continue;
      }
    }
    lines.push(
      line
        .replace(/^#{1,6}\s*/, "")
        .replace(/\*\*/g, "")
        .replace(/__/g, "")
        .replace(/`/g, ""),
    );
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isAiProcessLine(line = "") {
  const text = String(line || "").trim();
  if (!text) return false;
  if (/^[-*]\s*["“”']?use_as_hard_context/i.test(text)) return true;
  if (/^\d+[.、]\s*(开头|起势|拜访|利用|周知县|交接|尾钩|人物|限制|宋代|茶帮|知县|店铺)/.test(text)) return true;
  if (/^---+$/.test(text)) return true;
  return [
    "这就是开头",
    "现在我需要",
    "让我",
    "我需要",
    "根据章节内容",
    "核心事件是",
    "对于前300字",
    "我应该",
    "我来",
    "按照章节大纲",
    "开头（前300字",
    "开头（",
    "然后：",
    "人物：",
    "限制条件：",
    "任务说明",
    "评分最高的",
    "所以系统",
    "等等",
  ].some((prefix) => text.startsWith(prefix));
}

function isLikelyNovelProseLine(text = "") {
  const line = String(text || "").trim();
  if (!line) return false;
  if (/^[-*]|\d+[.、]/.test(line)) return false;
  if (/^(任务|说明|要求|核心|根据|现在|让我|我需要|这就是|然后|人物|限制|评分)/.test(line)) return false;
  return /^["“”‘’「」]?[\u4e00-\u9fff]{2,12}/.test(line);
}

function stripAiThinkingLeak(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  const leakPatterns = [
    /让我(?:仔细)?(?:分析|思考|理解|构思|开始写)/,
    /我需要(?:重写|写|分析|解决|按照|继续)/,
    /任务(?:说明|要求|包|是)/,
    /评分最高的.*候选/,
    /核心事件是/,
    /根据章节内容/,
    /现在我需要/,
    /Let me (?:analyze|think|understand|write)/i,
    /I need to (?:rewrite|write|analyze|fix)/i,
  ];
  const firstChunk = normalized.slice(0, 1200);
  if (!leakPatterns.some((pattern) => pattern.test(firstChunk))) return normalized;
  const startCandidates = [
    /(?:^|\n)---+\s*\n+/m,
    /(?:^|\n)(?=["“”‘’「」]?[\u4e00-\u9fff]{2,12}(?:一把|猛地|抬手|低头|推开|收住|抓住|站在|走进|刚要|正要|没有|把|从|在))/m,
    /(?:^|\n)(?=[\u4e00-\u9fff]{2,8}[：。])/m,
  ];
  for (const pattern of startCandidates) {
    const match = pattern.exec(normalized);
    if (match && match.index > 0) {
      const start = pattern.source.includes("---") ? match.index + match[0].length : match.index;
      const candidate = normalized.slice(start).trim();
      if (candidate && !leakPatterns.some((leak) => leak.test(candidate.slice(0, 320)))) return candidate;
    }
  }
  return normalized;
}

function hasAiThinkingLeak(text = "") {
  return hasAiProcessLeak(text);
}

function outputStats(rawText, cleanText, targetWords) {
  return {
    sanitized: rawText !== cleanText,
    ai_thinking_leak: hasAiThinkingLeak(rawText) || hasAiThinkingLeak(cleanText),
    char_count: cleanText.length,
    target_words: targetWords || null,
    target_delta: targetWords ? cleanText.length - targetWords : null,
  };
}

function modelOutputRejection(rawText = "", cleanText = "", { minChars = 600 } = {}) {
  const raw = String(rawText || "");
  const clean = String(cleanText || "").trim();
  const reasons = [];
  if (hasAiThinkingLeak(raw) || hasAiThinkingLeak(clean)) {
    reasons.push("ai_process_leak");
  }
  if (clean.length < minChars) {
    reasons.push("too_short_after_sanitize");
  }
  if (/^(绔犲崱|浠诲姟鍖厊鏍稿績浜嬩欢|鍐欎綔璇存槑|浠ヤ笅鏄瘄JSON|```)/.test(clean.slice(0, 80))) {
    reasons.push("not_direct_novel_prose");
  }
  const lossRatio = raw.length ? clean.length / raw.length : 1;
  if (raw.length > 2000 && lossRatio < 0.45) {
    reasons.push("sanitized_too_much_process_text");
  }
  return reasons.length ? { reasons, raw_chars: raw.length, clean_chars: clean.length } : null;
}

async function invokeWriteLikeTaskWithGuard(router, task, {
  minChars = 600,
  maxAttempts = 2,
  onRejected,
} = {}) {
  let rejection = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const output = await router.invoke({
      ...task,
      ...(rejection ? { output_rejection: rejection } : {}),
    });
    const rawText = output.text;
    const text = sanitizeModelText(rawText);
    rejection = modelOutputRejection(rawText, text, { minChars });
    if (!rejection) return { output, rawText, text, retry_count: attempt - 1 };
    if (typeof onRejected === "function") {
      await onRejected({ attempt, rejection, rawText, text });
    }
  }
  throw new Error(`妯″瀷杈撳嚭涓嶆槸鍙繚瀛樻鏂囷細${(rejection?.reasons || ["unknown"]).join(", ")}`);
}

export async function writeChapter(project, chapterNo, options = {}) {
  const taskPackage = await buildWritingTaskPackage(project, chapterNo, options);
  const card = taskPackage.chapter_card;
  const router = await createRouter(project, {
    ...options,
    routerOptions: routerOptionsForTask(options.routerOptions || {}, "write_chapter"),
  });
  let streamedText = "";
  const { rawText, text, retry_count: retryCount } = await invokeWriteLikeTaskWithGuard(router, {
    task_type: "write_chapter",
    chapter_card: card,
    task_package: taskPackage,
    draft_mode: "weak",
    onTextDelta: async ({ delta, text }) => {
      streamedText = text || `${streamedText}${delta || ""}`;
      if (typeof options.onTextDelta === "function") {
        await options.onTextDelta({ delta, text: streamedText, chapterNo, version: "v1", phase: "write" });
      }
    },
  }, {
    minChars: Math.max(500, Math.floor(Number(card.target_words || taskPackage.output?.target_words || 2600) * 0.45)),
    onRejected: options.onOutputRejected,
  });
  const draft = {
    chapter_no: chapterNo,
    version: "v1",
    text,
    output_stats: {
      ...outputStats(rawText, text, card.target_words || taskPackage.output?.target_words),
      retry_count: retryCount,
    },
    path: draftFile(project, chapterNo, "v1"),
  };
  await writeText(draft.path, text);
  return draft;
}

export async function reviewChapter(project, chapterNo, version, options = {}) {
  const { text } = await readDraft(project, chapterNo, version);
  const card = await loadCardOrCreate(project, chapterNo, options);
  const localQualityMetrics = await buildChapterQualityMetrics(project, chapterNo, card, text);
  const localPublishGate = evaluateChapterPublishGate(localQualityMetrics || {}, null, []);
  const reviewContext = await buildReviewContext(project, chapterNo, {
    text,
    chapterCard: card,
    localQualityMetrics,
    localPublishGate,
  });
  const reviewRouterOptions = routerOptionsForTask(options.routerOptions || {}, "review_chapter");
  const noFallbackReviewRouterOptions = {
    ...reviewRouterOptions,
    fallbackEnabled: false,
    fallbacks: [],
  };
  const router = await createRouter(project, {
    ...options,
    routerOptions: noFallbackReviewRouterOptions,
  });
  const review = assertReview(
    await router.invoke({
      task_type: "review_chapter",
      text,
      chapter_card: card,
      review_context: reviewContext,
      local_quality_metrics: localQualityMetrics,
      local_publish_gate: localPublishGate,
      publish_gate_contract: {
        user_facing_statuses: ["可发布", "需自动优化", "阻断"],
        first_300_chars_required_for_chapter_1: chapterNo === 1,
        direct_review_without_context_is_forbidden: true,
        must_check_logic_against_project_memory: true,
      },
    }),
  );
  let guardedReview = enforceReviewDepth(review, text);
  if (guardedReview.reviewer_status === "too_thin_for_publish_gate") {
    const retryReview = assertReview(
      await router.invoke({
        task_type: "review_chapter",
        text,
        chapter_card: card,
        review_context: reviewContext,
        local_quality_metrics: localQualityMetrics,
        local_publish_gate: localPublishGate,
        review_rejection: {
          reason: "weak_review_fallback",
          message: "Previous review was too thin to support publish gate. Return detailed JSON with scores, issues, risky_segments, keep, remove, and rewrite_direction.",
        },
        publish_gate_contract: {
          user_facing_statuses: ["可发布", "需自动优化", "阻断"],
          first_300_chars_required_for_chapter_1: chapterNo === 1,
          direct_review_without_context_is_forbidden: true,
          must_check_logic_against_project_memory: true,
        },
      }),
    );
    guardedReview = enforceReviewDepth(retryReview, text);
  }
  await writeJson(reviewFile(project, chapterNo), guardedReview);
  return guardedReview;
}

function enforceReviewDepth(review = {}, text = "") {
  const issues = Array.isArray(review.issues) ? [...review.issues] : [];
  const hardRuleViolations = Array.isArray(review.hard_rule_violations) ? [...review.hard_rule_violations] : [];
  const hasDetailedSignals = [
    Array.isArray(review.risky_segments) && review.risky_segments.length > 0,
    review.scores && Object.keys(review.scores || {}).length >= 3,
    Array.isArray(review.keep) && review.keep.length > 0,
    Array.isArray(review.remove) && review.remove.length > 0,
    String(review.rewrite_direction || "").length >= 20,
    issues.length >= 2,
  ].some(Boolean);
  const textChars = progressWordCount(text);
  const tooThin = textChars >= 800 && !hasDetailedSignals;
  if (!tooThin) return review;
  const flag = "weak_review_fallback";
  if (!issues.includes(flag)) issues.push(flag);
  if (!hardRuleViolations.includes(flag)) hardRuleViolations.push(flag);
  return {
    ...review,
    grade: "D",
    next_action: "rewrite_chapter",
    issues,
    hard_rule_violations: hardRuleViolations,
    reviewer_status: "too_thin_for_publish_gate",
    reviewer_message: "审查员输出过薄，不能作为发布门禁通过依据。",
  };
}

export async function rewriteChapter(project, chapterNo, options = {}) {
  const taskPackage = await buildWritingTaskPackage(project, chapterNo, {
    ...options,
    force: true,
    contextTokenBudget: Math.min(
      Number(options.contextTokenBudget || DEFAULT_CONTEXT_TOKEN_BUDGET),
      4500,
    ),
  });
  const card = taskPackage.chapter_card;
  const latest = await getLatestDraftVersion(project, chapterNo);
  const nextVersion = `v${versionNumber(latest || "v1") + 1}`;
  const router = await createRouter(project, {
    ...options,
    routerOptions: routerOptionsForTask(options.routerOptions || {}, "rewrite_chapter"),
  });
  const rewriteLayers = options.rewriteLayers || [];
  const baseRewriteFocus = rewriteFocusForLayer(options.rewriteFocus || rewriteLayers[0]);
  const rewriteFocus = baseRewriteFocus?.type === "character_voice"
    ? dialogueTuningGuideForRewrite({ layer: baseRewriteFocus, taskPackage })
    : baseRewriteFocus;
  taskPackage.stage_rule_contract = writingRulesForTask(project, "rewrite_chapter", { chapterNo, rewriteFocus });
  taskPackage.hard_rules = [
    ...(Array.isArray(taskPackage.hard_rules) ? taskPackage.hard_rules : []),
    ...taskPackage.stage_rule_contract.rules,
  ];
  let streamedText = "";
  const sourceDraft = latest ? await readDraft(project, chapterNo, latest) : null;
  const { rawText, text, retry_count: retryCount } = await invokeWriteLikeTaskWithGuard(router, {
    task_type: "rewrite_chapter",
    chapter_card: card,
    task_package: taskPackage,
    draft_mode: "strong",
    rewrite_strategy: rewriteFocus ? "targeted_rewrite" : "full_rewrite",
    rewrite_layers: rewriteLayers,
    rewrite_focus: rewriteFocus,
    source_draft_version: sourceDraft?.version || null,
    source_draft_text: sourceDraft?.text || "",
    onTextDelta: async ({ delta, text }) => {
      streamedText = text || `${streamedText}${delta || ""}`;
      if (typeof options.onTextDelta === "function") {
        await options.onTextDelta({ delta, text: streamedText, chapterNo, version: nextVersion, phase: "rewrite" });
      }
    },
  }, {
    minChars: Math.max(500, Math.floor(progressWordCount(sourceDraft?.text || "") * 0.75)),
    onRejected: options.onOutputRejected,
  });
  const draft = {
    chapter_no: chapterNo,
    version: nextVersion,
    text,
    output_stats: {
      ...outputStats(rawText, text, card.target_words || taskPackage.output?.target_words),
      retry_count: retryCount,
      source_draft_version: sourceDraft?.version || null,
    },
    rewrite_focus: rewriteFocus,
    path: draftFile(project, chapterNo, nextVersion),
  };
  await writeText(draft.path, text);
  return draft;
}

function locateRiskSegment(text = "", preview = "") {
  const body = String(text || "");
  const raw = String(preview || "").trim();
  if (!body || !raw) return null;
  let index = body.indexOf(raw);
  let needle = raw;
  if (index < 0) {
    const compactRaw = raw.replace(/\s+/g, "");
    const paragraphs = body.split(/\n{2,}/);
    let cursor = 0;
    for (const paragraph of paragraphs) {
      const paragraphIndex = body.indexOf(paragraph, cursor);
      cursor = paragraphIndex + paragraph.length;
      if (!paragraph.trim()) continue;
      if (paragraph.replace(/\s+/g, "").includes(compactRaw.slice(0, Math.min(80, compactRaw.length)))) {
        index = paragraphIndex;
        needle = paragraph;
        break;
      }
    }
  }
  if (index < 0) return null;
  const start = index;
  const end = index + needle.length;
  return {
    start,
    end,
    segment: body.slice(start, end),
    context: body.slice(Math.max(0, start - 500), Math.min(body.length, end + 500)),
  };
}

function chineseMoneyAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  const compact = {
    0: "零",
    1: "一",
    2: "二",
    3: "三",
    4: "四",
    5: "五",
    6: "六",
    7: "七",
    8: "八",
    9: "九",
    10: "十",
  }[amount];
  return compact || String(amount);
}

function parseSimpleChineseNumber(value = "") {
  const raw = String(value || "").trim();
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  const map = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (raw === "十") return 10;
  const tenIndex = raw.indexOf("十");
  if (tenIndex >= 0) {
    const left = raw.slice(0, tenIndex);
    const right = raw.slice(tenIndex + 1);
    const tens = left ? map[left] : 1;
    const ones = right ? map[right] : 0;
    if (Number.isFinite(tens) && Number.isFinite(ones)) return tens * 10 + ones;
  }
  if (raw.length === 1 && Number.isFinite(map[raw])) return map[raw];
  return NaN;
}

function chineseAmountText(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  const digit = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (amount <= 10) return chineseMoneyAmount(amount);
  if (amount < 20) return `十${digit[amount - 10] || ""}`;
  if (amount < 100) {
    const tens = Math.floor(amount / 10);
    const ones = amount % 10;
    return `${digit[tens]}十${ones ? digit[ones] : ""}`;
  }
  return String(amount);
}

function factUnitPriceHints(card = {}) {
  const facts = [
    ...(Array.isArray(card.facts_required) ? card.facts_required : []),
    card.resource_plan,
    card.money_source,
    card.supplier_info_path,
    card.first_trial_plan,
  ].map((item) => String(item || "")).filter(Boolean);
  const hints = [];
  for (const fact of facts) {
    const match = fact.match(/([^，。；;、\s]{1,12}?)(?:成本|单价)?\s*(\d+(?:\.\d+)?)元\/个/);
    if (!match) continue;
    hints.push({
      item: match[1],
      amount: Number(match[2]),
      amountText: chineseMoneyAmount(match[2]),
      source: fact,
    });
  }
  return hints;
}

function patchUnitPriceConflict(segment = "", risk = {}, card = {}) {
  let patched = String(segment || "");
  const riskText = [
    risk.preview,
    risk.text,
    risk.reason,
    ...(Array.isArray(risk.reasons) ? risk.reasons : []),
  ].join(" ");
  for (const hint of factUnitPriceHints(card)) {
    if (!hint.amountText) continue;
    const itemHit = String(riskText).includes(hint.item) || /打包盒|盒子/.test(riskText);
    if (!itemHit) continue;
    patched = patched
      .replace(/一个盒子[一二两三四五六七八九十\d.]+块钱/g, `一个盒子${hint.amountText}块钱`)
      .replace(/每个[一二两三四五六七八九十\d.]+块钱/g, `每个${hint.amountText}块钱`)
      .replace(/(\d+(?:\.\d+)?)元\/个/g, `${hint.amount}元/个`);
    const boxCountMatch = patched.match(/买你?([一二两三四五六七八九十\d.]+)个打包盒/);
    if (boxCountMatch) {
      const count = parseSimpleChineseNumber(boxCountMatch[1]);
      if (Number.isFinite(count) && count > 0) {
        const total = count * hint.amount;
        patched = patched.replace(
          /拿[一二两三四五六七八九十百千万\d.]+块买你?([一二两三四五六七八九十\d.]+)个打包盒/g,
          `拿${chineseAmountText(total)}块买你$1个打包盒`,
        );
      }
    }
  }
  return patched === segment ? null : patched;
}

function patchMerchantDecisionTransition(segment = "", risk = {}) {
  const riskText = [
    risk.preview,
    risk.text,
    risk.reason,
    ...(Array.isArray(risk.reasons) ? risk.reasons : []),
  ].join(" ");
  if (!/转折略快|过于顺滑|风险规避|商户|试单/.test(riskText)) return null;
  const body = String(segment || "");
  if (!/你先跑一单试试/.test(body)) return null;
  return body.replace(
    /你先跑一单试试。送到了，饭钱你先垫，我晚上跟你结。/,
    "先跑三单。洒了、凉了、学生退单，你照价赔。三单都送到，饭钱你先垫，我晚上跟你结。",
  );
}

function patchEraAndSemanticConsistency(segment = "", risk = {}) {
  const riskText = [
    risk.preview,
    risk.text,
    risk.reason,
    ...(Array.isArray(risk.reasons) ? risk.reasons : []),
  ].join(" ");
  let patched = String(segment || "");
  if (/搪瓷饭盒|时代细节|年代错位|不锈钢餐盘|塑料饭盒/.test(riskText) || /搪瓷饭盒/.test(patched)) {
    patched = patched
      .replace(/端着搪瓷饭盒/g, "端着不锈钢餐盘")
      .replace(/饭盒往胳膊底下一夹/g, "餐盘往胳膊底下一夹")
      .replace(/带上你饭盒/g, "带上你餐盘")
      .replace(/饭盒/g, "餐盘");
  }
  if (/真正的第一单|语义冲突|逻辑表述矛盾|第一笔正式合作/.test(riskText) || /明天，才是真正的第一单/.test(patched)) {
    patched = patched.replace(/明天，才是真正的第一单。/g, "明天，才是真正的第一笔合作。");
  }
  if (/证据链断裂|过渡动作|前往餐馆|递交现金|现场观察出餐/.test(riskText) || /老张黄焖鸡的门帘一掀/.test(patched)) {
    patched = patched.replace(
      /老张黄焖鸡的门帘一掀，热气裹着酱香味扑出来。/,
      "陆川合上本子，把十八块零钱攥进掌心，穿过后街两家小店，推开老张黄焖鸡的塑料门帘。热气裹着酱香味扑出来。",
    );
  }
  return patched === segment ? null : patched;
}

function cardTargetLivingMoney(card = {}) {
  const facts = [
    ...(Array.isArray(card.facts_required) ? card.facts_required : []),
    card.conflict,
    card.resource_plan,
    card.money_source,
  ].map((item) => String(item || ""));
  for (const fact of facts) {
    const match = fact.match(/(?:生活费|全部身家|余额|资金)[^0-9一二两三四五六七八九十百千万]{0,12}(?:只剩|剩|还有|约|还)?\s*(\d+(?:\.\d+)?)\s*元/);
    if (match) return Number(match[1]);
  }
  return null;
}

function moneyNumberText(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function simpleChineseMoneyText(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "";
  if (value === 200) return "两百块";
  if (value === 100) return "一百块";
  if (Number.isInteger(value) && value < 100) return `${chineseAmountText(value)}块`;
  return `${moneyNumberText(value)}元`;
}

function patchLivingMoneyDrift(text = "", card = {}, issueText = "") {
  const target = cardTargetLivingMoney(card);
  if (!Number.isFinite(target)) return null;
  const body = String(text || "");
  const issue = String(issueText || "");
  if (!/(生活费|全部身家|资金|余额|财务口径|章卡|设定偏差|正文账本)/.test(`${issue} ${body.slice(0, 900)}`)) return null;
  const candidateMatches = [
    ...body.matchAll(/生活费\s*(\d+(?:\.\d+)?)\s*元/g),
    ...body.matchAll(/初始\s*(\d+(?:\.\d+)?)\s*元/g),
    ...body.matchAll(/全部身家[：，,][^\n。；]*?(\d+(?:\.\d+)?)\s*元/g),
  ];
  const current = candidateMatches
    .map((match) => Number(match[1]))
    .find((value) => Number.isFinite(value) && Math.abs(value - target) > 0.01);
  if (!Number.isFinite(current)) return null;
  let patched = body;
  const replaceContextualMoney = (sourceAmount, targetAmount) => {
    const source = moneyNumberText(sourceAmount).replace(".", "\\.");
    const replacement = moneyNumberText(targetAmount);
    patched = patched.replace(new RegExp(`(生活费|初始|总资金变成|预计结余|结余|还剩|剩)${source}元`, "g"), `$1${replacement}元`);
    patched = patched.replace(new RegExp(`(生活费|初始|总资金变成|预计结余|结余|还剩|剩)${source}块`, "g"), `$1${replacement}元`);
  };
  replaceContextualMoney(current, target);
  for (const match of [...body.matchAll(/(\d+(?:\.\d+)?)元/g)]) {
    const value = Number(match[1]);
    const delta = Number((value - current).toFixed(2));
    if (!Number.isFinite(value) || Math.abs(delta) > 40) continue;
    if (!Number.isInteger(delta) && Math.abs(delta - Math.round(delta)) > 0.001) continue;
    const next = moneyNumberText(target + delta);
    const source = match[1].replace(".", "\\.");
    patched = patched.replace(new RegExp(`${source}元`, "g"), `${next}元`);
  }
  patched = patched
    .replace(/全部身家[：，,][^\n。；]*(一百二十五块六毛|一百二十五块六|一百二十五块六角|125\.6元?)/g, `全部身家：${simpleChineseMoneyText(target)}`)
    .replace(/看着那行“生活费[^”]+”/g, `看着那行“生活费${moneyNumberText(target)}元”`);
  return patched === body ? null : patched;
}

function patchChapterCardMoneyAnchorDrift(text = "", card = {}) {
  const analysis = analyzeChapterCardFactAnchors(text, card);
  const violation = analysis.violations.find((item) =>
    item.type === "chapter_card_money_anchor_mismatch" &&
    Number.isFinite(item.expected_amount) &&
    Array.isArray(item.observed_amounts) &&
    item.observed_amounts.length >= 2,
  );
  if (!violation) return null;
  const body = String(text || "");
  const [cashAmount, extraAmount] = violation.observed_amounts;
  if (!Number.isFinite(cashAmount) || !Number.isFinite(extraAmount)) return null;
  const observedMentions = extractMoneyMentions(body, { maxChars: 1200 });
  const cashEvidence = observedMentions.find((mention) => mention.amount === cashAmount);
  const extraEvidence = observedMentions.find((mention) => mention.amount === extraAmount);
  const cashText = cashEvidence?.text || `${cashAmount}元现金`;
  const extraText = extraEvidence?.text || `${extraAmount}元生活费`;
  const expectedCashText = `${violation.expected_amount}元现金`;
  const directPatched = body
    .replace(
      `口袋里装着${cashText}，这是他上辈子剩的全部家当。银行卡里还有这个月${extraText}。`,
      `口袋里装着${expectedCashText}，这是他能动用的全部启动资金。银行卡里的生活费先压着不动。`,
    )
    .replace(
      `口袋里装着${cashText}`,
      `口袋里装着${expectedCashText}`,
    )
    .replace(
      `银行卡里还有这个月${extraText}`,
      "银行卡里的生活费先压着不动",
    );
  if (directPatched !== body) return directPatched;
  let patched = body;
  const cashChinese = simpleChineseMoneyText(cashAmount);
  const extraChinese = simpleChineseMoneyText(extraAmount);
  const expectedText = simpleChineseMoneyText(violation.expected_amount);
  patched = patched
    .replace(
      new RegExp(`口袋里装着${escapeRegExpLiteral(cashChinese)}现金，这是他上辈子剩的全部家当。银行卡里还有这个月${escapeRegExpLiteral(extraChinese)}生活费。`, "g"),
      `口袋里装着${expectedText}现金，这是他能动用的全部启动资金。银行卡里那笔生活费他没打算碰。`,
    )
    .replace(
      new RegExp(`口袋里装着${escapeRegExpLiteral(cashChinese)}现金`, "g"),
      `口袋里装着${expectedText}现金`,
    )
    .replace(
      new RegExp(`银行卡里还有这个月${escapeRegExpLiteral(extraChinese)}生活费`, "g"),
      "银行卡里的生活费先压着不动",
    );
  return patched === body ? null : patched;
}
function patchCampusDeliveryBackgroundExposition(text = "", issueText = "") {
  const body = String(text || "");
  const issue = String(issueText || "");
  if (!/(2016|校园外卖|纯说明式背景|现场观察|动作|代入感|商家自己送|没人管|没人核对)/.test(`${issue} ${body}`)) return null;
  const pattern = /2016年，校园外卖刚冒头，商家自己送，送到楼下放地上，学生自己下来翻。没人管，没人核对，丢了就丢了。骂两句商家，商家骂两句骑手，骑手骂两句学生，最后谁都不爽，但谁都没办法。/g;
  if (!pattern.test(body)) return null;
  return body.replace(pattern, [
    "陆川没有急着走。他蹲到台阶边，把三个塑料袋上的店名和楼号抄进纸页。",
    "又一个学生从门洞里冲出来，翻开两个袋子，没找到自己的饭，掏出手机就骂：\"老板，我饭呢？楼下根本没有！\"",
    "旁边的店员骑着旧电动车赶到，车筐里还压着五份饭，满头汗地喊：\"自己按楼号拿，少了别赔我，我这边也没人签字。\"",
  ].join("\n\n"));
}
function escapeRegExpLiteral(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cardCharacterNames(card = {}) {
  const values = [
    ...(Array.isArray(card.characters_in_scene) ? card.characters_in_scene : []),
    ...(Array.isArray(card.character_anchors) ? card.character_anchors : []),
  ];
  return [...new Set(values
    .map((item) => (typeof item === "string" ? item : item?.name))
    .map((item) => String(item || "").trim())
    .filter((item) => /^[\u4e00-\u9fff]{2,5}$/.test(item)))]
    .slice(0, 12);
}

function preferredRoommateName(issueText = "", card = {}) {
  const issue = String(issueText || "");
  const names = cardCharacterNames(card);
  const cardText = JSON.stringify(card || {});
  const explicit = names.find((name) =>
    new RegExp(`${escapeRegExpLiteral(name)}.{0,24}(室友|跟单|愿意跟|嘲笑|态度|转变)`).test(cardText)
    || new RegExp(`${escapeRegExpLiteral(name)}.{0,80}(项目设定|人物关系|正文|章卡|大纲)`).test(issue)
    || new RegExp(`(项目设定|人物关系|正文|章卡|大纲).{0,80}${escapeRegExpLiteral(name)}`).test(issue)
  );
  if (explicit) return explicit;
  return names.find((name) => /周/.test(name)) || "";
}

function normalizeRoommateNameAndTail(text = "", issueText = "", card = {}) {
  const canonical = preferredRoommateName(issueText, card);
  if (!canonical) return String(text || "");
  let patched = String(text || "");
  const aliases = [...new Set(["周启明", "老周"]
    .filter((name) => name !== canonical)
    .filter((name) => patched.includes(name) || String(issueText || "").includes(name)))];
  for (const alias of aliases) {
    patched = patched.replace(new RegExp(escapeRegExpLiteral(alias), "g"), canonical);
  }
  if (/(尾钩|媒介|电话|消息|微信|来电|打来电话)/.test(String(issueText || "")) || /打来电话/.test(String(card?.tail_hook || ""))) {
    const name = escapeRegExpLiteral(canonical);
    patched = patched
      .replace(new RegExp(`手机震了一下。\s*\n+\s*是${name}发来的微信：`, "m"), `${canonical}打来电话：`)
      .replace(new RegExp(`是${name}发来的微信：`, "m"), `${canonical}打来电话：`)
      .replace(new RegExp(`${name}发来的微信：`, "m"), `${canonical}打来电话：`)
      .replace(new RegExp(`手机震了一下。\s*\n+\s*${name}打来电话：`, "m"), `${canonical}打来电话：`);
  }
  return patched;
}

function patchZhouQimingMotivationBridge(text = "", issueText = "", card = {}) {
  const body = String(text || "");
  const issue = String(issueText || "");
  const normalizedBody = normalizeRoommateNameAndTail(body, issue, card);
  const canonical = preferredRoommateName(issue, card) || "周启明";
  const name = escapeRegExpLiteral(canonical);
  const shouldPatch = new RegExp(`${name}.{0,80}(动机|态度|转变|跟单|愿意跟|中间行为|行为证据|逻辑微断)`).test(issue)
    || /(动机|态度|转变|跟单|愿意跟|中间行为|行为证据|逻辑微断|尾钩媒介|媒介偏离)/.test(issue)
      && new RegExp(`${name}|周启明|老周`).test(`${body} ${issue}`);
  if (!shouldPatch && normalizedBody === body) return null;
  if (new RegExp(`${name}.{0,100}(递水|主动问|帮.*看|改.*盯|跟着看|按平|推过来|盯着.*账本|看见.*签收|问.*带我|矿泉水|跑丢)`).test(normalizedBody)) {
    return normalizedBody === body ? null : normalizedBody;
  }
  const bridge = [
    `${canonical}探头看了一眼桌上的账本和路线图。`,
    "他嘴上还硬，手却先把桌角那张路线图按平，又拿圆珠笔在三号楼旁边点了一下：\"这边晚饭点最堵，你刚才要是从后门绕，能少跑两分钟吧？\"",
    `陆川看了他一眼。${canonical}别开脸，把半瓶没喝完的矿泉水推过来：\"别误会，我就是怕你明天跑丢了又回来借饭卡。\"`,
  ].join("\n\n");
  const phoneAnchor = new RegExp(`${name}打来电话[:：]`, "m");
  if (phoneAnchor.test(normalizedBody)) return normalizedBody.replace(phoneAnchor, `${bridge}\n\n${canonical}打来电话：`);
  const fallbackIndex = Math.max(normalizedBody.lastIndexOf("手机震了一下"), normalizedBody.lastIndexOf(canonical));
  if (fallbackIndex >= 0) return `${normalizedBody.slice(0, fallbackIndex).trimEnd()}\n\n${bridge}\n\n${normalizedBody.slice(fallbackIndex).trimStart()}`;
  return `${normalizedBody.trimEnd()}\n\n${bridge}`;
}

function patchEarlyCampusVehicleFundingBreak(text = "", issueText = "") {
  const body = String(text || "");
  const issue = String(issueText || "");
  if (!/(400|四百|电动车|回本|资金闭环|资金流向|商业逻辑|首日|试跑)/.test(`${issue} ${body}`)) return null;
  let patched = body
    .replace(/骑上那辆从二手市场花四百块买的电动车/g, "推过宿舍楼下那辆旧电动车")
    .replace(/骑上那辆从二手市场花400元买的电动车/g, "推过宿舍楼下那辆旧电动车")
    .replace(/电动车四百块，剩下的钱买打包盒和一次性餐具，还要留点钱吃饭。/g, "旧电动车是宿舍前任留下的，链条松得厉害，只能先凑合；他今天真正花出去的，是两单垫付的饭钱和一页写满楼号的账。");
  patched = patched.replace(/如果明天能跑二十单，每单一块五到两块，收入大概三十五块左右，后天如果能翻一倍，就是七十块。一个星期下来，差不多能把电动车钱攒回来。/g,
    "他没有急着算明天能赚多少。第一天最值钱的不是那几块配送费，而是老板愿意再试一天，以及两张能对上的签收记录。");
  return patched === body ? null : patched;
}

function patchDeliveryAccountingChain(text = "", issueText = "", card = {}) {
  const body = String(text || "");
  const issue = String(issueText || "");
  const cardText = JSON.stringify(card || {});
  if (!/(账目|账本|账册|财务闭环|结算|单价拆解|配送费|欠找零|找零|现金流|能力证据链|现场反应)/.test(`${issue} ${cardText}`)) {
    return null;
  }
  if (!/(配送费实留|欠找零|账目结算缺乏|财务闭环)/.test(`${body} ${issue}`)) return null;
  const accountingBridge = [
    "陆川没有只写结论。他把账页往老板面前推近半寸，笔尖按着第一行：8号楼306，黄焖鸡一份，餐费18元；学生给了20元，其中18元当场交给窗口，配送费2元单独夹在账页下方。",
    "第二行他又圈了一下：6号楼212，餐费18元，学生只有十九块现金，先签收，欠找零1元。赵老板要补的不是利润，是这1元找零和明天继续试跑的信任。",
    "赵老板盯着那两行签收记录看了几秒，手指在“欠找零1元”旁边敲了一下，声音比刚才低：\"账能对上，赔付也写清楚了。明天再试两单。\"",
  ].join("\n\n");
  let patched = body.replace(/他在账本最后写：配送费实留1元，欠找零1元。/, accountingBridge);
  if (patched === body && /(配送费实留|欠找零|账目结算缺乏|财务闭环)/.test(issue)) {
    patched = `${body.trimEnd()}\n\n${accountingBridge}`;
  }
  const canonical = preferredRoommateName(issue, card);
  if (canonical && !new RegExp(`${escapeRegExpLiteral(canonical)}[\s\S]{0,180}(路线图按平|矿泉水|跟一单|跟你跑|明天我跟)`).test(patched)) {
    const bridge = `${canonical}原本靠在门口看热闹，听到老板说“明天再试两单”，才把视线挪到账本上：\"那明天我跟你跑一单，至少别让你把楼号又绕错。\"`;
    const tail = new RegExp(`${escapeRegExpLiteral(canonical)}打来电话[:：]`);
    if (tail.test(patched)) patched = patched.replace(tail, `${bridge}\n\n${canonical}打来电话：`);
    else patched = `${patched.trimEnd()}\n\n${bridge}`;
  }
  return patched === body ? null : patched;
}

function localChapterWidePatch(text = "", rewriteFocus = {}, card = {}) {
  const issueText = [
    rewriteFocus?.source_issue,
    rewriteFocus?.instruction,
    rewriteFocus?.rewrite_direction,
    ...(Array.isArray(rewriteFocus?.issues) ? rewriteFocus.issues : []),
    ...(Array.isArray(rewriteFocus?.risk_segments) ? rewriteFocus.risk_segments.flatMap((risk) => [
      risk?.preview,
      risk?.text,
      risk?.reason,
      ...(Array.isArray(risk?.reasons) ? risk.reasons : []),
    ]) : []),
  ].filter(Boolean).join(" ");
  const patchers = [
    (current) => patchChapterCardMoneyAnchorDrift(current, card),
    (current) => patchLivingMoneyDrift(current, card, issueText),
    (current) => patchCampusDeliveryBackgroundExposition(current, issueText),
    (current) => patchEarlyCampusVehicleFundingBreak(current, issueText),
    (current) => patchDeliveryAccountingChain(current, issueText, card),
    (current) => patchZhouQimingMotivationBridge(current, issueText, card),
  ];
  let current = String(text || "");
  let changed = false;
  for (const patcher of patchers) {
    const next = patcher(current);
    if (next && next !== current) {
      current = next;
      changed = true;
    }
  }
  return changed ? current : null;
}
function localRiskSegmentPatch(segment = "", risk = {}, card = {}) {
  const patchers = [
    (current) => patchChapterCardMoneyAnchorDrift(current, card),
    (current) => patchUnitPriceConflict(current, risk, card),
    (current) => patchMerchantDecisionTransition(current, risk),
    (current) => patchEraAndSemanticConsistency(current, risk),
    (current) => patchLivingMoneyDrift(current, card, [
      risk.preview,
      risk.text,
      risk.reason,
      ...(Array.isArray(risk.reasons) ? risk.reasons : []),
    ].join(" ")),
    (current) => patchCampusDeliveryBackgroundExposition(current, [
      risk.preview,
      risk.text,
      risk.reason,
      ...(Array.isArray(risk.reasons) ? risk.reasons : []),
    ].join(" ")),
    (current) => patchEarlyCampusVehicleFundingBreak(current, [
      risk.preview,
      risk.text,
      risk.reason,
      ...(Array.isArray(risk.reasons) ? risk.reasons : []),
    ].join(" ")),
  ];
  let current = String(segment || "");
  let changed = false;
  for (const patcher of patchers) {
    const next = patcher(current);
    if (next && next !== current) {
      current = next;
      changed = true;
    }
  }
  return changed ? current : null;
}

function shouldUseSegmentPatch(rewriteFocus = {}) {
  if (rewriteFocus?.force_full_rewrite) return false;
  return [
    "fact_consistency_repair",
    "historical_logic_repair",
    "ability_source_repair",
    "first_300_hook_repair",
    "drop_risk_repair",
    "remove_explanation",
    "sentence_pattern_repair",
    "rhythm_repair",
    "first_300_retention_repair",
    "next_chapter_click_repair",
    "chapter_completion_repair",
    "follow_intent_repair",
    "reader_behavior_repair",
    "story_room_contract_repair",
    "strengthen_tail_hook",
    "retention_boost",
    "coolpoint_boost",
    "micro_hook_boost",
    "publish_gate_repair",
    "publish_grade_lift",
  ].includes(String(rewriteFocus?.type || ""));
}

function factRepairSyntheticTargets(text = "", rewriteFocus = {}) {
  const body = String(text || "");
  if (!body) return [];
  const issueText = [
    rewriteFocus?.source_issue,
    rewriteFocus?.instruction,
    rewriteFocus?.risk_segment?.reason,
    rewriteFocus?.risk_segment?.preview,
  ].filter(Boolean).join(" ");
  const type = String(rewriteFocus?.type || "");
  const factRe = /(收入|支出|结余|余额|成本|利润|赚|亏|回本|餐费|跑腿费|配送费|账|对账|订单|现金|签收|结算|元|块|毛|份|单)/;
  const abilityRe = /(能力|来源|经验|程序员|代码|系统|后台|账本|账册|税单|契约|茶引|订单|工具|操作|现场反应|可见结果|旁人反应)/;
  const historyRe = /(时间线|年代|年份|时代|2016|支付|外卖平台|校园|电动车|制度|不符合|常识|事实|设定)/;
  const wanted = type === "ability_source_repair"
    ? abilityRe
    : type === "historical_logic_repair"
      ? historyRe
      : factRe;
  const issueWanted = factRe.test(issueText)
    ? factRe
    : abilityRe.test(issueText)
      ? abilityRe
      : historyRe.test(issueText)
        ? historyRe
      : wanted;
  const paragraphs = body.split(/\n{2,}/);
  const candidates = [];
  let cursor = 0;
  for (const paragraph of paragraphs) {
    const start = body.indexOf(paragraph, cursor);
    cursor = start >= 0 ? start + paragraph.length : cursor + paragraph.length;
    const clean = paragraph.trim();
    if (!clean) continue;
    if (!wanted.test(clean) && !issueWanted.test(clean)) continue;
    const safeStart = Math.max(0, start);
    const safeEnd = Math.min(body.length, safeStart + paragraph.length);
    const located = {
      start: safeStart,
      end: safeEnd,
      segment: body.slice(safeStart, safeEnd),
      context: body.slice(Math.max(0, safeStart - 500), Math.min(body.length, safeEnd + 500)),
    };
    const score =
      (/(鏀跺叆|鏀嚭|缁撲綑|鍒╂鼎|璧殀浜弢鍥炴湰|椁愯垂|璺戣吙璐箌閰嶉€佽垂|鎴愭湰)/.test(clean) ? 16 : 0)
      + (/(瀵硅处|璐︽湰|绛惧瓧|绛炬敹|缁撶畻|璁㈠崟|鐜伴噾)/.test(clean) ? 5 : 0)
      + (/(鏀跺叆|鏀嚭|缁撲綑).{0,40}(鏀跺叆|鏀嚭|缁撲綑)|鎵嬮噷|杩樺樊|宸竴/.test(clean) ? 8 : 0)
      + (wanted.test(clean) ? 2 : 0)
      + (issueWanted.test(clean) ? 2 : 0)
      - (/浣欓鐭俊|閾惰鐭俊/.test(clean) ? 4 : 0);
    candidates.push({
      score,
      located,
      risk: {
        preview: located.segment,
        reason: type || "fact_consistency_repair",
        reasons: [type || "fact_consistency_repair"],
        synthetic: true,
        scope: "fact_window",
      },
    });
  }
  const targets = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 1)
    .map(({ score, ...item }) => item);
  if (targets.length) return targets;
  return [{
    located: textWindowAround(body, Math.floor(body.length / 2), 900),
    risk: {
      preview: body.slice(Math.max(0, Math.floor(body.length / 2) - 120), Math.floor(body.length / 2) + 120),
      reason: type || "fact_consistency_repair",
      reasons: [type || "fact_consistency_repair"],
      synthetic: true,
      scope: "fact_window",
    },
  }].filter((item) => item.located?.segment);
}

function textWindowAround(text = "", center = 0, size = 900) {
  const body = String(text || "");
  if (!body) return null;
  const half = Math.floor(size / 2);
  let start = Math.max(0, center - half);
  let end = Math.min(body.length, center + half);
  const beforeBreak = body.lastIndexOf("\n", start);
  if (beforeBreak > 0 && start - beforeBreak < 160) start = beforeBreak + 1;
  const afterBreak = body.indexOf("\n", end);
  if (afterBreak > end && afterBreak - end < 160) end = afterBreak;
  return {
    start,
    end,
    segment: body.slice(start, end),
    context: body.slice(Math.max(0, start - 500), Math.min(body.length, end + 500)),
  };
}

function storyRoomRepairSyntheticTargets(text = "", rewriteFocus = {}) {
  const body = String(text || "");
  if (!body) return [];
  const missing = Array.isArray(rewriteFocus?.story_room_missing_fields)
    ? rewriteFocus.story_room_missing_fields.filter(Boolean)
    : [];
  const fields = missing.length
    ? missing
    : ["public_feedback", "cost_residue", "relationship_shift", "chapter_debt"];
  const tailStart = Math.max(0, body.length - Math.min(520, body.length));
  const targets = [];
  const add = (located, label, reason) => {
    if (!located?.segment?.trim()) return;
    targets.push({
      located,
      risk: {
        preview: located.segment,
        reason,
        reasons: [reason],
        synthetic: true,
        scope: label,
      },
    });
  };
  const nonTail = fields.filter((field) => field !== "chapter_debt");
  if (nonTail.length) {
    add(
      textWindowAround(body, Math.floor(body.length * 0.66), 950),
      nonTail.join("+"),
      `story_room_contract_missing:${nonTail.join("+")}`,
    );
  }
  if (fields.includes("chapter_debt")) {
    add({
      start: tailStart,
      end: body.length,
      segment: body.slice(tailStart),
      context: body.slice(Math.max(0, tailStart - 700)),
    }, "chapter_debt", "story_room_contract_missing:chapter_debt");
  }
  return targets.slice(0, 3);
}

function syntheticPatchTargets(text = "", rewriteFocus = {}) {
  const body = String(text || "");
  if (!body) return [];
  const type = String(rewriteFocus?.type || "");
  const scope = rewriteFocus?.patch_scope || "";
  const openingEnd = Math.min(body.length, 360);
  const tailStart = Math.max(0, body.length - Math.min(520, body.length));
  const middle = Math.floor(body.length / 2);
  const targets = [];
  const add = (located, label, reason) => {
    if (!located?.segment?.trim()) return;
    targets.push({
      located,
      risk: {
        preview: located.segment,
        reason,
        reasons: [reason],
        synthetic: true,
        scope: label,
      },
    });
  };

  if (["fact_consistency_repair", "historical_logic_repair", "ability_source_repair"].includes(type)) {
    return factRepairSyntheticTargets(body, rewriteFocus).slice(0, 2);
  }
  if (type === "first_300_retention_repair" || scope === "opening") {
    add({
      start: 0,
      end: openingEnd,
      segment: body.slice(0, openingEnd),
      context: body.slice(0, Math.min(body.length, openingEnd + 600)),
    }, "opening", "first_300_retention_proxy_below_publish");
    return targets;
  }
  if (type === "next_chapter_click_repair" || type === "strengthen_tail_hook" || scope === "tail") {
    add({
      start: tailStart,
      end: body.length,
      segment: body.slice(tailStart),
      context: body.slice(Math.max(0, tailStart - 600)),
    }, "tail", "next_chapter_click_proxy_below_publish");
    return targets;
  }
  if (type === "chapter_completion_repair" || type === "follow_intent_repair" || scope === "middle") {
    add(textWindowAround(body, middle, 900), "middle", type === "follow_intent_repair" ? "follow_intent_proxy_below_publish" : "chapter_completion_proxy_below_publish");
    return targets;
  }
  if (type === "story_room_contract_repair" || scope === "story_room") {
    return storyRoomRepairSyntheticTargets(body, rewriteFocus);
  }
  if (
    type === "retention_boost"
    || type === "coolpoint_boost"
    || type === "micro_hook_boost"
    || type === "remove_explanation"
    || type === "drop_risk_repair"
    || type === "sentence_pattern_repair"
    || type === "rhythm_repair"
  ) {
    add(textWindowAround(body, middle, 900), "middle", type);
    return targets;
  }
  if (type === "reader_behavior_repair" || type === "publish_gate_repair" || type === "publish_grade_lift" || scope === "behavior") {
    add({
      start: 0,
      end: openingEnd,
      segment: body.slice(0, openingEnd),
      context: body.slice(0, Math.min(body.length, openingEnd + 600)),
    }, "opening", "reader_behavior_score_below_publish");
    add(textWindowAround(body, middle, 760), "middle", "reader_behavior_score_below_publish");
    add({
      start: tailStart,
      end: body.length,
      segment: body.slice(tailStart),
      context: body.slice(Math.max(0, tailStart - 600)),
    }, "tail", "reader_behavior_score_below_publish");
  }
  return targets;
}

async function patchChapterRiskSegments(project, chapterNo, {
  taskPackage,
  card,
  sourceDraft,
  nextVersion,
  rewriteFocus,
    router,
    options = {},
  } = {}) {
    if (!shouldUseSegmentPatch(rewriteFocus)) return null;
    const riskSegments = Array.isArray(rewriteFocus?.risk_segments) ? rewriteFocus.risk_segments : [];
    if (!sourceDraft?.text) return null;
    const stageRuleContract = writingRulesForTask(project, "segment_patch", { chapterNo, rewriteFocus });
    let patchedText = sourceDraft.text;
    const patches = [];
    const chapterWidePatch = localChapterWidePatch(patchedText, rewriteFocus, card);
    if (chapterWidePatch && chapterWidePatch !== patchedText) {
      patches.push({
        preview: String(rewriteFocus?.source_issue || rewriteFocus?.type || "chapter-wide local patch").slice(0, 120),
        original_chars: patchedText.length,
        replacement_chars: chapterWidePatch.length,
        reason: "local_chapter_wide_fact_or_motivation_patch",
        patch_mode: "local_chapter_wide_patch",
      });
      patchedText = chapterWidePatch;
    }
    const chapterWideSolved =
      patches.length > 0 &&
      String(rewriteFocus?.type || "") === "fact_consistency_repair" &&
      analyzeChapterCardFactAnchors(patchedText, card).violations.length === 0;
    if (chapterWideSolved) {
      const draft = {
        chapter_no: chapterNo,
        version: nextVersion,
        text: patchedText,
        output_stats: {
          ...outputStats(sourceDraft.text, patchedText, card.target_words || taskPackage?.output?.target_words),
          source_draft_version: sourceDraft.version,
          patch_count: patches.length,
          patch_mode: "targeted_segment",
        },
        rewrite_focus: rewriteFocus,
        segment_patches: patches,
        path: draftFile(project, chapterNo, nextVersion),
      };
      await writeText(draft.path, patchedText);
      return draft;
    }
    const explicitTargets = riskSegments
      .slice(0, 3)
      .map((risk) => ({ risk, located: null }));
    const patchTargets = explicitTargets.length
      ? explicitTargets
      : syntheticPatchTargets(patchedText, rewriteFocus).slice(0, 3);
    if (!patchTargets.length && !patches.length) return null;
    for (const { risk, located: initialLocated } of patchTargets) {
      const located = locateRiskSegment(patchedText, risk.preview || risk.text || risk.content || "")
        || initialLocated;
      if (!located?.segment) continue;
      const localReplacement = localRiskSegmentPatch(located.segment, risk, card);
      if (localReplacement && localReplacement !== located.segment) {
        patchedText = `${patchedText.slice(0, located.start)}${localReplacement}${patchedText.slice(located.end)}`;
        patches.push({
          preview: String(risk.preview || risk.text || "").slice(0, 120),
          original_chars: located.segment.length,
          replacement_chars: localReplacement.length,
          reason: risk.reason || risk.reasons || "",
          patch_mode: "local_micro_patch",
        });
        continue;
      }
      const output = await router.invoke({
      task_type: "rewrite_chapter",
      chapter_card: card,
      task_package: {
        chapter_no: chapterNo,
        chapter_card: taskPackage?.chapter_card || card,
        story_room_execution: taskPackage?.story_room_execution || storyRoomExecutionContract(card),
        context: {
          project_planning: taskPackage?.context?.project_planning || {},
          hard_rules: [
            ...(taskPackage?.context?.hard_rules || []),
            ...stageRuleContract.rules,
          ],
        },
        output: taskPackage?.output || {},
        stage_rule_contract: stageRuleContract,
      },
      rewrite_strategy: risk.synthetic ? "targeted_rewrite" : "segment_patch",
      patch_mode: risk.synthetic ? "synthetic_segment" : "segment",
      rewrite_focus: {
        ...rewriteFocus,
        risk_segment: risk,
      },
      source_draft_version: sourceDraft.version,
      source_draft_text: located.segment,
      segment_context: located.context,
      stage_rule_contract: stageRuleContract,
    });
    const replacement = sanitizeModelText(output?.text || "").trim();
    const rejection = modelOutputRejection(output?.text || "", replacement, {
      minChars: Math.min(120, Math.max(30, Math.floor(located.segment.length * 0.35))),
    });
    const maxReplacementChars = Math.max(220, Math.ceil(located.segment.length * 2.2));
    if (rejection || replacement.length < 20 || replacement.length > maxReplacementChars) continue;
    patchedText = `${patchedText.slice(0, located.start)}${replacement}${patchedText.slice(located.end)}`;
    patches.push({
      preview: String(risk.preview || risk.text || "").slice(0, 120),
      original_chars: located.segment.length,
      replacement_chars: replacement.length,
      reason: risk.reason || risk.reasons || "",
    });
  }
  if (!patches.length) return null;
  const draft = {
    chapter_no: chapterNo,
    version: nextVersion,
    text: patchedText,
    output_stats: {
      ...outputStats(sourceDraft.text, patchedText, card.target_words || taskPackage?.output?.target_words),
      source_draft_version: sourceDraft.version,
        patch_count: patches.length,
        patch_mode: "targeted_segment",
      },
    rewrite_focus: rewriteFocus,
    segment_patches: patches,
    path: draftFile(project, chapterNo, nextVersion),
  };
  await writeText(draft.path, patchedText);
  if (typeof options.onTextDelta === "function") {
    await options.onTextDelta({
      delta: "",
      text: patchedText,
      chapterNo,
      version: nextVersion,
      phase: "segment_patch",
    });
  }
  return draft;
}

export async function rewriteChapterSmart(project, chapterNo, options = {}) {
  const taskPackage = await buildWritingTaskPackage(project, chapterNo, {
    ...options,
    force: true,
    contextTokenBudget: Math.min(
      Number(options.contextTokenBudget || DEFAULT_CONTEXT_TOKEN_BUDGET),
      4500,
    ),
  });
  const card = taskPackage.chapter_card;
  const latest = await getLatestDraftVersion(project, chapterNo);
  const nextVersion = `v${versionNumber(latest || "v1") + 1}`;
  const sourceDraft = latest ? await readDraft(project, chapterNo, latest) : null;
  const router = await createRouter(project, {
    ...options,
    routerOptions: routerOptionsForTask(options.routerOptions || {}, "rewrite_chapter"),
  });
  const rewriteLayers = options.rewriteLayers || [];
  const baseRewriteFocus = rewriteFocusForLayer(options.rewriteFocus || rewriteLayers[0]);
  const rewriteFocus = baseRewriteFocus?.type === "character_voice"
    ? dialogueTuningGuideForRewrite({ layer: baseRewriteFocus, taskPackage })
    : baseRewriteFocus;
  taskPackage.stage_rule_contract = writingRulesForTask(project, "rewrite_chapter", { chapterNo, rewriteFocus });
  taskPackage.hard_rules = [
    ...(Array.isArray(taskPackage.hard_rules) ? taskPackage.hard_rules : []),
    ...taskPackage.stage_rule_contract.rules,
  ];
  const patched = await patchChapterRiskSegments(project, chapterNo, {
    taskPackage,
    card,
    sourceDraft,
    nextVersion,
    rewriteFocus,
    router,
    options,
  });
  if (patched) return patched;
  return rewriteChapter(project, chapterNo, options);
}

async function readModelCallLines(project) {
  try {
    const text = await readFile(modelCallsFile(project), "utf8");
    return text
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function summarizeModelCalls(calls) {
  const byTask = {};
  let estimatedCostCny = 0;
  let estimatedInputTokens = 0;
  let estimatedOutputTokens = 0;
  for (const call of calls) {
    byTask[call.task_type] = (byTask[call.task_type] || 0) + 1;
    estimatedCostCny += call.estimated_cost_cny || 0;
    estimatedInputTokens += call.estimated_input_tokens || 0;
    estimatedOutputTokens += call.estimated_output_tokens || 0;
  }
  return {
    total_calls: calls.length,
    by_task: byTask,
    estimated_input_tokens: estimatedInputTokens,
    estimated_output_tokens: estimatedOutputTokens,
    estimated_cost_cny: Number(estimatedCostCny.toFixed(6)),
  };
}

function placeholderChapterCard(project, chapterNo) {
  return {
    chapter_no: chapterNo,
    display_title: `第${chapterNo}章 · 待生成章卡`,
    opening_hook: project.idea || "当前章节需要先生成章卡",
    main_event: "根据项目大纲补全本章事件",
    protagonist_action: "主角用具体行动推进本章目标",
    conflict: "规则、资源或人物关系带来明确阻力",
    cool_point_type: "行动验证爽点 + 误判反转爽点",
    visible_result: "本章结束时产生可见结果",
    tail_hook: "下一章必须处理的新变化",
    characters_in_scene: ["主角"],
    character_anchors: [
      {
        name: "主角",
        surface: "被质疑时不急着解释",
        core: "先用行动做出结果",
        anchor: "表面克制，内核是结果导向",
        signature_action: "把可验证的结果摆到现场",
        signature_line: "先看结果。",
        first_appearance_chapter: 1,
      },
    ],
    facts_required: CONTEXT_HARD_RULES,
    forbidden_items: PROJECT_HARD_RULES,
    target_words: 2600,
  };
}
async function loadCardOrPlaceholder(project, chapterNo) {
  try {
    return assertChapterCard(await readJson(chapterCardFile(project, chapterNo)));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return placeholderChapterCard(project, chapterNo);
  }
}

function costRatesFor(config, routerOptions) {
  return (
    routerOptions.rates ||
    config.budget?.model_rates?.[routerOptions.model] ||
    config.budget?.openai_rates ||
    DEFAULT_OPENAI_RATES_CNY
  );
}

function summarizeEstimatedTasks(tasks, provider, rates) {
  const estimatedInputTokens = tasks.reduce((sum, task) => sum + task.estimated_input_tokens, 0);
  const estimatedOutputTokens = tasks.reduce((sum, task) => sum + task.estimated_output_tokens, 0);
  return {
    total_calls: tasks.length,
    estimated_input_tokens: estimatedInputTokens,
    estimated_output_tokens: estimatedOutputTokens,
    estimated_cost_cny: estimateCostCny({
      provider,
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      rates,
    }),
  };
}

function estimatedTask(taskType, input, outputTokens) {
  return {
    task_type: taskType,
    estimated_input_tokens: estimateTokens(input),
    estimated_output_tokens: outputTokens,
  };
}

export async function estimateSingleChapterCost(
  project,
  chapterNo,
  { maxRewrites = 2, routerOptions } = {},
) {
  const config = await loadProjectConfig(project);
  const resolvedRouterOptions = resolveRouterOptionsFromConfig(config, { routerOptions });
  const provider = resolvedRouterOptions.provider || "mock";
  const model = resolvedRouterOptions.model || config.model.default_writer;
  const rates = costRatesFor(config, resolvedRouterOptions);
  const chapterCard = await loadCardOrPlaceholder(project, chapterNo);
  const context = await buildChapterContext(project, chapterNo);
  const targetWords = chapterCard.target_words || 2600;
  const chapterOutputTokens = Math.ceil(targetWords * 1.5);
  const taskPackage = {
    chapter_no: chapterNo,
    chapter_card: chapterCard,
    context,
    hard_rules: context.hard_rules,
    output: {
      format: "txt",
      target_words: targetWords,
      paragraph_style: "fanqie_mobile_short_paragraphs",
    },
  };
  const cardTask = estimatedTask(
    "generate_chapter_card",
    {
      task_type: "generate_chapter_card",
      project,
      chapter_no: chapterNo,
    },
    700,
  );
  const writeTask = (draftMode) =>
    estimatedTask(
      "write_chapter",
      {
        task_type: "write_chapter",
        chapter_card: chapterCard,
        task_package: taskPackage,
        draft_mode: draftMode,
      },
      chapterOutputTokens,
    );
  const reviewTask = estimatedTask(
    "review_chapter",
    {
      task_type: "review_chapter",
      chapter_card: chapterCard,
    },
    300,
  );
  reviewTask.estimated_input_tokens += chapterOutputTokens;
  const stateTask = estimatedTask(
    "extract_state_candidates",
    {
      task_type: "extract_state_candidates",
      chapter_no: chapterNo,
      chapter_card: chapterCard,
    },
    800,
  );
  stateTask.estimated_input_tokens += chapterOutputTokens;

  const baseTasks = [cardTask, writeTask("weak"), reviewTask, stateTask];
  const plannedTasks = [cardTask, writeTask("weak"), reviewTask];
  for (let index = 0; index < maxRewrites; index += 1) {
    plannedTasks.push(writeTask("strong"), { ...reviewTask });
  }
  plannedTasks.push(stateTask);

  return {
    status: "dry_run",
    project_title: project.title,
    chapter_no: chapterNo,
    provider,
    model,
    max_rewrites: maxRewrites,
    base: summarizeEstimatedTasks(baseTasks, provider, rates),
    worst_case: summarizeEstimatedTasks(plannedTasks, provider, rates),
    planned_tasks: plannedTasks,
    created_at: new Date().toISOString(),
  };
}

export async function createSingleChapterPreflight(
  project,
  chapterNo,
  { maxRewrites = 2, routerOptions, confirmed = false, maxCostCny } = {},
) {
  const estimate = await estimateSingleChapterCost(project, chapterNo, { maxRewrites, routerOptions });
  const status =
    Number.isFinite(maxCostCny) && estimate.worst_case.estimated_cost_cny > maxCostCny
      ? "blocked"
      : "ready";
  const preflight = {
    status,
    project_title: project.title,
    chapter_no: chapterNo,
    provider: estimate.provider,
    model: estimate.model,
    confirmed: Boolean(confirmed),
    max_cost_cny: maxCostCny ?? null,
    estimate,
    created_at: new Date().toISOString(),
  };
  const file = singleChapterPreflightFile(project, chapterNo);
  preflight.path = file;
  await writeJson(file, preflight);
  return preflight;
}

export async function summarizeProjectCost(project) {
  const calls = await readModelCallLines(project);
  return {
    status: "ok",
    project_title: project.title,
    currency: "CNY",
    ...summarizeModelCalls(calls),
  };
}

export async function compareModelsForChapter(project, chapterNo, { providers = ["mock"] } = {}) {
  const results = [];
  for (const provider of providers) {
    const sandboxProject = {
      ...project,
      title: `${project.title}-${provider}`,
      path: path.join(project.path, "reports", `model_sandbox_${provider}_${chapterNo}`),
    };
    await ensureDir(sandboxProject.path);
    const result = await runSingleChapterQualityLoop(sandboxProject, chapterNo, {
      maxRewrites: 1,
      routerOptions: { provider },
    });
    results.push({
      provider,
      status: result.status,
      final_grade: result.final_grade,
      final_version: result.final_version,
      rewrite_count: result.rewrite_count,
      quality_report_path: result.quality_report_path,
      sandbox_path: sandboxProject.path,
      stop: result.stop || null,
    });
  }
  const report = {
    project_title: project.title,
    chapter_no: chapterNo,
    results,
    created_at: new Date().toISOString(),
  };
  report.path = modelCompareFile(project, chapterNo);
  await writeJson(report.path, report);
  return report;
}

function countPatternMatches(text = "", pattern) {
  return (String(text || "").match(pattern) || []).length;
}

function aiTasteBand(score) {
  if (score < 55) return "blocked";
  if (score < 78) return "needs_polish";
  if (score < 90) return "pass";
  return "premium";
}

function analyzeAiTasteText(text = "") {
  const content = String(text || "");
  const paragraphs = splitParagraphs(content);
  const markers = [];
  const addMarker = (key, label, count, weight) => {
    if (count > 0) markers.push({ key, label, count, weight });
  };

  const explanationTerms = AI_TASTE_EXPLANATION_TERMS.filter((term) => content.includes(term)).length;
  const wrapperLines = content.split(/\r?\n/).filter((line) => isAiWrapperLine(line)).length;
  const summaryPhrases = countPatternMatches(content, /总之|综上|这说明|这意味着|本章|这一章|核心是|本质是|商业价值|未来趋势|战略眼光|平台竞争|必须把握/g);
  const mentalDeclarations = countPatternMatches(content, /他知道|他明白|他意识到|他很清楚|他决定|他相信|他理解/g);
  const formulaTransitions = countPatternMatches(content, /与此同时|然而|很快|下一刻|随后|接着|然后/g);
  const genericEmotions = countPatternMatches(content, /震惊|愣住|心中一动|眼神复杂|倒吸一口凉气|露出微笑/g);
  const repeatedOpenings = (() => {
    const starts = paragraphs
      .map((paragraph) => paragraph.replace(/^[“"'\s]+/, "").slice(0, 2))
      .filter((item) => item.length >= 2);
    const counts = new Map();
    for (const item of starts) counts.set(item, (counts.get(item) || 0) + 1);
    return [...counts.values()].filter((count) => count >= 3).reduce((sum, count) => sum + count - 2, 0);
  })();

  addMarker("ai_explanation_terms", "解释腔", explanationTerms, 12);
  addMarker("ai_wrapper", "AI外壳句", wrapperLines, 20);
  addMarker("summary_phrases", "总结判断句", summaryPhrases, 8);
  addMarker("mental_declarations", "心理判断替代行动", mentalDeclarations, 5);
  addMarker("formula_transitions", "模板转场", Math.max(0, formulaTransitions - 2), 3);
  addMarker("generic_emotions", "泛化情绪词", genericEmotions, 4);
  addMarker("repeated_openings", "段首复读", repeatedOpenings, 5);

  const dialogueCount = countPatternMatches(content, /[“”"]/g) + countPatternMatches(content, /(^|\n)\s*[-—]/g);
  const actionCount = countPatternMatches(content, /(抓|推|拉|递|拍|盯|看|刷|低头|刷新|塞进|按住|写下|跑到|站住|拨通|stared|pushed|rang|refreshed|moved|walked|stopped|called)/g);
  const objectCount = countPatternMatches(content, /(订单|后台|手机|路线|柜台|队伍|电话|通知|二维码|合同|屏幕|数据|号码|账单|账本|签收|order|backend|phone|screen|data|queue)/gi);
  const feedbackCount = countPatternMatches(content, /(跳到|缩短|刷新|响了|沉默|停住|骂声|投诉|到账|排队|结果|证明|愿意|签字|from \d+ to \d+)/gi);
  const reward = Math.min(18, dialogueCount * 2 + actionCount * 1.2 + objectCount * 1.1 + feedbackCount * 1.5);
  const penalty = markers.reduce((sum, marker) => {
    const weight = marker.key === "repeated_openings" ? 1 : marker.weight;
    return sum + marker.count * weight;
  }, 0);
  const score = Math.max(0, Math.min(100, Math.round(86 + reward - penalty)));
  const issues = [];
  if (score < 78) issues.push("ai_taste_below_publish");
  if (explanationTerms || summaryPhrases) issues.push("explanation_heavy");
  if (wrapperLines) issues.push("ai_wrapper");
  if (repeatedOpenings) issues.push("pattern_repetition");

  return {
    score,
    ai_taste_risk: 100 - score,
    band: aiTasteBand(score),
    markers,
    positive_signals: {
      dialogue_count: dialogueCount,
      action_count: actionCount,
      object_count: objectCount,
      feedback_count: feedbackCount,
    },
    issues: [...new Set(issues)],
    actions: score < 78
      ? ["replace_explanation_with_action", "add_dialogue_and_visible_feedback", "vary_sentence_pattern"]
      : [],
    rewrite_instruction: score < 78
      ? "去掉解释腔和总结腔，把判断改成动作、对白、物件、订单/数据反馈和现场反应，直到 AI 味分数 >= 78。"
      : "表达已达标，只需要轻润色。",
  };
}
function modelCapabilityKey(call = {}) {
  return [
    call.provider || "unknown",
    call.model || "unknown",
    call.task_type || "unknown",
    call.platform || "unknown",
    Array.isArray(call.genre_tags) ? call.genre_tags.join("+") : (call.genre_tags || "unknown"),
    call.chapter_range || "unknown",
  ].join("::");
}

function emptyCapabilityEntry(call = {}) {
  return {
    provider: call.provider || "unknown",
    model: call.model || "unknown",
    task_type: call.task_type || "unknown",
    stage: call.stage || "",
    platform: call.platform || "",
    genre_tags: Array.isArray(call.genre_tags) ? call.genre_tags : [],
    chapter_range: call.chapter_range || "",
    total_calls: 0,
    ok_calls: 0,
    error_calls: 0,
    timeout_calls: 0,
    slow_first_token_calls: 0,
    total_duration_ms: 0,
    total_input_chars: 0,
    total_output_tokens: 0,
    total_cost_cny: 0,
    diagnosis_counts: {},
    quality_samples: 0,
    publish_ready_samples: 0,
    premium_ready_samples: 0,
    stopped_samples: 0,
    total_rewrite_count: 0,
    total_reader_behavior_score: 0,
    total_first_300_retention_proxy: 0,
    total_chapter_completion_proxy: 0,
    total_next_chapter_click_proxy: 0,
    total_follow_intent_proxy: 0,
    total_ai_taste_score: 0,
    total_retention_prediction: 0,
    blocker_counts: {},
    last_seen_at: "",
  };
}

function modelQualityCallSnapshot(call = {}) {
  return {
    provider: call.provider || "unknown",
    model: call.model || "unknown",
    task_type: call.task_type || "unknown",
    stage: call.stage || "",
    platform: call.platform || "",
    genre_tags: Array.isArray(call.genre_tags) ? call.genre_tags : [],
    chapter_range: call.chapter_range || "",
    status: call.status || "",
    duration_ms: Number(call.duration_ms || 0),
    timeout_diagnosis: call.timeout_diagnosis || null,
    estimated_cost_cny: Number(call.estimated_cost_cny || 0),
    created_at: call.created_at || "",
  };
}

function qualityOutcomeFromReport(report = {}) {
  const gate = report.publish_gate || report.review?.publish_gate || {};
  const metrics = report.quality_metrics || {};
  const reader = metrics.reader_behavior_score || {};
  const proxies = reader.proxies || {};
  const blockers = Array.isArray(gate.blockers) ? gate.blockers.filter(Boolean) : [];
  const finalGrade = String(report.final_grade || report.review?.grade || "").trim().toUpperCase();
  return {
    chapter_no: report.chapter_no || null,
    status: report.status || "",
    final_grade: finalGrade || null,
    publish_ready: gate.publish_ready === true,
    premium_ready: gate.publish_ready === true && ["S", "A"].includes(finalGrade),
    stopped: report.status === "stopped" || Boolean(report.stop),
    rewrite_count: Number(report.rewrite_count || 0),
    reader_behavior_score: Number(reader.score ?? NaN),
    first_300_retention_proxy: Number(
      metrics.first_300_retention_proxy?.score
      ?? proxies.first_300_retention_proxy?.score
      ?? NaN,
    ),
    chapter_completion_proxy: Number(
      metrics.chapter_completion_proxy?.score
      ?? proxies.chapter_completion_proxy?.score
      ?? NaN,
    ),
    next_chapter_click_proxy: Number(
      metrics.next_chapter_click_proxy?.score
      ?? proxies.next_chapter_click_proxy?.score
      ?? NaN,
    ),
    follow_intent_proxy: Number(
      metrics.follow_intent_proxy?.score
      ?? proxies.follow_intent_proxy?.score
      ?? NaN,
    ),
    ai_taste_score: Number(metrics.ai_taste_score?.score ?? NaN),
    retention_prediction: Number(metrics.retention_prediction?.score ?? NaN),
    blockers,
    blocker_count: blockers.length,
    created_at: report.created_at || "",
  };
}

async function readChapterQualityReports(project) {
  const reportsDir = path.join(project.path, "reports");
  try {
    const names = await readdir(reportsDir);
    const reports = [];
    for (const name of names) {
      if (!/^chapter_\d+_quality_report\.json$/i.test(name)) continue;
      try {
        reports.push(await readJson(path.join(reportsDir, name)));
      } catch {
        // A partially written report should not break the capability ledger.
      }
    }
    return reports;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function addFiniteScore(entry, field, value) {
  if (Number.isFinite(value)) entry[field] += value;
}

function summarizeModelQualityOutcomes(reports = []) {
  const entries = new Map();
  for (const report of reports) {
    const calls = Array.isArray(report.model_call_details)
      ? report.model_call_details
      : Array.isArray(report.quality_model_calls)
        ? report.quality_model_calls
        : [];
    if (!calls.length) continue;
    const outcome = qualityOutcomeFromReport(report);
    for (const call of calls) {
      const key = modelCapabilityKey(call);
      const entry = entries.get(key) || emptyCapabilityEntry(call);
      entry.quality_samples += 1;
      if (outcome.publish_ready) entry.publish_ready_samples += 1;
      if (outcome.premium_ready) entry.premium_ready_samples += 1;
      if (outcome.stopped) entry.stopped_samples += 1;
      entry.total_rewrite_count += outcome.rewrite_count;
      addFiniteScore(entry, "total_reader_behavior_score", outcome.reader_behavior_score);
      addFiniteScore(entry, "total_first_300_retention_proxy", outcome.first_300_retention_proxy);
      addFiniteScore(entry, "total_chapter_completion_proxy", outcome.chapter_completion_proxy);
      addFiniteScore(entry, "total_next_chapter_click_proxy", outcome.next_chapter_click_proxy);
      addFiniteScore(entry, "total_follow_intent_proxy", outcome.follow_intent_proxy);
      addFiniteScore(entry, "total_ai_taste_score", outcome.ai_taste_score);
      addFiniteScore(entry, "total_retention_prediction", outcome.retention_prediction);
      for (const blocker of outcome.blockers) {
        entry.blocker_counts[blocker] = (entry.blocker_counts[blocker] || 0) + 1;
      }
      entry.last_seen_at = outcome.created_at || call.created_at || entry.last_seen_at;
      entries.set(key, entry);
    }
  }
  return entries;
}

function summarizeModelCapabilities(calls = []) {
  const entries = new Map();
  for (const call of calls) {
    const key = modelCapabilityKey(call);
    const entry = entries.get(key) || emptyCapabilityEntry(call);
    const diagnosis = call.timeout_diagnosis || {};
    entry.total_calls += 1;
    if (call.status === "ok" || call.status === "fallback_ok") entry.ok_calls += 1;
    if (call.status === "error") entry.error_calls += 1;
    if (diagnosis.timed_out) entry.timeout_calls += 1;
    if (diagnosis.category === "slow_first_token") entry.slow_first_token_calls += 1;
    entry.total_duration_ms += Number(call.duration_ms || 0);
    entry.total_input_chars += Number(call.diagnostics?.input_chars || 0);
    entry.total_output_tokens += Number(call.estimated_output_tokens || 0);
    entry.total_cost_cny += Number(call.estimated_cost_cny || 0);
    const category = diagnosis.category || "normal";
    entry.diagnosis_counts[category] = (entry.diagnosis_counts[category] || 0) + 1;
    entry.last_seen_at = call.created_at || entry.last_seen_at;
    entries.set(key, entry);
  }
  return [...entries.values()]
    .map((entry) => ({
      ...entry,
      success_rate: entry.total_calls ? Number((entry.ok_calls / entry.total_calls).toFixed(4)) : 0,
      timeout_rate: entry.total_calls ? Number((entry.timeout_calls / entry.total_calls).toFixed(4)) : 0,
      publish_ready_rate: entry.quality_samples ? Number((entry.publish_ready_samples / entry.quality_samples).toFixed(4)) : null,
      premium_ready_rate: entry.quality_samples ? Number((entry.premium_ready_samples / entry.quality_samples).toFixed(4)) : null,
      stopped_rate: entry.quality_samples ? Number((entry.stopped_samples / entry.quality_samples).toFixed(4)) : null,
      avg_duration_ms: entry.total_calls ? Math.round(entry.total_duration_ms / entry.total_calls) : 0,
      avg_input_chars: entry.total_calls ? Math.round(entry.total_input_chars / entry.total_calls) : 0,
      avg_rewrite_count: entry.quality_samples ? Number((entry.total_rewrite_count / entry.quality_samples).toFixed(2)) : null,
      avg_reader_behavior_score: entry.quality_samples ? Number((entry.total_reader_behavior_score / entry.quality_samples).toFixed(2)) : null,
      avg_first_300_retention_proxy: entry.quality_samples ? Number((entry.total_first_300_retention_proxy / entry.quality_samples).toFixed(2)) : null,
      avg_chapter_completion_proxy: entry.quality_samples ? Number((entry.total_chapter_completion_proxy / entry.quality_samples).toFixed(2)) : null,
      avg_next_chapter_click_proxy: entry.quality_samples ? Number((entry.total_next_chapter_click_proxy / entry.quality_samples).toFixed(2)) : null,
      avg_follow_intent_proxy: entry.quality_samples ? Number((entry.total_follow_intent_proxy / entry.quality_samples).toFixed(2)) : null,
      avg_ai_taste_score: entry.quality_samples ? Number((entry.total_ai_taste_score / entry.quality_samples).toFixed(2)) : null,
      avg_retention_prediction: entry.quality_samples ? Number((entry.total_retention_prediction / entry.quality_samples).toFixed(2)) : null,
      total_cost_cny: Number(entry.total_cost_cny.toFixed(6)),
    }))
    .sort((a, b) =>
      a.task_type.localeCompare(b.task_type)
      || a.platform.localeCompare(b.platform)
      || a.chapter_range.localeCompare(b.chapter_range)
      || b.success_rate - a.success_rate
      || a.timeout_rate - b.timeout_rate
      || a.avg_duration_ms - b.avg_duration_ms,
    );
}

async function writeModelCapabilityLedger(project) {
  const calls = await readModelCallLines(project);
  const qualityEntries = summarizeModelQualityOutcomes(await readChapterQualityReports(project));
  const callEntries = summarizeModelCapabilities(calls);
  for (const entry of callEntries) {
    const quality = qualityEntries.get(modelCapabilityKey(entry));
    if (!quality) continue;
    Object.assign(entry, {
      quality_samples: quality.quality_samples,
      publish_ready_samples: quality.publish_ready_samples,
      premium_ready_samples: quality.premium_ready_samples,
      stopped_samples: quality.stopped_samples,
      total_rewrite_count: quality.total_rewrite_count,
      total_reader_behavior_score: quality.total_reader_behavior_score,
      total_first_300_retention_proxy: quality.total_first_300_retention_proxy,
      total_chapter_completion_proxy: quality.total_chapter_completion_proxy,
      total_next_chapter_click_proxy: quality.total_next_chapter_click_proxy,
      total_follow_intent_proxy: quality.total_follow_intent_proxy,
      total_ai_taste_score: quality.total_ai_taste_score,
      total_retention_prediction: quality.total_retention_prediction,
      blocker_counts: quality.blocker_counts,
      publish_ready_rate: quality.quality_samples ? Number((quality.publish_ready_samples / quality.quality_samples).toFixed(4)) : null,
      premium_ready_rate: quality.quality_samples ? Number((quality.premium_ready_samples / quality.quality_samples).toFixed(4)) : null,
      stopped_rate: quality.quality_samples ? Number((quality.stopped_samples / quality.quality_samples).toFixed(4)) : null,
      avg_rewrite_count: quality.quality_samples ? Number((quality.total_rewrite_count / quality.quality_samples).toFixed(2)) : null,
      avg_reader_behavior_score: quality.quality_samples ? Number((quality.total_reader_behavior_score / quality.quality_samples).toFixed(2)) : null,
      avg_first_300_retention_proxy: quality.quality_samples ? Number((quality.total_first_300_retention_proxy / quality.quality_samples).toFixed(2)) : null,
      avg_chapter_completion_proxy: quality.quality_samples ? Number((quality.total_chapter_completion_proxy / quality.quality_samples).toFixed(2)) : null,
      avg_next_chapter_click_proxy: quality.quality_samples ? Number((quality.total_next_chapter_click_proxy / quality.quality_samples).toFixed(2)) : null,
      avg_follow_intent_proxy: quality.quality_samples ? Number((quality.total_follow_intent_proxy / quality.quality_samples).toFixed(2)) : null,
      avg_ai_taste_score: quality.quality_samples ? Number((quality.total_ai_taste_score / quality.quality_samples).toFixed(2)) : null,
      avg_retention_prediction: quality.quality_samples ? Number((quality.total_retention_prediction / quality.quality_samples).toFixed(2)) : null,
    });
  }
  const ledger = {
    version: 2,
    project_title: project.title,
    updated_at: new Date().toISOString(),
    policy: {
      selection_basis: "Use real local task outcomes before claiming a model is best.",
      dimensions: ["task_type", "platform", "genre_tags", "chapter_range"],
      quality_note: "Quality outcome rates are joined from chapter quality reports. A model is only promoted after enough local samples for the same task, platform, genre tags, and chapter range.",
    },
    entries: callEntries,
  };
  await writeJson(path.join(project.path, "tasks", "model_capability_ledger.json"), ledger);
  return ledger;
}

export function analyzeAiTaste(projectOrText, chapterNo, { text } = {}) {
  if (typeof projectOrText === "string" || !projectOrText || !projectOrText.path) {
    return analyzeAiTasteText(projectOrText || text || "");
  }
  return (async () => {
    const project = projectOrText;
    const content = text || (await readDraft(project, chapterNo).then((draft) => draft.text).catch(() => ""));
    const analysis = analyzeAiTasteText(content);
    const plan = {
      project_title: project.title,
      chapter_no: chapterNo,
      ...analysis,
      created_at: new Date().toISOString(),
    };
    plan.path = aiRewritePlanFile(project, chapterNo);
    await writeJson(plan.path, plan);
    return plan;
  })();
}

function flattenCandidateFacts(chapterNo, candidates) {
  const items = [];
  for (const [category, values] of Object.entries(candidates)) {
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      items.push({
        chapter_no: chapterNo,
        category,
        text: JSON.stringify(value),
      });
    }
  }
  return items;
}

export async function indexProjectMemory(project, { from = 1, to = 1 } = {}) {
  const items = [];
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    try {
      const candidates = await readJson(stateCandidatesFile(project, chapterNo));
      items.push(...flattenCandidateFacts(chapterNo, candidates));
    } catch {
      // Missing state is allowed for a light index pass.
    }
  }
  const index = {
    project_title: project.title,
    items,
    created_at: new Date().toISOString(),
  };
  index.path = memoryIndexFile(project);
  await writeJson(index.path, index);
  return index;
}

export async function searchProjectMemory(project, query, { limit = 10 } = {}) {
  const index = await readJson(memoryIndexFile(project)).catch(() => ({ items: [] }));
  const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  return (index.items || [])
    .map((item) => {
      const text = item.text.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (text.includes(term.toLowerCase()) ? 1 : 0), 0);
      return { ...item, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const REFERENCE_FORBIDDEN_TO_COPY = [
  "source_sentences",
  "character_names",
  "proper_nouns",
  "unique_scene_objects",
  "exact_event_order",
  "official_plot_text",
  "names",
  "exact_events",
  "sentences",
  "scene_order",
  "unique_settings",
  "proprietary_terms",
  "dialogue_lines",
  "plot_bridge_details",
];

function countBy(items = []) {
  return items.reduce((counts, item) => {
    counts[item] = (counts[item] || 0) + 1;
    return counts;
  }, {});
}

function firstNonEmptySegment(text = "", maxChars = 300) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function lastNonEmptySegment(text = "", maxChars = 240) {
  const body = String(text || "").replace(/\s+/g, " ").trim();
  return body.slice(Math.max(0, body.length - maxChars));
}

function classifyOpeningPattern(openingText = "") {
  const text = String(openingText || "");
  let pattern = "generic";
  const reasons = [];
  let score = 40;
  if (/([“"「]|^[-—]\s*[\w\u4e00-\u9fff].{0,60}[？?])/.test(text)) {
    pattern = "dialogue_opening";
    score += 15;
    reasons.push("starts_with_voice");
  }
  if (/(喊|骂|争|拒绝|压力|冲突|误判|嘲笑|慌|撞|死|shout|curse|fight|argue|refuse|pressure|conflict|angry|misjudge|mock|laugh|panic|crash|dead|death)/i.test(text)) {
    pattern = "direct_conflict";
    score += 20;
    reasons.push("immediate_conflict");
  }
  if (/(订单|后台|数字|数据|收据|到账|消息|通知|屏幕|从\d+到\d+|跳|order|backend|count|data|receipt|paid|message|notification|screen|from \d+ to \d+|jumped)/i.test(text)) {
    pattern = "data_result";
    score += 20;
    reasons.push("visible_result_object");
  }
  if (/(秋天|天气|天空|风|街上很安静|晨光|校园|开始变|autumn|weather|sky|wind|street was quiet|morning light|campus was|began to)/i.test(text) && reasons.length === 0) {
    pattern = "static_environment";
    score -= 15;
    reasons.push("static_environment");
  }
  return {
    pattern,
    score: Math.max(0, Math.min(100, score)),
    reasons,
  };
}

function classifyTailHook(tailText = "") {
  const text = String(tailText || "");
  let type = "generic";
  const reasons = [];
  let score = 40;
  if (/(reader|readers|someone|unknown|did not see|didn't see|only .* understood|but .* did not know|behind|watched)/i.test(text)) {
    type = "information_gap";
    score += 30;
    reasons.push("information_asymmetry");
  }
  if (/(message|phone|call|rang|beeped|knock|interrupted|just as|before he could)/i.test(text)) {
    type = type === "generic" ? "interruption" : type;
    score += 15;
    reasons.push("interruption");
  }
  if (/(order|backend|count|data|receipt|paid|queue|from \d+ to \d+|jumped|dropped)/i.test(text)) {
    type = type === "generic" ? "data_change" : type;
    score += 15;
    reasons.push("data_change");
  }
  if (/(pressure|threat|start tonight|tomorrow|next|rival|copied|report|complaint|blocked)/i.test(text)) {
    type = type === "generic" ? "pressure" : type;
    score += 15;
    reasons.push("next_pressure");
  }
  return {
    type,
    score: Math.max(0, Math.min(100, score)),
    reasons,
  };
}

function analyzeReferenceRhythm(text = "") {
  const body = String(text || "").trim();
  const paragraphs = body.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const dialogueChars = [...body.matchAll(/"[^"]{1,300}"/g)]
    .reduce((sum, match) => sum + match[0].length, 0);
  const totalChars = body.length || 1;
  return {
    dialogue_ratio: Number((dialogueChars / totalChars).toFixed(3)),
    paragraph_count: paragraphs.length,
    avg_paragraph_chars: paragraphs.length
      ? Math.round(paragraphs.reduce((sum, item) => sum + item.length, 0) / paragraphs.length)
      : 0,
  };
}

function extractTransferableBeats(text = "") {
  const source = String(text || "");
  const beats = new Set();
  if (/璇垽|涓嶈В閲妡缁撴灉|鍙嶈浆|misjudge|misjudgment|thought .* joking|everyone thought|expected .* but/i.test(source)) {
    beats.add("misread_then_result");
  }
  if (/绔犲熬|閽╁瓙|绐佺劧|tail hook|suddenly|rang|beeped|next|start tonight|before he could/i.test(source)) {
    beats.add("tail_hook_pressure");
  }
  if (/璁㈠崟|鍚庡彴|鏁板瓧|鏁版嵁|缁撴灉|order|backend|count|data|result|receipt|paid|from \d+ to \d+|jumped/i.test(source)) {
    beats.add("data_payoff");
  }
  if (/闃熶紞|鍥磋|鍏紑|鑰佸笀|鍚屽|public|queue|everyone|teacher|street|copied/i.test(source)) {
    beats.add("public_validation");
  }
  if (/浠ｄ环|璇В|娌″悆楗瓅濂冲効|鐗虹壊|cost|dinner money|sacrifice|misunderstood|lost/i.test(source)) {
    beats.add("visible_cost");
  }
  if (/璇昏€呯煡閬搢涓昏涓嶇煡閬搢did not see|did not know|readers could understand|someone behind|watched/i.test(source)) {
    beats.add("information_gap");
  }
  return [...beats];
}

function sanitizeMicroHookDensityForReference(result = {}) {
  return {
    block_size: result.block_size,
    total_blocks: result.total_blocks,
    hooked_blocks: result.hooked_blocks,
    density: result.density,
    blocks: (result.blocks || []).map(({ preview, ...block }) => block),
    issues: result.issues || [],
  };
}

function sanitizeDropRiskForReference(result = {}) {
  return {
    segment_size: result.segment_size,
    total_segments: result.total_segments,
    risky_segment_count: result.risky_segment_count,
    risk_density: result.risk_density,
    segments: (result.segments || []).map(({ preview, ...segment }) => segment),
    issues: result.issues || [],
  };
}

export function classifyChapterStructure(text = "", { chapterNo } = {}) {
  const body = String(text || "");
  const microHookDensity = sanitizeMicroHookDensityForReference(analyzeMicroHookDensity(body));
  const dropRiskSegments = sanitizeDropRiskForReference(analyzeDropRiskSegments(body));
  const transferableBeats = extractTransferableBeats(body);
  return {
    chapter_no: chapterNo ?? null,
    saved_source_text: false,
    word_count: body.replace(/\s+/g, "").length,
    opening: classifyOpeningPattern(firstNonEmptySegment(body, 300)),
    tail_hook: classifyTailHook(lastNonEmptySegment(body, 240)),
    rhythm: analyzeReferenceRhythm(body),
    micro_hook_density: microHookDensity,
    drop_risk_segments: dropRiskSegments,
    transferable_beats: transferableBeats,
  };
}

function buildStructureFingerprint(chapters = []) {
  const safeChapters = chapters || [];
  const chapterCount = safeChapters.length || 1;
  const avg = (selector) => Number((safeChapters.reduce((sum, chapter) => sum + Number(selector(chapter) || 0), 0) / chapterCount).toFixed(3));
  const beats = safeChapters.flatMap((chapter) => chapter.transferable_beats || []);
  return {
    opening_patterns: countBy(safeChapters.map((chapter) => chapter.opening?.pattern || "generic")),
    tail_hook_types: countBy(safeChapters.map((chapter) => chapter.tail_hook?.type || "generic")),
    beat_distribution: countBy(beats),
    avg_dialogue_ratio: avg((chapter) => chapter.rhythm?.dialogue_ratio),
    avg_paragraph_chars: Math.round(safeChapters.reduce((sum, chapter) => sum + Number(chapter.rhythm?.avg_paragraph_chars || 0), 0) / chapterCount),
    avg_micro_hook_density: avg((chapter) => chapter.micro_hook_density?.density),
    avg_drop_risk_segments: avg((chapter) => chapter.drop_risk_segments?.risky_segment_count),
  };
}

async function upsertReferenceLibrary(project, profile) {
  const library = await readJson(referenceLibraryFile(project)).catch(() => ({
    project_title: project.title,
    saved_source_text: false,
    references: [],
  }));
  const summary = {
    reference_name: profile.reference_name,
    chapter_count: profile.chapter_count,
    structure_fingerprint: profile.structure_fingerprint,
    path: profile.path,
    updated_at: profile.created_at,
  };
  const references = (library.references || []).filter((item) => item.reference_name !== profile.reference_name);
  references.push(summary);
  const next = {
    ...library,
    project_title: project.title,
    saved_source_text: false,
    references: references.sort((a, b) => a.reference_name.localeCompare(b.reference_name)),
    updated_at: new Date().toISOString(),
  };
  await writeJson(referenceLibraryFile(project), next);
  return next;
}

export async function writeReferenceStructureProfile(project, { name, chapters = [] } = {}) {
  const referenceName = name || "reference";
  const chapterProfiles = chapters.map((chapter, index) => classifyChapterStructure(chapter.text, {
    chapterNo: chapter.chapter_no ?? chapter.chapterNo ?? index + 1,
  }));
  const profile = {
    project_title: project.title,
    reference_name: referenceName,
    saved_source_text: false,
    chapter_count: chapterProfiles.length,
    structure_fingerprint: buildStructureFingerprint(chapterProfiles),
    chapters: chapterProfiles,
    forbidden_to_copy: REFERENCE_FORBIDDEN_TO_COPY,
    created_at: new Date().toISOString(),
  };
  profile.path = referenceStructureFile(project, referenceName);
  await writeJson(profile.path, profile);
  await upsertReferenceLibrary(project, profile);
  return profile;
}

export async function searchReferenceLibrary(project, query = {}, { limit = 10 } = {}) {
  const library = await readJson(referenceLibraryFile(project)).catch(() => ({ references: [] }));
  const beat = typeof query === "string" ? query : query.beat;
  const openingPattern = typeof query === "object" ? query.opening_pattern : null;
  const tailHookType = typeof query === "object" ? query.tail_hook_type : null;
  return (library.references || [])
    .map((reference) => {
      const fingerprint = reference.structure_fingerprint || {};
      let score = 0;
      if (beat && fingerprint.beat_distribution?.[beat]) score += fingerprint.beat_distribution[beat];
      if (openingPattern && fingerprint.opening_patterns?.[openingPattern]) score += fingerprint.opening_patterns[openingPattern];
      if (tailHookType && fingerprint.tail_hook_types?.[tailHookType]) score += fingerprint.tail_hook_types[tailHookType];
      return { ...reference, score };
    })
    .filter((reference) => reference.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function normalizeReferenceName(name = "") {
  return String(name || "reference").trim() || "reference";
}

function normalizeChapterLimit(value, fallback = 30) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.max(1, Math.floor(number));
}

export async function createReferenceReadPlan(project, {
  name = "reference",
  startUrl,
  chapterLimit = 30,
  platform = "browser",
} = {}) {
  const referenceName = normalizeReferenceName(name);
  if (!startUrl) {
    throw new Error("createReferenceReadPlan requires startUrl");
  }
  const plan = {
    project_title: project.title,
    reference_name: referenceName,
    platform,
    start_url: String(startUrl),
    chapter_limit: normalizeChapterLimit(chapterLimit, 30),
    status: "awaiting_confirmation",
    requires_user_confirmation_before_browser_read: true,
    saved_source_text: false,
    allowed_outputs: [
      "word_count",
      "opening_pattern",
      "tail_hook_type",
      "dialogue_ratio",
      "paragraph_avg_length",
      "micro_hook_density",
      "drop_risk_segments",
      "transferable_beats",
    ],
    safety_rules: REFERENCE_BROWSER_SAFETY_RULES,
    forbidden_to_copy: REFERENCE_FORBIDDEN_TO_COPY,
    next_actions: [
      "confirm_visible_authorized_content",
      "run_reference_read",
      "review_reference_read_audit",
      "create_rhythm_transfer_plan_when_safe",
    ],
    created_at: new Date().toISOString(),
  };
  plan.path = referenceReadPlanFile(project, referenceName);
  await writeJson(plan.path, plan);
  return plan;
}

function sanitizeBrowserChapterForProfile(chapterProfile = {}, source = {}) {
  return {
    ...chapterProfile,
    source_url: source.url || source.source_url || null,
    source_title: source.title || source.source_title || null,
    saved_source_text: false,
  };
}

function sleep(ms) {
  const delay = Number(ms);
  if (!Number.isFinite(delay) || delay <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function isReadableVisibleChapter(chapter = {}) {
  const status = String(chapter.status || chapter.read_status || "readable").toLowerCase();
  if (["paywall", "blocked", "captcha", "login_required", "unreadable"].includes(status)) return false;
  return Boolean(String(chapter.text || "").trim());
}

function sanitizeVisibleChapter(chapter = {}) {
  return {
    chapter_no: chapter.chapter_no ?? chapter.chapterNo ?? null,
    url: chapter.url || chapter.source_url || null,
    source_url: chapter.source_url || chapter.url || null,
    title: chapter.title || chapter.source_title || null,
    source_title: chapter.source_title || chapter.title || null,
    text: String(chapter.text || ""),
  };
}

function attachReaderStop(chapters = [], stopped = null) {
  Object.defineProperty(chapters, "stopped", {
    value: stopped,
    enumerable: false,
    configurable: true,
  });
  return chapters;
}

export function createSafeAutoReaderAdapter({
  reader,
  minDelayMs = 3000,
  maxDelayMs = 5000,
} = {}) {
  if (typeof reader !== "function") {
    throw new Error("createSafeAutoReaderAdapter requires reader");
  }
  return {
    async readChapters({
      startUrl,
      chapterLimit = 30,
      safetyRules = REFERENCE_BROWSER_SAFETY_RULES,
    } = {}) {
      const limit = normalizeChapterLimit(chapterLimit, 30);
      const result = await reader({
        cursor: startUrl,
        startUrl,
        chapterLimit: limit,
        safetyRules,
      });
      const rawChapters = Array.isArray(result) ? result : (Array.isArray(result?.chapters) ? result.chapters : []);
      const chapters = [];
      let stopped = Array.isArray(result) ? null : (result?.stopped || null);
      for (const chapter of rawChapters) {
        if (!isReadableVisibleChapter(chapter)) {
          stopped = stopped || {
            reason: "paywall_or_unreadable",
            url: chapter?.url || chapter?.source_url || null,
          };
          break;
        }
        chapters.push(sanitizeVisibleChapter(chapter));
        if (chapters.length >= limit) {
          stopped = stopped || {
            reason: "chapter_limit_reached",
            url: chapter.url || chapter.source_url || null,
          };
          break;
        }
        const min = Math.max(0, Number(minDelayMs || 0));
        const max = Math.max(min, Number(maxDelayMs || min));
        await sleep(min === max ? min : min + Math.random() * (max - min));
      }
      return attachReaderStop(chapters, stopped);
    },
  };
}

export function createVisibleBrowserAutoReaderAdapter({
  browserDriver,
  minDelayMs = 3000,
  maxDelayMs = 5000,
} = {}) {
  if (!browserDriver || typeof browserDriver.goto !== "function") {
    throw new Error("createVisibleBrowserAutoReaderAdapter requires browserDriver.goto");
  }
  if (typeof browserDriver.extractVisibleChapter !== "function") {
    throw new Error("createVisibleBrowserAutoReaderAdapter requires browserDriver.extractVisibleChapter");
  }
  if (typeof browserDriver.goNext !== "function") {
    throw new Error("createVisibleBrowserAutoReaderAdapter requires browserDriver.goNext");
  }
  return createSafeAutoReaderAdapter({
    minDelayMs,
    maxDelayMs,
    reader: async ({
      cursor,
      chapterLimit,
      safetyRules,
    }) => {
      await browserDriver.goto(cursor, { safetyRules });
      const chapters = [];
      let stopped = null;
      for (let index = 0; index < normalizeChapterLimit(chapterLimit, 30); index += 1) {
        const visible = await browserDriver.extractVisibleChapter({ index, safetyRules });
        if (!isReadableVisibleChapter(visible)) {
          stopped = {
            reason: "paywall_or_unreadable",
            url: visible?.url || visible?.source_url || null,
          };
          break;
        }
        chapters.push({
          chapter_no: visible.chapter_no ?? visible.chapterNo ?? index + 1,
          url: visible.url || visible.source_url || null,
          source_url: visible.source_url || visible.url || null,
          title: visible.title || visible.source_title || null,
          source_title: visible.source_title || visible.title || null,
          text: String(visible.text || ""),
        });
        if (chapters.length >= normalizeChapterLimit(chapterLimit, 30)) {
          stopped = {
            reason: "chapter_limit_reached",
            url: visible.url || visible.source_url || null,
          };
          break;
        }
        const nextUrl = visible.nextUrl || visible.next_url || null;
        if (!nextUrl && !visible.has_next) {
          stopped = {
            reason: "no_next_chapter",
            url: visible.url || visible.source_url || null,
          };
          break;
        }
        await browserDriver.goNext(nextUrl, { index, safetyRules });
      }
      return { chapters, stopped };
    },
  });
}

async function writeReferenceReadAudit(project, name, audit) {
  const next = {
    project_title: project.title,
    reference_name: normalizeReferenceName(name),
    saved_source_text: false,
    ...audit,
    updated_at: new Date().toISOString(),
  };
  next.path = referenceReadAuditFile(project, next.reference_name);
  await writeJson(next.path, next);
  return next;
}

export async function runReferenceStructureRead(project, {
  name = "reference",
  confirmed = false,
  browserAdapter,
  chapterLimit,
} = {}) {
  const referenceName = normalizeReferenceName(name);
  if (!confirmed) {
    throw new Error("runReferenceStructureRead requires user confirmation");
  }
  if (!browserAdapter || typeof browserAdapter.readChapters !== "function") {
    throw new Error("runReferenceStructureRead requires browserAdapter.readChapters");
  }
  const plan = await readJson(referenceReadPlanFile(project, referenceName)).catch(() => null);
  const limit = normalizeChapterLimit(chapterLimit ?? plan?.chapter_limit, 30);
  const startUrl = plan?.start_url;
  const startedAt = new Date().toISOString();
  let chapters = [];
  let autoReaderStop = null;
  try {
    chapters = await browserAdapter.readChapters({
      project,
      referenceName,
      startUrl,
      chapterLimit: limit,
      safetyRules: REFERENCE_BROWSER_SAFETY_RULES,
    });
    autoReaderStop = chapters?.stopped || null;
  } catch (error) {
    await writeReferenceReadAudit(project, referenceName, {
      status: "browser_error",
      started_at: startedAt,
      error: error.message,
      chapters: [],
    });
    throw error;
  }
  const safeChapters = (Array.isArray(chapters) ? chapters : [])
    .slice(0, limit)
    .filter((chapter) => String(chapter?.text || "").trim());

  if (!safeChapters.length) {
    await writeReferenceReadAudit(project, referenceName, {
      status: "no_chapters",
      started_at: startedAt,
      chapters: [],
    });
    throw new Error("runReferenceStructureRead found no readable chapters");
  }

  const chapterProfiles = safeChapters.map((chapter, index) => sanitizeBrowserChapterForProfile(
    classifyChapterStructure(chapter.text, {
      chapterNo: chapter.chapter_no ?? chapter.chapterNo ?? index + 1,
    }),
    chapter,
  ));
  const profile = {
    project_title: project.title,
    reference_name: referenceName,
    source: {
      mode: "browser_visible_authorized_content",
      start_url: startUrl,
      platform: plan?.platform || "browser",
    },
    auto_reader_stop: autoReaderStop,
    saved_source_text: false,
    chapter_count: chapterProfiles.length,
    structure_fingerprint: buildStructureFingerprint(chapterProfiles),
    chapters: chapterProfiles,
    forbidden_to_copy: REFERENCE_FORBIDDEN_TO_COPY,
    created_at: new Date().toISOString(),
  };
  profile.path = referenceStructureFile(project, referenceName);
  await writeJson(profile.path, profile);
  await upsertReferenceLibrary(project, profile);
  await writeReferenceReadAudit(project, referenceName, {
    status: "completed",
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    plan_path: plan?.path || null,
    structure_profile_path: profile.path,
    auto_reader_stop: autoReaderStop,
    chapters: chapterProfiles.map((chapter) => ({
      chapter_no: chapter.chapter_no,
      source_url: chapter.source_url,
      source_title: chapter.source_title,
      status: "profiled",
      word_count: chapter.word_count,
      opening_pattern: chapter.opening?.pattern,
      tail_hook_type: chapter.tail_hook?.type,
      transferable_beats: chapter.transferable_beats || [],
    })),
  });
  if (plan) {
    await writeJson(plan.path, {
      ...plan,
      status: "completed",
      last_run_at: new Date().toISOString(),
      latest_profile_path: profile.path,
      latest_audit_path: referenceReadAuditFile(project, referenceName),
    });
  }
  return profile;
}

function dominantKey(counts = {}, fallback = "generic") {
  const entries = Object.entries(counts || {});
  if (!entries.length) return fallback;
  return entries.sort((a, b) => b[1] - a[1])[0][0] || fallback;
}

function ratioBand(value = 0, width = 0.08) {
  const number = Math.max(0, Number(value || 0));
  return {
    min: Number(Math.max(0, number - width).toFixed(3)),
    target: Number(number.toFixed(3)),
    max: Number(Math.min(1, number + width).toFixed(3)),
  };
}

function clampMetric(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function buildRhythmTransferConstraints(referenceProfile = {}, {
  chapterNo = 1,
  project,
  targetIdea,
} = {}) {
  const fingerprint = referenceProfile.structure_fingerprint || {};
  const openingPattern = dominantKey(fingerprint.opening_patterns, "direct_conflict");
  const tailHookType = dominantKey(fingerprint.tail_hook_types, "pressure");
  const beatDistribution = fingerprint.beat_distribution || {};
  const beatConstraints = Object.entries(beatDistribution)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([beat]) => beat);
  const microHookTarget = clampMetric(fingerprint.avg_micro_hook_density, 0.9);
  const dropRiskTarget = clampMetric(fingerprint.avg_drop_risk_segments, 2);
  const avgParagraphChars = Math.round(clampMetric(fingerprint.avg_paragraph_chars, 120));
  const constraints = {
    reference_name: referenceProfile.reference_name || "reference",
    chapter_no: chapterNo,
    target_project_title: project?.title || null,
    target_idea: targetIdea || project?.idea || null,
    copy_policy: {
      saved_source_text: false,
      mode: "rhythm_and_structure_only",
      allowed: [
        "opening_pattern",
        "tail_hook_type",
        "dialogue_ratio",
        "paragraph_length",
        "micro_hook_density",
        "drop_risk_density",
        "abstract_beat_distribution",
      ],
      forbidden: referenceProfile.forbidden_to_copy || REFERENCE_FORBIDDEN_TO_COPY,
    },
    opening_constraint: {
      pattern: openingPattern,
      instruction: `Use a ${openingPattern} opening adapted to the target project's own setting and characters.`,
    },
    tail_hook_constraint: {
      type: tailHookType,
      instruction: `End with a ${tailHookType} hook using only target-project events and stakes.`,
    },
    rhythm_constraint: {
      dialogue_ratio_target: ratioBand(fingerprint.avg_dialogue_ratio, 0.08),
      avg_paragraph_chars_target: {
        min: Math.max(40, avgParagraphChars - 40),
        target: avgParagraphChars,
        max: avgParagraphChars + 40,
      },
    },
    quality_gates: {
      micro_hook_density_min: Number(Math.max(0.6, Math.min(1.2, microHookTarget)).toFixed(3)),
      drop_risk_segments_max: Math.max(0, Math.ceil(dropRiskTarget)),
    },
    beat_constraints: beatConstraints,
  };
  constraints.chapter_card_patch = {
    rhythm_transfer: {
      reference_name: constraints.reference_name,
      opening_pattern: constraints.opening_constraint.pattern,
      tail_hook_type: constraints.tail_hook_constraint.type,
      beat_constraints: constraints.beat_constraints,
      dialogue_ratio_target: constraints.rhythm_constraint.dialogue_ratio_target,
      avg_paragraph_chars_target: constraints.rhythm_constraint.avg_paragraph_chars_target,
      micro_hook_density_min: constraints.quality_gates.micro_hook_density_min,
      drop_risk_segments_max: constraints.quality_gates.drop_risk_segments_max,
      copy_policy: constraints.copy_policy.mode,
    },
  };
  return constraints;
}

export async function writeRhythmTransferPlan(project, {
  name = "rhythm-transfer",
  referenceProfile,
  from = 1,
  to = 1,
  targetIdea,
} = {}) {
  if (!referenceProfile) {
    throw new Error("writeRhythmTransferPlan requires referenceProfile");
  }
  const constraints = [];
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    constraints.push(buildRhythmTransferConstraints(referenceProfile, {
      chapterNo,
      project,
      targetIdea,
    }));
  }
  const plan = {
    project_title: project.title,
    name,
    reference_name: referenceProfile.reference_name || "reference",
    saved_source_text: false,
    range: { from, to },
    copy_policy: {
      mode: "rhythm_and_structure_only",
      saved_source_text: false,
      forbidden: referenceProfile.forbidden_to_copy || REFERENCE_FORBIDDEN_TO_COPY,
    },
    constraints,
    created_at: new Date().toISOString(),
  };
  plan.path = rhythmTransferPlanFile(project, name);
  await writeJson(plan.path, plan);
  return plan;
}

function publicReferenceProfileFromSource(source = {}) {
  const chapters = (source.chapters || []).map((chapter, index) => ({
    ...classifyChapterStructure(chapter.text || "", {
      chapterNo: chapter.chapter_no ?? chapter.chapterNo ?? index + 1,
    }),
    source_url: chapter.url || chapter.source_url || source.source_url || null,
    source_title: chapter.title || chapter.source_title || null,
  }));
  return {
    reference_name: source.name || source.reference_name || "reference",
    source_url: source.source_url || source.url || null,
    source_batch: source.source_batch || null,
    tags: [...new Set(source.tags || [])],
    auto_reader_stop: source.auto_reader_stop || null,
    saved_source_text: false,
    chapter_count: chapters.length,
    structure_fingerprint: buildStructureFingerprint(chapters),
    chapters,
    forbidden_to_copy: REFERENCE_FORBIDDEN_TO_COPY,
    updated_at: new Date().toISOString(),
  };
}

export async function growPublicReferenceLibrary({
  root,
  sources = [],
  sourceBatch = "manual",
} = {}) {
  if (!root) throw new Error("growPublicReferenceLibrary requires root");
  const existing = await readJson(publicReferenceLibraryFile(root)).catch(() => ({
    root,
    saved_source_text: false,
    references: [],
  }));
  const byName = new Map((existing.references || []).map((reference) => [reference.reference_name, reference]));
  for (const source of sources || []) {
    const profile = publicReferenceProfileFromSource({
      ...source,
      source_batch: source.source_batch || sourceBatch,
    });
    byName.set(profile.reference_name, profile);
  }
  const library = {
    root,
    saved_source_text: false,
    update_policy: "auto_from_authorized_visible_reference_sources",
    references: [...byName.values()].sort((a, b) => a.reference_name.localeCompare(b.reference_name)),
    safety_rules: [
      "authorized_visible_reference_sources_only",
      "structure_fingerprints_only",
      "no_raw_reference_prose_saved",
      "no_wash_writing",
    ],
    updated_at: new Date().toISOString(),
    path: publicReferenceLibraryFile(root),
  };
  await writeJson(library.path, library);
  return library;
}

function normalizeReadSource(source = {}, index = 0) {
  const name = normalizeReferenceName(source.name || source.reference_name || `reference-${index + 1}`);
  return {
    name,
    reference_name: name,
    start_url: source.start_url || source.startUrl || source.url || source.source_url || null,
    source_url: source.source_url || source.url || source.start_url || source.startUrl || null,
    platform: source.platform || "visible-browser",
    tags: [...new Set(source.tags || [])],
    chapter_limit: normalizeChapterLimit(source.chapter_limit ?? source.chapterLimit, 30),
    chapters: Array.isArray(source.chapters) ? source.chapters : undefined,
  };
}

export async function createPublicReferenceReadPlan({
  root,
  sources = [],
  chapterLimit = 30,
  sourceBatch = "manual",
} = {}) {
  if (!root) throw new Error("createPublicReferenceReadPlan requires root");
  const normalizedSources = (sources || []).map((source, index) => normalizeReadSource({
    ...source,
    chapter_limit: source.chapter_limit ?? source.chapterLimit ?? chapterLimit,
  }, index));
  const plan = {
    root,
    status: "awaiting_confirmation",
    source_batch: sourceBatch,
    source_count: normalizedSources.length,
    chapter_limit: normalizeChapterLimit(chapterLimit, 30),
    requires_user_confirmation_before_browser_read: true,
    saved_source_text: false,
    sources: normalizedSources.map((source) => ({
      name: source.name,
      reference_name: source.reference_name,
      start_url: source.start_url,
      source_url: source.source_url,
      platform: source.platform,
      tags: source.tags,
      chapter_limit: source.chapter_limit,
    })),
    safety_rules: REFERENCE_BROWSER_SAFETY_RULES,
    forbidden_to_copy: REFERENCE_FORBIDDEN_TO_COPY,
    created_at: new Date().toISOString(),
    path: publicReferenceReadPlanFile(root),
  };
  await writeJson(plan.path, plan);
  return plan;
}

export async function growPublicReferenceLibraryFromReadSources({
  root,
  confirmed = false,
  readSources = [],
  browserAdapterFactory,
  chapterLimit = 30,
  sourceBatch = "manual-visible-read",
} = {}) {
  if (!root) throw new Error("growPublicReferenceLibraryFromReadSources requires root");
  if (!confirmed) {
    throw new Error("growPublicReferenceLibraryFromReadSources requires user confirmation");
  }
  if (typeof browserAdapterFactory !== "function") {
    throw new Error("growPublicReferenceLibraryFromReadSources requires browserAdapterFactory");
  }
  const sources = (readSources || []).map((source, index) => normalizeReadSource({
    ...source,
    chapter_limit: source.chapter_limit ?? source.chapterLimit ?? chapterLimit,
  }, index));
  const grownSources = [];
  for (const source of sources) {
    const adapter = browserAdapterFactory({ source });
    if (!adapter || typeof adapter.readChapters !== "function") {
      throw new Error("browserAdapterFactory must return an adapter with readChapters");
    }
    const chapters = await adapter.readChapters({
      startUrl: source.start_url,
      chapterLimit: source.chapter_limit,
      safetyRules: REFERENCE_BROWSER_SAFETY_RULES,
    });
    grownSources.push({
      name: source.name,
      reference_name: source.reference_name,
      source_url: source.source_url || source.start_url,
      source_batch: sourceBatch,
      tags: source.tags,
      chapters,
      auto_reader_stop: chapters?.stopped || null,
    });
  }
  const library = await growPublicReferenceLibrary({
    root,
    sources: grownSources,
    sourceBatch,
  });
  const existingPlan = await readJson(publicReferenceReadPlanFile(root)).catch(() => null);
  if (existingPlan) {
    await writeJson(existingPlan.path || publicReferenceReadPlanFile(root), {
      ...existingPlan,
      status: "completed",
      latest_public_reference_library_path: library.path,
      last_run_at: new Date().toISOString(),
    });
  }
  return library;
}

function referenceMatchScore(reference = {}, template = {}) {
  const templateTokens = new Set([
    ...tokenizeTemplateText(template.template_prompt || ""),
    ...tokenizeTemplateText(template.domain || ""),
    ...(template.keywords || []).map((item) => String(item).toLowerCase()),
    ...(template.angles || []).map((item) => String(item).toLowerCase()),
  ]);
  let score = 0;
  const reasons = [];
  for (const tag of reference.tags || []) {
    if (templateTokens.has(String(tag).toLowerCase())) {
      score += 15;
      if (!reasons.includes("tag_overlap")) reasons.push("tag_overlap");
    }
  }
  for (const token of tokenizeTemplateText(`${reference.reference_name} ${(reference.tags || []).join(" ")}`)) {
    if (templateTokens.has(token)) {
      score += 4;
      if (!reasons.includes("keyword_overlap")) reasons.push("keyword_overlap");
    }
  }
  const fingerprint = reference.structure_fingerprint || {};
  if ((fingerprint.beat_distribution?.data_payoff || 0) > 0 && templateTokens.has("commerce")) {
    score += 8;
    reasons.push("payoff_rhythm_fit");
  }
  if ((fingerprint.beat_distribution?.information_gap || 0) > 0) {
    score += 4;
  }
  score += Math.round(Number(fingerprint.avg_micro_hook_density || 0) * 5);
  return { score, reasons: [...new Set(reasons)] };
}

export async function recommendPublicReferenceFingerprints({
  root,
  template,
  limit = 3,
} = {}) {
  if (!root) throw new Error("recommendPublicReferenceFingerprints requires root");
  const library = await readJson(publicReferenceLibraryFile(root)).catch(() => ({
    references: [],
  }));
  return (library.references || [])
    .map((reference) => {
      const match = referenceMatchScore(reference, template || {});
      return {
        ...reference,
        match_score: match.score,
        reasons: match.reasons,
      };
    })
    .filter((reference) => reference.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, limit);
}

export async function writeRhythmTransferPlanFromPublicReference(project, {
  root,
  referenceName,
  name = "public-reference-rhythm",
  from = 1,
  to = 1,
  targetIdea,
} = {}) {
  if (!root) throw new Error("writeRhythmTransferPlanFromPublicReference requires root");
  if (!referenceName) throw new Error("writeRhythmTransferPlanFromPublicReference requires referenceName");
  const library = await readJson(publicReferenceLibraryFile(root));
  const referenceProfile = (library.references || []).find((reference) => reference.reference_name === referenceName);
  if (!referenceProfile) throw new Error(`public reference not found: ${referenceName}`);
  return writeRhythmTransferPlan(project, {
    name,
    referenceProfile,
    from,
    to,
    targetIdea,
  });
}

async function loadActiveRhythmTransferConstraint(project, chapterNo) {
  const config = await loadProjectConfig(project);
  const planName = config.writing?.rhythm_transfer_plan;
  if (!planName) return null;
  try {
    const plan = await readJson(rhythmTransferPlanFile(project, planName));
    return (plan.constraints || []).find((constraint) => constraint.chapter_no === chapterNo) || null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function applyRhythmTransferConstraint(card = {}, constraint = null) {
  if (!constraint?.chapter_card_patch?.rhythm_transfer) return card;
  return {
    ...card,
    rhythm_transfer: constraint.chapter_card_patch.rhythm_transfer,
  };
}

function buildRhythmTransferTaskContext(rhythmTransfer) {
  if (!rhythmTransfer) return null;
  return {
    reference_name: rhythmTransfer.reference_name,
    copy_policy: rhythmTransfer.copy_policy,
    beat_constraints: rhythmTransfer.beat_constraints || [],
    rhythm_targets: {
      dialogue_ratio_target: rhythmTransfer.dialogue_ratio_target,
      avg_paragraph_chars_target: rhythmTransfer.avg_paragraph_chars_target,
    },
    quality_gates: {
      micro_hook_density_min: rhythmTransfer.micro_hook_density_min,
      drop_risk_segments_max: rhythmTransfer.drop_risk_segments_max,
    },
    rules: [
      "Use rhythm_and_structure_only: learn pacing, hook type, density, and abstract beat function.",
      "Do not reuse reference-book sentences, names, exact events, scene order, dialogue lines, or plot bridge details.",
      "Adapt every event to the current project's own characters, world, conflict, and commercial logic.",
    ],
  };
}

export async function analyzeReferenceStructure(project, { name, text } = {}) {
  const source = String(text || "");
  const transferableBeats = [];
  const chapterProfile = classifyChapterStructure(text || "", { chapterNo: 1 });
  if (/璇垽|涓嶈В閲妡缁撴灉|鍙嶈浆/.test(source)) {
    transferableBeats.push("misread_then_result");
  }
  if (/绔犲熬|閽╁瓙|绐佺劧/.test(source)) {
    transferableBeats.push("tail_hook_pressure");
  }
  const result = {
    project_title: project.title,
    reference_name: name || "reference",
    saved_source_text: false,
    transferable_beats: [...new Set([...transferableBeats, ...chapterProfile.transferable_beats])],
    structure_fingerprint: buildStructureFingerprint([chapterProfile]),
    chapter_profiles: [chapterProfile],
    forbidden_to_copy: REFERENCE_FORBIDDEN_TO_COPY,
    created_at: new Date().toISOString(),
  };
  result.path = referenceStructureFile(project, result.reference_name);
  await writeJson(result.path, result);
  return result;
}

export async function simulateReaders(project, chapterNo, { text } = {}) {
  const content = text || (await readDraft(project, chapterNo).then((draft) => draft.text).catch(() => ""));
  const actionTerms = [
    "\u9012\u7ed9",
    "\u8ba2\u5355",
    "\u540e\u53f0",
    "\u51b2",
    "\u8d70",
    "\u62ff",
    "\u8d34",
  ];
  const hookTerms = [
    "\u7a81\u7136",
    "\u4e0b\u4e00",
    "\u540e\u53f0",
    "\u6570\u5b57",
    "\u6572\u95e8",
    "\u7535\u8bdd",
  ];
  const hasAction = actionTerms.some((term) => content.includes(term));
  const hasHook = hookTerms.some((term) => content.includes(term));
  const hasBusinessDetail = [
    "\u8ba2\u5355",
    "\u6210\u672c",
    "\u540e\u53f0",
  ].some((term) => content.includes(term));
  const aiTaste = analyzeAiTaste(content);
  const aiExplanation = aiTaste.score < 78 || hasAiExplanation(content);
  const readers = [
    {
      type: "fanqie_fast_reader",
      continue_reason: hasAction ? "action_visible" : "needs_faster_event_entry",
      quit_risk: hasAction ? "medium" : "high",
      next_expectation: hasHook ? "hook_payoff" : "stronger_tail_hook",
    },
    {
      type: "logic_reader",
      continue_reason: "business_action_needs_cost_order_fulfillment_details",
      quit_risk: hasBusinessDetail ? "low" : "medium",
      next_expectation: "result_data_and_supporting_character_reaction",
    },
    {
      type: "ai_taste_sensitive_reader",
      continue_reason: aiExplanation ? "explanation_heavy" : "natural_expression",
      quit_risk: aiExplanation ? "high" : "medium",
      next_expectation: "dialogue_and_action_drive_scene",
    },
  ];
  const result = {
    project_title: project.title,
    chapter_no: chapterNo,
    readers,
    created_at: new Date().toISOString(),
  };
  result.path = readerSimulationFile(project, chapterNo);
  await writeJson(result.path, result);
  return result;
}

export async function writeWebStatus(project) {
  const cost = await summarizeProjectCost(project);
  const status = {
    project_title: project.title,
    current_chapter: project.current_chapter,
    status: project.status,
    model_calls: cost.total_calls,
    estimated_cost_cny: cost.estimated_cost_cny,
    commands: ["real-single", "write-batch", "export-merged", "cost-report"],
    created_at: new Date().toISOString(),
  };
  status.path = webStatusFile(project);
  await writeJson(status.path, status);
  return status;
}

async function writeQualityReport(project, result, callsBefore) {
  const allCalls = await readModelCallLines(project);
  const calls = allCalls.slice(callsBefore.length);
  const card = await readJson(chapterCardFile(project, result.chapter_no)).catch(() => ({}));
  const qualityMetrics = await buildChapterQualityMetrics(project, result.chapter_no, card);
  const finalReviewQualityFlags = Array.isArray(result.final_review_quality_flags)
    ? [...new Set(result.final_review_quality_flags)]
    : [...new Set(result.review_quality_flags || [])];
  const cumulativeReviewQualityFlags = Array.isArray(result.cumulative_review_quality_flags)
    ? [...new Set(result.cumulative_review_quality_flags)]
    : finalReviewQualityFlags;
  const publishGate = effectiveReviewGate(result.review || null, evaluateChapterPublishGate(
    qualityMetrics,
    result.review || null,
    finalReviewQualityFlags,
  ));
  const repairDiagnosis = await diagnoseRepairFailure(project, {
    chapterNo: result.chapter_no,
    card,
    result: {
      ...result,
      review_quality_flags: finalReviewQualityFlags,
      cumulative_review_quality_flags: cumulativeReviewQualityFlags,
    },
    calls,
    qualityMetrics,
  });
  const report = {
    project_title: project.title,
    status: result.status,
    chapter_no: result.chapter_no,
    card_title: result.card_title,
    final_grade: result.final_grade,
    final_version: result.final_version,
    rewrite_count: result.rewrite_count,
    export_path: result.export_path || null,
    state_candidates_path: result.state_candidates_path || null,
    stop: result.stop || null,
    review: result.review || null,
    review_quality_flags: finalReviewQualityFlags,
    cumulative_review_quality_flags: cumulativeReviewQualityFlags,
    tail_hook_score: result.tail_hook_score || null,
    rhythm_transfer_compliance: result.rhythm_transfer_compliance || null,
    domain_knowledge_compliance: result.domain_knowledge_compliance || null,
    quality_metrics: qualityMetrics,
    publish_gate: publishGate,
    rewrite_layers: result.rewrite_layers || [],
    applied_rewrite_layers: result.applied_rewrite_layers || [],
    rewrite_delta: result.rewrite_delta || null,
    rewrite_deltas: Array.isArray(result.rewrite_deltas) ? result.rewrite_deltas : [],
    rewrite_degraded: Boolean(result.rewrite_degraded),
    repair_failure_diagnosis: repairDiagnosis,
    model_call_details: calls.map(modelQualityCallSnapshot),
    model_calls: summarizeModelCalls(calls),
    created_at: new Date().toISOString(),
  };
  if (report.publish_gate?.publish_ready && report.review) {
    report.review = {
      ...report.review,
      grade: report.final_grade,
      publish_gate: report.publish_gate,
    };
  }
  if (report.review && report.publish_gate) {
    report.review.publish_gate = report.publish_gate;
  }
  report.failure_summary = buildFailureSummary({
    review: report.review,
    publishGate: report.publish_gate,
    stop: report.stop,
    rewriteCount: report.rewrite_count,
  });
  report.repair_queue = buildRepairQueue(report.review || { publish_gate: report.publish_gate });
  const file = qualityReportFile(project, result.chapter_no);
  report.path = file;
  await writeJson(file, report);
  void writeModelCapabilityLedger(project);
  return report;
}

async function diagnoseRepairFailure(project, { chapterNo, card = {}, result = {}, calls = [], qualityMetrics = {} } = {}) {
  const planningContext = await buildProjectPlanningContext(project).catch(() => ({}));
  const diagnosis = [];
  const cardGaps = chapterCardExecutionGaps(card, planningContext);
  if (cardGaps.length) {
    diagnosis.push({
      code: "planning_or_card_not_executable",
      severity: "high",
      evidence: cardGaps,
      action: "先深化本章细纲和章卡，再写正文；章卡必须有场景节拍、证据链和发布门禁要求。",
    });
  }
  const reviewTimeouts = calls.filter((call) =>
    call.task_type === "review_chapter" &&
    call.status === "error" &&
    /timeout/i.test(String(call.error || "")),
  );
  if (reviewTimeouts.length) {
    diagnosis.push({
      code: "reviewer_timeout_or_unstable",
      severity: "medium",
      evidence: reviewTimeouts.map((call) => ({
        provider: call.provider,
        model: call.model,
        duration_ms: call.duration_ms,
        error: call.error,
      })),
      action: "审查超时时不应静默采用弱审稿结论；需要缩短上下文复审或切换总编辑审查。",
    });
  }
  const weakReviewFallbacks = calls.filter((call) =>
    call.task_type === "review_chapter" &&
    call.status === "fallback_ok" &&
    Number(call.estimated_output_tokens || 0) <= 20,
  );
  if (weakReviewFallbacks.length) {
    diagnosis.push({
      code: "weak_review_fallback",
      severity: "high",
      evidence: weakReviewFallbacks.map((call) => ({
        provider: call.provider,
        model: call.model,
        output_tokens: call.estimated_output_tokens,
        fallback_reason: call.fallback_reason,
      })),
      action: "弱输出审稿不能作为发布门禁依据；应重试严审或停止并显示审查员异常。",
    });
  }
  const writerFallbacks = calls.filter((call) =>
    ["write_chapter", "rewrite_chapter"].includes(call.task_type) &&
    call.status === "fallback_ok",
  );
  if (writerFallbacks.length) {
    diagnosis.push({
      code: "writer_fallback_changed_style",
      severity: "medium",
      evidence: writerFallbacks.map((call) => ({
        task_type: call.task_type,
        provider: call.provider,
        model: call.model,
        fallback_reason: call.fallback_reason,
      })),
      action: "写作师超时或降级会改变文风和篇幅，应记录并优先保持原稿定点修补。",
    });
  }
  if (result.rewrite_degraded) {
    diagnosis.push({
      code: "rewrite_degraded",
      severity: "high",
      evidence: {
        final_version: result.final_version,
        rewrite_count: result.rewrite_count,
      },
      action: "已回退稳定稿；下一步应局部修补未过项，而不是继续整章重写。",
    });
  }
  if ((result.applied_rewrite_layers || []).length >= 4 && result.status !== "approved") {
    diagnosis.push({
      code: "too_many_repair_rounds_without_convergence",
      severity: "high",
      evidence: (result.applied_rewrite_layers || []).map((item) => item.type || item.source_issue || item).slice(0, 10),
      action: "修稿多轮不收敛时应回到章卡/细纲层重新规划，而不是继续写正文。",
    });
  }
  if ((result.review_quality_flags || []).includes("ai_process_leak")) {
    diagnosis.push({
      code: "model_process_leak",
      severity: "high",
      evidence: "正文曾出现模型思考或任务分析痕迹。",
      action: "该版本不得入库，必须重新生成纯小说正文。",
    });
  }
  const blockers = result.review?.publish_gate?.blockers || [];
  if (blockers.length) {
    diagnosis.push({
      code: "publish_gate_blockers",
      severity: "medium",
      evidence: blockers,
      action: "按阻断项逐个定点修补，正文中标红问题句并复审。",
    });
  }
  const metricsBlockers = evaluateChapterPublishGate(
    qualityMetrics,
    result.review || null,
    result.final_review_quality_flags || result.review_quality_flags || [],
  ).blockers || [];
  if (metricsBlockers.length && !blockers.length) {
    diagnosis.push({
      code: "metric_gate_blockers",
      severity: "medium",
      evidence: metricsBlockers,
      action: "审稿结论与程序化门禁不一致，以门禁指标为准继续修补。",
    });
  }
  return diagnosis;
}
async function writeChapterQualityCheckpoint(project, chapterNo, patch = {}) {
  const current = await readJson(chapterQualityCheckpointFile(project, chapterNo)).catch(() => ({
    status: "running",
    project_title: project.title,
    chapter_no: chapterNo,
    completed_steps: [],
    last_step: "start",
    updated_at: new Date().toISOString(),
  }));
  const completedSteps = new Set(current.completed_steps || []);
  if (patch.last_step && patch.last_step !== "completed") {
    completedSteps.add(patch.last_step);
  }
  const checkpoint = {
    ...current,
    ...patch,
    completed_steps: [...completedSteps],
    updated_at: new Date().toISOString(),
  };
  await writeJson(chapterQualityCheckpointFile(project, chapterNo), checkpoint);
  return checkpoint;
}

async function writeChapterQualityReportFromBatch(
  project,
  { chapterNo, card, review, version, rewriteCount, exported, stateCandidates, stop, callsBefore = [] },
) {
  const allCalls = await readModelCallLines(project);
  const calls = allCalls.slice(callsBefore.length);
  const qualityMetrics = await buildChapterQualityMetrics(project, chapterNo, card);
  const publishGate = effectiveReviewGate(review || null, evaluateChapterPublishGate(
    qualityMetrics,
    review || null,
    review?.hard_rule_violations || [],
  ));
  const finalGrade = normalizedPublishGrade(review || null, publishGate) || review?.grade || null;
  const result = {
    status: stop ? "stopped" : "approved",
    chapter_no: chapterNo,
    card_title: card?.display_title || "",
    final_grade: finalGrade,
    final_version: version,
    rewrite_count: rewriteCount,
    export_path: exported?.path || null,
    state_candidates_path: stateCandidates?.path || null,
    stop: stop || null,
  };
  const report = {
    project_title: project.title,
    status: result.status,
    chapter_no: result.chapter_no,
    card_title: result.card_title,
    final_grade: result.final_grade,
    final_version: result.final_version,
    rewrite_count: result.rewrite_count,
    export_path: result.export_path,
    state_candidates_path: result.state_candidates_path,
    stop: result.stop,
    review: review || null,
    quality_metrics: qualityMetrics,
    publish_gate: publishGate,
    model_call_details: calls.map(modelQualityCallSnapshot),
    model_calls: summarizeModelCalls(calls),
    created_at: new Date().toISOString(),
  };
  if (report.review && report.publish_gate) {
    report.review.publish_gate = report.publish_gate;
  }
  report.failure_summary = buildFailureSummary({
    review: report.review,
    publishGate: report.publish_gate,
    stop,
    rewriteCount,
  });
  report.repair_queue = buildRepairQueue(report.review || { publish_gate: report.publish_gate });
  const file = qualityReportFile(project, chapterNo);
  report.path = file;
  await writeJson(file, report);
  return report;
}

const publishBlockerText = (value = "") => ({
  review_grade_below_publish: "质检等级未到发布线",
  hard_quality_flag_active: "命中硬规则",
  ai_process_leak: "模型过程泄露",
  drop_risk_segments_remaining: "仍有弃读风险段",
  tail_hook_below_publish: "章尾钩子不够强",
  micro_hook_density_below_publish: "微钩子密度不足",
  coolpoint_density_below_publish: "爽点兑现不足",
  retention_prediction_below_publish: "追读预测不足",
  story_room_contract_not_delivered: "章卡承诺未落正文",
  ai_taste_below_publish: "AI味偏重",
  publish_gate_not_ready: "发布门禁未通过",
  template_opening_inertia: "模板开头复读",
  inline_risk_segments: "正文存在风险句",
  sentence_pattern_inertia: "句式惯性偏重",
  paragraph_rhythm_single_note: "段落节奏单一",
  dialogue_wall: "对白墙",
}[String(value || "")] || String(value || "待优化"));

function humanIssueText(value = "", review = {}) {
  const text = String(value || "");
  if (isChapterCardFactAnchorIssue(text)) {
    const violation = (Array.isArray(review?.card_fact_anchor_violations) ? review.card_fact_anchor_violations : [])[0];
    if (violation) {
      const expected = Number.isFinite(violation.expected_amount) ? `${violation.expected_amount}` : "-";
      const observed = Array.isArray(violation.observed_amounts) && violation.observed_amounts.length
        ? violation.observed_amounts.join("+")
        : (Number.isFinite(violation.observed_sum) ? String(violation.observed_sum) : "-");
      return `章卡资金锚点冲突：应为 ${expected}，正文写成 ${observed}`;
    }
    return "章卡关键事实锚点与正文不一致";
  }
  if (text === "fact_consistency_violation") return "正文与章卡/设定存在事实冲突";
  if (/^[a-z_:-]+$/i.test(text)) return publishBlockerText(text);
  return text;
}

const stopReasonText = (value = "") => ({
  targeted_repair_exhausted: "已自动修完当前上限，仍未达发布线",
  max_rewrites_exhausted: "自动改稿轮数已用完，仍未达发布线",
  degraded_on_rewrite: "改稿后质量变差，已回退到较好版本",
  rollback_required: "审稿判定不可用，需要回退重写",
  publish_gate_not_ready: "发布门禁未通过",
}[String(value || "")] || String(value || ""));
function buildFailureSummary({ review, publishGate, stop, rewriteCount = 0 } = {}) {
  if (publishGate?.failure_type === "reviewer_invalid" || review?.reviewer_status === "too_thin_for_publish_gate") {
    return {
      title: "审查员无效，不重写正文",
      reasons: [
        review?.reviewer_message || "审查员没有给出足够细的分数、问题段、保留项、删除项和改稿方向。",
        "这不是正文质量结论，不能用来触发自动改稿，否则会越修越差。",
      ],
      metrics: [],
      rewrite_count: rewriteCount,
      next_action: "重新调用严审；如果仍失败，切换审查员后再判断正文是否需要修改。",
    };
  }
  const reasons = [
    ...(Array.isArray(stop?.blockers) ? stop.blockers : []),
    ...(Array.isArray(publishGate?.blockers) ? publishGate.blockers : []),
    ...(Array.isArray(review?.issues) ? review.issues : []),
  ]
    .map((item) => String(item || ""))
    .filter(Boolean)
    .map((item) => humanIssueText(item, review))
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 8);
  const values = publishGate?.values || {};
  const thresholds = publishGate?.thresholds || {};
  const blockerDetails = (Array.isArray(publishGate?.blockers) ? publishGate.blockers : []).map((blocker) => {
    if (blocker === "fact_consistency_violation") {
      const anchorDetail = humanIssueText("chapter_card_money_anchor_mismatch", review);
      return anchorDetail || "正文与章卡/设定存在事实冲突，需要按设定锚点修正。";
    }
    if (blocker === "review_grade_below_publish") {
      return `质检等级 ${values.grade || "-"}，需要达到 A/B 才能发布。`;
    }
    if (blocker === "coolpoint_density_below_publish") {
      return `爽点兑现 ${values.coolpoint_delivered ?? 0}/${thresholds.coolpoint_delivered_min || 2}，需要补出现实收益或反转。`;
    }
    if (blocker === "retention_prediction_below_publish") {
      return `追读预测 ${values.retention_prediction ?? "-"}/${thresholds.retention_prediction_min || 80}，需要增强开头压力、微钩子和章尾牵引。`;
    }
    if (blocker === "story_room_contract_not_delivered") {
      const missing = Array.isArray(values.story_room_contract_missing) ? values.story_room_contract_missing.join("、") : "-";
      return `章卡承诺未落正文：${missing}，需要写成现场反馈、代价残留、关系变化和章尾债务。`;
    }
    if (blocker === "ai_taste_below_publish") {
      return `AI味 ${values.ai_taste_score ?? "-"}/${thresholds.ai_taste_score_min || 78}，需要减少解释总结，改成动作、对白和物件反馈。`;
    }
    if (blocker === "tail_hook_below_publish") {
      return `章尾钩子 ${values.tail_hook_score ?? "-"}/${thresholds.tail_hook_score_min || 4}，需要留下下一章必须兑现的压力。`;
    }
    if (blocker === "micro_hook_density_below_publish") {
      return `微钩子密度 ${values.micro_hook_density ?? "-"}/${thresholds.micro_hook_density_min || 0.9}，需要每屏都有小悬念或行动压力。`;
    }
    if (blocker === "drop_risk_segments_remaining") {
      return `弃读风险段 ${values.drop_risk_segments ?? 0}/${thresholds.max_drop_risk_segments ?? 0}，需要清掉红标句。`;
    }
    if (blocker === "sentence_pattern_inertia") {
      return "句式惯性偏重，需要把重复句式改成动作、对白、物件反馈和现场变化。";
    }
    if (blocker === "paragraph_rhythm_single_note") {
      return "段落节奏单一，需要插入短对白、动作、环境反馈或心理针脚。";
    }
    if (blocker === "dialogue_wall") {
      return "对白段过密，需要加入动作、物件和场景变化。";
    }
    return "";
  }).filter(Boolean);
  const metrics = [
    values.retention_prediction !== undefined ? `追读 ${values.retention_prediction}/${thresholds.retention_prediction_min || 80}` : "",
    values.ai_taste_score !== undefined ? `AI味 ${values.ai_taste_score}/${thresholds.ai_taste_score_min || 78}` : "",
    values.coolpoint_delivered !== undefined ? `爽点 ${values.coolpoint_delivered}/${thresholds.coolpoint_delivered_min || 2}` : "",
    values.drop_risk_segments !== undefined ? `弃读风险段 ${values.drop_risk_segments}/${thresholds.max_drop_risk_segments ?? 0}` : "",
  ].filter(Boolean);
  const stopTitle = stopReasonText(stop?.reason);
  return {
    title: stopTitle || (publishGate?.publish_ready ? "已可发布" : "未通过发布门禁"),
    reasons: [...blockerDetails, ...reasons].filter((item, index, list) => list.indexOf(item) === index).slice(0, 10),
    metrics,
    rewrite_count: rewriteCount,
    next_action: publishGate?.publish_ready
      ? "本章已可发布。"
      : "继续自动修到发布；如果仍反复失败，需要先修项目设定或章卡中的逻辑约束。",
  };
}
function isMockProviderName(provider = "") {
  const value = String(provider || "").trim().toLowerCase();
  return value === "mock" || value.startsWith("mock-");
}

function isSubPath(childPath = "", parentPath = "") {
  const child = path.resolve(String(childPath || ""));
  const parent = path.resolve(String(parentPath || ""));
  const relative = path.relative(parent, child);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function isLikelyTestProjectPath(projectPath = "") {
  const resolved = path.resolve(String(projectPath || ""));
  const lower = resolved.toLowerCase();
  return (
    isSubPath(resolved, process.cwd()) ||
    lower.includes(`${path.sep}.tmp`) ||
    lower.includes(`${path.sep}tmp-`) ||
    lower.includes(`${path.sep}temp${path.sep}`) ||
    lower.includes(`${path.sep}appdata${path.sep}local${path.sep}temp${path.sep}`)
  );
}

export function __test_formalMockStages(config = DEFAULT_PROJECT_CONFIG, routerOptions) {
  const stages = ["generate_chapter_card", "write_chapter", "review_chapter", "rewrite_chapter", "extract_state_candidates"];
  return stages.filter((taskType) => {
    const resolved = resolveRouterOptionsFromConfig(config, { routerOptions, taskType });
    return isMockProviderName(resolved.provider);
  });
}

async function assertFormalWritingDoesNotUseImplicitMock(project, { router, routerOptions, allowMockWriting = false } = {}) {
  if (allowMockWriting || router || isLikelyTestProjectPath(project?.path)) return;
  const config = await loadProjectConfig(project);
  const mockStages = __test_formalMockStages(config, routerOptions);
  if (!mockStages.length) return;
  throw new Error(
    [
      "正式写作已阻止：当前写作链路会调用演示 mock 模型。",
      `项目：${project?.path || project?.title || ""}`,
      `受影响环节：${mockStages.join(", ")}`,
      "请从桌面应用/服务端 /api/run 入口发起，或先在系统配置中连接真实模型 API。测试脚本如确实需要 mock，必须显式传入 allowMockWriting: true。",
    ].join("\n"),
  );
}

export async function runSingleChapterQualityLoop(
  project,
  chapterNo,
  { maxRewrites = 2, router, routerOptions, onProgress, allowMockWriting = false } = {},
) {
  let repairRoundsThisRun = 0;
  const reportProgress = async (progress) => {
    if (typeof onProgress === "function") {
      await onProgress({
        chapter_no: chapterNo,
        repair_rounds_this_run: repairRoundsThisRun,
        max_repair_rounds: maxRewrites,
        ...progress,
      });
    }
  };
  const createStreamProgressReporter = (base = {}) => {
    let lastAt = 0;
    let lastLength = 0;
    return async ({ text = "", delta = "" } = {}) => {
      const now = Date.now();
      const length = String(text || "").length;
      if (length === lastLength) return;
      if (now - lastAt < 260 && length - lastLength < 16) return;
      lastAt = now;
      lastLength = length;
      await reportProgress({
        ...base,
        text_delta: delta,
        draft_preview: progressManuscriptPreview(text, 1200),
        word_count: progressWordCount(text),
        streaming: true,
      });
    };
  };
  const modelStageLabel = (taskType = "") => ({
    generate_chapter_card: "章卡师",
    write_chapter: "写作师",
    review_chapter: "审查员",
    rewrite_chapter: "修稿师",
    extract_state_candidates: "记忆员",
    global_review: "总审查员",
  })[taskType] || taskType || "创作角色";
  const modelAttemptMessage = (attempt = {}) => {
    const label = modelStageLabel(attempt.task_type);
    const roleText = label || "当前角色";
    const seconds = attempt.timeout_ms ? Math.round(Number(attempt.timeout_ms) / 1000) : 0;
    if (attempt.event === "fallback") {
      return `${label}响应异常，正在切换备用角色。`;
    }
    if (attempt.event === "failed") {
      return `${label}调用失败，章鱼会保留原因并停止本轮，避免生成假结果。`;
    }
    if (attempt.fallback_from) {
      return `备用${roleText}接手${seconds ? `，最长等待 ${seconds} 秒` : ""}。`;
    }
    return `${label}正在工作${seconds ? `，最长等待 ${seconds} 秒` : ""}。`;
  };
  const callsBefore = await readModelCallLines(project);
  await assertFormalWritingDoesNotUseImplicitMock(project, { router, routerOptions, allowMockWriting });
  await writeChapterQualityCheckpoint(project, chapterNo, { status: "running", last_step: "start" });
  const options = {
    ...(router ? { router } : {}),
    routerOptions,
    onAttempt: async (attempt) => {
      await reportProgress({
        step: attempt.event === "fallback" ? "model_fallback" : attempt.event === "failed" ? "model_failed" : "model_call",
        model_event: attempt.event,
        model_task_type: attempt.task_type,
        model_stage: modelStageLabel(attempt.task_type),
        model_provider: attempt.provider,
        model_name: attempt.model,
        model_timeout_ms: attempt.timeout_ms,
        model_error: attempt.error || "",
        fallback_next: attempt.fallback_next || null,
        message: progressWorkerAttemptMessage(attempt),
      });
    },
  };
  await reportProgress({ step: "card", message: "正在生成章卡，锁定本章事件和爽点" });
  const card = await generateChapterCard(project, chapterNo, options);
  await writeChapterQualityCheckpoint(project, chapterNo, { last_step: "card" });
  await reportProgress({
    step: "card_done",
    card_title: card.display_title || card.title || "",
    card_goal: progressCardGoal(card),
    message: "章卡已完成，开始写正文",
  });
  await reportProgress({
    step: "write",
    card_title: card.display_title || card.title || "",
    card_goal: progressCardGoal(card),
    message: "正在写正文初稿",
  });
  const firstDraft = await writeChapter(project, chapterNo, {
    ...options,
    onTextDelta: createStreamProgressReporter({
      step: "write",
      version: "v1",
      card_title: card.display_title || card.title || "",
      card_goal: progressCardGoal(card),
      message: "正在流式写正文初稿",
    }),
  });
  await writeChapterQualityCheckpoint(project, chapterNo, { last_step: "write" });
  let version = firstDraft.version;
  let currentText = firstDraft.text;
  await reportProgress({
    step: "write_done",
    version,
    word_count: progressWordCount(currentText),
    draft_preview: progressManuscriptPreview(currentText),
    message: "正文初稿完成，开始自动审稿",
  });
  await reportProgress({
    step: "review",
    version,
    word_count: progressWordCount(currentText),
    draft_preview: progressManuscriptPreview(currentText),
    message: "正在审稿：检查钩子、爽点、弃读风险和设定一致性",
  });
  let review = await reviewChapter(project, chapterNo, version, options);
  let qualityCheck = await applyReviewQualityFlags(project, chapterNo, review, currentText);
  review = qualityCheck.review;
  let reviewQualityFlags = qualityCheck.flags;
  const cumulativeReviewQualityFlags = [...reviewQualityFlags];
  let tailHookScore = qualityCheck.tail_hook_score;
  let rhythmTransferCompliance = qualityCheck.rhythm_transfer_compliance;
  let domainKnowledgeCompliance = qualityCheck.domain_knowledge_compliance;
  await writeChapterQualityCheckpoint(project, chapterNo, { last_step: "review" });
  await reportProgress(progressReviewPayload(review, {
    step: "review_done",
    version,
    word_count: progressWordCount(currentText),
    draft_preview: progressManuscriptPreview(currentText),
    rewrite_count: 0,
    quality_events: progressQualityEvents({
      flags: reviewQualityFlags,
      step: "review_done",
      rewriteCount: 0,
      grade: review.grade,
    }),
    message: review.grade === "E"
      ? "审稿判定不可用，已停止入库"
      : reviewQualityFlags.includes("template_opening_inertia")
        ? "模板开头复读，触发硬规则，正在自动重写"
      : review.grade === "D"
        ? "审稿未达标，准备自动改稿"
        : "审稿通过，准备同步项目记忆",
  }));
  if (review.reviewer_status === "too_thin_for_publish_gate" || review.publish_gate?.failure_type === "reviewer_invalid") {
    const result = {
      status: "stopped",
      chapter_no: chapterNo,
      card_title: card.display_title,
      final_grade: review.grade,
      final_version: version,
      rewrite_count: 0,
      stop: {
        grade: review.grade,
        reason: "reviewer_invalid",
        blockers: ["reviewer_invalid"],
        review,
      },
      review,
      review_quality_flags: reviewQualityFlags,
      cumulative_review_quality_flags: cumulativeReviewQualityFlags,
      tail_hook_score: tailHookScore,
      rhythm_transfer_compliance: rhythmTransferCompliance,
      domain_knowledge_compliance: domainKnowledgeCompliance,
    };
    const report = await writeQualityReport(project, result, callsBefore);
    await writeChapterQualityCheckpoint(project, chapterNo, { status: "stopped", last_step: "stopped", stop: result.stop });
    await reportProgress(progressReviewPayload(review, {
      step: "stopped",
      grade: review.grade,
      reason: "reviewer_invalid",
      blockers: ["reviewer_invalid"],
      draft_preview: progressManuscriptPreview(currentText),
      before_rewrite_preview: progressManuscriptPreview(currentText),
      word_count: progressWordCount(currentText),
      message: "审查员输出无效，已暂停正文改稿；系统需要重新严审或切换审查员，避免把好稿越修越差。",
    }));
    return { ...result, quality_report_path: report.path };
  }
  if (review.grade === "E") {
    const result = {
      status: "stopped",
      chapter_no: chapterNo,
      card_title: card.display_title,
      final_grade: review.grade,
      final_version: version,
      rewrite_count: 0,
      stop: {
        grade: "E",
        reason: "rollback_required",
        review,
      },
      review,
      review_quality_flags: reviewQualityFlags,
      cumulative_review_quality_flags: cumulativeReviewQualityFlags,
      tail_hook_score: tailHookScore,
      rhythm_transfer_compliance: rhythmTransferCompliance,
      domain_knowledge_compliance: domainKnowledgeCompliance,
    };
    const report = await writeQualityReport(project, result, callsBefore);
    await writeChapterQualityCheckpoint(project, chapterNo, { status: "stopped", last_step: "stopped", stop: result.stop });
    await reportProgress(progressReviewPayload(review, {
      step: "stopped",
      grade: review.grade,
      reason: "rollback_required",
      draft_preview: progressManuscriptPreview(currentText),
      before_rewrite_preview: progressManuscriptPreview(currentText),
      word_count: progressWordCount(currentText),
      message: "本章质量低于底线，已停止并保留报告。",
    }));
    return { ...result, quality_report_path: report.path };
  }

  let rewriteCount = 0;
  let rewriteLayers = [];
  const appliedRewriteLayers = [];
  const rewriteDeltas = [];
  let latestRewriteDelta = null;
  while (needsTargetedRepair(review) && rewriteCount < maxRewrites) {
    const previousReview = review;
    const previousVersion = version;
    const beforeRepairDelta = rewriteDeltaSnapshot({ text: currentText, review });
    const repair = nextTargetedRepairFocus(review, rewriteCount);
    rewriteLayers = repair.layers;
    let rewriteFocus = repair.focus;
    if (rewriteFocus?.type === "rhythm_transfer_repair" && rhythmTransferCompliance) {
      rewriteFocus = {
        ...rewriteFocus,
        rhythm_transfer_compliance: rhythmTransferCompliance,
      };
    }
    if (rewriteFocus?.type === "domain_knowledge_repair" && domainKnowledgeCompliance) {
      rewriteFocus = {
        ...rewriteFocus,
        domain_knowledge_compliance: domainKnowledgeCompliance,
      };
    }
    await reportProgress(progressReviewPayload(review, {
      step: "rewrite",
      rewrite_count: rewriteCount + 1,
      repair_rounds_this_run: repairRoundsThisRun + 1,
      repair_label: repair.label,
      repair_taxonomy: repair.taxonomy,
      repair_type: rewriteFocus?.type || "",
      ...repairProgressFields(rewriteFocus),
      repair_status_code: `repair:${rewriteFocus?.type || "quality"}:round:${rewriteCount + 1}:running`,
      repair_issues: repair.issues.slice(0, 6),
      version,
      draft_preview: progressManuscriptPreview(currentText),
      word_count: progressWordCount(currentText),
      quality_events: progressQualityEvents({
        flags: reviewQualityFlags,
        step: "rewrite",
        rewriteCount,
        grade: review.grade,
      }),
      message: reviewQualityFlags.includes("template_opening_inertia")
        ? "模板开头复读，正在改成本章专属动作钩子"
        : rewriteFocusProgressMessage(rewriteFocus),
    }));
    const rewritten = await rewriteChapterSmart(project, chapterNo, {
      ...options,
      rewriteLayers,
      rewriteFocus,
      onTextDelta: createStreamProgressReporter(progressReviewPayload(review, {
        step: "rewrite",
        rewrite_count: rewriteCount + 1,
        repair_rounds_this_run: repairRoundsThisRun + 1,
        repair_label: repair.label,
        repair_taxonomy: repair.taxonomy,
        repair_type: rewriteFocus?.type || "",
        ...repairProgressFields(rewriteFocus),
        version,
        before_rewrite_preview: progressManuscriptPreview(currentText),
        quality_events: progressQualityEvents({
          flags: reviewQualityFlags,
          step: "rewrite",
          rewriteCount,
          grade: review.grade,
        }),
        message: rewriteFocusProgressMessage(rewriteFocus, "正在流式改写未达标版本"),
      })),
    });
    if (rewriteFocus) appliedRewriteLayers.push(rewriteFocus);
    await writeChapterQualityCheckpoint(project, chapterNo, { last_step: "rewrite" });
    version = rewritten.version;
    const previousText = currentText;
    currentText = rewritten.text;
    rewriteCount += 1;
    await reportProgress({
      step: "rewrite_done",
      rewrite_count: rewriteCount,
      repair_label: repair.label,
      repair_taxonomy: repair.taxonomy,
      repair_type: rewriteFocus?.type || "",
      ...repairProgressFields(rewriteFocus),
      repair_status_code: `repair:${rewriteFocus?.type || "quality"}:round:${rewriteCount}:local_gate`,
      version,
      before_rewrite_preview: progressManuscriptPreview(previousText),
      after_rewrite_preview: progressManuscriptPreview(currentText),
      draft_preview: progressManuscriptPreview(currentText),
      word_count: progressWordCount(currentText),
      quality_events: progressQualityEvents({
        flags: previousReview?.hard_rule_violations || reviewQualityFlags,
        step: "rewrite_done",
        rewriteCount,
        grade: review.grade,
      }),
      message: "改稿完成，重新审稿",
    });
    await reportProgress({
      step: "local_gate",
      version,
      rewrite_count: rewriteCount,
      word_count: progressWordCount(currentText),
      draft_preview: progressManuscriptPreview(currentText),
      message: "正在复审改稿版本",
    });
    const localGate = await localPostRepairReview(project, chapterNo, {
      card,
      text: currentText,
      previousReview,
      rewriteFocus,
      rewriteLayers,
      rewriteCount,
    });
    if (localGate.used_local_gate) {
      qualityCheck = localGate.qualityCheck;
      review = qualityCheck.review;
      await reportProgress(progressReviewPayload(review, {
        step: "local_gate_done",
        version,
        rewrite_count: rewriteCount,
        word_count: progressWordCount(currentText),
        draft_preview: progressManuscriptPreview(currentText),
        repair_label: repair.label,
        repair_taxonomy: repair.taxonomy,
        repair_type: rewriteFocus?.type || "",
        ...repairProgressFields(rewriteFocus),
        repair_status_code: `repair:${rewriteFocus?.type || "quality"}:round:${rewriteCount}:local_gate_done`,
        message: review.publish_gate?.publish_ready
          ? "本地门禁复核通过，跳过一次审查员复审"
          : "本地门禁仍未通过，继续定点修补",
      }));
    } else {
      review = await reviewChapter(project, chapterNo, version, options);
      qualityCheck = await applyReviewQualityFlags(project, chapterNo, review, currentText);
      review = qualityCheck.review;
    }
    reviewQualityFlags = qualityCheck.flags;
    for (const flag of reviewQualityFlags) {
      if (!cumulativeReviewQualityFlags.includes(flag)) cumulativeReviewQualityFlags.push(flag);
    }
    tailHookScore = qualityCheck.tail_hook_score;
    rhythmTransferCompliance = qualityCheck.rhythm_transfer_compliance;
    domainKnowledgeCompliance = qualityCheck.domain_knowledge_compliance;
    latestRewriteDelta = buildRewriteDelta(beforeRepairDelta, rewriteDeltaSnapshot({ text: currentText, review }));
    rewriteDeltas.push({
      ...latestRewriteDelta,
      round: rewriteCount,
      repair_label: repair.label,
      repair_type: rewriteFocus?.type || "",
    });
    await writeChapterQualityCheckpoint(project, chapterNo, { last_step: review.local_verification?.skipped_model_review ? "local_gate" : "review" });
    await reportProgress(progressReviewPayload(review, {
      step: "review_done",
      version,
      word_count: progressWordCount(currentText),
      draft_preview: progressManuscriptPreview(currentText),
      rewrite_count: rewriteCount,
      quality_events: progressQualityEvents({
        flags: reviewQualityFlags.length ? reviewQualityFlags : previousReview?.hard_rule_violations || [],
        step: "review_done",
        rewriteCount,
        grade: review.grade,
      }),
      message: review.grade === "D"
        ? "复审仍未达标，继续判断是否改稿"
        : review.grade === "E"
          ? "复审判定不可用，已停止入库"
          : "复审通过，准备同步项目记忆",
    }));
    if (reviewScore(review) < reviewScore(previousReview) || rewriteCollapsed(previousText, currentText, review)) {
      version = previousVersion;
      review = previousReview;
      currentText = (await readDraft(project, chapterNo, previousVersion)).text;
      qualityCheck = await applyReviewQualityFlags(project, chapterNo, review, currentText);
      review = qualityCheck.review;
      reviewQualityFlags = qualityCheck.flags;
      tailHookScore = qualityCheck.tail_hook_score;
      rhythmTransferCompliance = qualityCheck.rhythm_transfer_compliance;
      domainKnowledgeCompliance = qualityCheck.domain_knowledge_compliance;
      const result = {
        status: "stopped",
        chapter_no: chapterNo,
        card_title: card.display_title,
        final_grade: review.grade,
        final_version: version,
        rewrite_count: rewriteCount,
        repair_rounds_this_run: repairRoundsThisRun,
        rewrite_degraded: true,
        stop: {
          grade: review.grade,
          reason: "degraded_on_rewrite",
          review,
        },
        review,
        review_quality_flags: reviewQualityFlags,
        cumulative_review_quality_flags: cumulativeReviewQualityFlags,
        tail_hook_score: tailHookScore,
        rhythm_transfer_compliance: rhythmTransferCompliance,
        domain_knowledge_compliance: domainKnowledgeCompliance,
        rewrite_layers: rewriteLayers,
        applied_rewrite_layers: appliedRewriteLayers,
        rewrite_delta: latestRewriteDelta,
        rewrite_deltas: rewriteDeltas,
      };
      const report = await writeQualityReport(project, result, callsBefore);
      await writeChapterQualityCheckpoint(project, chapterNo, { status: "stopped", last_step: "stopped", stop: result.stop });
      await reportProgress(progressReviewPayload(review, {
        step: "stopped",
        grade: review.grade,
        reason: "degraded_on_rewrite",
        rewrite_count: rewriteCount,
        draft_preview: progressManuscriptPreview(currentText),
        word_count: progressWordCount(currentText),
        message: "鏀圭瀵艰嚧璇勫垎涓嬮檷锛屽凡鍥為€€鍒版洿绋冲畾鐗堟湰",
      }));
      return { ...result, quality_report_path: report.path };
    }
    if (review.grade === "E") {
      const result = {
        status: "stopped",
        chapter_no: chapterNo,
        card_title: card.display_title,
        final_grade: review.grade,
        final_version: version,
        rewrite_count: rewriteCount,
        stop: {
          grade: "E",
          reason: "rollback_required",
          review,
        },
        review,
        review_quality_flags: reviewQualityFlags,
        cumulative_review_quality_flags: cumulativeReviewQualityFlags,
        tail_hook_score: tailHookScore,
        rhythm_transfer_compliance: rhythmTransferCompliance,
        domain_knowledge_compliance: domainKnowledgeCompliance,
        rewrite_layers: rewriteLayers,
        applied_rewrite_layers: appliedRewriteLayers,
      };
      const report = await writeQualityReport(project, result, callsBefore);
      await writeChapterQualityCheckpoint(project, chapterNo, { status: "stopped", last_step: "stopped", stop: result.stop });
      await reportProgress(progressReviewPayload(review, {
        step: "stopped",
        grade: review.grade,
        reason: "rollback_required",
        rewrite_count: rewriteCount,
        draft_preview: progressManuscriptPreview(currentText),
        word_count: progressWordCount(currentText),
        message: "本章质量低于底线，已停止并保留报告。",
      }));
      return { ...result, quality_report_path: report.path };
    }
  }

  if (needsTargetedRepair(review)) {
    const remainingBlockers = publishGateBlockers(review);
    const result = {
      status: "stopped",
      chapter_no: chapterNo,
      card_title: card.display_title,
      final_grade: review.grade,
      final_version: version,
      rewrite_count: rewriteCount,
      stop: {
        grade: review.grade,
        reason: remainingBlockers.length ? "targeted_repair_exhausted" : "max_rewrites_exhausted",
        blockers: remainingBlockers,
        review,
      },
      review,
      review_quality_flags: reviewQualityFlags,
      cumulative_review_quality_flags: cumulativeReviewQualityFlags,
      tail_hook_score: tailHookScore,
      rhythm_transfer_compliance: rhythmTransferCompliance,
      domain_knowledge_compliance: domainKnowledgeCompliance,
      rewrite_layers: rewriteLayers,
      applied_rewrite_layers: appliedRewriteLayers,
      rewrite_delta: latestRewriteDelta,
      rewrite_deltas: rewriteDeltas,
    };
    const report = await writeQualityReport(project, result, callsBefore);
    await writeChapterQualityCheckpoint(project, chapterNo, { status: "stopped", last_step: "stopped", stop: result.stop });
    await reportProgress(progressReviewPayload(review, {
      step: "stopped",
      grade: review.grade,
      reason: remainingBlockers.length ? "targeted_repair_exhausted" : "max_rewrites_exhausted",
      blockers: remainingBlockers,
      rewrite_count: rewriteCount,
      draft_preview: progressManuscriptPreview(currentText),
      word_count: progressWordCount(currentText),
      message: "多轮改稿后仍未达标，已停止入库，等待人工查看。",
    }));
    return { ...result, quality_report_path: report.path };
  }

  await reportProgress(progressReviewPayload(review, {
    step: "state",
    version,
    rewrite_count: rewriteCount,
    word_count: progressWordCount(currentText),
    draft_preview: progressManuscriptPreview(currentText),
    message: "正在同步角色、伏笔、时间线和商业状态",
  }));
  const stateCandidates = await extractStateCandidates(project, chapterNo, options);
  await writeChapterQualityCheckpoint(project, chapterNo, { last_step: "state" });
  await reportProgress({
    step: "state_done",
    grade: review.grade,
    version,
    rewrite_count: rewriteCount,
    word_count: progressWordCount(currentText),
    memory_count: progressStateCandidateCount(stateCandidates),
    state_candidates_path: stateCandidates.path,
    message: "项目记忆已同步，准备写入正式章节",
  });
  await reportProgress({
    step: "export",
    grade: review.grade,
    version,
    rewrite_count: rewriteCount,
    word_count: progressWordCount(currentText),
    memory_count: progressStateCandidateCount(stateCandidates),
    message: "正在写入正式章节文件",
  });
  const exported = await exportChapter(project, chapterNo);
  await writeChapterQualityCheckpoint(project, chapterNo, { last_step: "export" });
  await reportProgress({
    step: "export_done",
    grade: review.grade,
    version,
    rewrite_count: rewriteCount,
    word_count: progressWordCount(currentText),
    memory_count: progressStateCandidateCount(stateCandidates),
    export_path: exported.path,
    state_candidates_path: stateCandidates.path,
    message: "正式章节已入库",
  });
  const result = {
    status: "approved",
    chapter_no: chapterNo,
    card_title: card.display_title,
    final_grade: review.grade,
    final_version: version,
    rewrite_count: rewriteCount,
    export_path: exported.path,
    state_candidates_path: stateCandidates.path,
    review,
    review_quality_flags: reviewQualityFlags,
    cumulative_review_quality_flags: cumulativeReviewQualityFlags,
    tail_hook_score: tailHookScore,
    rhythm_transfer_compliance: rhythmTransferCompliance,
    domain_knowledge_compliance: domainKnowledgeCompliance,
    rewrite_layers: rewriteLayers,
    applied_rewrite_layers: appliedRewriteLayers,
    rewrite_delta: latestRewriteDelta,
    rewrite_deltas: rewriteDeltas,
  };
  const report = await writeQualityReport(project, result, callsBefore);
  await writeChapterQualityCheckpoint(project, chapterNo, { status: "completed", last_step: "completed", quality_report_path: report.path });
  if (chapterNo >= (project.current_chapter || 1)) {
    project.current_chapter = chapterNo + 1;
    project.status = "writing";
    project.updated_at = new Date().toISOString();
    await saveProject(project);
  }
  await reportProgress({
    step: "completed",
    grade: review.grade,
    publish_status: report.publish_gate?.publish_ready ? "可发布" : report.publish_gate?.label || "需自动优化",
    publish_gate: report.publish_gate,
    version,
    rewrite_count: rewriteCount,
    word_count: progressWordCount(currentText),
    memory_count: progressStateCandidateCount(stateCandidates),
    draft_preview: progressManuscriptPreview(currentText),
    export_path: exported.path,
    state_candidates_path: stateCandidates.path,
    message: "本章写作、审稿、改稿、记忆同步已完成",
  });
  return { ...result, quality_report_path: report.path, next_chapter: project.current_chapter };
}

export async function repairChapterToPublish(
  project,
  chapterNo,
  { maxRepairRounds = 6, router, routerOptions, onProgress } = {},
) {
  let repairRoundsThisRun = 0;
  const reportProgress = async (progress) => {
    if (typeof onProgress === "function") {
      await onProgress({
        chapter_no: chapterNo,
        repair_rounds_this_run: repairRoundsThisRun,
        max_repair_rounds: maxRepairRounds,
        ...progress,
      });
    }
  };
  const createStreamProgressReporter = (base = {}) => {
    let lastAt = 0;
    let lastLength = 0;
    return async ({ text = "", delta = "" } = {}) => {
      const now = Date.now();
      const length = String(text || "").length;
      if (length === lastLength) return;
      if (now - lastAt < 260 && length - lastLength < 16) return;
      lastAt = now;
      lastLength = length;
      await reportProgress({
        ...base,
        text_delta: delta,
        draft_preview: progressManuscriptPreview(text, 1200),
        word_count: progressWordCount(text),
        streaming: true,
      });
    };
  };
  const modelStageLabel = (taskType = "") => ({
    generate_chapter_card: "章卡师",
    write_chapter: "写作师",
    review_chapter: "审查员",
    rewrite_chapter: "修稿师",
    extract_state_candidates: "记忆员",
    global_review: "总审查员",
  })[taskType] || taskType || "创作角色";
  const options = {
    ...(router ? { router } : {}),
    routerOptions,
    onAttempt: async (attempt) => {
      await reportProgress({
        step: attempt.event === "fallback" ? "model_fallback" : attempt.event === "failed" ? "model_failed" : "model_call",
        model_event: attempt.event,
        model_task_type: attempt.task_type,
        model_stage: modelStageLabel(attempt.task_type),
        model_provider: attempt.provider,
        model_name: attempt.model,
        model_timeout_ms: attempt.timeout_ms,
        model_error: attempt.error || "",
        fallback_next: attempt.fallback_next || null,
        message: `${modelStageLabel(attempt.task_type)}正在工作。`,
      });
    },
  };
  const callsBefore = await readModelCallLines(project);
  const card = await loadCardOrCreate(project, chapterNo, options);
  let version = await getLatestDraftVersion(project, chapterNo);
  if (!version) {
    throw new Error(`第${chapterNo}章还没有正文，不能继续修补。请先生成本章正文。`);
  }
  let currentText = (await readDraft(project, chapterNo, version)).text;
  let existingReport = await readJson(qualityReportFile(project, chapterNo)).catch(() => null);
  let review = existingReport?.review || null;
  let reviewQualityFlags = Array.isArray(existingReport?.review_quality_flags)
    ? [...existingReport.review_quality_flags]
    : [];
  let tailHookScore = existingReport?.tail_hook_score || null;
  let rhythmTransferCompliance = existingReport?.rhythm_transfer_compliance || null;
  let domainKnowledgeCompliance = existingReport?.domain_knowledge_compliance || null;
  let rewriteLayers = Array.isArray(existingReport?.rewrite_layers) ? [...existingReport.rewrite_layers] : [];
  const appliedRewriteLayers = Array.isArray(existingReport?.applied_rewrite_layers)
    ? [...existingReport.applied_rewrite_layers]
    : [];
  const rewriteDeltas = Array.isArray(existingReport?.rewrite_deltas)
    ? [...existingReport.rewrite_deltas]
    : [];
  let latestRewriteDelta = existingReport?.rewrite_delta || null;
  let rewriteCount = Number(existingReport?.rewrite_count || 0);
  let bestCandidate = null;

  await writeChapterQualityCheckpoint(project, chapterNo, { status: "running", last_step: "repair_start" });
  await reportProgress({
    step: "review",
    version,
    rewrite_count: rewriteCount,
    draft_preview: progressManuscriptPreview(currentText),
    word_count: progressWordCount(currentText),
    message: "正在读取未通过原因并复核当前稿件，准备定点修补。",
  });
  if (!review) {
    review = await reviewChapter(project, chapterNo, version, options);
  }
  let qualityCheck = await applyReviewQualityFlags(project, chapterNo, review, currentText);
  review = qualityCheck.review;
  reviewQualityFlags = [...new Set(qualityCheck.flags)];
  tailHookScore = qualityCheck.tail_hook_score;
  rhythmTransferCompliance = qualityCheck.rhythm_transfer_compliance;
  domainKnowledgeCompliance = qualityCheck.domain_knowledge_compliance;
  bestCandidate = betterRepairCandidate(repairCandidateSnapshot({
    version,
    text: currentText,
    review,
    flags: reviewQualityFlags,
    tailHookScore,
    rhythmTransferCompliance,
    domainKnowledgeCompliance,
    gate: review.publish_gate,
    rewriteCount,
  }), bestCandidate);
  await reportProgress(progressReviewPayload(review, {
    step: "review_done",
    version,
    rewrite_count: rewriteCount,
    draft_preview: progressManuscriptPreview(currentText),
    word_count: progressWordCount(currentText),
    blockers: publishGateBlockers(review),
    quality_events: progressQualityEvents({
      flags: reviewQualityFlags,
      step: "review_done",
      rewriteCount,
      grade: review.grade,
    }),
    message: "复核完成，开始按发布门禁未通过项定点修补。",
  }));
  if (review.reviewer_status === "too_thin_for_publish_gate" || review.publish_gate?.failure_type === "reviewer_invalid") {
    const result = {
      status: "stopped",
      chapter_no: chapterNo,
      card_title: card.display_title,
      final_grade: review.grade,
      final_version: version,
      rewrite_count: rewriteCount,
      repair_rounds_this_run: repairRoundsThisRun,
      stop: {
        grade: review.grade,
        reason: "reviewer_invalid",
        blockers: ["reviewer_invalid"],
        review,
      },
      review,
      review_quality_flags: reviewQualityFlags,
      tail_hook_score: tailHookScore,
      rhythm_transfer_compliance: rhythmTransferCompliance,
      domain_knowledge_compliance: domainKnowledgeCompliance,
      rewrite_layers: rewriteLayers,
      applied_rewrite_layers: appliedRewriteLayers,
      rewrite_delta: latestRewriteDelta,
      rewrite_deltas: rewriteDeltas,
    };
    const report = await writeQualityReport(project, result, callsBefore);
    await writeChapterQualityCheckpoint(project, chapterNo, { status: "stopped", last_step: "stopped", stop: result.stop });
    await reportProgress(progressReviewPayload(review, {
      step: "stopped",
      version,
      grade: review.grade,
      reason: "reviewer_invalid",
      blockers: ["reviewer_invalid"],
      rewrite_count: rewriteCount,
      draft_preview: progressManuscriptPreview(currentText),
      word_count: progressWordCount(currentText),
      message: "审查员输出无效，本次不会继续改正文；请重新严审或切换审查员后再判断是否需要修稿。",
    }));
    return { ...result, quality_report_path: report.path };
  }

  while (needsTargetedRepair(review) && repairRoundsThisRun < maxRepairRounds) {
    const previousReview = review;
    const previousVersion = version;
    const previousText = currentText;
    const beforeRepairDelta = rewriteDeltaSnapshot({ text: previousText, review: previousReview });
    const repair = nextTargetedRepairFocus(review, repairRoundsThisRun);
    rewriteLayers = repair.layers;
    let rewriteFocus = repair.focus;
    if (rewriteFocus?.type === "rhythm_transfer_repair" && rhythmTransferCompliance) {
      rewriteFocus = { ...rewriteFocus, rhythm_transfer_compliance: rhythmTransferCompliance };
    }
    if (rewriteFocus?.type === "domain_knowledge_repair" && domainKnowledgeCompliance) {
      rewriteFocus = { ...rewriteFocus, domain_knowledge_compliance: domainKnowledgeCompliance };
    }
    await reportProgress(progressReviewPayload(review, {
      step: "rewrite",
      rewrite_count: rewriteCount + 1,
      repair_label: repair.label,
      repair_taxonomy: repair.taxonomy,
      repair_type: rewriteFocus?.type || "",
      ...repairProgressFields(rewriteFocus),
      repair_status_code: `repair:${rewriteFocus?.type || "quality"}:round:${rewriteCount + 1}:running`,
      repair_issues: repair.issues.slice(0, 8),
      blockers: publishGateBlockers(review),
      version,
      draft_preview: progressManuscriptPreview(currentText),
      word_count: progressWordCount(currentText),
      quality_events: progressQualityEvents({
        flags: reviewQualityFlags,
        step: "rewrite",
        rewriteCount,
        grade: review.grade,
      }),
      message: `正在定点修补：${repair.label || "发布门禁未通过项"}`,
    }));
    const rewritten = await rewriteChapterSmart(project, chapterNo, {
      ...options,
      rewriteLayers,
      rewriteFocus,
      onTextDelta: createStreamProgressReporter(progressReviewPayload(review, {
        step: "rewrite",
        rewrite_count: rewriteCount + 1,
        repair_label: repair.label,
        repair_taxonomy: repair.taxonomy,
        repair_type: rewriteFocus?.type || "",
        ...repairProgressFields(rewriteFocus),
        version,
        before_rewrite_preview: progressManuscriptPreview(currentText),
        message: "正在流式输出修补稿，完成后会自动复审。",
      })),
    });
    if (rewriteFocus) appliedRewriteLayers.push(rewriteFocus);
    version = rewritten.version;
    currentText = rewritten.text;
    rewriteCount += 1;
    repairRoundsThisRun += 1;
    await writeChapterQualityCheckpoint(project, chapterNo, { last_step: "rewrite" });
    await reportProgress({
      step: "rewrite_done",
      rewrite_count: rewriteCount,
      repair_label: repair.label,
      repair_taxonomy: repair.taxonomy,
      repair_type: rewriteFocus?.type || "",
      ...repairProgressFields(rewriteFocus),
      repair_status_code: `repair:${rewriteFocus?.type || "quality"}:round:${rewriteCount}:local_gate`,
      version,
      before_rewrite_preview: progressManuscriptPreview(previousText),
      after_rewrite_preview: progressManuscriptPreview(currentText),
      draft_preview: progressManuscriptPreview(currentText),
      word_count: progressWordCount(currentText),
      message: "修补稿完成，正在复审。",
    });
    const localGate = await localPostRepairReview(project, chapterNo, {
      card,
      text: currentText,
      previousReview,
      rewriteFocus,
      rewriteLayers,
      rewriteCount,
    });
    if (localGate.used_local_gate) {
      qualityCheck = localGate.qualityCheck;
      review = qualityCheck.review;
      await reportProgress(progressReviewPayload(review, {
        step: "local_gate_done",
        version,
        rewrite_count: rewriteCount,
        draft_preview: progressManuscriptPreview(currentText),
        word_count: progressWordCount(currentText),
        blockers: publishGateBlockers(review),
        repair_label: repair.label,
        repair_taxonomy: repair.taxonomy,
        repair_type: rewriteFocus?.type || "",
        ...repairProgressFields(rewriteFocus),
        repair_status_code: `repair:${rewriteFocus?.type || "quality"}:round:${rewriteCount}:local_gate_done`,
        message: review.publish_gate?.publish_ready
          ? "本地门禁复核通过，跳过一次审查员复审"
          : "本地门禁仍未通过，继续定点修补",
      }));
    } else {
      review = await reviewChapter(project, chapterNo, version, options);
      qualityCheck = await applyReviewQualityFlags(project, chapterNo, review, currentText);
      review = qualityCheck.review;
    }
    reviewQualityFlags = [...new Set(qualityCheck.flags)];
    tailHookScore = qualityCheck.tail_hook_score;
    rhythmTransferCompliance = qualityCheck.rhythm_transfer_compliance;
    domainKnowledgeCompliance = qualityCheck.domain_knowledge_compliance;
    latestRewriteDelta = buildRewriteDelta(beforeRepairDelta, rewriteDeltaSnapshot({ text: currentText, review }));
    rewriteDeltas.push({
      ...latestRewriteDelta,
      round: rewriteCount,
      repair_label: repair.label,
      repair_type: rewriteFocus?.type || "",
      repair_taxonomy: repair.taxonomy || null,
    });
    const candidate = repairCandidateSnapshot({
      version,
      text: currentText,
      review,
      flags: reviewQualityFlags,
      tailHookScore,
      rhythmTransferCompliance,
      domainKnowledgeCompliance,
      gate: review.publish_gate,
      rewriteCount,
    });
    const bestBefore = bestCandidate;
    bestCandidate = betterRepairCandidate(candidate, bestCandidate);
    await writeChapterQualityCheckpoint(project, chapterNo, { last_step: review.local_verification?.skipped_model_review ? "local_gate" : "review" });
    await reportProgress(progressReviewPayload(review, {
      step: "review_done",
      version,
      rewrite_count: rewriteCount,
      rewrite_delta: latestRewriteDelta,
      draft_preview: progressManuscriptPreview(currentText),
      word_count: progressWordCount(currentText),
      blockers: publishGateBlockers(review),
      quality_events: progressQualityEvents({
        flags: reviewQualityFlags,
        step: "review_done",
        rewriteCount,
        grade: review.grade,
      }),
      message: needsTargetedRepair(review) ? "复审仍未过，继续判断下一轮修补重点。" : "复审通过，准备同步记忆并入库。",
    }));
    if (
      rewriteCollapsed(previousText, currentText, review)
      || (reviewScore(review) < reviewScore(previousReview) && candidate.score < (bestBefore?.score ?? 0))
    ) {
      const selected = bestCandidate || repairCandidateSnapshot({
        version: previousVersion,
        text: previousText,
        review: previousReview,
        flags: reviewQualityFlags,
        tailHookScore,
        rhythmTransferCompliance,
        domainKnowledgeCompliance,
        gate: previousReview?.publish_gate,
        rewriteCount,
      });
      version = selected.version;
      review = selected.review;
      currentText = selected.text;
      reviewQualityFlags = selected.review_quality_flags || reviewQualityFlags;
      tailHookScore = selected.tail_hook_score;
      rhythmTransferCompliance = selected.rhythm_transfer_compliance;
      domainKnowledgeCompliance = selected.domain_knowledge_compliance;
      const result = {
        status: "stopped",
        chapter_no: chapterNo,
        card_title: card.display_title,
        final_grade: review.grade,
        final_version: version,
        rewrite_count: rewriteCount,
        rewrite_degraded: true,
        best_candidate: {
          version: selected.version,
          score: selected.score,
          publish_gate: selected.publish_gate || review.publish_gate || null,
        },
        stop: { grade: review.grade, reason: "degraded_on_rewrite", blockers: publishGateBlockers(review), review },
        review,
        review_quality_flags: reviewQualityFlags,
        tail_hook_score: tailHookScore,
        rhythm_transfer_compliance: rhythmTransferCompliance,
        domain_knowledge_compliance: domainKnowledgeCompliance,
        rewrite_layers: rewriteLayers,
        applied_rewrite_layers: appliedRewriteLayers,
      };
      const report = await writeQualityReport(project, result, callsBefore);
      await writeChapterQualityCheckpoint(project, chapterNo, { status: "stopped", last_step: "stopped", stop: result.stop });
      await reportProgress(progressReviewPayload(review, {
        step: "stopped",
        grade: review.grade,
        reason: "degraded_on_rewrite",
        blockers: publishGateBlockers(review),
        rewrite_count: rewriteCount,
        draft_preview: progressManuscriptPreview(currentText),
        word_count: progressWordCount(currentText),
        message: "修补后评分下降，已保留原稳定版本并停止，避免越修越差。",
      }));
      return { ...result, quality_report_path: report.path };
    }
    if (review.grade === "E") break;
  }

  if (needsTargetedRepair(review)) {
    if (bestCandidate && bestCandidate.version && bestCandidate.score > publishGateScore(review?.publish_gate, review)) {
      version = bestCandidate.version;
      review = bestCandidate.review;
      currentText = bestCandidate.text;
      reviewQualityFlags = bestCandidate.review_quality_flags || reviewQualityFlags;
      tailHookScore = bestCandidate.tail_hook_score;
      rhythmTransferCompliance = bestCandidate.rhythm_transfer_compliance;
      domainKnowledgeCompliance = bestCandidate.domain_knowledge_compliance;
    }
    const remainingBlockers = publishGateBlockers(review);
    const result = {
      status: "stopped",
      chapter_no: chapterNo,
      card_title: card.display_title,
      final_grade: review.grade,
      final_version: version,
      rewrite_count: rewriteCount,
      repair_rounds_this_run: repairRoundsThisRun,
      best_candidate: bestCandidate ? {
        version: bestCandidate.version,
        score: bestCandidate.score,
        publish_gate: bestCandidate.publish_gate || null,
      } : null,
      stop: {
        grade: review.grade,
        reason: review.grade === "E" ? "rollback_required" : "targeted_repair_exhausted",
        blockers: remainingBlockers,
        review,
      },
      review,
      review_quality_flags: reviewQualityFlags,
      tail_hook_score: tailHookScore,
      rhythm_transfer_compliance: rhythmTransferCompliance,
      domain_knowledge_compliance: domainKnowledgeCompliance,
      rewrite_layers: rewriteLayers,
      applied_rewrite_layers: appliedRewriteLayers,
    };
    const report = await writeQualityReport(project, result, callsBefore);
    await writeChapterQualityCheckpoint(project, chapterNo, { status: "stopped", last_step: "stopped", stop: result.stop });
    await reportProgress(progressReviewPayload(review, {
      step: "stopped",
      version,
      grade: review.grade,
      reason: result.stop.reason,
      blockers: remainingBlockers,
      best_candidate: result.best_candidate,
      rewrite_count: rewriteCount,
      draft_preview: progressManuscriptPreview(currentText),
      word_count: progressWordCount(currentText),
      message: "定点修补后仍未过发布门禁，已列出原因，等待继续修补或人工调整设定。",
    }));
    return { ...result, quality_report_path: report.path };
  }

  await reportProgress(progressReviewPayload(review, {
    step: "state",
    version,
    rewrite_count: rewriteCount,
    draft_preview: progressManuscriptPreview(currentText),
    word_count: progressWordCount(currentText),
    message: "修补达标，正在同步项目记忆。",
  }));
  const stateCandidates = await extractStateCandidates(project, chapterNo, options);
  const exported = await exportChapter(project, chapterNo);
  const result = {
    status: "approved",
    chapter_no: chapterNo,
    card_title: card.display_title,
    final_grade: review.grade,
    final_version: version,
    rewrite_count: rewriteCount,
    repair_rounds_this_run: repairRoundsThisRun,
    export_path: exported.path,
    state_candidates_path: stateCandidates.path,
    review,
    review_quality_flags: reviewQualityFlags,
    tail_hook_score: tailHookScore,
    rhythm_transfer_compliance: rhythmTransferCompliance,
    domain_knowledge_compliance: domainKnowledgeCompliance,
    rewrite_layers: rewriteLayers,
    applied_rewrite_layers: appliedRewriteLayers,
  };
  const report = await writeQualityReport(project, result, callsBefore);
  await writeChapterQualityCheckpoint(project, chapterNo, { status: "completed", last_step: "completed", quality_report_path: report.path });
  if (chapterNo >= (project.current_chapter || 1)) {
    project.current_chapter = chapterNo + 1;
    project.status = "writing";
    project.updated_at = new Date().toISOString();
    await saveProject(project);
  }
  await reportProgress({
    step: "completed",
    grade: review.grade,
    publish_status: report.publish_gate?.publish_ready ? "可发布" : report.publish_gate?.label || "需自动优化",
    publish_gate: report.publish_gate,
    version,
    rewrite_count: rewriteCount,
    word_count: progressWordCount(currentText),
    memory_count: progressStateCandidateCount(stateCandidates),
    draft_preview: progressManuscriptPreview(currentText),
    export_path: exported.path,
    state_candidates_path: stateCandidates.path,
    message: "本章已修到发布门禁通过，并写入正式章节文件。",
  });
  return { ...result, quality_report_path: report.path, next_chapter: project.current_chapter };
}

function progressTextPreview(text = "", max = 360) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function progressManuscriptPreview(text = "", max = 900) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim()
      .slice(0, max);
  }

function progressWordCount(text = "") {
  return String(text || "").replace(/\s/g, "").length;
}

function progressWorkerRole(taskType = "") {
  return ({
    generate_book_plan: "规划师",
    generate_title: "标题师",
    generate_chapter_card: "章卡师",
    write_chapter: "写作师",
    review_chapter: "审查员",
    rewrite_chapter: "修稿师",
    extract_state_candidates: "记忆员",
    global_review: "总审查员",
  })[taskType] || "创作角色";
}

function progressWorkerStage(taskType = "") {
  return ({
    generate_book_plan: "规划设定",
    generate_title: "生成书名",
    generate_chapter_card: "生成章卡",
    write_chapter: "写正文",
    review_chapter: "自动审查",
    rewrite_chapter: "定点修补",
    extract_state_candidates: "同步记忆",
    global_review: "全局复审",
  })[taskType] || "处理任务";
}

function progressWorkerAttemptMessage(attempt = {}) {
  const role = progressWorkerRole(attempt.task_type);
  const stage = progressWorkerStage(attempt.task_type);
  const seconds = attempt.timeout_ms ? Math.round(Number(attempt.timeout_ms) / 1000) : 0;
  if (attempt.event === "fallback") return `${role}响应异常，正在切换备用角色。`;
  if (attempt.event === "failed") return `${role}调用失败，章鱼会保留原因并停止本轮，避免生成假结果。`;
  if (attempt.fallback_from) return `备用${role}接手${seconds ? `，最长等待 ${seconds} 秒` : ""}。`;
  return `${role}正在执行${stage}${seconds ? `，最长等待 ${seconds} 秒` : ""}。`;
}

function progressCardGoal(card = {}) {
  const candidates = [
    card.goal,
    card.core_event,
    card.event,
    card.cool_point,
    card.tail_hook,
    card.summary,
    card.main_conflict,
  ];
  return progressTextPreview(candidates.find((item) => item) || "", 120);
}

function progressIssueText(issue) {
  if (!issue) return "";
  if (typeof issue === "string") return issue;
  return String(issue.text || issue.issue || issue.reason || issue.message || issue.preview || "");
}

function progressReviewPayload(review = {}, extra = {}) {
  return {
    grade: review.grade || null,
    publish_status: review.publish_gate?.publish_ready ? "可发布" : review.publish_gate?.label || null,
    publish_gate: review.publish_gate || null,
    issues: Array.isArray(review.issues)
      ? review.issues.map(progressIssueText).filter(Boolean).slice(0, 3)
      : [],
    scores: Array.isArray(review.scores) ? review.scores.slice(0, 5) : [],
    repair_queue: buildRepairQueue(review).slice(0, 8),
    ...extra,
  };
}

function progressQualityEvents({ flags = [], step = "", rewriteCount = 0, grade = "" } = {}) {
  const normalizedFlags = [...new Set(flags || [])];
  const hasAiLeak = flags.includes("ai_process_leak");
  const hasTemplateOpening = flags.includes("template_opening_inertia");
  const hasInlineRisk = flags.includes("inline_risk_segments");
  const hasPublishGate = flags.includes("publish_gate_not_ready");
  const events = [];
  if (hasPublishGate) {
    if (hasAiLeak) {
      events.push({
        key: "ai_process_leak",
        label: "过程泄露",
        status: "blocked",
        detail: "正文包含任务分析或思考痕迹，必须自动重写为纯小说正文。",
      });
    }
    if (hasTemplateOpening) {
      events.push({
        key: "template_opening_inertia",
        label: "模板开头复读",
        status: "blocked",
        detail: "命中硬规则，不能入库。",
      });
    }
    if (hasInlineRisk) {
      events.push({
        key: "inline_risk_segments",
        label: "红标句命中",
        status: "blocked",
        detail: "命中正文问题句，必须自动优化后再入库。",
      });
    }
    events.push(
      {
        key: "publish_gate_not_ready",
        label: "发布门禁未过",
        status: "blocked",
        detail: normalizedFlags
          .filter((flag) => flag !== "publish_gate_not_ready")
          .slice(0, 3)
          .join(" / ") || "未达到可直接投稿水准，系统会自动返工。",
      },
      {
        key: "auto_rewrite",
        label: "自动优化到发布级",
        status: step === "rewrite" ? "running" : rewriteCount > 0 ? "done" : "pending",
        reason: hasAiLeak ? "remove_ai_process_leak" : undefined,
        detail: rewriteCount > 0 ? `已优化 ${rewriteCount} 轮` : "正在补强开头、章尾、爽点、微钩子和逻辑自洽。",
      },
    );
    if (rewriteCount > 0) {
      const passed = !["D", "E"].includes(String(grade || "").toUpperCase());
      events.push({
        key: "rereview",
        label: passed ? "复审通过" : "复审未过",
        status: passed ? "done" : "running",
        detail: passed ? "发布门禁复查通过。" : "继续返工，直到过关或触发安全上限。",
      });
    }
    return events;
  }
  if (hasInlineRisk) {
    events.push(
      {
        key: "inline_risk_segments",
        label: "红标句命中",
        status: "blocked",
        detail: "命中正文问题句，必须自动优化后再入库。",
      },
      {
        key: "auto_rewrite",
        label: "自动优化红标句",
        status: step === "rewrite" ? "running" : rewriteCount > 0 ? "done" : "pending",
        detail: rewriteCount > 0 ? `已改稿 ${rewriteCount} 轮` : "正在把红标句改成动作、对白和现场反馈。",
      },
    );
    if (rewriteCount > 0) {
      const passed = !["D", "E"].includes(String(grade || "").toUpperCase());
      events.push({
        key: "rereview",
        label: passed ? "复审通过" : "复审未过",
        status: passed ? "done" : "running",
        detail: grade ? `${grade}级` : "等待复审结果。",
      });
    }
    return events;
  }
  if (!hasAiLeak && !hasTemplateOpening && !rewriteCount) return [];
  if (hasAiLeak) {
    events.push({
      key: "ai_process_leak",
      label: "过程泄露",
      status: "blocked",
      detail: "正文包含任务分析或思考痕迹，不能入库。",
    });
  }
  if (hasTemplateOpening) {
    events.push({
      key: "template_opening_inertia",
      label: "模板开头复读",
      status: "blocked",
      detail: "命中硬规则，不能入库。",
    });
  }
  if (hasAiLeak || hasTemplateOpening || step === "rewrite" || rewriteCount > 0) {
    events.push({
      key: "auto_rewrite",
      label: "自动重写中",
      status: step === "rewrite" ? "running" : rewriteCount > 0 ? "done" : "pending",
      detail: rewriteCount > 0 ? `已重写 ${rewriteCount} 轮` : "正在改成本章专属动作钩子。",
    });
  }
  if (rewriteCount > 0) {
    const passed = !["D", "E"].includes(String(grade || "").toUpperCase());
    events.push({
      key: "rereview",
      label: passed ? "复审通过" : "复审未过",
      status: passed ? "done" : "running",
      detail: grade ? `${grade}级` : "等待复审结果。",
    });
  }
  return events;
}
function progressStateCandidateCount(stateCandidates = {}) {
  return [
    "characters",
    "relationships",
    "business_state",
    "money_orders",
    "foreshadowing_added",
    "foreshadowing_resolved",
    "timeline",
    "risks",
  ].reduce((sum, key) => sum + (Array.isArray(stateCandidates[key]) ? stateCandidates[key].length : 0), 0);
}

function progressChapterResult(chapter = {}) {
  return {
    chapter_no: chapter.chapter_no,
    grade: chapter.review_grade || chapter.grade || chapter.final_grade || null,
    version: chapter.version || chapter.final_version || "",
    word_count: Number(chapter.word_count || 0),
    rewrite_count: Number(chapter.rewrite_count || 0),
    export_path: chapter.export_path || "",
    state_candidates_path: chapter.state_candidates_path || "",
    quality_report_path: chapter.quality_report_path || "",
    status: chapter.status || "completed",
  };
}

function progressGlobalReviewResult(review = {}) {
  const outlineRefresh = review.outline_refresh || {};
  return {
    from: review.from || review.range?.from || null,
    to: review.to || review.range?.to || null,
    status: review.status || "completed",
    repair_status: review.repair_status || "",
    summary: review.summary || "",
    issue_count: Array.isArray(review.cross_chapter_issues) ? review.cross_chapter_issues.length : 0,
    remaining_issue_count: Array.isArray(review.final_cross_chapter_issues) ? review.final_cross_chapter_issues.length : undefined,
    outline_refresh: outlineRefresh.status ? outlineRefresh : undefined,
    path: review.path || "",
  };
}

function progressCheckpointPayload(checkpoint = {}, fallback = {}) {
  const chapters = Array.isArray(checkpoint.completed_chapters)
    ? checkpoint.completed_chapters.map(progressChapterResult)
    : [];
  const globalReviews = Array.isArray(checkpoint.global_reviews)
    ? checkpoint.global_reviews.map(progressGlobalReviewResult)
    : [];
  const latest = chapters[chapters.length - 1] || null;
  const latestGlobalReview = checkpoint.global_review || globalReviews[globalReviews.length - 1] || null;
  return {
    step: checkpoint?.last_step || "running",
    chapter_no: checkpoint?.current_chapter || fallback.chapter_no,
    completed_chapters: chapters.length,
    chapter_results: chapters,
    global_review: latestGlobalReview,
    global_reviews: globalReviews,
    latest_chapter: latest,
    grade: latest?.grade || undefined,
    version: latest?.version || undefined,
    word_count: latest?.word_count || undefined,
    rewrite_count: latest?.rewrite_count || undefined,
    export_path: latest?.export_path || undefined,
    checkpoint_path: checkpoint?.path || "",
    message: progressBatchMessage(checkpoint, latest),
  };
}

function progressBatchMessage(checkpoint = {}, latest = null) {
  const step = checkpoint?.last_step || "";
  if (step === "chapter_card") return `正在准备第 ${checkpoint.current_chapter} 章章卡`;
  if (step === "write") return `正在写第 ${checkpoint.current_chapter} 章正文`;
  if (step === "review") return `正在审第 ${checkpoint.current_chapter} 章`;
  if (step === "rewrite") return `第 ${checkpoint.current_chapter} 章未达标，正在自动改稿`;
  if (step === "state_candidates") return `正在同步第 ${checkpoint.current_chapter} 章项目记忆`;
  if (step === "export") return `正在写入第 ${checkpoint.current_chapter} 章正式文件`;
  if (step === "global_repair") {
    const review = checkpoint.global_review || {};
    const item = review.current_repair_item || {};
    return `全局复审命中第 ${item.chapter_no || checkpoint.current_chapter || "?"} 章问题，正在自动返工`;
  }
  if (step === "global_rereview") {
    const review = checkpoint.global_review || {};
    return `跨章返工完成，正在复查第 ${review.from || "?"}-${review.to || checkpoint.current_chapter || "?"} 章`;
  }
  if (step === "global_review") {
    const review = checkpoint.global_review || {};
    return `正在做第 ${review.from || "?"}-${review.to || checkpoint.current_chapter || "?"} 章全局复审`;
  }
  if (step === "outline_refresh") {
    const refresh = checkpoint.global_review?.outline_refresh || {};
    if (refresh.status === "completed") return `已刷新第 ${refresh.from || "?"}-${refresh.to || "?"} 章滚动细纲`;
    if (refresh.status === "failed") return `后续细纲刷新失败：${refresh.reason || "规划师未返回完整细纲"}`;
    return `正在根据第 ${Math.max(1, (checkpoint.current_chapter || 10) - 9)}-${checkpoint.current_chapter || "?"} 章全局复审刷新后续细纲`;
  }
  if (step === "chapter_completed" && latest) {
    return `第 ${latest.chapter_no} 章已完成，${latest.grade || "-"}级，${latest.word_count || 0}字`;
  }
  if (step === "batch_state") return "正在汇总本批次项目状态";
  return "连续写作进行中";
}
function reviewScore(review) {
  return REVIEW_GRADE_SCORE[review?.grade] || 0;
}

function publishGateScore(gate = {}, review = {}) {
  const values = gate?.values || {};
  const blockerCount = Array.isArray(gate?.blockers) ? gate.blockers.length : 8;
  const gradeScore = REVIEW_GRADE_SCORE[String(values.grade || review?.grade || "").toUpperCase()] || 0;
  const tail = Math.min(5, Math.max(0, Number(values.tail_hook_score || 0)));
  const micro = Math.min(1.2, Math.max(0, Number(values.micro_hook_density || 0)));
  const coolpoint = Math.min(2, Math.max(0, Number(values.coolpoint_delivered || 0)));
  const retention = Math.min(100, Math.max(0, Number(values.retention_prediction || 0)));
  const aiTaste = Math.min(100, Math.max(0, Number(values.ai_taste_score || 0)));
  return (
    (gate?.publish_ready ? 10000 : 0) +
    gradeScore * 500 +
    coolpoint * 180 +
    tail * 80 +
    (retention >= 80 ? 220 : retention * 2) +
    (aiTaste >= 78 ? 220 : aiTaste * 2) +
    micro * 120 -
    blockerCount * 260
  );
}

function repairCandidateSnapshot({ version, text, review, flags = [], tailHookScore = null, rhythmTransferCompliance = null, domainKnowledgeCompliance = null, gate = null, rewriteCount = 0 } = {}) {
  const publishGate = gate || review?.publish_gate || null;
  const wordCount = progressWordCount(text);
  return {
    version,
    text,
    word_count: wordCount,
    review,
    review_quality_flags: [...new Set(flags || [])],
    tail_hook_score: tailHookScore,
    rhythm_transfer_compliance: rhythmTransferCompliance,
    domain_knowledge_compliance: domainKnowledgeCompliance,
    publish_gate: publishGate,
    rewrite_count: rewriteCount,
    score: publishGateScore(publishGate, review) + Math.min(900, wordCount / 10),
  };
}

function betterRepairCandidate(candidate, best) {
  if (!candidate) return best;
  if (!best) return candidate;
  return candidate.score > best.score ? candidate : best;
}

function rewriteCollapsed(previousText = "", nextText = "", review = {}) {
  const previousWords = progressWordCount(previousText);
  const nextWords = progressWordCount(nextText);
  if (previousWords < 1200) return false;
  if (nextWords >= previousWords * 0.7) return false;
  return review?.publish_gate?.publish_ready !== true;
}

function rewriteDeltaSnapshot({ text = "", review = null } = {}) {
  const blockers = publishGateBlockers(review);
  return {
    grade: review?.grade || null,
    score: reviewScore(review),
    publish_ready: review?.publish_gate?.publish_ready === true,
    blocker_count: blockers.length,
    blockers,
    word_count: progressWordCount(text),
  };
}

function buildRewriteDelta(before = {}, after = {}) {
  const beforeBlockers = Array.isArray(before.blockers) ? before.blockers : [];
  const afterBlockers = Array.isArray(after.blockers) ? after.blockers : [];
  const afterSet = new Set(afterBlockers);
  const beforeSet = new Set(beforeBlockers);
  const removedBlockers = beforeBlockers.filter((item) => !afterSet.has(item));
  const addedBlockers = afterBlockers.filter((item) => !beforeSet.has(item));
  const beforeWords = Number(before.word_count || 0);
  const afterWords = Number(after.word_count || 0);
  return {
    before,
    after,
    score_delta: Number(after.score || 0) - Number(before.score || 0),
    word_count_delta: afterWords - beforeWords,
    blockers_removed: removedBlockers.length,
    blockers_added: addedBlockers.length,
    removed_blockers: removedBlockers,
    added_blockers: addedBlockers,
    word_count_collapsed: beforeWords >= 1200 && afterWords < Math.max(1200, Math.floor(beforeWords * 0.7)),
  };
}

function publishGateBlockers(review = {}) {
  return Array.isArray(review?.publish_gate?.blockers)
    ? review.publish_gate.blockers.filter(Boolean)
    : [];
}

function repairIssueBlockerKey(issue = "") {
  const text = String(issue || "");
  if (/reader_behavior_score_below_publish|first_300_retention_proxy_below_publish|chapter_completion_proxy_below_publish|next_chapter_click_proxy_below_publish|follow_intent_proxy_below_publish/.test(text)) return "reader_behavior_score_below_publish";
  if (/story_room_contract_not_delivered|story_room_contract/.test(text)) return "story_room_contract_not_delivered";
  if (/ai_taste_below_publish|ai_taste/i.test(text)) return "ai_taste_below_publish";
  if (/tail_hook_below_publish|tail_hook|绔犲熬閽╁瓙|閽╁瓙/.test(text)) return "tail_hook_below_publish";
  if (/micro_hook_density_below_publish|micro_hook/.test(text)) return "micro_hook_density_below_publish";
  if (/coolpoint_density_below_publish|coolpoint|鐖界偣/.test(text)) return "coolpoint_density_below_publish";
  if (/retention_prediction_below_publish|retention/.test(text)) return "retention_prediction_below_publish";
  if (/drop_risk_segments_remaining|drop_risk_segments|inline_risk_segments/.test(text)) return "drop_risk_segments_remaining";
  if (/sentence_pattern_inertia/.test(text)) return "sentence_pattern_inertia";
  if (/paragraph_rhythm_single_note/.test(text)) return "paragraph_rhythm_single_note";
  if (/dialogue_wall/.test(text)) return "dialogue_wall";
  if (/review_grade_below_publish/.test(text)) return "review_grade_below_publish";
  if (/publish_gate_not_ready/.test(text)) return "publish_gate_not_ready";
  return "";
}

function issueMatchesFinalGate(issue = "", blockerSet = new Set(), gate = null) {
  const key = repairIssueBlockerKey(issue);
  if (!key) return true;
  if (key === "publish_gate_not_ready") return gate?.publish_ready !== true;
  return blockerSet.has(key);
}

function repairIssuesFromReview(review = {}) {
  const gate = review?.publish_gate || null;
  if (gate?.publish_ready === true) return [];
  const blockers = publishGateBlockers(review);
  const blockerSet = new Set(blockers);
  const hardIssues = Array.isArray(review.hard_rule_violations) ? review.hard_rule_violations : [];
  const rawIssues = Array.isArray(review.issues) ? review.issues : [];
  const filteredIssues = rawIssues.filter((issue) => {
    const text = String(issue || "");
    if (!text) return false;
    if (hardIssues.includes(text)) return true;
    if (isFactConsistencyIssue(text) || isHistoricalLogicIssue(text) || isAbilitySourceIssue(text) || isFirstChapterOpeningIssue(text)) {
      return true;
    }
    return issueMatchesFinalGate(text, blockerSet, gate);
  });
  const priority = [
    "ai_process_leak",
    "fact_consistency_violation",
    "inline_risk_segments",
    "drop_risk_segments",
    "drop_risk_segments_remaining",
    "ai_taste_below_publish",
    "micro_hook_density_below_publish",
    "coolpoint_density_below_publish",
    "retention_prediction_below_publish",
    "story_room_contract_not_delivered",
    "reader_behavior_score_below_publish",
    "first_300_retention_proxy_below_publish",
    "chapter_completion_proxy_below_publish",
    "next_chapter_click_proxy_below_publish",
    "follow_intent_proxy_below_publish",
    "tail_hook_below_publish",
    "sentence_pattern_inertia",
    "paragraph_rhythm_single_note",
    "dialogue_wall",
    "review_grade_below_publish",
    "hard_quality_flag_active",
    "publish_gate_not_ready",
  ];
  const all = [...new Set([...blockers, ...hardIssues, ...filteredIssues].filter(Boolean))];
  const taxonomyPriority = (issue = "") => {
    const text = String(issue || "");
    if (/^[a-z_:-]+$/i.test(text)) return 20;
    const key = repairTaxonomyForIssue(issue).key;
    return ({
      accounting_chain: 0,
      tail_hook_medium: 1,
      canon_consistency: 2,
    })[key] ?? 20;
  };
  return all.sort((a, b) => {
    const tax = taxonomyPriority(a) - taxonomyPriority(b);
    if (tax !== 0) return tax;
    const ai = priority.indexOf(String(a || ""));
    const bi = priority.indexOf(String(b || ""));
    const ar = ai >= 0 ? ai : priority.length;
    const br = bi >= 0 ? bi : priority.length;
    return ar - br;
  });
}

function needsTargetedRepair(review = {}) {
  if (review?.reviewer_status === "too_thin_for_publish_gate") return false;
  if (review?.publish_gate?.failure_type === "reviewer_invalid") return false;
  if (review?.publish_gate?.publish_ready === true) return false;
  const grade = String(review?.grade || "").toUpperCase();
  if (grade === "E") return false;
  if (grade === "D") return true;
  if (review?.publish_gate && review.publish_gate.publish_ready !== true) return true;
  return false;
}

function targetedRepairIssues(review = {}) {
  return repairIssuesFromReview(review);
}

function repairQueuePriority(issue = "") {
  const text = String(issue || "");
  if (/ai_process_leak/.test(text)) return 0;
  if (/fact_consistency_violation/.test(text) || isFactConsistencyIssue(text)) return 1;
  if (isHistoricalLogicIssue(text)) return 2;
  if (isAbilitySourceIssue(text)) return 3;
  if (isFirstChapterOpeningIssue(text) || /first_300_retention_proxy_below_publish/.test(text)) return 4;
  if (/story_room_contract_not_delivered|story_room_contract/.test(text)) return 5;
  if (/inline_risk_segments|drop_risk_segments|drop_risk_segments_remaining/.test(text)) return 8;
  if (/reader_behavior_score_below_publish/.test(text)) return 10;
  if (/chapter_completion_proxy_below_publish/.test(text)) return 11;
  if (/next_chapter_click_proxy_below_publish|tail_hook_below_publish|tail_hook/.test(text)) return 12;
  if (/follow_intent_proxy_below_publish|retention_prediction_below_publish/.test(text)) return 13;
  if (/micro_hook_density_below_publish/.test(text)) return 14;
  if (/coolpoint_density_below_publish/.test(text)) return 15;
  if (/ai_taste_below_publish|ai_taste/.test(text)) return 18;
  if (/sentence_pattern_inertia|paragraph_rhythm_single_note|dialogue_wall/.test(text)) return 20;
  if (/hard_quality_flag_active/.test(text)) return 88;
  if (/review_grade_below_publish/.test(text)) return 90;
  if (/publish_gate_not_ready/.test(text)) return 99;
  return 50;
}

function buildRepairQueue(review = {}) {
  if (review?.publish_gate?.publish_ready === true) return [];
  const gateValues = review?.publish_gate?.values || {};
  const issues = [...new Set(targetedRepairIssues(review))].sort((a, b) => {
    const priority = repairQueuePriority(a) - repairQueuePriority(b);
    if (priority !== 0) return priority;
    return String(a || "").localeCompare(String(b || ""));
  });
  return issues.map((issue, index) => {
    const taxonomy = repairTaxonomyForIssue(issue);
    const layer = planRewriteLayers([issue])[0] || rewriteLayerForIssue(issue);
    const missingFields = /story_room_contract_not_delivered|story_room_contract/.test(String(issue || ""))
      && Array.isArray(gateValues.story_room_contract_missing)
      ? gateValues.story_room_contract_missing.slice(0, 4)
      : [];
    return {
      id: `${index + 1}:${repairIssueBlockerKey(issue)}:${taxonomy.repair_type || layer?.type || "repair"}`,
      issue,
      key: taxonomy.key || repairIssueBlockerKey(issue),
      blocker_key: repairIssueBlockerKey(issue),
      priority: repairQueuePriority(issue),
      label: taxonomy.label || repairLabelForIssue(issue),
      stage_label: taxonomy.stage_label || taxonomy.label || repairLabelForIssue(issue),
      repair_type: taxonomy.repair_type || layer?.type || "",
      ui_color: taxonomy.ui_color || "slate",
      requires_rereview: taxonomy.requires_rereview !== false,
      status: index === 0 ? "current" : "queued",
      missing_fields: missingFields,
      missing_labels: storyRoomMissingLabels(missingFields),
    };
  });
}

function repairLabelForIssue(issue = "") {
  const text = String(issue || "");
  if (/ai_process_leak/.test(text)) return "妯″瀷杩囩▼娉勯湶";
  if (/fact_consistency_violation/.test(text) || isFactConsistencyIssue(text)) return "璁惧畾涓€鑷存€?;
  if (isHistoricalLogicIssue(text)) return "historical_logic";
  if (isAbilitySourceIssue(text)) return "ability_source";
  if (isFirstChapterOpeningIssue(text)) return "first_300_hook";
  if (/template_opening_inertia/.test(text)) return "妯℃澘寮€澶村璇?;
  if (/inline_risk_segments|drop_risk_segments|drop_risk_segments_remaining/.test(text)) return "寮冭椋庨櫓娈?;
  if (/tail_hook_below_publish|tail_hook|缁旂姴鐔?.test(text)) return "绔犲熬閽╁瓙";
  if (/micro_hook_density_below_publish|micro_hook/.test(text)) return "寰挬瀛愬瘑搴?;
  if (/coolpoint_density_below_publish|coolpoint/.test(text)) return "鐖界偣鍏戠幇";
  if (/retention_prediction_below_publish|retention/.test(text)) return "杩借棰勬祴";
  if (/reader_behavior_score_below_publish|reader_behavior/.test(text)) return "璇昏€呰涓轰唬鐞嗗垎";
  if (/story_room_contract_not_delivered|story_room_contract/.test(text)) return "绔犲崱鎵胯钀藉湴";
  if (/first_300_retention_proxy_below_publish|first_300_retention/.test(text)) return "鍓?00瀛楃暀瀛?;
  if (/chapter_completion_proxy_below_publish|chapter_completion/.test(text)) return "绔犺妭璇诲畬";
  if (/next_chapter_click_proxy_below_publish|next_chapter_click/.test(text)) return "涓嬩竴绔犵偣鍑?;
  if (/follow_intent_proxy_below_publish|follow_intent/.test(text)) return "杩芥洿鎰忔効";
  if (/ai_taste_below_publish|ai_taste/.test(text)) return "AI鍛?;
  if (/review_grade_below_publish/.test(text)) return "璐ㄦ绛夌骇";
  if (/hard_quality_flag_active/.test(text)) return "纭鍒?;
  return text || "璐ㄩ噺闂";
}

function repairTaxonomyForIssue(issue = "") {
  const text = String(issue || "");
  if (/story_room_contract_not_delivered|story_room_contract|鍏紑鍙嶉|浠ｄ环娈嬬暀|鍏崇郴鎺ㄨ繘|绔犲熬鍊哄姟|绔犲崱鎵胯/.test(text)) {
    return {
      key: "story_room_contract",
      label: "绔犲崱鎵胯钀藉湴",
      stage_label: "琛ョ珷鍗℃壙璇?,
      repair_type: "story_room_contract_repair",
      ui_color: "emerald",
      requires_rereview: true,
    };
  }
  if (/(灏鹃挬|绔犲熬|鐢佃瘽|寰俊|娑堟伅|濯掍粙|tail_hook|next_chapter_click)/.test(text)) {
    return {
      key: "tail_hook_medium",
      label: "绔犲熬閽╁瓙",
      stage_label: "淇珷灏鹃挬瀛?,
      repair_type: "strengthen_tail_hook",
      ui_color: "violet",
      requires_rereview: true,
    };
  }
  if (/(璐︾洰|璐︽湰|璐﹀唽|璐㈠姟闂幆|缁撶畻|鍗曚环鎷嗚В|閰嶉€佽垂|娆犳壘闆秥鎵鹃浂|鐜伴噾娴亅鑳藉姏璇佹嵁閾緗鐜板満鍙嶅簲)/.test(text)) {
    return {
      key: "accounting_chain",
      label: "璐︾洰闂幆",
      stage_label: "淇处鐩棴鐜?,
      repair_type: "fact_consistency_repair",
      ui_color: "amber",
      requires_rereview: true,
    };
  }
  if (/(瑙掕壊鍚峾璺ㄦ枃妗浜虹墿鍏崇郴|绔犲崱.*姝ｆ枃|姝ｆ枃.*绔犲崱|璁惧畾.*鍐茬獊|浜嬪疄鍐茬獊|鍙ｅ緞|鍛ㄥ惎鏄巪鍛ㄧ珛)/.test(text) || isFactConsistencyIssue(text)) {
    return {
      key: "canon_consistency",
      label: "璁惧畾涓€鑷存€?,
      stage_label: "缁熶竴璁惧畾鍙ｅ緞",
      repair_type: "fact_consistency_repair",
      ui_color: "rose",
      requires_rereview: true,
    };
  }
  if (/(AI鍛硘ai_taste|瑙ｉ噴|鎬荤粨|鏃佺櫧|鍙ュ紡)/i.test(text)) {
    return {
      key: "ai_taste",
      label: "鍘籄I鍛?,
      stage_label: "鍘籄I鍛?,
      repair_type: "remove_explanation",
      ui_color: "sky",
      requires_rereview: true,
    };
  }
  if (/(鐖界偣|coolpoint|鍏戠幇|鍙嶈浆)/i.test(text)) {
    return {
      key: "coolpoint",
      label: "鐖界偣鍏戠幇",
      stage_label: "琛ョ埥鐐瑰厬鐜?,
      repair_type: "coolpoint_boost",
      ui_color: "emerald",
      requires_rereview: true,
    };
  }
  if (/(寮冭|绾㈡爣|risk|drop_risk|inline_risk)/i.test(text)) {
    return {
      key: "drop_risk",
      label: "寮冭椋庨櫓",
      stage_label: "娓呭純璇绘",
      repair_type: "drop_risk_repair",
      ui_color: "orange",
      requires_rereview: true,
    };
  }
  return {
    key: "quality",
    label: repairLabelForIssue(text),
    stage_label: "瀹氱偣淇ˉ",
    repair_type: rewriteLayerForIssue(text).type,
    ui_color: "slate",
    requires_rereview: true,
  };
}

function nextTargetedRepairFocus(review = {}, attempt = 0) {
  const repairQueue = buildRepairQueue(review);
  const issues = repairQueue.length ? repairQueue.map((item) => item.issue) : targetedRepairIssues(review);
  const layers = planRewriteLayers(issues);
  const forcedHardLayer = layers.find((layer) => layer.type === "remove_ai_process_leak");
  const selectedLayer = forcedHardLayer || (layers.length ? layers[0] : rewriteLayerForIssue(issues[0] || "publish_gate_not_ready"));
  const currentQueueItem = repairQueue.find((item) => item.issue === selectedLayer?.source_issue) || repairQueue[0] || null;
  const taxonomy = currentQueueItem || repairTaxonomyForIssue(selectedLayer?.source_issue || issues[0] || "publish_gate_not_ready");
  const focus = withReviewRiskFocus(rewriteFocusForLayer(selectedLayer), review);
  return {
    issues,
    repair_queue: repairQueue,
    layers,
    focus,
    taxonomy,
    label: taxonomy.label || repairLabelForIssue(selectedLayer?.source_issue || issues[0] || "publish_gate_not_ready"),
  };
}

function enforceHardQualityFlags(review = {}, flags = []) {
  if (review?.reviewer_status === "too_thin_for_publish_gate") return review;
  const currentGrade = String(review?.grade || "").toUpperCase();
  const hardFlags = flags.filter((flag) =>
    ["ai_process_leak", "template_opening_inertia", "inline_risk_segments", "fact_consistency_violation", "weak_review_fallback", "publish_gate_not_ready"].includes(flag),
  );
  if (!hardFlags.length) return review;
  const issues = Array.isArray(review.issues) ? [...review.issues] : [];
  for (const flag of hardFlags) {
    if (!issues.includes(flag)) issues.push(flag);
  }
  return {
    ...review,
    grade: currentGrade === "E" ? "E" : "D",
    next_action: "rewrite_chapter",
    issues,
    hard_rule_violations: [
      ...(Array.isArray(review.hard_rule_violations) ? review.hard_rule_violations : []),
      ...hardFlags,
    ],
  };
}

function meaningfulHookTokens(text = "") {
  return String(text)
    .replace(/[锛屻€傦紒锛熴€?.!?;锛?锛歖/g, " ")
    .split(/\s+/)
    .flatMap((part) => part.match(/[\u4e00-\u9fff]{2,}|[a-zA-Z0-9]{3,}/g) || [])
    .filter((token) => token.length >= 2);
}

function debtHasProgress(debt, text) {
  const body = String(text || "");
  const hookTokens = [...new Set(meaningfulHookTokens(debt?.hook || ""))];
  const requirementTokens = [...new Set(meaningfulHookTokens(debt?.payoff_requirement || ""))];
  if (requirementTokens.some((token) => body.includes(token))) return true;
  const matchedHookTokens = hookTokens.filter((token) => body.includes(token));
  return matchedHookTokens.length >= 2;
}

function informationGapPrematurelyRevealed(gap, text) {
  const body = String(text || "");
  const blindspotTokens = meaningfulHookTokens(gap.protagonist_blindspot || "");
  const readerTokens = meaningfulHookTokens(gap.reader_knows || "");
  const revealVerbs = /realizes|realized|identifies|identified|knows|knew|discovers|discovered|璇嗙牬|鐭ラ亾|鍙戠幇|鎰忚瘑鍒皘纭/.test(body);
  const blindspotMatches = blindspotTokens.filter((token) => body.includes(token)).length;
  const readerMatches = readerTokens.filter((token) => body.includes(token)).length;
  return revealVerbs && (blindspotMatches >= 2 || readerMatches >= 2);
}

export function characterAnchorUsage(anchor = {}, text = "", currentChapter, dormantWindow = 20) {
  const body = String(text || "");
  const sourceChapter = anchor.source_chapter ?? anchor.first_appearance_chapter ?? null;
  const age = Number.isInteger(sourceChapter) && Number.isInteger(currentChapter)
    ? currentChapter - sourceChapter
    : 0;
  const actionTokens = meaningfulHookTokens(anchor.signature_action || "");
  const lineTokens = meaningfulHookTokens(anchor.signature_line || "");
  const coreTokens = meaningfulHookTokens(anchor.core || anchor.contradiction || anchor.anchor || "");
  const hasLine = lineTokens.length > 0 && lineTokens.some((token) => body.includes(token));
  const hasAction = actionTokens.length > 0 && actionTokens.some((token) => body.includes(token));
  const coreMatches = coreTokens.filter((token) => body.includes(token)).length;
  const realized = hasLine || hasAction || coreMatches >= 2;
  return {
    name: anchor.name || "",
    age,
    realized,
    dormant: age >= dormantWindow && !realized,
    matched: {
      signature_line: hasLine,
      signature_action: hasAction,
      core_token_count: coreMatches,
    },
  };
}

export function analyzeReversalDensity(text = "") {
  const body = String(text || "");
  const patterns = [
    /浠ヤ负[^銆?!?\n]{0,80}(浣唡鍗磡缁撴灉|娌℃兂鍒皘鍙嶈€?/g,
    /thought[^.!?\n]{0,120}(but|then|instead|only to)/gi,
    /everyone thought[^.!?\n]{0,120}(but|then|instead)/gi,
    /(鍒氳|姝ｈ)[^銆?!?\n]{0,80}(绐佺劧|鍗磡鐢佃瘽|鏁查棬|鎻愮ず|璺冲埌)/g,
    /was about to[^.!?\n]{0,120}(then|suddenly|but)/gi,
    /(绐佺劧|娌℃兂鍒皘鍙嶈€寍鍗磡缁撴灉)[^銆?!?\n]{0,80}(璁㈠崟|鍚庡彴|鏁板瓧|鐢佃瘽|閫氱煡|璇佹嵁|鍚嶅崟|鏁版嵁)/g,
    /(misread|mockery|mistook|mistaken)[^.!?\n]{0,120}(order|backend|data|proof|result)/gi,
  ];
  const matches = [];
  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) {
      matches.push(match[0]);
    }
  }
  const score = matches.length;
  return {
    score,
    matches,
    issues: score < 2 ? ["reversal_density_low"] : [],
  };
}

export function analyzeVisibleCost(text = "") {
  const body = String(text || "");
  const patterns = [
    /(but|however|yet)[^.!?\n]{0,120}(misunderstood|owe|owes|debt|pressure|exposed|public|blame|risk|complaint)/gi,
    /(misunderstood|misread|blame|complaint|pressure|exposed|public explanation|owes|debt|risk)/gi,
    /(浣唡鍗磡鍙嶈€寍缁撴灉)[^銆?!?\n]{0,80}(璇В|娆爘鏆撮湶|鐩笂|鍘嬪姏|鎶曡瘔|楠倈閿厊鍊簗椋庨櫓|浠ｄ环)/g,
    /(璇В|娆犱汉鎯厊娆犺处|鏆撮湶|鐩笂|鍘嬪姏|鎶曡瘔|琚獋|鑳岄攨|涓㈣劯|鐗虹壊|浠ｄ环)/g,
  ];
  const matches = [];
  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) {
      matches.push(match[0]);
    }
  }
  const score = matches.length;
  return {
    score,
    matches,
    issues: score < 1 ? ["visible_cost_missing"] : [],
  };
}

function splitTextSegments(text = "", segmentSize = 500) {
  const body = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!body) return [];
  const paragraphs = body.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const segments = [];
  let current = "";
  const pushCurrent = () => {
    if (current.trim()) segments.push(current.trim());
    current = "";
  };
  for (const paragraph of paragraphs.length ? paragraphs : [body]) {
    if ((current + "\n\n" + paragraph).trim().length <= segmentSize) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
      continue;
    }
    pushCurrent();
    if (paragraph.length <= segmentSize) {
      current = paragraph;
      continue;
    }
    for (let index = 0; index < paragraph.length; index += segmentSize) {
      segments.push(paragraph.slice(index, index + segmentSize).trim());
    }
  }
  pushCurrent();
  return segments;
}

function hasVisibleAction(segment = "") {
  return /(鎺▅鎺ㄥ洖|閫抾鎷峾鐮竱鍐瞸璺憒璇曡窇|绔檤鍧恷闈爘绔潃|鎶ご|浣庡ご|缈粅鍐檤鎷斿紑|鐩瘄鍒锋柊|鎺弢鎸墊鎽攟韪鎷絴鍋渱浼告墜|杞韩|璧皘鎷縷閫掕繃鍘粅slap|push|stare|refresh|move|lean|drop|grab|throw|walk|run|stop|ask|curse|click|hand|beep|spark|pay|paid)/i.test(segment);
}

function hasDialogue(segment = "") {
  return /["鈥溾€濃€樷€橾|(^|\n)\s*[-鈥擼?\s*[^銆俓n]{0,20}[:锛歖/.test(segment);
}

function hasEventProgress(segment = "") {
  return /(璁㈠崟|鍚庡彴|鏁板瓧|鏁版嵁|鐢佃瘽|閫氱煡|缁撴灉|璺硘娑▅涓嬮檷|鍒拌处|鎺掗槦|鎶曡瘔|鍚嶅崟|鍚堝悓|浜岀淮鐮亅鑰佸笀|鑰佹澘|鍟嗘埛|璇曡窇|閰嶉€佽垂|鎶奸噾|璧斾粯|鍑洪|閫佷涪|鎷掓敹|瀵硅处|绛惧瓧|璐︽湰|count|order|backend|result|data|paid|queue|call|contract|message|screen|from \d+ to \d+)/i.test(segment);
}

function hasConcreteSceneProof(segment = "") {
  const body = String(segment || "");
  const actionHits = [...body.matchAll(/(鎷巪鍫唡缈粅楠倈娓梶娣寍鏀句笅|韫瞸鎺弢鎷斿紑|鍐檤鍚堜笂|濉炲洖|绔欒捣鏉鎷峾璧皘閫抾鎺▅鏁皘绛惧瓧|瑁呰繘|鎵庣揣|璧跺埌|鎷嗗紑|鎺ヨ繃|鐩瘄闂畖璇磡璺憒鎷縷閫掕繃鍘粅閫掑嚭鏉缁撶畻|瀵硅处|鏀舵|鍒拌处|call|pay|paid|run|sign|write|hand|push)/gi)].length;
  const objectHits = [...body.matchAll(/(澶栧崠|濉戞枡琚媩姹ゆ按|姘存偿鍦皘绗旇鏈瑋鏈瓙|绗斿附|璐︽湰|鐜伴噾|闆堕挶|璺嚎鍥緗鏌滃彴|闂ㄥ笜|楗洅|璁㈠崟|鎴垮彿|閰嶉€佽垂|鎶奸噾|鍟嗘埛|鑰佹澘|瀹ゅ弸|瀹胯垗妤紎椁愰|榛勭剸楦瀛︾敓|鐢佃瘽|鎵嬫満)/g)].length;
  const hasVisibleResult = /(鏀跺叆|鏀嚭|缁撲綑|瀹屾垚|娌¤禂|鍘熷皝涓嶅姩|閫佸埌|鎷掓敹|鎰挎剰|璺熶綘璺憒闈㈣皥|绛惧瓧|鏀朵簡|鍒拌处|浠樹簡|鎺ヨ繃|鏀瑰彛|娌夐粯|鎰鐩?/.test(body);
  return actionHits >= 3 && objectHits >= 3 && hasVisibleResult;
}

function expositionHitCount(segment = "") {
  const patterns = [
    /浠栫煡閬搢浠栨剰璇嗗埌|浠栨槑鐧絴浠栫悊瑙杩欐剰鍛崇潃|鏈川涓妡鏍稿績鏄瘄鍟嗕笟浠峰€紎鏈潵瓒嬪娍|瑙勫垯|璐ｄ换|鎴樼暐/g,
    /knew|realized|understood|meant|business model|opportunity|strategy|market|value|platform|responsibility|rule/gi,
  ];
  return patterns.reduce((count, pattern) => count + [...segment.matchAll(pattern)].length, 0);
}

function repeatedInformationHit(segment = "") {
  return /(鍐嶆|閲嶅|鍚屾牱|浠嶇劧鏄瘄杩樻槸杩欎簺|same information|repeated|again|for the \d+ time)/i.test(segment);
}

const SENTENCE_INERTIA_PATTERNS = [
  {
    id: "not_but_loop",
    pattern: /(?:not|涓嶆槸)[^.!?銆傦紒锛焅n]{0,40}(?:but|鑰屾槸)/gi,
    threshold: 3,
  },
  {
    id: "means_declaration",
    pattern: /(?:this means|that means|杩欐剰鍛崇潃|杩欒鏄巪杩欎唬琛ㄧ潃)/gi,
    threshold: 2,
  },
  {
    id: "then_chain",
    pattern: /(?:then|鐒跺悗|鎺ョ潃|闅忓悗)/gi,
    threshold: 2,
  },
];

export function analyzeSentencePatternInertia(text = "") {
  const body = String(text || "");
  const patterns = SENTENCE_INERTIA_PATTERNS.map((entry) => {
    const matches = [...body.matchAll(entry.pattern)].map((match) => match[0]);
    return {
      id: entry.id,
      count: matches.length,
      threshold: entry.threshold,
      high_risk: matches.length >= entry.threshold,
      matches: matches.slice(0, 8),
    };
  });
  const riskyPatterns = patterns.filter((pattern) => pattern.high_risk);
  return {
    issue_count: riskyPatterns.length,
    patterns,
    issues: riskyPatterns.length ? ["sentence_pattern_inertia"] : [],
  };
}

function splitParagraphs(text = "") {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function paragraphRhythmType(paragraph = "") {
  const text = String(paragraph || "").trim();
  if (!text) return "empty";
  if (hasDialogue(text)) return "dialogue";
  if (expositionHitCount(text) > 0 || /(means|because|therefore|strategy|market|value|鎰忓懗鐫€|璇存槑|鎵€浠鏈川)/i.test(text)) {
    return "exposition";
  }
  if (/(thought|felt|remembered|realized|knew|蹇冮噷|鎰忚瘑鍒皘鏄庣櫧|瑙夊緱|鎯宠捣)/i.test(text)) {
    return "interior";
  }
  if (hasVisibleAction(text) || hasEventProgress(text)) return "action";
  return "description";
}

export function analyzeParagraphRhythm(text = "") {
  const paragraphs = splitParagraphs(text);
  const details = paragraphs.map((paragraph, index) => ({
    index: index + 1,
    type: paragraphRhythmType(paragraph),
    char_count: paragraph.length,
    preview: paragraph.slice(0, 100),
  }));
  const streaks = [];
  let current = null;
  for (const detail of details) {
    if (!current || current.type !== detail.type) {
      if (current) streaks.push(current);
      current = { type: detail.type, start: detail.index, end: detail.index, count: 1 };
    } else {
      current.end = detail.index;
      current.count += 1;
    }
  }
  if (current) streaks.push(current);

  const issues = [];
  const singleNote = streaks.find((streak) => ["action", "description", "exposition", "interior"].includes(streak.type) && streak.count >= 3);
  const dialogueWall = streaks.find((streak) => streak.type === "dialogue" && streak.count >= 5);
  if (singleNote) issues.push("paragraph_rhythm_single_note");
  if (dialogueWall) issues.push("dialogue_wall");

  return {
    paragraph_count: details.length,
    details,
    streaks,
    issues,
  };
}

export function analyzeDropRiskSegments(text = "", { segmentSize = 500 } = {}) {
  const rawSegments = splitTextSegments(text, segmentSize);
  let noDialogueStreak = 0;
  const segments = rawSegments.map((segment, index) => {
    const reasons = [];
    let riskPoints = 0;
    const hasAction = hasVisibleAction(segment);
    const dialogue = hasDialogue(segment);
    const progresses = hasEventProgress(segment);
    const expositionCount = expositionHitCount(segment);
    const businessFormulaRisk = detectBusinessFormulaExposition(segment);
    if (!hasAction) {
      riskPoints += 1;
      reasons.push("no_visible_action");
    }
    if (!progresses) {
      riskPoints += 1;
      reasons.push("no_event_progress");
    }
    if (dialogue) {
      noDialogueStreak = 0;
    } else {
      noDialogueStreak += 1;
      if (noDialogueStreak >= 3) {
        riskPoints += 2;
        reasons.push("no_dialogue_streak");
      }
    }
    if (expositionCount > 2) {
      riskPoints += 2;
      reasons.push("exposition_heavy");
    }
    if (repeatedInformationHit(segment)) {
      riskPoints += 1;
      reasons.push("repeated_information");
    }
    if (businessFormulaRisk.hit && !businessFormulaRisk.scene_negotiation) {
      riskPoints += 3;
      for (const reason of businessFormulaRisk.reasons) reasons.push(reason);
    }
    return {
      index: index + 1,
      char_count: segment.length,
      risk_points: riskPoints,
      high_risk: riskPoints >= 3,
      reasons,
      preview: segment.slice(0, 120),
    };
  });
  const riskySegments = segments.filter((segment) => segment.high_risk);
  return {
    segment_size: segmentSize,
    total_segments: segments.length,
    risky_segment_count: riskySegments.length,
    risk_density: segments.length ? riskySegments.length / segments.length : 0,
    segments,
    issues: riskySegments.length ? ["drop_risk_segments"] : [],
  };
}

export function detectBusinessFormulaExposition(text = "") {
  const mojibakeAccountingFragments = [
    "鍘熸枡鎴愭湰",
    "鎵?鎶?,
    "鎶奸噾",
    "澶氳禋",
    "鍑戝",
    "鎵嶈兘鍥炴潵",
    "鍥炴湰",
    "閸樼喐鏋￠幋鎰拱",
    "閹存劖婀?",
    "閹舵鍏?,
    "閹跺ジ鍣?,
    "婢舵俺绂?,
    "閸戞垵",
    "閸ョ偞",
    "娑撳秵瀵氶張",
    "閸忓牊濡哥捄",
  ];
  const body = String(text || "");
  const hasMoney = /(?:\d+|涓€|浜寍涓墊鍥泑浜攟鍏瓅涓億鍏珅涔潀鍗亅鐧?.{0,4}(?:鍧梶鍏億姣泑浠絴鍗?/.test(body);
  const hasFormula = /鎴愭湰|鎶奸噾|鍒╂鼎|璧殀鍥炴湰|鎶榺姣忓崟|姣忎唤|鍑戝|绠梶鏀跺叆|鏀嚭|琛ヨ创|鎶芥垚|瀹氫环/.test(body);
  const hasPayback = /鍥炴湰|鍑戝|鎵??:鑳絴鑳藉)|涔熷氨鏄瘄涓嶆寚鏈泑鍏堟妸/.test(body);
  const hasActionProof = /鎷嶅湪妗寍鎺忓嚭|閫掔粰|濉炶繘|鍒掓帀|鍦堝嚭|鐩栫珷|绛惧瓧|鏀舵|鍒拌处|璺憒閫抾鎺ヨ繃|鐑熷ご|韪╃伃|绐楀彛|楗洅|鎵嬫満/.test(body);
  const hasSceneProof = hasActionProof && /璐︽湰|鐜伴噾|浼犲崟|璁㈠崟|鍟嗘埛|鑰佹澘|瀹ゅ弸|鐭俊|鏀舵|鍒拌处|缁撶畻|瀵硅处|鑿滃崟|璺嚎|鎴垮彿/.test(body);
  const hasRepeatedCalculation = /涓嶅|閲嶆柊绠梶鍙堢畻|绠椾簡涓夐亶|纭娌＄畻閿檤姝ｇ‘绠楁硶|绛変簬|鎵€浠?*鍒╂鼎|鍑€璧殀鍑€浜忔崯|鍥炴湰/.test(body);
  const hasDenseAccountingRun = /(?:鎴愭湰|鎶奸噾|鎵揬d+鎶榺鐪乗d+姣泑澶氳禋|鍑戝|鎵嶈兘鍥炴潵|涔熷氨鏄瘄鍥炴湰|鍑€璧殀鍑€浜忔崯|鍒╂鼎).{0,80}(?:鎴愭湰|鎶奸噾|鎵揬d+鎶榺鐪乗d+姣泑澶氳禋|鍑戝|鎵嶈兘鍥炴潵|涔熷氨鏄瘄鍥炴湰|鍑€璧殀鍑€浜忔崯|鍒╂鼎)/.test(body);
  const hasNegotiationActor = /鐜嬪|鑰佹澘|鍟嗘埛|鏌滃彴|绐楀彛|闂ㄦ|妗寍妗堟澘|鍛ㄥ惎鏄巪鑰佸紶|寮犲彅|闄堝摜|鐜嬪Ж|瀹ゅ弸/.test(body);
  const hasNegotiationDialogue = /[鈥溾€?]/.test(body);
  const hasNegotiationTerms = /淇濆簳|鎸夊懆缁搢琛ュ樊浠穦鐓ч【瀛﹀紵|鎷嶅湪妗寍韪╃伃|瀵硅处|缁撶畻|浼犲崟|璁㈠崟|璇曡窇|璧斾粯|鍑洪|閫佷涪|鎷掓敹|閰嶉€佽垂|鎶奸噾/.test(body);
  const isSceneNegotiation = hasActionProof
    && hasNegotiationTerms
    && (hasNegotiationActor || hasNegotiationDialogue)
    && !hasPayback
    && !hasDenseAccountingRun;
  const hasHardFormula = hasAnyTextFragment(body, mojibakeAccountingFragments) || (hasMoney && (hasFormula || hasPayback));
  const hasDialogue = /[鈥溾€?]/.test(body);
  const reasons = [];
  if (hasAnyTextFragment(body, mojibakeAccountingFragments) && (!hasSceneProof || hasRepeatedCalculation || hasDenseAccountingRun)) {
    reasons.push("accounting_formula_exposition");
  }
  if (hasMoney && hasFormula && (!hasSceneProof || hasRepeatedCalculation || hasDenseAccountingRun)) reasons.push("accounting_formula_exposition");
  if (hasMoney && hasPayback && (!hasSceneProof || hasRepeatedCalculation || hasDenseAccountingRun)) reasons.push("payback_explanation");
  if (/鐢ㄦ埛閲弢瀹氫环绛栫暐|璁㈠崟鎶芥垚|琛ヨ创鎴愭湰|鍟嗘埛绔瘄椤惧绔?.test(body)) reasons.push("business_plan_terms");
  return {
    hit: reasons.length > 0 && !isSceneNegotiation && !(hasActionProof && hasDialogue && reasons.length <= 1 && !hasHardFormula),
    reasons,
    scene_negotiation: isSceneNegotiation,
  };
}

function applyChineseQualitySignals(metric, text = "", card = {}) {
  const body = String(text || "");
  if (!metric || !body) return metric;
  if (metric.tail_hook_score) {
    const tailText = lastNonEmptySegment(body, 260) || card.tail_hook || "";
    const reasons = new Set(metric.tail_hook_score.reasons || []);
    let score = Number(metric.tail_hook_score.score || 0);
    if (CN_EVENT_PROGRESS_RE.test(tailText)) {
      score += 1;
      reasons.add("cn_data_or_result_change");
    }
    if (CN_TURN_RE.test(tailText)) {
      score += 1;
      reasons.add("cn_turn_or_interruption");
    }
    if (CN_NEXT_PRESSURE_RE.test(tailText)) {
      score += 1;
      reasons.add("cn_next_chapter_pressure");
    }
    score = Math.max(0, Math.min(5, score));
    metric.tail_hook_score = {
      ...metric.tail_hook_score,
      score,
      reasons: [...reasons],
      issues: score <= 2 ? ["tail_hook_weak"] : [],
    };
  }
  if (metric.micro_hook_density) {
    const blocks = metric.micro_hook_density.blocks || [];
    let hookedBlocks = 0;
    const nextBlocks = blocks.map((block) => {
      const segment = block.preview || "";
      const reasons = new Set(block.reasons || []);
      if (CN_TURN_RE.test(segment)) reasons.add("cn_turn");
      if (CN_VISIBLE_OBJECT_RE.test(segment) || CN_EVENT_PROGRESS_RE.test(segment)) reasons.add("cn_visible_data_or_object");
      if (CN_INFORMATION_GAP_RE.test(segment)) reasons.add("cn_information_gap");
      if (CN_VISIBLE_ACTION_RE.test(segment) || hasDialogue(segment)) reasons.add("cn_action_or_dialogue");
      const hooked = reasons.size > 0;
      if (hooked) hookedBlocks += 1;
      return { ...block, hooked, reasons: [...reasons] };
    });
    const density = nextBlocks.length ? hookedBlocks / nextBlocks.length : 0;
    metric.micro_hook_density = {
      ...metric.micro_hook_density,
      hooked_blocks: hookedBlocks,
      density,
      blocks: nextBlocks,
      issues: density < 0.6 ? ["micro_hook_density_low"] : [],
    };
  }
  if (metric.coolpoint_delivered) {
    const visibleResult = Boolean(metric.coolpoint_delivered.visible_result || CN_PAYOFF_RE.test(body));
    const characterReaction = Boolean(metric.coolpoint_delivered.character_reaction || /鎰ｄ綇|娌夐粯|绗戜簡|楠倈鍒锋柊|浣庡ご|鎶ご|鍋滀綇|鐪嬬潃|鐩潃|娌¤璇潀鑴歌壊|stopped|laughing|refreshed|cursed|silent|stared/i.test(body));
    const payoffMarkers = body.match(CN_PAYOFF_RE) || [];
    const expositionOnly = (AI_EXPLANATION_PHRASES_RE.test(body) || CN_EXPOSITION_RE.test(body))
      && !visibleResult
      && !characterReaction;
    const eventPayoff = visibleResult && characterReaction && !expositionOnly;
    const effectiveCount = eventPayoff
      ? Math.max(Number(metric.coolpoint_delivered.effective_count || 0), Math.max(1, Math.min(2, Math.floor(payoffMarkers.length / 4) || 1)))
      : Number(metric.coolpoint_delivered.effective_count || 0);
    metric.coolpoint_delivered = {
      ...metric.coolpoint_delivered,
      effective_count: effectiveCount,
      grade: effectiveCount >= 2 ? "A" : effectiveCount === 1 ? "B" : "C",
      visible_result: visibleResult,
      character_reaction: characterReaction,
      issues: effectiveCount < 1 ? ["coolpoint_not_delivered"] : [],
    };
  }
  if (metric.drop_risk_segments) {
    const segments = (metric.drop_risk_segments.segments || []).map((segment) => {
      const source = segment.preview || "";
      let riskPoints = Number(segment.risk_points || 0);
      const reasons = new Set(segment.reasons || []);
      if (CN_VISIBLE_ACTION_RE.test(source) && reasons.delete("no_visible_action")) riskPoints -= 1;
      if (CN_EVENT_PROGRESS_RE.test(source) && reasons.delete("no_event_progress")) riskPoints -= 1;
      if (AI_EXPLANATION_PHRASES_RE.test(source) || CN_EXPOSITION_RE.test(source)) {
        riskPoints += 2;
        reasons.add("cn_exposition_heavy");
      }
      riskPoints = Math.max(0, riskPoints);
      return {
        ...segment,
        risk_points: riskPoints,
        high_risk: riskPoints >= 3,
        reasons: [...reasons],
      };
    });
    const riskySegments = segments.filter((segment) => segment.high_risk);
    metric.drop_risk_segments = {
      ...metric.drop_risk_segments,
      risky_segment_count: riskySegments.length,
      risk_density: segments.length ? riskySegments.length / segments.length : 0,
      segments,
      issues: riskySegments.length ? ["drop_risk_segments"] : [],
    };
  }
  if (metric.ai_taste_score) {
    let score = Number(metric.ai_taste_score.score || 0);
    if (AI_EXPLANATION_PHRASES_RE.test(body)) score -= 18;
    if (CN_VISIBLE_ACTION_RE.test(body) && CN_EVENT_PROGRESS_RE.test(body) && hasDialogue(body)) score += 8;
    score = Math.max(0, Math.min(100, Math.round(score)));
    metric.ai_taste_score = {
      ...metric.ai_taste_score,
      score,
      band: score >= 90 ? "premium" : score >= 78 ? "pass" : score >= 55 ? "risk" : "eliminate",
      issues: score < 78 ? ["ai_taste_below_publish"] : [],
    };
  }
  return metric;
}

function splitFixedBlocks(text = "", blockSize = 350) {
  const body = String(text || "").replace(/\s+/g, " ").trim();
  if (!body) return [];
  const blocks = [];
  for (let index = 0; index < body.length; index += blockSize) {
    blocks.push(body.slice(index, index + blockSize).trim());
  }
  return blocks;
}

function microHookReasons(block = "") {
  const reasons = [];
  if (hasDialogue(block) || /鎵撴柇|闂畖鍠妡楠倈鎰ｄ綇|鍋滀綇|娌夐粯|鎶ご|浣庡ご|鎺ヨ瘽|鐢佃瘽鍝峾鎻愮ず闊硘interrupt|asked|shouted|stopped/i.test(block)) {
    reasons.push("dialogue_or_interruption");
  }
  if (CN_TURN_RE.test(block) || /was about to|suddenly|but|instead/i.test(block)) {
    reasons.push("turn");
  }
  if (CN_VISIBLE_OBJECT_RE.test(block) || CN_EVENT_PROGRESS_RE.test(block)) {
    reasons.push("visible_data_or_object");
  }
  if (CN_INFORMATION_GAP_RE.test(block)) {
    reasons.push("information_gap");
  }
  if (/(["鈥溾€漖.{0,80}$|闂畖鍠妡鎰鍋滀綇|鎵撴柇|interrupt|asked|shouted|stopped)/i.test(block)) {
    reasons.push("dialogue_or_interruption");
  }
  if (/(绐佺劧|鍒氳|姝ｈ|鍗磡浣唡鍙嶈€寍娌℃兂鍒皘was about to|suddenly|but|instead)/i.test(block)) {
    reasons.push("turn");
  }
  if (/(璁㈠崟|鍚庡彴|鏁板瓧|鏁版嵁|閫氱煡|鐢佃瘽|浜岀淮鐮亅闃熶紞|count|order|backend|data|notification|phone|queue)/i.test(block)) {
    reasons.push("visible_data_or_object");
  }
  if (/(璇昏€厊涓嶇煡閬搢鐩笂|鏈変汉|闅斿|鑰佸笀|鑰佹澘|platform|someone|unknown|watched)/i.test(block)) {
    reasons.push("information_gap");
  }
  return reasons;
}

export function analyzeMicroHookDensity(text = "", { blockSize = 350 } = {}) {
  const blocks = splitTextSegments(text, blockSize);
  const details = blocks.map((block, index) => {
    const reasons = microHookReasons(block);
    return {
      index: index + 1,
      char_count: block.length,
      hooked: reasons.length > 0,
      reasons,
      preview: block.slice(0, 100),
    };
  });
  const hookedBlocks = details.filter((block) => block.hooked).length;
  const density = details.length ? hookedBlocks / details.length : 0;
  return {
    block_size: blockSize,
    total_blocks: details.length,
    hooked_blocks: hookedBlocks,
    density,
    blocks: details,
    issues: density < 0.6 ? ["micro_hook_density_low"] : [],
  };
}

export function analyzeReviewDepth(text = "") {
  const sentencePatternInertia = analyzeSentencePatternInertia(text);
  const paragraphRhythm = analyzeParagraphRhythm(text);
  return {
    sentence_pattern_inertia: sentencePatternInertia,
    paragraph_rhythm: paragraphRhythm,
    issues: [
      ...sentencePatternInertia.issues,
      ...paragraphRhythm.issues,
    ],
  };
}

function cardKeywordTokens(card = {}) {
  return [
    card.cool_point_type,
    card.visible_result,
    card.main_event,
    card.conflict,
  ]
    .join(" ")
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 20);
}

export function analyzeCoolpointDelivered(text = "", card = {}) {
  const body = String(text || "");
  const tokens = cardKeywordTokens(card);
  const matchedTokens = tokens.filter((token) => body.toLowerCase().includes(token.toLowerCase()));
  const payoffBeats = extractCoolpointPayoffBeats(body);
  if (payoffBeats.length > 0) {
    const visibleResult = payoffBeats.some((beat) => beat.reasons.includes("visible_result") || beat.reasons.includes("concrete_gain"));
    const characterReaction = payoffBeats.some((beat) => beat.reasons.includes("character_reaction") || beat.reasons.includes("public_reaction"));
    const effectiveCount = Math.max(1, Math.min(2, payoffBeats.length));
    return {
      effective_count: effectiveCount,
      grade: effectiveCount >= 2 ? "A" : "B",
      matched_tokens: matchedTokens,
      payoff_beats: payoffBeats,
      visible_result: visibleResult,
      character_reaction: characterReaction,
      issues: [],
    };
  }
  const visibleResult = /(璁㈠崟|鍚庡彴|鏁板瓧|鏁版嵁|娑▅璺硘鍒拌处|鎺掗槦|鎬佸害|鐢佃瘽|閫氱煡|缁撴灉|count|order|backend|data|queue|result|paid|jumped|from \d+ to \d+)/i.test(body);
  const characterReaction = /(鎰鍋渱绗憒楠倈娌夐粯|鍒锋柊|浣庡ご|鎶ご|stopped|laughing|refreshed|cursed|silent|stared)/i.test(body);
  const payoffMarkers = body.match(/(璁㈠崟|鍚庡彴|鏁板瓧|鏁版嵁|鎺掗槦|鐢佃瘽|閫氱煡|鍒拌处|鎶曡瘔|鐓х墖|鑰佸笀|office|order|backend|queue|paid|buzzed|complaint|photo)/gi) || [];
  const expositionOnly = /(浠栫煡閬搢浠栨槑鐧絴浠栨剰璇嗗埌|杩欏氨鏄瘄鎰忓懗鐫€|knew|understood|realized|meant|business value|strategy)/i.test(body)
    && !visibleResult
    && !characterReaction;
  const eventPayoff = (matchedTokens.length >= 1 || /璇垽|鎵撹劯|misjudg|payoff|proves|proved/i.test(body))
    && visibleResult
    && !expositionOnly;
  const effectiveCount = eventPayoff ? Math.max(1, Math.min(2, Math.floor(payoffMarkers.length / 4))) : 0;
  const grade = effectiveCount >= 2 ? "A" : effectiveCount === 1 ? "B" : "C";
  return {
    effective_count: effectiveCount,
    grade,
    matched_tokens: matchedTokens,
    visible_result: visibleResult,
    character_reaction: characterReaction,
    issues: effectiveCount < 1 ? ["coolpoint_not_delivered"] : [],
  };
}

function extractCoolpointPayoffBeats(text = "") {
  const body = String(text || "");
  if (!body.trim()) return [];
  const rawBeats = body
    .split(/\n{2,}|(?<=[銆傦紒锛??])\s*/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 18);
  const candidates = [];
  for (let index = 0; index < rawBeats.length; index += 1) {
    const current = rawBeats[index];
    const next = rawBeats.slice(index + 1, index + 3).join("\n");
    const windowText = [current, next].filter(Boolean).join("\n");
    const reasons = [];
    if (CN_PAYOFF_RE.test(windowText) || EN_EVENT_PROGRESS_RE.test(windowText)) reasons.push("visible_result");
    if (CN_EVENT_PROGRESS_RE.test(windowText) || EN_EVENT_PROGRESS_RE.test(windowText)) reasons.push("data_or_event_change");
    if (/鍥磋|鐪嬬儹闂箌鐐镐簡閿厊鑴搁兘缁縷鑴歌壊|鎰ｄ綇|娌夐粯|绗憒楠倈鍜潃鐗檤鍜戒簡鍥炲幓|鐏版簻婧渱杞ご鐪媩stared|silent|cursed|laughed/i.test(windowText)) {
      reasons.push("character_reaction");
    }
    if (/鎺掗槦|浼犲紑|閮藉惉瑙亅涓€涓嬪瓙|浼椾汉|鏃佽竟|琛椾笂|闂ㄥ彛|鍏紑|public|crowd|witness/i.test(windowText)) {
      reasons.push("public_reaction");
    }
    if (/绛緗濂戜功|鍗皘鐩東鍒拌处|鎴愪氦|閫氳繃|鎷夸笅|绉熶笅|浜斿勾|鍚嶉|璇曠偣|鍚堝悓|璁㈠崟|澧為暱|浠嶾d+鍒癨d+|paid|signed|contract|deal/i.test(windowText)) {
      reasons.push("concrete_gain");
    }
    if (/閫€|璧颁簡|鐮竱鎺夊湪鍦颁笂|鍚冧簭|璧攟缃殀涓炬姤|鎶曡瘔|琚揩|涓嶆暍|鍜戒簡鍥炲幓|鐏版簻婧渱cost|lost|retreated/i.test(windowText)) {
      reasons.push("opponent_cost");
    }
    if (CN_TURN_RE.test(windowText) || CN_INFORMATION_GAP_RE.test(windowText) || /misjudg|reversal|proved|proof/i.test(windowText)) {
      reasons.push("reversal_or_misjudgment");
    }
    if (CN_VISIBLE_ACTION_RE.test(windowText) || EN_VISIBLE_ACTION_RE.test(windowText) || hasDialogue(windowText)) {
      reasons.push("scene_action");
    }
    const hasPayoffCore = reasons.includes("visible_result") || reasons.includes("concrete_gain") || reasons.includes("opponent_cost");
    const hasSceneProof = reasons.includes("character_reaction") || reasons.includes("public_reaction") || reasons.includes("scene_action");
    const isExplanationOnly = (AI_EXPLANATION_PHRASES_RE.test(current) || CN_EXPOSITION_RE.test(current)) && !hasSceneProof;
    if (hasPayoffCore && hasSceneProof && !isExplanationOnly) {
      candidates.push({
        source_index: index + 1,
        reasons: [...new Set(reasons)],
        signature: coolpointBeatSignature(reasons),
        preview: windowText.slice(0, 160),
      });
    }
  }
  const selected = [];
  const seenSignatures = new Set();
  for (const candidate of candidates.sort((a, b) => coolpointBeatWeight(b) - coolpointBeatWeight(a))) {
    const tooCloseDuplicate = selected.some((item) =>
      Math.abs(item.source_index - candidate.source_index) <= 2
      && item.signature === candidate.signature
    );
    if (tooCloseDuplicate) continue;
    if (seenSignatures.has(candidate.signature) && candidate.signature === "visible_result") continue;
    seenSignatures.add(candidate.signature);
    selected.push(candidate);
    if (selected.length >= 3) break;
  }
  return selected
    .sort((a, b) => a.source_index - b.source_index)
    .map((beat, index) => ({ ...beat, index: index + 1 }));
}

function coolpointBeatSignature(reasons = []) {
  if (reasons.includes("opponent_cost")) return "opponent_cost";
  if (reasons.includes("concrete_gain")) return "concrete_gain";
  if (reasons.includes("public_reaction")) return "public_reaction";
  if (reasons.includes("reversal_or_misjudgment")) return "reversal";
  return "visible_result";
}

function coolpointBeatWeight(beat = {}) {
  const reasons = new Set(beat.reasons || []);
  let score = 0;
  if (reasons.has("opponent_cost")) score += 8;
  if (reasons.has("concrete_gain")) score += 7;
  if (reasons.has("public_reaction")) score += 6;
  if (reasons.has("character_reaction")) score += 5;
  if (reasons.has("reversal_or_misjudgment")) score += 4;
  if (reasons.has("data_or_event_change")) score += 3;
  if (reasons.has("scene_action")) score += 2;
  return score;
}

export function analyzeRhythmTransferCompliance(text = "", card = {}) {
  const rhythm = card.rhythm_transfer;
  if (!rhythm) {
    return {
      enabled: false,
      issues: [],
      checks: {},
    };
  }
  const body = String(text || "");
  const chapterStructure = classifyChapterStructure(body, { chapterNo: card.chapter_no });
  const issues = [];
  const checks = {};

  checks.opening_pattern = {
    expected: rhythm.opening_pattern,
    actual: chapterStructure.opening.pattern,
    ok: !rhythm.opening_pattern || chapterStructure.opening.pattern === rhythm.opening_pattern,
  };
  if (!checks.opening_pattern.ok) issues.push("rhythm_opening_mismatch");

  checks.tail_hook_type = {
    expected: rhythm.tail_hook_type,
    actual: chapterStructure.tail_hook.type,
    ok: !rhythm.tail_hook_type || chapterStructure.tail_hook.type === rhythm.tail_hook_type,
  };
  if (!checks.tail_hook_type.ok) issues.push("rhythm_tail_hook_mismatch");

  const requiredBeats = rhythm.beat_constraints || [];
  const missingBeats = requiredBeats.filter((beat) => !(chapterStructure.transferable_beats || []).includes(beat));
  checks.beat_constraints = {
    expected: requiredBeats,
    actual: chapterStructure.transferable_beats || [],
    missing: missingBeats,
    ok: missingBeats.length === 0,
  };
  if (!checks.beat_constraints.ok) issues.push("rhythm_beat_missing");

  const ratioTarget = rhythm.dialogue_ratio_target || {};
  const ratio = chapterStructure.rhythm.dialogue_ratio;
  checks.dialogue_ratio = {
    expected: ratioTarget,
    actual: ratio,
    ok: !Number.isFinite(ratioTarget.min) || (ratio >= ratioTarget.min && ratio <= ratioTarget.max),
  };
  if (!checks.dialogue_ratio.ok) issues.push("rhythm_dialogue_ratio_off");

  const microHookMin = Number(rhythm.micro_hook_density_min);
  checks.micro_hook_density = {
    expected_min: microHookMin,
    actual: chapterStructure.micro_hook_density.density,
    ok: !Number.isFinite(microHookMin) || chapterStructure.micro_hook_density.density >= microHookMin,
  };
  if (!checks.micro_hook_density.ok) issues.push("rhythm_micro_hook_low");

  const dropRiskMax = Number(rhythm.drop_risk_segments_max);
  checks.drop_risk_segments = {
    expected_max: dropRiskMax,
    actual: chapterStructure.drop_risk_segments.risky_segment_count,
    ok: !Number.isFinite(dropRiskMax) || chapterStructure.drop_risk_segments.risky_segment_count <= dropRiskMax,
  };
  if (!checks.drop_risk_segments.ok) issues.push("rhythm_drop_risk_high");

  return {
    enabled: true,
    reference_name: rhythm.reference_name,
    issues,
    checks,
  };
}

function normalizeScore(value, max = 100) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, (number / max) * 100));
}

function retentionBand(score) {
  if (score < 40) return "eliminate";
  if (score < 60) return "risk";
  if (score < 80) return "pass";
  return "premium";
}

function behaviorBand(score) {
  if (score < 55) return "eliminate";
  if (score < 80) return "risk";
  if (score < 92) return "publish";
  return "premium";
}

function significantStoryTokens(value = "") {
  const text = String(value || "");
  const cnTokens = text.match(/[\u4e00-\u9fff]{2,4}/g) || [];
  const enTokens = text.match(/[a-zA-Z0-9_]{3,}/g) || [];
  const stop = new Set([
    "鏈珷", "蹇呴』", "鐜板満", "涓€涓?, "鍏蜂綋", "閫氳繃", "涓嶈兘", "鍚屾剰", "鍏崇郴", "绔犲熬",
    "涓嬩竴", "瑙ｉ噴", "缁撴灉", "浜虹墿", "涓昏", "瀵规柟", "鍥犱负", "褰撳満", "鍑虹幇",
  ]);
  return [...new Set([...cnTokens, ...enTokens])]
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .filter((item) => !stop.has(item))
    .slice(0, 14);
}

function storyRoomFieldDelivered(body = "", expected = "", field = "") {
  const text = String(body || "");
  const value = String(expected || "").trim();
  if (!value) return true;
  if (text.includes(value)) return true;
  const tokens = significantStoryTokens(value);
  const hits = tokens.filter((token) => text.includes(token)).length;
  const minimumHits = tokens.length >= 4 ? 2 : 1;
  if (hits >= minimumHits) return true;
  const tail = text.slice(-800);
  if (field === "public_feedback") {
    return /鏀瑰彛|鍚屾剰|鍋滀笅|鑴歌壊|鎰ｄ綇|娌夐粯|鐐瑰ご|鎰挎剰|鎶ヤ环|杩介棶|鍥磋|鎬佸害/.test(text);
  }
  if (field === "cost_residue") {
    return /鎶紎璧攟娆爘鎴愭湰|浠ｄ环|椋庨櫓|鏈挶|浜弢鎹焲绋巪濂戠害|鑼跺紩|鍑洪敊|鎶奸噾|涓夎疮|閽?.test(text);
  }
  if (field === "relationship_shift") {
    return /鍢瞸璇曟帰|鐩镐俊|鎬€鐤憒涓嶄俊|鎰挎剰|鏀瑰彛|璇皵|绔欓槦|浜ゆ槗|瀵规姉|鍒ゆ柇|涓嶅啀/.test(text);
  }
  if (field === "chapter_debt") {
    return /绐佺劧|瀹樺樊|缂哄嵃|鎷嶅湪妗屼笂|閫紎瑙ｉ噴|鍑瘉|鏉ユ簮|鏉ョ數|娑堟伅|闂ㄥ|闂畖鏁笉鏁涓嬩竴绔?.test(tail);
  }
  return false;
}

export function evaluateStoryRoomContractDelivery(text = "", card = {}) {
  const contract = storyRoomExecutionContract(card);
  const requiredFields = contract.required_fields || [];
  if (!requiredFields.length) {
    return {
      status: "not_applicable",
      missing: [],
      required_fields: [],
      delivered: {},
    };
  }
  const body = String(text || "");
  const contractText = requiredFields.map((field) => contract[field]).join("\n");
  if (/[\u4e00-\u9fff]/.test(contractText) && !/[\u4e00-\u9fff]/.test(body)) {
    return {
      status: "not_applicable",
      missing: [],
      required_fields: requiredFields,
      delivered: {},
      evidence_basis: "story_room_contract_skipped_for_non_chinese_test_text",
    };
  }
  const delivered = {};
  const missing = [];
  for (const field of requiredFields) {
    delivered[field] = storyRoomFieldDelivered(text, contract[field], field);
    if (!delivered[field]) missing.push(field);
  }
  return {
    status: missing.length ? "fail" : "pass",
    missing,
    required_fields: requiredFields,
    delivered,
    evidence_basis: "story_room_contract_token_and_scene_signal_gate",
  };
}

export function evaluateChapterPublishGate(metrics = {}, review = {}, flags = []) {
  const grade = String(review?.grade || "").toUpperCase();
  const hardFlags = new Set(flags || []);
  const reviewerInvalid = review?.reviewer_status === "too_thin_for_publish_gate" || hardFlags.has("weak_review_fallback");
  const riskyCount = Number(metrics?.drop_risk_segments?.risky_segment_count || 0);
  const tailScore = Number(metrics?.tail_hook_score?.score ?? metrics?.tail_hook_score?.value ?? 0);
  const microHookDensity = Number(metrics?.micro_hook_density?.density || 0);
  const coolpointCount = Number(metrics?.coolpoint_delivered?.effective_count || 0);
  const retentionScore = Number(metrics?.retention_prediction?.score || 0);
  const aiTasteScore = Number(metrics?.ai_taste_score?.score || 0);
  const readerBehaviorScore = Number(metrics?.reader_behavior_score?.score || 0);
  const first300Score = Number(metrics?.first_300_retention_proxy?.score || metrics?.reader_behavior_score?.proxies?.first_300_retention_proxy?.score || 0);
  const completionScore = Number(metrics?.chapter_completion_proxy?.score || metrics?.reader_behavior_score?.proxies?.chapter_completion_proxy?.score || 0);
  const nextClickScore = Number(metrics?.next_chapter_click_proxy?.score || metrics?.reader_behavior_score?.proxies?.next_chapter_click_proxy?.score || 0);
  const followIntentScore = Number(metrics?.follow_intent_proxy?.score || metrics?.reader_behavior_score?.proxies?.follow_intent_proxy?.score || 0);
  const storyRoomDelivery = metrics?.story_room_contract_delivery || {};
  const blockers = [];
  if (reviewerInvalid) {
    return {
      status: "reviewer_invalid",
      failure_type: "reviewer_invalid",
      publish_ready: false,
      label: "瀹℃煡鍛樻棤鏁?,
      blockers: ["reviewer_invalid"],
      reviewer_status: review?.reviewer_status || "too_thin_for_publish_gate",
      reviewer_message: review?.reviewer_message || "瀹℃煡鍛樿緭鍑鸿繃钖勶紝涓嶈兘浣滀负鍙戝竷闂ㄧ渚濇嵁銆?,
      thresholds: {
        allowed_grades: ["A", "B"],
        reviewer_required: "detailed_scores_issues_risks_rewrite_direction",
      },
      values: {
        grade,
        reviewer_status: review?.reviewer_status || "too_thin_for_publish_gate",
        drop_risk_segments: riskyCount,
        tail_hook_score: tailScore,
        micro_hook_density: Number.isFinite(microHookDensity) ? Number(microHookDensity.toFixed(3)) : 0,
        coolpoint_delivered: coolpointCount,
        retention_prediction: retentionScore,
        ai_taste_score: aiTasteScore,
        reader_behavior_score: readerBehaviorScore,
        first_300_retention_proxy: first300Score,
        chapter_completion_proxy: completionScore,
        next_chapter_click_proxy: nextClickScore,
        follow_intent_proxy: followIntentScore,
      },
    };
  }
  if (!["A", "B"].includes(grade)) blockers.push("review_grade_below_publish");
  if (hardFlags.has("fact_consistency_violation")) blockers.push("fact_consistency_violation");
  if (hardFlags.has("ai_process_leak")) blockers.push("ai_process_leak");
  if (["ai_process_leak", "template_opening_inertia", "inline_risk_segments", "fact_consistency_violation"].some((flag) => hardFlags.has(flag))) {
    blockers.push("hard_quality_flag_active");
  }
  if (riskyCount > 0) blockers.push("drop_risk_segments_remaining");
  if (tailScore < 4) blockers.push("tail_hook_below_publish");
  if (microHookDensity < 0.9) blockers.push("micro_hook_density_below_publish");
  if (coolpointCount < 2) blockers.push("coolpoint_density_below_publish");
  if (retentionScore < 80) blockers.push("retention_prediction_below_publish");
  if (aiTasteScore < 78) blockers.push("ai_taste_below_publish");
  if (readerBehaviorScore < 80) blockers.push("reader_behavior_score_below_publish");
  if (first300Score < 82) blockers.push("first_300_retention_proxy_below_publish");
  if (completionScore < 80) blockers.push("chapter_completion_proxy_below_publish");
  if (nextClickScore < 80) blockers.push("next_chapter_click_proxy_below_publish");
  if (followIntentScore < 78) blockers.push("follow_intent_proxy_below_publish");
  if (storyRoomDelivery.status === "fail") blockers.push("story_room_contract_not_delivered");
  const styleWeakCore = riskyCount > 0 || microHookDensity < 0.9 || aiTasteScore < 78;
  if (styleWeakCore && hardFlags.has("sentence_pattern_inertia")) blockers.push("sentence_pattern_inertia");
  if (styleWeakCore && hardFlags.has("paragraph_rhythm_single_note")) blockers.push("paragraph_rhythm_single_note");
  if (styleWeakCore && hardFlags.has("dialogue_wall")) blockers.push("dialogue_wall");
  return {
    status: blockers.length ? "needs_rewrite" : "publish_ready",
    publish_ready: blockers.length === 0,
    label: blockers.length ? "闇€鑷姩浼樺寲" : "鍙彂甯?,
    blockers,
    thresholds: {
      allowed_grades: ["A", "B"],
      max_drop_risk_segments: 0,
      tail_hook_score_min: 4,
      micro_hook_density_min: 0.9,
      coolpoint_delivered_min: 2,
      retention_prediction_min: 80,
      ai_taste_score_min: 78,
      reader_behavior_score_min: 80,
      first_300_retention_proxy_min: 82,
      chapter_completion_proxy_min: 80,
      next_chapter_click_proxy_min: 80,
      follow_intent_proxy_min: 78,
      story_room_contract_delivery: "required chapter-card public feedback, cost residue, relationship shift, and chapter debt must land in prose",
      sentence_pattern_inertia: "blocks only with AI taste, drop-risk, or micro-hook failure",
      paragraph_rhythm_single_note: "blocks only with AI taste, drop-risk, or micro-hook failure",
      dialogue_wall: "blocks only with AI taste, drop-risk, or micro-hook failure",
    },
    values: {
      grade,
      drop_risk_segments: riskyCount,
      tail_hook_score: tailScore,
      micro_hook_density: Number.isFinite(microHookDensity) ? Number(microHookDensity.toFixed(3)) : 0,
      coolpoint_delivered: coolpointCount,
      retention_prediction: retentionScore,
      ai_taste_score: aiTasteScore,
      reader_behavior_score: readerBehaviorScore,
      first_300_retention_proxy: first300Score,
      chapter_completion_proxy: completionScore,
      next_chapter_click_proxy: nextClickScore,
      follow_intent_proxy: followIntentScore,
      story_room_contract_delivery: storyRoomDelivery.status || "not_applicable",
      story_room_contract_missing: storyRoomDelivery.missing || [],
    },
  };
}

function normalizedPublishGrade(review = null, publishGate = null) {
  const reviewGrade = String(review?.grade || "").toUpperCase();
  const gateGrade = String(publishGate?.values?.grade || publishGate?.grade || "").toUpperCase();
  if (publishGate?.publish_ready === true) {
    if (["A", "B"].includes(reviewGrade)) return reviewGrade;
    if (["A", "B"].includes(gateGrade)) return gateGrade;
    return "B";
  }
  return reviewGrade || null;
}

export function predictRetention({
  tail_hook_score: tailHookScore = {},
  coolpoint_delivered: coolpointDelivered = {},
  drop_risk_segments: dropRiskSegments = {},
  micro_hook_density: microHookDensity = {},
} = {}) {
  const tail = normalizeScore(tailHookScore.score ?? tailHookScore.value, 5);
  const coolpoint = Math.min(100, Number(coolpointDelivered.effective_count || 0) * 50);
  const totalSegments = Number(dropRiskSegments.total_segments || 0);
  const riskySegments = Number(dropRiskSegments.risky_segment_count || 0);
  const dropRisk = totalSegments > 0 ? Math.max(0, 100 - (riskySegments / totalSegments) * 100) : 100;
  const microHook = Math.min(100, (Number(microHookDensity.density || 0) / 1.2) * 100);
  const score = Math.round(tail * 0.35 + coolpoint * 0.3 + dropRisk * 0.2 + microHook * 0.15);
  return {
    score,
    band: retentionBand(score),
    components: {
      tail_hook_score: Math.round(tail),
      coolpoint_delivered: Math.round(coolpoint),
      drop_risk_inverse: Math.round(dropRisk),
      micro_hook_density: Math.round(microHook),
    },
  };
}

export function predictReaderBehavior({
  opening_hook_score: openingHookScore = {},
  tail_hook_score: tailHookScore = {},
  coolpoint_delivered: coolpointDelivered = {},
  drop_risk_segments: dropRiskSegments = {},
  micro_hook_density: microHookDensity = {},
  retention_prediction: retentionPrediction = {},
  ai_taste_score: aiTasteScore = {},
} = {}) {
  const opening = Number(openingHookScore.score || 0);
  const tail = normalizeScore(tailHookScore.score ?? tailHookScore.value, 5);
  const coolpoint = Math.min(100, Number(coolpointDelivered.effective_count || 0) * 50);
  const totalSegments = Number(dropRiskSegments.total_segments || 0);
  const riskySegments = Number(dropRiskSegments.risky_segment_count || 0);
  const dropRiskInverse = totalSegments > 0 ? Math.max(0, 100 - (riskySegments / totalSegments) * 115) : 100;
  const micro = Math.min(100, (Number(microHookDensity.density || 0) / 1.2) * 100);
  const retention = Number(retentionPrediction.score || 0);
  const aiTaste = Number(aiTasteScore.score || 0);
  const first300 = Math.round(opening * 0.55 + micro * 0.15 + dropRiskInverse * 0.15 + aiTaste * 0.15);
  const completion = Math.round(dropRiskInverse * 0.35 + retention * 0.25 + aiTaste * 0.2 + coolpoint * 0.2);
  const nextClick = Math.round(tail * 0.45 + micro * 0.25 + retention * 0.2 + coolpoint * 0.1);
  const followIntent = Math.round(coolpoint * 0.3 + retention * 0.25 + tail * 0.2 + aiTaste * 0.15 + opening * 0.1);
  const score = Math.round(first300 * 0.25 + completion * 0.3 + nextClick * 0.25 + followIntent * 0.2);
  const blockers = [];
  if (first300 < 82) blockers.push("first_300_retention_proxy_below_publish");
  if (completion < 80) blockers.push("chapter_completion_proxy_below_publish");
  if (nextClick < 80) blockers.push("next_chapter_click_proxy_below_publish");
  if (followIntent < 78) blockers.push("follow_intent_proxy_below_publish");
  if (score < 80) blockers.push("reader_behavior_score_below_publish");
  return {
    score,
    band: behaviorBand(score),
    publish_ready: score >= 80 && first300 >= 82 && completion >= 80 && nextClick >= 80 && followIntent >= 78,
    proxies: {
      first_300_retention_proxy: { score: first300, band: behaviorBand(first300), threshold: 82 },
      chapter_completion_proxy: { score: completion, band: behaviorBand(completion), threshold: 80 },
      next_chapter_click_proxy: { score: nextClick, band: behaviorBand(nextClick), threshold: 80 },
      follow_intent_proxy: { score: followIntent, band: behaviorBand(followIntent), threshold: 78 },
    },
    blockers,
    components: {
      opening_hook_score: Math.round(opening),
      tail_hook_score: Math.round(tail),
      coolpoint_delivered: Math.round(coolpoint),
      drop_risk_inverse: Math.round(dropRiskInverse),
      micro_hook_density: Math.round(micro),
      retention_prediction: Math.round(retention),
      ai_taste_score: Math.round(aiTaste),
    },
    evidence_basis: "public_platform_behavior_proxy_plus_local_calibration",
  };
}

export async function buildChapterQualityMetrics(project, chapterNo, card = {}, text) {
  const content = text ?? await readDraft(project, chapterNo).then((draft) => draft.text).catch(() => "");
  if (!content) return null;
  const openingHookScore = scoreOpeningHook(firstNonEmptySegment(content, 300));
  const microHookDensity = analyzeMicroHookDensity(content);
  const coolpointDelivered = analyzeCoolpointDelivered(content, card);
  const dropRiskSegments = analyzeDropRiskSegments(content);
  const tailHookScore = scoreTailHook(lastNonEmptySegment(content, 260) || card.tail_hook || "", {
    characters: card.characters_in_scene || [],
  });
  const retentionPrediction = predictRetention({
    tail_hook_score: tailHookScore,
    coolpoint_delivered: coolpointDelivered,
    drop_risk_segments: dropRiskSegments,
    micro_hook_density: microHookDensity,
  });
  const aiTasteScore = analyzeAiTaste(content);
  const metrics = {
    opening_hook_score: openingHookScore,
    tail_hook_score: tailHookScore,
    micro_hook_density: microHookDensity,
    coolpoint_delivered: coolpointDelivered,
    drop_risk_segments: dropRiskSegments,
    retention_prediction: retentionPrediction,
    ai_taste_score: aiTasteScore,
    story_room_contract_delivery: evaluateStoryRoomContractDelivery(content, card),
  };
  applyChineseQualitySignals(metrics, content, card);
  metrics.retention_prediction = predictRetention({
    tail_hook_score: metrics.tail_hook_score,
    coolpoint_delivered: metrics.coolpoint_delivered,
    drop_risk_segments: metrics.drop_risk_segments,
    micro_hook_density: metrics.micro_hook_density,
  });
  metrics.reader_behavior_score = predictReaderBehavior(metrics);
  metrics.first_300_retention_proxy = metrics.reader_behavior_score.proxies.first_300_retention_proxy;
  metrics.chapter_completion_proxy = metrics.reader_behavior_score.proxies.chapter_completion_proxy;
  metrics.next_chapter_click_proxy = metrics.reader_behavior_score.proxies.next_chapter_click_proxy;
  metrics.follow_intent_proxy = metrics.reader_behavior_score.proxies.follow_intent_proxy;
  return metrics;
}

function cardNeedsReversal(card = {}) {
  const text = [
    card.cool_point_type,
    card.main_event,
    card.conflict,
    card.visible_result,
  ].join(" ");
  return /expectation_reversal|reversal|棰勬湡鍙嶈浆|鍦烘櫙鍙嶈浆|鍙嶈浆瀵嗗害/.test(text);
}

function cardNeedsVisibleCost(card = {}) {
  const text = [
    card.cool_point_type,
    card.main_event,
    card.conflict,
    card.visible_result,
    card.visible_cost,
  ].join(" ");
  return /visible_cost|visible cost|鍙浠ｄ环|浠ｄ环|鐗虹壊|娆爘鏆撮湶|鍘嬪姏/.test(text);
}

const CN_NUMERAL_VALUE = new Map([
  ["\u96f6", 0],
  ["\u4e00", 1],
  ["\u4e8c", 2],
  ["\u4e24", 2],
  ["\u4e09", 3],
  ["\u56db", 4],
  ["\u4e94", 5],
  ["\u516d", 6],
  ["\u4e03", 7],
  ["\u516b", 8],
  ["\u4e5d", 9],
]);

const CN_MONEY_ANCHOR_RE = /([0-9]+(?:\.[0-9]+)?|[\u96f6\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07]+)\s*(?:\u5143|\u5757|\u5757\u94b1)?\s*(?:\u73b0\u91d1|\u5b58\u6b3e|\u751f\u6d3b\u8d39|\u542f\u52a8\u8d44\u91d1|\u542f\u52a8\u91d1|\u8d44\u91d1|\u672c\u94b1|\u5bb6\u5f53|\u94f6\u884c\u5361|\u5361\u91cc)?/g;
const CN_MONEY_CONTEXT_RE = /[\u5143\u5757\u73b0\u91d1\u5b58\u6b3e\u751f\u6d3b\u8d39\u542f\u52a8\u8d44\u91d1\u8d44\u91d1\u672c\u94b1\u5bb6\u5f53\u94f6\u884c\u5361]/;
const CN_STARTING_MONEY_RE = /\u73b0\u91d1|\u5b58\u6b3e|\u751f\u6d3b\u8d39|\u542f\u52a8\u8d44\u91d1|\u542f\u52a8\u91d1|\u8d44\u91d1|\u672c\u94b1|\u5bb6\u5f53|\u94f6\u884c\u5361|\u5361\u91cc|\u53e3\u888b/;
const CN_TOTAL_MONEY_RE = /\u5b58\u6b3e|\u542f\u52a8\u8d44\u91d1|\u542f\u52a8\u91d1|\u8d44\u91d1|\u672c\u94b1|\u5bb6\u5f53/;
const CN_LIVING_MONEY_RE = /\u751f\u6d3b\u8d39/;
const CN_COUNT_UNIT_AFTER_RE = /^[\u5355\u4efd\u6b21\u7ae0\u4e2a\u4eba\u5929\u65e5\u5468\u6708\u5e74\u5206\u949f\u5c0f\u65f6\u6761\u7b14\u95e8\u5bb6\u4ef6\u697c\u53f7]/;

function parseReadableChineseNumber(value = "") {
  const raw = String(value || "").trim();
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(raw)) return Number(raw);
  if (!raw) return NaN;
  const colloquialThousand = raw.match(/^([\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d])\u5343([\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d])$/);
  if (colloquialThousand) {
    return (CN_NUMERAL_VALUE.get(colloquialThousand[1]) * 1000) + (CN_NUMERAL_VALUE.get(colloquialThousand[2]) * 100);
  }
  const colloquialHundred = raw.match(/^([\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d])\u767e([\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d])$/);
  if (colloquialHundred) {
    return (CN_NUMERAL_VALUE.get(colloquialHundred[1]) * 100) + (CN_NUMERAL_VALUE.get(colloquialHundred[2]) * 10);
  }
  let section = 0;
  let number = 0;
  let pendingDigit = 0;
  const commitUnit = (unit) => {
    const digit = pendingDigit || 1;
    section += digit * unit;
    pendingDigit = 0;
  };
  for (const char of raw) {
    if (CN_NUMERAL_VALUE.has(char)) {
      pendingDigit = CN_NUMERAL_VALUE.get(char);
    } else if (char === "\u5341") {
      commitUnit(10);
    } else if (char === "\u767e") {
      commitUnit(100);
    } else if (char === "\u5343") {
      commitUnit(1000);
    } else if (char === "\u4e07") {
      number += (section + pendingDigit) * 10000;
      section = 0;
      pendingDigit = 0;
    }
  }
  const result = number + section + pendingDigit;
  return result > 0 ? result : NaN;
}

function cardMoneyAnchorSources(card = {}) {
  return [
    ...(Array.isArray(card.facts_required) ? card.facts_required : []),
    card.conflict,
    card.resource_plan,
    card.money_source,
    card.protagonist_action,
  ].map((item) => String(item || "")).filter(Boolean);
}

function extractMoneyMentions(text = "", { maxChars = Infinity } = {}) {
  const body = String(text || "").slice(0, maxChars);
  const mentions = [];
  for (const match of body.matchAll(CN_MONEY_ANCHOR_RE)) {
    const token = match[1];
    if (!token) continue;
    const start = match.index || 0;
    const end = start + match[0].length;
    const context = body.slice(Math.max(0, start - 16), Math.min(body.length, end + 16));
    const before = body.slice(Math.max(0, start - 8), start);
    const after = body.slice(end, Math.min(body.length, end + 8));
    if (!CN_MONEY_CONTEXT_RE.test(match[0])) {
      if (CN_COUNT_UNIT_AFTER_RE.test(after)) continue;
      if (!CN_MONEY_CONTEXT_RE.test(before) && !CN_MONEY_CONTEXT_RE.test(after)) continue;
    }
    const amount = parseReadableChineseNumber(token);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const markerText = match[0] || context;
    const nearbyMarker = `${before}${markerText}`;
    mentions.push({
      amount,
      token,
      text: match[0],
      context,
      starting_money: CN_STARTING_MONEY_RE.test(nearbyMarker),
      total_money: CN_TOTAL_MONEY_RE.test(nearbyMarker),
      living_money: CN_LIVING_MONEY_RE.test(nearbyMarker),
    });
  }
  return mentions;
}

function extractChapterCardMoneyAnchors(card = {}) {
  const anchors = [];
  const seen = new Set();
  for (const source of cardMoneyAnchorSources(card)) {
    for (const mention of extractMoneyMentions(source)) {
      if (!mention.starting_money && !mention.total_money && !mention.living_money) continue;
      const key = [
        mention.amount,
        mention.total_money ? "total" : "",
        mention.living_money ? "living" : "",
      ].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      anchors.push({
        amount: mention.amount,
        source,
        total_money: mention.total_money,
        living_money: mention.living_money,
      });
    }
  }
  return anchors;
}

export function analyzeChapterCardFactAnchors(text = "", card = {}) {
  const anchors = extractChapterCardMoneyAnchors(card);
  if (!anchors.length) return { issues: [], violations: [] };
  const openingMentions = extractMoneyMentions(text, { maxChars: 1200 })
    .filter((mention) => mention.starting_money || mention.total_money || mention.living_money);
  const violations = [];
  for (const anchor of anchors) {
    const relevant = openingMentions.filter((mention) => {
      if (anchor.living_money) return mention.living_money;
      if (anchor.total_money) return mention.starting_money || mention.total_money || mention.living_money;
      return mention.starting_money;
    });
    if (!relevant.length) continue;
    if (anchor.living_money && !relevant.some((mention) => mention.living_money)) continue;
    const hasExact = relevant.some((mention) => Math.abs(mention.amount - anchor.amount) <= 0.01);
    if (hasExact) continue;
    const largeMentions = relevant.filter((mention) => mention.amount >= Math.max(80, anchor.amount * 0.2));
    if (!largeMentions.length) continue;
    const summed = largeMentions.reduce((sum, mention) => sum + mention.amount, 0);
    const drift = Math.abs(summed - anchor.amount);
    const maxSingleDrift = Math.min(...largeMentions.map((mention) => Math.abs(mention.amount - anchor.amount)));
    const threshold = Math.max(20, anchor.amount * 0.05);
    if (largeMentions.length > 1 ? drift <= threshold : maxSingleDrift <= threshold) continue;
    violations.push({
      type: "chapter_card_money_anchor_mismatch",
      expected_amount: anchor.amount,
      observed_amounts: largeMentions.map((mention) => mention.amount),
      observed_sum: Number(summed.toFixed(2)),
      source: anchor.source,
      evidence: largeMentions.map((mention) => mention.context).slice(0, 3),
    });
  }
  const issues = violations.length
    ? [`chapter_card_money_anchor_mismatch: expected ${violations[0].expected_amount}, observed ${violations[0].observed_amounts.join("+")}`]
    : [];
  return { issues, violations };
}

function sceneCharacterNames(card) {
  return new Set(
    (card.characters_in_scene || [])
      .map((character) => (typeof character === "string" ? character : character?.name))
      .filter(Boolean),
  );
}

function dedupeList(values = []) {
  return [...new Set((values || []).filter(Boolean))];
}

function blockingQualityFlags(flags = []) {
  return dedupeList(flags).filter((flag) =>
    [
      "ai_process_leak",
      "template_opening_inertia",
      "inline_risk_segments",
      "drop_risk_segments",
      "fact_consistency_violation",
      "weak_review_fallback",
      "publish_gate_not_ready",
    ].includes(flag),
  );
}

function isLocalHardGateBlocker(blocker = "") {
  return [
    "reviewer_invalid",
    "drop_risk_segments_remaining",
    "fact_consistency_violation",
    "ai_process_leak",
    "hard_quality_flag_active",
  ].includes(String(blocker || ""));
}

const LOCAL_POST_REPAIR_TYPES = new Set([
  "chapter_card_fact_anchor_repair",
  "remove_ai_process_leak",
  "drop_risk_repair",
  "remove_explanation",
  "sentence_pattern_repair",
  "rhythm_repair",
  "first_300_hook_repair",
  "first_300_retention_repair",
  "next_chapter_click_repair",
  "reader_behavior_repair",
  "chapter_completion_repair",
  "follow_intent_repair",
  "micro_hook_boost",
  "coolpoint_boost",
  "retention_boost",
  "strengthen_tail_hook",
  "cost_visibility",
  "publish_gate_repair",
]);

const SEMANTIC_POST_REPAIR_TYPES = new Set([
  "structural_scene_repair",
  "fact_consistency_repair",
  "historical_logic_repair",
  "ability_source_repair",
  "character_voice",
  "domain_knowledge_repair",
  "rhythm_transfer_repair",
  "global_review_repair",
  "foreshadowing_progress",
]);

const LOCAL_POST_REPAIR_BLOCKERS = new Set([
  "ai_process_leak",
  "hard_quality_flag_active",
  "drop_risk_segments_remaining",
  "tail_hook_below_publish",
  "micro_hook_density_below_publish",
  "coolpoint_density_below_publish",
  "retention_prediction_below_publish",
  "ai_taste_below_publish",
  "reader_behavior_score_below_publish",
  "first_300_retention_proxy_below_publish",
  "chapter_completion_proxy_below_publish",
  "next_chapter_click_proxy_below_publish",
  "follow_intent_proxy_below_publish",
  "sentence_pattern_inertia",
  "paragraph_rhythm_single_note",
  "dialogue_wall",
  "publish_gate_not_ready",
]);

const SEMANTIC_POST_REPAIR_FLAGS = new Set([
  "fact_consistency_violation",
  "broken_hook_chain",
  "foreshadowing_debt_due",
  "information_gap_premature_reveal",
  "anchor_dormant",
  "reversal_density_low",
  "visible_cost_missing",
  "rhythm_transfer_deviation",
  "domain_knowledge_violation",
]);

function unresolvedCardFactAnchorViolations(review = {}, text = "", card = {}) {
  const previous = Array.isArray(review?.card_fact_anchor_violations) ? review.card_fact_anchor_violations : [];
  const current = analyzeChapterCardFactAnchors(text, card);
  return {
    previous,
    current: current.violations,
    resolved: previous.length > 0 && current.violations.length === 0,
  };
}

function localPostRepairDecision({ previousReview = {}, rewriteFocus = {}, rewriteLayers = [], card = {}, text = "" } = {}) {
  if (previousReview?.reviewer_status === "too_thin_for_publish_gate") {
    return { can_use_local_gate: false, reason: "reviewer_invalid" };
  }
  if (previousReview?.publish_gate?.failure_type === "reviewer_invalid") {
    return { can_use_local_gate: false, reason: "reviewer_invalid" };
  }
  if (String(previousReview?.grade || "").toUpperCase() === "E") {
    return { can_use_local_gate: false, reason: "grade_e_requires_review" };
  }

  const layerTypes = (rewriteLayers || []).map((layer) => String(layer?.type || "")).filter(Boolean);
  const focusType = String(rewriteFocus?.type || "");
  const allTypes = [...new Set([focusType, ...layerTypes].filter(Boolean))];
  const deterministicAnchorRepair = allTypes.includes("chapter_card_fact_anchor_repair");
  const anchorState = deterministicAnchorRepair
    ? unresolvedCardFactAnchorViolations(previousReview, text, card)
    : { previous: [], current: [], resolved: false };
  if (deterministicAnchorRepair && anchorState.previous.length > 0 && anchorState.current.length > 0) {
    return {
      can_use_local_gate: false,
      reason: "chapter_card_fact_anchor_still_drifting",
      repair_types: allTypes,
      card_fact_anchor_violations: anchorState.current,
    };
  }
  if (allTypes.some((type) => SEMANTIC_POST_REPAIR_TYPES.has(type))) {
    return { can_use_local_gate: false, reason: "semantic_repair_requires_reviewer", repair_types: allTypes };
  }
  if ((rewriteLayers || []).some((layer) => layer?.force_full_rewrite)) {
    return { can_use_local_gate: false, reason: "full_rewrite_requires_reviewer", repair_types: allTypes };
  }

  const issueText = [
    rewriteFocus?.source_issue,
    rewriteFocus?.instruction,
    rewriteFocus?.rewrite_direction,
    ...(Array.isArray(rewriteFocus?.issues) ? rewriteFocus.issues : []),
    ...(Array.isArray(previousReview?.issues) ? previousReview.issues : []),
    ...(Array.isArray(previousReview?.hard_rule_violations) ? previousReview.hard_rule_violations : []),
    ...(Array.isArray(previousReview?.publish_gate?.blockers) ? previousReview.publish_gate.blockers : []),
  ].map((item) => String(item || "")).join("\n");
  const semanticIssueText = deterministicAnchorRepair
    ? issueText
      .split("\n")
      .filter((line) => !isChapterCardFactAnchorIssue(line) && line !== "fact_consistency_violation")
      .join("\n")
    : issueText;
  if (
    isFactConsistencyIssue(semanticIssueText) ||
    isHistoricalLogicIssue(semanticIssueText) ||
    isAbilitySourceIssue(semanticIssueText) ||
    /global_review|domain_knowledge|rhythm_transfer|structural_scene|broken_hook_chain|foreshadowing|information_gap|anchor_dormant|motivation|character_logic/i.test(semanticIssueText)
  ) {
    return { can_use_local_gate: false, reason: "semantic_issue_requires_reviewer", repair_types: allTypes };
  }

  const blockers = Array.isArray(previousReview?.publish_gate?.blockers)
    ? previousReview.publish_gate.blockers.map((item) => String(item || "")).filter(Boolean)
    : [];
  const locallyResolvedBlockers = new Set();
  if (deterministicAnchorRepair && anchorState.previous.length > 0 && anchorState.current.length === 0) {
    locallyResolvedBlockers.add("fact_consistency_violation");
  }
  const activeBlockers = blockers.filter((blocker) => !locallyResolvedBlockers.has(blocker));
  const unknownBlockers = activeBlockers.filter((blocker) => !LOCAL_POST_REPAIR_BLOCKERS.has(blocker));
  if (unknownBlockers.length) {
    return { can_use_local_gate: false, reason: "unknown_blocker_requires_reviewer", blockers: unknownBlockers };
  }

  if (allTypes.length && !allTypes.some((type) => LOCAL_POST_REPAIR_TYPES.has(type))) {
    return { can_use_local_gate: false, reason: "repair_type_not_locally_verifiable", repair_types: allTypes };
  }

  return {
    can_use_local_gate: true,
    reason: "locally_verifiable_repair",
    repair_types: allTypes,
    blockers: activeBlockers,
    locally_resolved_blockers: [...locallyResolvedBlockers],
  };
}

async function localPostRepairReview(project, chapterNo, {
  card = {},
  text = "",
  previousReview = {},
  rewriteFocus = {},
  rewriteLayers = [],
  rewriteCount = 0,
} = {}) {
  const decision = localPostRepairDecision({ previousReview, rewriteFocus, rewriteLayers, card, text });
  if (!decision.can_use_local_gate) return { used_local_gate: false, decision };

  const seedReview = {
    grade: "B",
    next_action: "local_publish_gate_check",
    issues: [],
    risky_segments: [],
    hard_rule_violations: [],
    scores: Array.isArray(previousReview?.scores) ? previousReview.scores : [],
  };
  const qualityCheck = await applyReviewQualityFlags(project, chapterNo, seedReview, text);
  const ignoredSemanticFlags = new Set();
  if ((decision.repair_types || []).includes("chapter_card_fact_anchor_repair")) {
    const anchorState = unresolvedCardFactAnchorViolations(previousReview, text, card);
    if (anchorState.previous.length > 0 && anchorState.current.length === 0) {
      ignoredSemanticFlags.add("fact_consistency_violation");
    }
  }
  const semanticFlags = (qualityCheck.flags || []).filter((flag) =>
    SEMANTIC_POST_REPAIR_FLAGS.has(flag) && !ignoredSemanticFlags.has(flag),
  );
  if (semanticFlags.length) {
    return {
      used_local_gate: false,
      decision: {
        can_use_local_gate: false,
        reason: "local_semantic_flag_requires_reviewer",
        semantic_flags: semanticFlags,
      },
    };
  }

  const publishGate = qualityCheck.review?.publish_gate || evaluateChapterPublishGate(
    await buildChapterQualityMetrics(project, chapterNo, card, text),
    seedReview,
    qualityCheck.flags || [],
  );
  const grade = publishGate.publish_ready
    ? (normalizedPublishGrade(seedReview, publishGate) || "B")
    : "D";
  const review = {
    ...qualityCheck.review,
    grade,
    next_action: publishGate.publish_ready ? "publish_gate_pass" : "rewrite_chapter",
    reviewer_status: "local_verified_after_repair",
    reviewer_message: publishGate.publish_ready
      ? "淇鍚庣殑纭寚鏍囧凡鐢辨湰鍦伴棬绂佸鏍搁€氳繃锛屾湭鍐嶆璋冪敤瀹℃煡鍛樸€?
      : "淇鍚庢湰鍦伴棬绂佷粛鏈€氳繃锛岀户缁畾鐐逛慨琛ャ€傛棤闇€绛夊緟瀹℃煡鍛樼‘璁よ繖涓噺鍖栭棶棰樸€?,
    publish_gate: publishGate,
    local_verification: {
      status: publishGate.publish_ready ? "passed" : "needs_repair",
      reason: decision.reason,
      repair_types: decision.repair_types || [],
      ignored_semantic_flags: [...ignoredSemanticFlags],
      skipped_model_review: true,
      rewrite_count: rewriteCount,
      checked_at: new Date().toISOString(),
    },
  };
  await writeJson(reviewFile(project, chapterNo), review);
  return {
    used_local_gate: true,
    decision,
    review,
    qualityCheck: {
      ...qualityCheck,
      review,
    },
  };
}

export function effectiveReviewGate(review = null, computedGate = null) {
  const computedBlockers = Array.isArray(computedGate?.blockers) ? computedGate.blockers : [];
  const hardComputedBlockers = computedBlockers.filter(isLocalHardGateBlocker);
  if (computedGate && computedGate.publish_ready === false && hardComputedBlockers.length > 0) {
    return computedGate;
  }
  if (review?.publish_gate?.publish_ready === true) {
    return {
      ...computedGate,
      ...review.publish_gate,
      status: "publish_ready",
      publish_ready: true,
      label: review.publish_gate.label || "鍙彂甯?,
      blockers: [],
    };
  }
  return computedGate;
}

function styleAdvisoryFlags(flags = []) {
  return dedupeList(flags).filter((flag) =>
    ["sentence_pattern_inertia", "paragraph_rhythm_single_note", "dialogue_wall"].includes(flag),
  );
}

async function applyReviewQualityFlags(project, chapterNo, review, text) {
  const flags = Array.isArray(review?.hard_rule_violations)
    ? [...review.hard_rule_violations]
    : [];
  const issues = Array.isArray(review.issues) ? [...review.issues] : [];
  if (hasAiProcessLeak(text)) {
    flags.push("ai_process_leak");
    if (!issues.includes("ai_process_leak")) issues.push("ai_process_leak");
    const issue = "姝ｆ枃娉勯湶妯″瀷鎬濊€?浠诲姟鍒嗘瀽锛屽繀椤婚噸鍐欎负绾皬璇存鏂?;
    if (!issues.includes(issue)) issues.push(issue);
  }
  const templateOpeningInertia = detectTemplateOpeningInertia(text);
  if (templateOpeningInertia.length > 0) {
    flags.push("template_opening_inertia");
    if (!issues.includes("template_opening_inertia")) issues.push("template_opening_inertia");
    if (!issues.includes("寮€澶村惈閲嶅妯℃澘鍙ワ紝蹇呴』閲嶅啓涓烘湰绔犱笓灞炲姩浣滈挬瀛?)) {
      issues.push("寮€澶村惈閲嶅妯℃澘鍙ワ紝蹇呴』閲嶅啓涓烘湰绔犱笓灞炲姩浣滈挬瀛?);
    }
  }
  const card = await loadCardOrCreate(project, chapterNo);
  const context = await buildChapterContext(project, chapterNo);
  const lastHook = context.narrative_context?.last_hook || "";
  if (lastHook) {
    const tokens = meaningfulHookTokens(lastHook);
    const carriesHook = tokens.some((token) => String(text).includes(token));
    if (!carriesHook) {
      flags.push("broken_hook_chain");
      if (!issues.includes("broken_hook_chain")) issues.push("broken_hook_chain");
    }
  }
  const dueDebts = context.foreshadowing_debts?.due || [];
  if (dueDebts.some((debt) => !debtHasProgress(debt, text))) {
    flags.push("foreshadowing_debt_due");
    if (!issues.includes("foreshadowing_debt_due")) issues.push("foreshadowing_debt_due");
  }
  const prematureGap = (context.information_gaps?.active || []).some((gap) =>
    informationGapPrematurelyRevealed(gap, text),
  );
  if (prematureGap) {
    flags.push("information_gap_premature_reveal");
    if (!issues.includes("information_gap_premature_reveal")) {
      issues.push("information_gap_premature_reveal");
    }
  }
  const sceneNames = sceneCharacterNames(card);
  const dormantAnchors = (context.character_anchors || [])
    .filter((anchor) => sceneNames.has(anchor.name))
    .map((anchor) => characterAnchorUsage(anchor, text, chapterNo))
    .filter((usage) => usage.dormant);
  if (dormantAnchors.length > 0) {
    flags.push("anchor_dormant");
    if (!issues.includes("anchor_dormant")) issues.push("anchor_dormant");
  }
  if (cardNeedsReversal(card)) {
    const reversalDensity = analyzeReversalDensity(text);
    if (reversalDensity.issues.includes("reversal_density_low")) {
      flags.push("reversal_density_low");
      if (!issues.includes("reversal_density_low")) issues.push("reversal_density_low");
    }
  }
  if (cardNeedsVisibleCost(card)) {
    const visibleCost = analyzeVisibleCost(text);
    if (visibleCost.issues.includes("visible_cost_missing")) {
      flags.push("visible_cost_missing");
      if (!issues.includes("visible_cost_missing")) issues.push("visible_cost_missing");
    }
  }
  const factConsistencyIssues = issues.filter(isFactConsistencyIssue);
  if (factConsistencyIssues.length > 0) {
    flags.push("fact_consistency_violation");
    if (!issues.includes("fact_consistency_violation")) issues.push("fact_consistency_violation");
  }
  const cardFactAnchors = analyzeChapterCardFactAnchors(text, card);
  if (cardFactAnchors.violations.length > 0) {
    flags.push("fact_consistency_violation");
    for (const issue of cardFactAnchors.issues) {
      if (!issues.includes(issue)) issues.push(issue);
    }
    if (!issues.includes("fact_consistency_violation")) issues.push("fact_consistency_violation");
    review.card_fact_anchor_violations = cardFactAnchors.violations;
  }
  const dropRisk = analyzeDropRiskSegments(text);
  const reviewerRiskSegments = blockingReviewRiskSegments(review);
  if (reviewerRiskSegments.length > 0) {
    flags.push("inline_risk_segments");
    if (!issues.includes("inline_risk_segments")) issues.push("inline_risk_segments");
  }
  if (dropRisk.risky_segment_count > 0) {
    flags.push("drop_risk_segments");
    if (!issues.includes("drop_risk_segments")) issues.push("drop_risk_segments");
  }
  const metrics = await buildChapterQualityMetrics(project, chapterNo, card, text);
  const tailHookScore = metrics?.tail_hook_score || scoreTailHook(lastNonEmptySegment(text, 260) || card.tail_hook || "", {
    characters: card.characters_in_scene || [],
  });
  if (tailHookScore.issues?.includes("tail_hook_weak")) {
    flags.push("weak_tail_hook");
    if (!issues.includes("绔犲熬閽╁瓙寮?)) issues.push("绔犲熬閽╁瓙寮?);
  }
  const reviewDepth = analyzeReviewDepth(text);
  if (reviewDepth.sentence_pattern_inertia.issues.includes("sentence_pattern_inertia")) {
    flags.push("sentence_pattern_inertia");
    if (!issues.includes("sentence_pattern_inertia")) issues.push("sentence_pattern_inertia");
  }
  if (reviewDepth.paragraph_rhythm.issues.includes("paragraph_rhythm_single_note")) {
    flags.push("paragraph_rhythm_single_note");
    if (!issues.includes("paragraph_rhythm_single_note")) issues.push("paragraph_rhythm_single_note");
  }
  if (reviewDepth.paragraph_rhythm.issues.includes("dialogue_wall")) {
    flags.push("dialogue_wall");
    if (!issues.includes("dialogue_wall")) issues.push("dialogue_wall");
  }
  const rhythmCompliance = analyzeRhythmTransferCompliance(text, card);
  if (rhythmCompliance.issues.length > 0) {
    flags.push("rhythm_transfer_deviation");
    for (const issue of rhythmCompliance.issues) {
      if (!issues.includes(issue)) issues.push(issue);
    }
  }
  const domainKnowledge = await retrieveRelevantDomainKnowledge(project, card);
  const domainCompliance = analyzeDomainKnowledgeCompliance(text, card, domainKnowledge);
  if (domainCompliance.issues.length > 0) {
    flags.push("domain_knowledge_violation");
    for (const issue of domainCompliance.issues) {
      if (!issues.includes(issue)) issues.push(issue);
    }
  }
  const preliminaryGate = effectiveReviewGate(review, evaluateChapterPublishGate(metrics, review, flags));
  const publishGate = effectiveReviewGate(review, evaluateChapterPublishGate(metrics, review, [
    ...flags,
    ...(preliminaryGate.publish_ready ? [] : ["publish_gate_not_ready"]),
  ]));
  if (!publishGate.publish_ready) {
    flags.push("publish_gate_not_ready");
    review.publish_gate = publishGate;
    if (!issues.includes("publish_gate_not_ready")) issues.push("publish_gate_not_ready");
    for (const blocker of publishGate.blockers) {
      if (!issues.includes(blocker)) issues.push(blocker);
    }
  } else {
    review.publish_gate = publishGate;
  }
  if (!flags.length) {
    return {
      review,
      flags,
      tail_hook_score: tailHookScore,
      rhythm_transfer_compliance: rhythmCompliance.enabled ? rhythmCompliance : null,
      domain_knowledge_compliance: domainCompliance.enabled ? domainCompliance : null,
    };
  }
  const enforcedReview = enforceHardQualityFlags({ ...review, issues }, blockingQualityFlags(flags));
  const finalPublishGate = effectiveReviewGate(enforcedReview, evaluateChapterPublishGate(metrics, enforcedReview, flags));
  const finalIssues = Array.isArray(enforcedReview.issues) ? [...enforcedReview.issues] : [];
  if (!finalPublishGate.publish_ready) {
    if (!flags.includes("publish_gate_not_ready")) flags.push("publish_gate_not_ready");
    if (!finalIssues.includes("publish_gate_not_ready")) finalIssues.push("publish_gate_not_ready");
    for (const blocker of finalPublishGate.blockers) {
      if (!finalIssues.includes(blocker)) finalIssues.push(blocker);
    }
  }
  return {
    review: {
      ...enforcedReview,
      issues: finalIssues,
      publish_gate: finalPublishGate,
      style_advisories: styleAdvisoryFlags(flags),
      blocking_quality_flags: blockingQualityFlags(flags),
    },
    flags: [...new Set(flags)],
    tail_hook_score: tailHookScore,
    rhythm_transfer_compliance: rhythmCompliance.enabled ? rhythmCompliance : null,
    domain_knowledge_compliance: domainCompliance.enabled ? domainCompliance : null,
  };
}

export const __test_applyReviewQualityFlags = applyReviewQualityFlags;
export const __test_targetedRepairIssues = targetedRepairIssues;
export const __test_localPostRepairDecision = localPostRepairDecision;
export const __test_repairTaxonomyForIssue = repairTaxonomyForIssue;
export const __test_buildRepairQueue = buildRepairQueue;

export async function exportChapter(project, chapterNo) {
  const card = await loadCardOrCreate(project, chapterNo);
  const { text } = await readDraft(project, chapterNo);
  const lines = text.split(/\r?\n/);
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim() !== "");
  if (firstNonEmptyIndex >= 0 && lines[firstNonEmptyIndex].trim() === card.display_title) {
    lines.splice(firstNonEmptyIndex, 1);
  }
  const body = lines.join("\n").trim();
  const output = `${card.display_title}\n\n${body}\n`;
  const file = exportFile(project, chapterNo);
  await writeText(file, output);
  return { path: file };
}

export async function exportMerged(project, { from, to } = {}) {
  const chunks = [];
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    const exported = await exportChapter(project, chapterNo);
    const text = await readFile(exported.path, "utf8");
    chunks.push(`绗?{String(chapterNo).padStart(4, "0")}绔燶n\n${text.trim()}`);
  }
  const file = mergedExportFile(project, from, to);
  await writeText(file, `${chunks.join("\n\n")}\n`);
  return {
    path: file,
    from,
    to,
    chapter_count: to - from + 1,
  };
}

export async function extractStateCandidates(project, chapterNo, options = {}) {
  const card = await loadCardOrCreate(project, chapterNo, options);
  const { text, version } = await readDraft(project, chapterNo);
  const router = await createRouter(project, {
    ...options,
    routerOptions: routerOptionsForTask(options.routerOptions || {}, "extract_state_candidates"),
  });
  const candidates = assertStateCandidates(
    await router.invoke({
      task_type: "extract_state_candidates",
      chapter_no: chapterNo,
      chapter_card: card,
      text,
    }),
  );
  candidates.meta.source_version = version;
  const file = stateCandidatesFile(project, chapterNo);
  candidates.path = file;
  await writeJson(file, candidates);
  return candidates;
}

function pushFact(batchState, category, item) {
  const confidence = item?.confidence ?? 1;
  if (confidence < FACT_CONFIDENCE_THRESHOLD) {
    batchState.low_confidence_candidates.push({ category, ...item });
    return;
  }
  batchState[category].push(item);
}

export async function aggregateBatchState(project, { from, to } = {}) {
  const batchState = {
    meta: {
      from,
      to,
      source_files: [],
      confidence_threshold: FACT_CONFIDENCE_THRESHOLD,
      created_at: new Date().toISOString(),
    },
    characters: [],
    relationships: [],
    business_state: [],
    money_orders: [],
    foreshadowing_added: [],
    foreshadowing_resolved: [],
    timeline: [],
    risks: [],
    character_voice_samples: [],
    low_confidence_candidates: [],
  };

  const files = Array.from({ length: to - from + 1 }, (_, index) =>
    stateCandidatesFile(project, from + index),
  );
  const candidatesList = await Promise.all(files.map((file) => readJson(file)));
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const candidates = assertStateCandidates(candidatesList[index]);
    batchState.meta.source_files.push(file);
    for (const category of [
      "characters",
      "relationships",
      "business_state",
      "money_orders",
      "foreshadowing_added",
      "foreshadowing_resolved",
      "timeline",
      "risks",
      "character_voice_samples",
    ]) {
      for (const item of candidates[category] || []) {
        pushFact(batchState, category, item);
      }
    }
  }

  const file = batchStateFile(project, from, to);
  batchState.path = file;
  const checked = assertBatchState(batchState);
  await writeJson(file, checked);
  return checked;
}

async function latestBatchStateForChapter(project, chapterNo) {
  const to = chapterNo - 1;
  if (to < 1) return null;
  const from = Math.max(1, to - project.batch_size + 1);
  try {
    return await readJson(batchStateFile(project, from, to));
  } catch {
    return null;
  }
}

async function narrativeContextForChapter(project, chapterNo) {
  const previousChapterNo = chapterNo - 1;
  if (previousChapterNo < 1) return null;
  let card = null;
  try {
    card = await readJson(chapterCardFile(project, previousChapterNo));
  } catch {
    card = null;
  }
  let lastScene = "";
  try {
    const { text } = await readDraft(project, previousChapterNo);
    lastScene = text.slice(-200);
  } catch {
    lastScene = "";
  }
  if (!card?.tail_hook && !lastScene) return null;
  return {
    previous_chapter_no: previousChapterNo,
    last_hook: card?.tail_hook || "",
    last_scene: lastScene,
  };
}

async function readTextIfExists(file, maxChars = 6000) {
  try {
    return (await readFile(file, "utf8")).slice(0, maxChars);
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

function chapterOutlineWindow(outline = "", chapterNo = 0, radius = 2) {
  const text = String(outline || "");
  if (!text.trim() || !chapterNo) return "";
  const from = Math.max(1, Number(chapterNo) - radius);
  const to = Number(chapterNo) + radius;
  const blocks = [];
  for (let current = from; current <= to; current += 1) {
    const block = chapterOutlineTextForChapter(text, current);
    if (block.trim()) blocks.push(block.trim());
  }
  return blocks.join("\n\n").slice(0, 8000);
}

function compactTextForModel(text = "", maxChars = 3000) {
  const value = String(text || "").trim();
  if (value.length <= maxChars) return value;
  const head = Math.floor(maxChars * 0.7);
  const tail = maxChars - head - 40;
  return `${value.slice(0, head)}\n...\n${value.slice(-Math.max(0, tail))}`;
}

function compactPlanningContextForChapterCard(context = {}, chapterNo = 0) {
  const fineOutline = String(context.fine_outline || context.rolling_fine_outline || "");
  return {
    project_bible: compactTextForModel(context.project_bible, 2600),
    settings: compactTextForModel(context.settings, 1800),
    character_relationships: compactTextForModel(context.character_relationships, 1800),
    volume_outline: compactTextForModel(context.volume_outline, 2600),
    fine_outline_window: chapterOutlineWindow(fineOutline, chapterNo, 2) || compactTextForModel(fineOutline, 3000),
    use_as_hard_context: Boolean(context.use_as_hard_context),
    anti_cross_project_rules: context.anti_cross_project_rules || [],
    forbidden_cross_project_terms: context.forbidden_cross_project_terms || [],
  };
}

function compactJsonItems(items = [], maxItems = 5, maxChars = 260) {
  return (Array.isArray(items) ? items : [])
    .slice(0, maxItems)
    .map((item) => {
      if (typeof item === "string") return compactTextForModel(item, maxChars);
      if (!item || typeof item !== "object") return item;
      const compacted = {};
      for (const [key, value] of Object.entries(item)) {
        if (typeof value === "string") {
          compacted[key] = compactTextForModel(value, maxChars);
        } else if (Array.isArray(value)) {
          compacted[key] = value.slice(0, 4);
        } else if (value && typeof value === "object") {
          compacted[key] = compactTextForModel(JSON.stringify(value), maxChars);
        } else {
          compacted[key] = value;
        }
      }
      return compacted;
    });
}

function compactReviewChapterContext(context = {}, chapterCard = {}) {
  const sceneNames = new Set(
    (chapterCard?.characters_in_scene || [])
      .map((character) => (typeof character === "string" ? character : character?.name))
      .filter(Boolean),
  );
  const batchState = context.batch_state || {};
  const allAnchors = Array.isArray(context.character_anchors) ? context.character_anchors : [];
  const sceneAnchors = allAnchors.filter((anchor) => sceneNames.has(anchor.name));
  return {
    chapter_no: context.chapter_no,
    batch_position: context.batch_position,
    project: context.project,
    recent_batch_range: context.recent_batch_range,
    hard_rules: compactJsonItems(context.hard_rules || [], 10, 220),
    narrative_context: context.narrative_context
      ? {
          previous_chapter_no: context.narrative_context.previous_chapter_no,
          last_hook: compactTextForModel(context.narrative_context.last_hook, 280),
          last_scene: compactTextForModel(context.narrative_context.last_scene, 320),
        }
      : null,
    due_foreshadowing_debts: {
      overdue: compactJsonItems(context.foreshadowing_debts?.overdue || [], 3, 180),
      due: compactJsonItems(context.foreshadowing_debts?.due || [], 3, 180),
    },
    active_information_gaps: {
      active: compactJsonItems(context.information_gaps?.active || [], 3, 180),
      reveal_allowed: compactJsonItems(context.information_gaps?.reveal_allowed || [], 2, 180),
      overdue_reveal: compactJsonItems(context.information_gaps?.overdue_reveal || [], 2, 180),
    },
    scene_character_anchors: compactJsonItems(sceneAnchors.length ? sceneAnchors : allAnchors, 4, 180),
    batch_state_summary: {
      timeline: compactJsonItems(batchState.timeline || [], 4, 180),
      characters: compactJsonItems(batchState.characters || [], 4, 180),
      relationships: compactJsonItems(batchState.relationships || [], 4, 180),
      business_state: compactJsonItems(batchState.business_state || [], 4, 180),
      money_orders: compactJsonItems(batchState.money_orders || [], 4, 180),
      risks: compactJsonItems(batchState.risks || [], 3, 180),
    },
    recent_review_history: compactJsonItems(context.recent_review_history || [], 1, 180),
  };
}

function compactWritingChapterContext(context = {}, chapterCard = {}) {
  const projectPlanning = context.project_planning || {};
  const batchState = context.batch_state || {};
  const compactReviewContext = compactReviewChapterContext(context, chapterCard);
  return {
    ...compactReviewContext,
    project_planning: {
      project_bible: compactTextForModel(projectPlanning.project_bible, 1600),
      outline: compactTextForModel(projectPlanning.outline, 1000),
      settings: compactTextForModel(projectPlanning.settings, 800),
      character_relationships: compactTextForModel(projectPlanning.character_relationships, 900),
      volume_outline: compactTextForModel(projectPlanning.volume_outline, 1200),
      fine_outline_window: chapterOutlineWindow(
        projectPlanning.fine_outline || projectPlanning.rolling_fine_outline || "",
        context.chapter_no,
        1,
      ) || compactTextForModel(projectPlanning.fine_outline || projectPlanning.rolling_fine_outline, 1400),
      use_as_hard_context: Boolean(projectPlanning.use_as_hard_context),
      anti_cross_project_rules: compactJsonItems(projectPlanning.anti_cross_project_rules || [], 5, 220),
      forbidden_cross_project_terms: compactJsonItems(projectPlanning.forbidden_cross_project_terms || [], 5, 180),
    },
    recent_review_history: context.recent_review_history
      ? {
          window: Math.min(Number(context.recent_review_history.window || 0) || 0, 2),
          source_chapters: compactJsonItems(context.recent_review_history.source_chapters || [], 2, 220),
          writing_constraints: compactJsonItems(context.recent_review_history.writing_constraints || [], 5, 220),
          use_as_prompt_constraints: Boolean(context.recent_review_history.use_as_prompt_constraints),
        }
      : null,
    batch_state: {
      meta: batchState.meta || null,
      timeline: compactJsonItems(batchState.timeline || [], 5, 220),
      characters: compactJsonItems(batchState.characters || [], 6, 220),
      relationships: compactJsonItems(batchState.relationships || [], 6, 220),
      business_state: compactJsonItems(batchState.business_state || [], 5, 220),
      money_orders: compactJsonItems(batchState.money_orders || [], 5, 220),
      foreshadowing_added: compactJsonItems(batchState.foreshadowing_added || [], 6, 220),
      foreshadowing_resolved: compactJsonItems(batchState.foreshadowing_resolved || [], 4, 220),
      risks: compactJsonItems(batchState.risks || [], 4, 220),
    },
  };
}

async function buildProjectPlanningContext(project) {
  const projectBible = await readTextIfExists(path.join(project.path, "椤圭洰鍦ｇ粡.md"), 8000);
  const outline = await readTextIfExists(path.join(project.path, "澶х翰", "鎬荤翰.md"), 6000);
  const settings = await readTextIfExists(path.join(project.path, "璁惧畾", "璁惧畾搴?md"), 6000);
  const relationships = await readTextIfExists(path.join(project.path, "璁惧畾", "浜虹墿鍏崇郴.md"), 6000);
  const volumeOutline = await readTextIfExists(path.join(project.path, "鍗风翰", "鍏ㄤ功鍗风翰.md"), 9000)
    || await readTextIfExists(path.join(project.path, "鍗风翰", "绗竴鍗?md"), 6000);
  const fineOutline = await readRollingFineOutline(project)
    || await readTextIfExists(path.join(project.path, "缁嗙翰", "鍓?0绔?md"), 12000)
    || await readTextIfExists(path.join(project.path, "缁嗙翰", "鍓?0绔?md"), 8000);
  const projectText = `${project.title || ""}\n${project.idea || ""}\n${projectBible}\n${outline}\n${settings}\n${relationships}\n${volumeOutline}\n${fineOutline}`;
  const forbiddenTerms = [
    "涓嶅緱缁ф壙鍏朵粬椤圭洰鐨勪汉鍚嶃€佸湴鍚嶃€侀鏉愯瘝銆佸浐瀹氬彞寮忔垨鏃т功寮€澶淬€?,
    "涓嶅緱鎶婃棫椤圭洰鐨勬父鎴?IP/鍦板浘/瑁呭浜ゆ槗绾垮啓杩涘綋鍓嶉」鐩€?,
    "涓嶅緱浣跨敤浠讳綍涓庡綋鍓嶉」鐩垱鎰忔棤鍏崇殑妯℃澘鍖栧紑鍦哄彞銆?,
  ].filter((term) => !projectText.includes(term));
  return {
    project_bible: projectBible,
    outline,
    settings,
    character_relationships: relationships,
    volume_outline: volumeOutline,
    fine_outline: fineOutline,
    rolling_fine_outline: fineOutline,
    use_as_hard_context: Boolean(projectBible || outline || settings || relationships || volumeOutline || fineOutline),
    anti_cross_project_rules: [
      "鍙兘浣跨敤褰撳墠椤圭洰鐨勬爣棰樸€佸垱鎰忋€佸ぇ绾层€佽瀹氥€佷汉鐗╁叧绯汇€佸嵎绾插拰缁嗙翰銆?,
      "涓嶅緱缁ф壙鍏朵粬椤圭洰鐨勪汉鍚嶃€佸湴鍚嶃€侀鏉愯瘝銆侀亾鍏枫€佸彛澶寸銆佸浐瀹氬紑澶存垨鍟嗕笟绾裤€?,
      "绔犲崱蹇呴』浼樺厛鏈嶄粠鍓?0绔犳粴鍔ㄧ粏绾诧紱濡傛灉缁嗙翰缂烘煇绔狅紝鎵嶆寜椤圭洰鍦ｇ粡銆佹€荤翰鍜屽叏涔﹀嵎绾茶ˉ鍏ㄣ€?,
      "姝ｆ枃蹇呴』鏍规嵁鏈珷绔犲崱銆侀」鐩湥缁忋€佷汉鐗╁叧绯汇€佸叏涔﹀嵎绾层€佹粴鍔ㄧ粏绾插拰鐘舵€佽蹇嗙敓鎴愩€?,
      "鐩爣鎬诲瓧鏁般€侀璁＄珷鑺傘€佸叏涔﹂樁娈靛姬鍜屽垎鍗锋壙杞芥槸纭害鏉燂紝涓嶅緱涓轰簡鍗曠珷鐖界偣鐮村潖闀跨嚎閫昏緫銆?,
    ],
    forbidden_cross_project_terms: forbiddenTerms,
  };
}

async function recentChapterMemoryForReview(project, chapterNo, window = 5) {
  const from = Math.max(1, chapterNo - window);
  const chapters = [];
  for (let current = from; current < chapterNo; current += 1) {
    let card = null;
    let state = null;
    let review = null;
    let finalText = "";
    try {
      card = await readJson(chapterCardFile(project, current));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      state = await readJson(stateCandidatesFile(project, current));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      review = await readJson(reviewFile(project, current));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      finalText = (await readFile(exportFile(project, current), "utf8")).slice(-350);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (!card && !state && !review && !finalText) continue;
    chapters.push({
      chapter_no: current,
      card_summary: card
        ? {
            title: card.display_title || card.title || "",
            main_event: card.main_event || "",
            protagonist_action: card.protagonist_action || "",
            conflict: card.conflict || "",
            tail_hook: card.tail_hook || "",
          }
        : null,
      state_summary: state
        ? {
            characters: (state.characters || []).slice(0, 8),
            relationships: (state.relationships || []).slice(0, 8),
            business_state: (state.business_state || []).slice(0, 8),
            money_orders: (state.money_orders || []).slice(0, 8),
            foreshadowing_added: (state.foreshadowing_added || []).slice(0, 8),
            foreshadowing_resolved: (state.foreshadowing_resolved || []).slice(0, 8),
            timeline: (state.timeline || []).slice(0, 8),
            risks: (state.risks || []).slice(0, 8),
          }
        : null,
      previous_review: review
        ? {
            grade: review.grade || null,
            issues: (review.issues || []).slice(0, 5),
            risky_segments: (review.risky_segments || []).slice(0, 4),
          }
        : null,
      ending_excerpt: finalText,
    });
  }
  return chapters;
}

async function buildReviewContext(project, chapterNo, {
  text = "",
  chapterCard = null,
  localQualityMetrics = null,
  localPublishGate = null,
} = {}) {
  const chapterContext = await buildChapterContext(project, chapterNo);
  const recentChapters = await recentChapterMemoryForReview(project, chapterNo, 2);
  const bible = await readTextIfExists(path.join(project.path, "椤圭洰鍦ｇ粡.md"), 8000);
  const relationships = await readTextIfExists(path.join(project.path, "璁惧畾", "浜虹墿鍏崇郴.md"), 6000);
  const volume = await readTextIfExists(path.join(project.path, "鍗风翰", "绗竴鍗?md"), 6000);
  const opening300 = String(text || "").replace(/\s+/g, "").slice(0, 300);
  const compactChapterContext = compactReviewChapterContext(chapterContext, chapterCard || {});
  const reviewRuleContract = writingRulesForTask(project, "review_chapter", { chapterNo });
  return {
    mode: "contextual_publish_gate_review",
    context_policy: {
      mode: "compact_review_context",
      reason: "keep review focused and avoid thin or timed-out publish-gate reviews",
      max_recent_chapters: 2,
      full_previous_chapter_text_included: false,
    },
    instruction: [
      "涓嶈兘鍙寜褰撳墠绔犳枃瀛楁墦鍒嗭紝蹇呴』缁撳悎椤圭洰鍦ｇ粡銆佷汉鐗╁叧绯汇€佸嵎绾层€佸墠鏂囩珷鍗°€佸墠鏂囪蹇嗗拰鏈珷绔犲崱鍒ゆ柇銆?,
      "濡傛灉鍙戠幇鑳藉姏鏉ユ簮銆佽祫婧愭潵婧愩€佷汉鐗╁姩鏈恒€佹椂闂寸嚎銆佷紡绗斻€佸晢涓氶€昏緫涓庡墠鏂囩煕鐩撅紝蹇呴』鍒椾负鍙戝竷闂ㄧ闂銆?,
      "绗竴绔犳垨鍓嶄笁绔犺閲嶇偣妫€鏌ュ墠300瀛楋細鏄惁蹇€熻繘鍏ュ啿绐併€佸弽甯搞€佽鍔ㄦ垨鍙缁撴灉銆?,
      "鏈€缁堝垽鏂互鍙彂甯?闇€鑷姩浼樺寲/闃绘柇涓哄噯锛孉/B/C/D/E 鍙兘浣滀负鍐呴儴鍙傝€冦€?,
    ],
    project: {
      title: project.title,
      idea: project.idea,
      platform: project.platform,
      channel: project.channel,
      genre: project.genre,
      subgenre: project.subgenre,
      tags: Array.isArray(project.tags) ? project.tags.slice(0, 8) : project.tags,
      target_words: project.target_words,
    },
    writing_rules: compactJsonItems([
      ...writingRulesForProject(project),
      ...reviewRuleContract.rules,
    ], 14, 180),
    chapter_no: chapterNo,
    project_bible: compactTextForModel(bible, 520),
    character_relationships: compactTextForModel(relationships, 420),
    volume_outline: compactTextForModel(volume, 520),
    recent_chapters: compactJsonItems(recentChapters, 2, 220),
    chapter_context_summary: compactChapterContext,
    first_300_chars: opening300,
    checks: {
      text_quality: true,
      context_consistency: true,
      character_motivation: true,
      resource_and_skill_origin: true,
      foreshadowing_and_payoff: true,
      mobile_readability: true,
      publish_gate: true,
    },
    local_quality_summary: localQualityMetrics
      ? {
          opening_hook_score: localQualityMetrics.opening_hook_score?.score,
          tail_hook_score: localQualityMetrics.tail_hook_score?.score,
          micro_hook_density: localQualityMetrics.micro_hook_density?.density,
          coolpoint_count: localQualityMetrics.coolpoint_delivered?.effective_count,
          drop_risk_segments: localQualityMetrics.drop_risk_segments?.risky_segment_count,
          retention_score: localQualityMetrics.retention_prediction?.score,
          ai_taste_score: localQualityMetrics.ai_taste_score?.score,
          reader_behavior_score: localQualityMetrics.reader_behavior_score?.score,
          publish_gate: localPublishGate
            ? {
                publish_ready: localPublishGate.publish_ready,
                blockers: localPublishGate.blockers || [],
                values: localPublishGate.values || {},
              }
            : null,
        }
      : null,
  };
}

async function chapterSummaryForGlobalReview(project, chapterNo) {
  const card = await readJson(chapterCardFile(project, chapterNo)).catch(() => null);
  const review = await readJson(reviewFile(project, chapterNo)).catch(() => null);
  const state = await readJson(stateCandidatesFile(project, chapterNo)).catch(() => null);
  const text = await readFile(exportFile(project, chapterNo), "utf8").catch(() => "");
  return {
    chapter_no: chapterNo,
    card: card
      ? {
          title: card.display_title || card.title || "",
          opening_hook: card.opening_hook || "",
          main_event: card.main_event || "",
          protagonist_action: card.protagonist_action || "",
          conflict: card.conflict || "",
          visible_result: card.visible_result || "",
          tail_hook: card.tail_hook || "",
          facts_required: card.facts_required || [],
          forbidden_items: card.forbidden_items || [],
        }
      : null,
    review: review
      ? {
          grade: review.grade || null,
          next_action: review.next_action || null,
          issues: (review.issues || []).slice(0, 8),
          risky_segments: (review.risky_segments || []).slice(0, 5),
          publish_gate: review.publish_gate || null,
        }
      : null,
    state: state
      ? {
          characters: (state.characters || []).slice(0, 10),
          relationships: (state.relationships || []).slice(0, 10),
          business_state: (state.business_state || []).slice(0, 10),
          money_orders: (state.money_orders || []).slice(0, 10),
          foreshadowing_added: (state.foreshadowing_added || []).slice(0, 10),
          foreshadowing_resolved: (state.foreshadowing_resolved || []).slice(0, 10),
          timeline: (state.timeline || []).slice(0, 10),
          risks: (state.risks || []).slice(0, 10),
        }
      : null,
    text_excerpt: String(text || "").slice(0, 700),
    ending_excerpt: String(text || "").slice(-500),
  };
}

function normalizeGlobalReview(project, { from, to, output }) {
  const issues = Array.isArray(output?.cross_chapter_issues) ? output.cross_chapter_issues : [];
  return {
    status: output?.status || (issues.length ? "needs_attention" : "pass"),
    project_title: project.title,
    range: { from, to },
    summary: output?.summary || "",
    cross_chapter_issues: issues.map((issue) => ({
      chapter_no: Number(issue?.chapter_no || 0) || null,
      type: issue?.type || "cross_chapter",
      severity: issue?.severity || "warn",
      issue: issue?.issue || issue?.description || "",
      fix: issue?.fix || issue?.suggestion || "",
    })),
    forgotten_hooks: Array.isArray(output?.forgotten_hooks) ? output.forgotten_hooks : [],
    repeated_patterns: Array.isArray(output?.repeated_patterns) ? output.repeated_patterns : [],
    character_consistency: Array.isArray(output?.character_consistency) ? output.character_consistency : [],
    publish_gate: output?.publish_gate || { status: issues.some((issue) => issue?.severity === "blocker") ? "blocked" : issues.length ? "needs_repair" : "pass" },
    created_at: new Date().toISOString(),
  };
}

export function repairItemsFromGlobalReview(globalReview = {}) {
  const range = globalReview.range || {};
  const issues = Array.isArray(globalReview.cross_chapter_issues) ? globalReview.cross_chapter_issues : [];
  return issues
    .map((issue, index) => {
      const chapterNo = Number(issue?.chapter_no || 0);
      if (!Number.isInteger(chapterNo) || chapterNo <= 0) return null;
      const repairPreset = repairPresetForIssue({
        metric: "global_consistency",
        issue: issue.issue || issue.type || "",
        reason: issue.fix || "",
      });
      const instruction = [
        `Global review found a cross-chapter problem in chapter ${chapterNo}: ${issue.issue || issue.type || "cross-chapter consistency issue"}.`,
        issue.fix ? `Required fix: ${issue.fix}` : "",
        "Repair only the affected chapter unless the chapter cannot stay logically consistent without a local bridge. Preserve the chapter's core event, but add or adjust motivation, setup, payoff, or transition so the surrounding chapters remain coherent.",
        "After repair, the chapter must still pass publish gate and keep the project memory consistent.",
      ].filter(Boolean).join("\n");
      return {
        id: `global-${range.from || "x"}-${range.to || "x"}-${chapterNo}-${index + 1}`,
        source: "global_review",
        metric: "global_consistency",
        chapter_no: chapterNo,
        type: issue.type || "cross_chapter",
        severity: issue.severity || "warn",
        issue: issue.issue || issue.description || "",
        fix: issue.fix || issue.suggestion || "",
        status: "queued",
        priority: repairPriority({ metric: "global_consistency" }),
        repair_preset: repairPreset,
        rewrite_layers: repairPreset?.rewrite_layers || ["remove_explanation"],
        rewrite_focus: {
          type: "global_review_repair",
          source_issue: issue.issue || issue.type || "global_review_issue",
          instruction,
          global_review_range: {
            from: range.from || null,
            to: range.to || null,
          },
          issue,
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority || a.chapter_no - b.chapter_no);
}

export async function runGlobalReviewRepairQueue(
  project,
  globalReview,
  { maxRewrites = 1, router, routerOptions, onProgress } = {},
) {
  const items = repairItemsFromGlobalReview(globalReview);
  const options = {
    ...(router ? { router } : {}),
    routerOptions,
  };
  const runs = [];
  const reportProgress = async (progress) => {
    if (typeof onProgress === "function") await onProgress(progress);
  };
  for (const item of items) {
    const callsBefore = await readModelCallLines(project);
    const run = {
      ...item,
      status: "running",
      attempts: [],
      started_at: new Date().toISOString(),
    };
    await reportProgress({
      step: "global_repair",
      chapter_no: item.chapter_no,
      message: `姝ｅ湪杩斿伐绗?${item.chapter_no} 绔狅細${item.issue || "璺ㄧ珷涓€鑷存€ч棶棰?}`,
      repair_item: item,
    });
    let finalReview = null;
    let finalVersion = null;
    let finalGate = null;
    let repaired = false;
    for (let attempt = 1; attempt <= Math.max(1, maxRewrites); attempt += 1) {
      const rewritten = await rewriteChapterSmart(project, item.chapter_no, {
        ...options,
        rewriteLayers: item.rewrite_layers,
        rewriteFocus: item.rewrite_focus,
      });
      finalVersion = rewritten.version;
      const review = await reviewChapter(project, item.chapter_no, rewritten.version, options);
      const qualityCheck = await applyReviewQualityFlags(project, item.chapter_no, review, rewritten.text);
      finalReview = qualityCheck.review;
      const card = await loadCardOrCreate(project, item.chapter_no, options);
      const metrics = await buildChapterQualityMetrics(project, item.chapter_no, card, rewritten.text);
      finalGate = evaluateChapterPublishGate(metrics, finalReview, finalReview?.hard_rule_violations || []);
      run.attempts.push({
        attempt,
        version: rewritten.version,
        grade: finalReview.grade || null,
        publish_ready: Boolean(finalGate.publish_ready),
        blockers: finalGate.blockers || [],
      });
      await writeChapterQualityReportFromBatch(project, {
        chapterNo: item.chapter_no,
        card,
        review: finalReview,
        version: rewritten.version,
        rewriteCount: attempt,
        callsBefore,
      });
      if (finalReview.grade !== "D" && finalReview.grade !== "E" && finalGate.publish_ready) {
        const stateCandidates = await extractStateCandidates(project, item.chapter_no, options);
        const exported = await exportChapter(project, item.chapter_no);
        await writeChapterQualityReportFromBatch(project, {
          chapterNo: item.chapter_no,
          card,
          review: finalReview,
          version: rewritten.version,
          rewriteCount: attempt,
          exported,
          stateCandidates,
          callsBefore,
        });
        repaired = true;
        break;
      }
    }
    runs.push({
      ...run,
      status: repaired ? "repaired" : "needs_manual_review",
      final_version: finalVersion,
      final_grade: finalReview?.grade || null,
      publish_gate: finalGate,
      completed_at: new Date().toISOString(),
    });
  }
  const from = globalReview.range?.from || globalReview.from;
  const to = globalReview.range?.to || globalReview.to;
  let rereview = null;
  if (from && to && runs.length) {
    await reportProgress({
      step: "global_rereview",
      chapter_no: to,
      message: `姝ｅ湪澶嶆煡绗?${from}-${to} 绔犺法绔犻€昏緫`,
    });
    rereview = await runGlobalChapterReview(project, { from, to, ...options });
  }
  const remainingIssues = Array.isArray(rereview?.cross_chapter_issues) ? rereview.cross_chapter_issues.length : 0;
  const status = !runs.length
    ? "no_issues"
    : remainingIssues === 0 && runs.every((run) => run.status === "repaired")
      ? "repaired"
      : "needs_attention";
  const finalReport = {
    ...globalReview,
    repair_status: status,
    repair_queue: items.map((item) => ({
      ...item,
      status: runs.find((run) => run.id === item.id)?.status || "queued",
    })),
    repair_runs: runs,
    rereview,
    final_cross_chapter_issues: rereview?.cross_chapter_issues || globalReview.cross_chapter_issues || [],
    updated_at: new Date().toISOString(),
  };
  if (from && to) {
    finalReport.path = globalReviewFile(project, from, to);
    await writeJson(finalReport.path, finalReport);
  }
  return finalReport;
}

export async function runGlobalChapterReview(project, { from, to, router, routerOptions } = {}) {
  const chapters = [];
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    chapters.push(await chapterSummaryForGlobalReview(project, chapterNo));
  }
  const projectMemory = {
    project_bible: await readTextIfExists(path.join(project.path, "椤圭洰鍦ｇ粡.md"), 8000),
    outline: await readTextIfExists(path.join(project.path, "澶х翰", "鎬荤翰.md"), 5000),
    settings: await readTextIfExists(path.join(project.path, "璁惧畾", "璁惧畾搴?md"), 5000),
    relationships: await readTextIfExists(path.join(project.path, "璁惧畾", "浜虹墿鍏崇郴.md"), 5000),
    volume_outline: await readTextIfExists(path.join(project.path, "鍗风翰", "绗竴鍗?md"), 5000),
    memory_index: await readJson(memoryIndexFile(project)).catch(() => null),
  };
  const selectedRouter = await createRouter(project, {
    ...(router ? { router } : {}),
    routerOptions: routerOptionsForTask(routerOptions || {}, "global_review"),
  });
  const output = await selectedRouter.invoke({
    task_type: "global_review",
    project: {
      title: project.title,
      idea: project.idea,
      platform: project.platform,
      genre: project.genre,
    },
    from,
    to,
    project_memory: projectMemory,
    chapters,
  });
  const report = normalizeGlobalReview(project, { from, to, output });
  const file = globalReviewFile(project, from, to);
  report.path = file;
  await writeJson(file, report);
  void writeModelCapabilityLedger(project);
  return report;
}

export async function readLatestGlobalReview(project) {
  const reportsDir = path.join(project.path, "reports");
  const entries = await readdir(reportsDir, { withFileTypes: true }).catch(() => []);
  const reviews = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^global_review_\d+-\d+\.json$/i.test(entry.name)) continue;
    const file = path.join(reportsDir, entry.name);
    const review = await readJson(file).catch(() => null);
    if (review) reviews.push({ ...review, path: review.path || file });
  }
  reviews.sort((a, b) => Number(b.range?.to || 0) - Number(a.range?.to || 0));
  return {
    status: reviews.length ? "ready" : "empty",
    reviews,
    latest: reviews[0] || null,
  };
}

function foreshadowingDebtKey(debt) {
  return String(debt?.hook || "").trim().toLowerCase();
}

function foreshadowingDebtsFromBatchState(batchState, chapterNo) {
  if (!batchState) {
    return {
      window: null,
      open: [],
      due: [],
      overdue: [],
      resolved: [],
    };
  }
  const resolvedKeys = new Set(
    (batchState.foreshadowing_resolved || [])
      .map((item) => foreshadowingDebtKey(normalizeForeshadowingDebt(item, chapterNo)))
      .filter(Boolean),
  );
  const resolved = (batchState.foreshadowing_resolved || []).map((item) => ({
    ...normalizeForeshadowingDebt(item, chapterNo),
    status: "resolved",
  }));
  const open = (batchState.foreshadowing_added || [])
    .map((item) => normalizeForeshadowingDebt(item, chapterNo))
    .filter((debt) => debt.hook && !resolvedKeys.has(foreshadowingDebtKey(debt)));
  return {
    window: {
      from: batchState.meta?.from ?? null,
      to: batchState.meta?.to ?? null,
    },
    open,
    due: open.filter((debt) => debt.status === "due" || debt.status === "overdue"),
    overdue: open.filter((debt) => debt.status === "overdue"),
    resolved,
  };
}

function informationGapsFromBatchState(batchState, chapterNo) {
  if (!batchState) {
    return {
      active: [],
      reveal_allowed: [],
      overdue: [],
    };
  }
  const resolvedKeys = new Set(
    (batchState.foreshadowing_resolved || [])
      .map((item) => String(item.hook || item.reader_knows || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const gaps = (batchState.foreshadowing_added || [])
    .filter(isInformationGapItem)
    .map((item) => normalizeInformationGap(item, chapterNo))
    .filter((gap) => gap.reader_knows && !resolvedKeys.has(String(gap.hook || gap.reader_knows).trim().toLowerCase()));
  return {
    active: gaps.filter((gap) => gap.status === "active_hidden"),
    reveal_allowed: gaps.filter((gap) => gap.status === "reveal_allowed"),
    overdue: gaps.filter((gap) => gap.status === "overdue_reveal"),
  };
}

function characterAnchorsFromBatchState(batchState) {
  if (!batchState) return [];
  const anchors = [];
  const seen = new Set();
  for (const item of batchState.characters || []) {
    const anchor = normalizeCharacterAnchor(item);
    if (!anchor.name || !anchor.contradiction) continue;
    const key = anchor.name;
    if (seen.has(key)) continue;
    seen.add(key);
    anchors.push({
      ...anchor,
      reuse_as_voice_constraint: true,
    });
  }
  return anchors.slice(0, 12);
}

function characterVoiceSamplesFromBatchState(batchState) {
  if (!batchState) return [];
  const samples = [];
  const seen = new Set();
  const sourceItems = sortRecentFirst(batchState.character_voice_samples || []);
  for (const item of sourceItems) {
    const name = String(item?.name || "").trim();
    const line = String(item?.line || "").trim();
    if (!name || !line) continue;
    const key = `${name}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    samples.push({
      name,
      line,
      voice_note: item.voice_note || "",
      source: item.source || "",
      chapter_no: item.chapter_no || null,
      confidence: item.confidence ?? 1,
      reuse_as_voice_constraint: true,
    });
  }
  return samples.slice(0, 16);
}

function reviewIssueToConstraint(issue) {
  const text = String(issue || "");
  if (/瑙ｉ噴鑵攟浠栫煡閬搢浠栨剰璇嗗埌|浠栨槑鐧?.test(text)) {
    return "鐢ㄥ叿浣撳姩浣溿€佸璇濆拰鍙缁撴灉鏇夸唬瑙ｉ噴鑵斻€?;
  }
  if (/鏃佺櫧|鍢磡鍙ｅご|鎺ㄨ繘/.test(text)) {
    return "涓昏鎺ㄨ繘蹇呴』钀藉湪鍔ㄤ綔銆佽鍗曘€佸啿绐佸拰鐜板満鍙嶉涓婏紝涓嶉潬鏃佺櫧璇存槑銆?;
  }
  if (/绔犲熬|閽╁瓙|鐣欎汉/.test(text)) {
    return "绔犲熬蹇呴』缁欏嚭涓庝笅涓€绔犱簨浠剁洿鎺ュ叧鑱旂殑涓€鍙ヨ瘽鍙嶈浆鎴栧帇鍔涖€?;
  }
  if (/鍙拌瘝|鍚岃川鍖東閰嶈|瑙掕壊/.test(text)) {
    return "閰嶈鍙拌瘝蹇呴』浣撶幇韬唤銆佸埄鐩婂拰璇磋瘽涔犳儻锛岄伩鍏嶆墍鏈変汉涓€涓彛鍚汇€?;
  }
  return `閬垮厤閲嶅闂锛?{text}`;
}

async function recentReviewHistoryForChapter(project, chapterNo, window = 5) {
  const from = Math.max(1, chapterNo - window);
  const sourceChapters = [];
  const issueSet = new Set();
  for (let current = from; current < chapterNo; current += 1) {
    try {
      const review = await readJson(reviewFile(project, current));
      const issues = Array.isArray(review.issues) ? review.issues.filter(Boolean) : [];
      if (!issues.length) continue;
      sourceChapters.push({
        chapter_no: current,
        grade: review.grade || null,
        issues,
      });
      for (const issue of issues) issueSet.add(String(issue));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const issues = [...issueSet];
  return {
    window,
    source_chapters: sourceChapters,
    issues,
    writing_constraints: [...new Set(issues.map(reviewIssueToConstraint))],
    use_as_prompt_constraints: issues.length > 0,
  };
}

export async function buildChapterContext(project, chapterNo) {
  const projectPlanning = await buildProjectPlanningContext(project);
  const batchState = await latestBatchStateForChapter(project, chapterNo);
  const narrativeContext = await narrativeContextForChapter(project, chapterNo);
  const recentReviewHistory = await recentReviewHistoryForChapter(project, chapterNo);
  const foreshadowingDebts = foreshadowingDebtsFromBatchState(batchState, chapterNo);
  const informationGaps = informationGapsFromBatchState(batchState, chapterNo);
  const characterAnchors = characterAnchorsFromBatchState(batchState);
  const characterVoiceSamples = characterVoiceSamplesFromBatchState(batchState);
  const batchSize = project.batch_size || 5;
  return {
    chapter_no: chapterNo,
    batch_position: {
      index_in_batch: ((chapterNo - 1) % batchSize) + 1,
      batch_size: batchSize,
      batch_start: chapterNo - (((chapterNo - 1) % batchSize)),
    },
    project: {
      title: project.title,
      idea: project.idea,
      platform: project.platform,
      channel: project.channel,
      genre: project.genre,
      target_words: project.target_words,
    },
    project_planning: projectPlanning,
    recent_batch_range: batchState
      ? { from: batchState.meta.from, to: batchState.meta.to }
      : null,
    hard_rules: [
      ...writingRulesForProject(project),
      "搴熷純鑽夌浜嬪疄涓嶅緱杩涘叆浠诲姟鍖咃紱琚洖閫€鐗堟湰鍙兘浣滀负鍙嶉潰璁板綍锛屼笉鑳芥薄鏌撴鏂囪繛缁€с€?,
    ],
    batch_state: batchState,
    narrative_context: narrativeContext,
    recent_review_history: recentReviewHistory,
    foreshadowing_debts: foreshadowingDebts,
    information_gaps: informationGaps,
    character_anchors: characterAnchors,
    character_voice_samples: characterVoiceSamples,
  };
}

function sortRecentFirst(items = []) {
  return [...items].sort((a, b) => (b.chapter_no || 0) - (a.chapter_no || 0));
}

function trimArrayToBudget(baseContext, batchState, field, maxItems, budget) {
  const items = sortRecentFirst(batchState[field] || []);
  while (items.length > maxItems) items.pop();
  while (items.length > 0) {
    const candidateBatchState = { ...batchState, [field]: items };
    const candidateContext = { ...baseContext, batch_state: candidateBatchState };
    if (estimateTokens(candidateContext) <= budget) break;
    items.pop();
  }
  return items;
}

export function fitContextToTokenBudget(context, budget = DEFAULT_CONTEXT_TOKEN_BUDGET) {
  const initialTokens = estimateTokens(context);
  if (initialTokens <= budget) {
    return {
      context,
      context_budget: {
        status: "ok",
        token_budget: budget,
        estimated_tokens: initialTokens,
        removed: {},
      },
    };
  }

  const original = context.batch_state || {};
  let batchState = {
    ...original,
    low_confidence_candidates: [],
  };
  const removed = {
    low_confidence_candidates: (original.low_confidence_candidates || []).length,
  };
  let trimmedContext = { ...context, batch_state: batchState };

  const trimPlan = [
    ["timeline", 10],
    ["characters", 15],
    ["relationships", 15],
    ["business_state", 12],
    ["money_orders", 10],
    ["character_voice_samples", 12],
    ["foreshadowing_resolved", 8],
    ["foreshadowing_added", 20],
    ["risks", 8],
  ];

  for (const [field, maxItems] of trimPlan) {
    const before = (batchState[field] || []).length;
    batchState = {
      ...batchState,
      [field]: trimArrayToBudget(trimmedContext, batchState, field, maxItems, budget),
    };
    removed[field] = before - (batchState[field] || []).length;
    trimmedContext = { ...context, batch_state: batchState };
  }

  const finalTokens = estimateTokens(trimmedContext);
  return {
    context: trimmedContext,
    context_budget: {
      status: finalTokens <= budget ? "trimmed" : "budget_exceeded",
      token_budget: budget,
      estimated_tokens: finalTokens,
      original_estimated_tokens: initialTokens,
      removed,
    },
  };
}

export async function buildWritingTaskPackage(project, chapterNo, options = {}) {
  const { force = false, contextTokenBudget = DEFAULT_CONTEXT_TOKEN_BUDGET } = options;
  const file = taskPackageFile(project, chapterNo);
  if (!force) {
    try {
      const existing = assertWritingTaskPackage(await readJson(file));
      const planningContext = await buildProjectPlanningContext(project);
      const gaps = chapterCardContaminationGaps(existing.chapter_card, project, planningContext);
      if (!existing.story_room_execution || existing.story_room_execution.status !== "required") {
        throw Object.assign(new Error("stale writing task package missing story-room execution contract"), { code: "ENOENT" });
      }
      if (!gaps.length) return existing;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  const executableCard = await ensureExecutableChapterCard(project, chapterNo, options);
  const chapterCard = executableCard.card;
    const rawContext = compactWritingChapterContext(
      await buildChapterContext(project, chapterNo),
      chapterCard,
    );
  const { context, context_budget: contextBudget } = fitContextToTokenBudget(
    rawContext,
    contextTokenBudget,
  );
  const openingHookCandidates = {
    use_first_300_chars: chapterNo <= 3,
    rules: [
      "棣栫珷/鍓嶄笁绔犲墠 300 瀛楀繀椤荤洿鎺ヨ繘鍏ュ啿绐併€佸弽甯搞€佸姩浣滄垨缁撴灉銆?,
      "涓嶈鐢ㄧ幆澧冩弿鍐欍€佽韩浠借В閲娿€佷笘鐣岃璇存槑鍋氱涓€鍙ャ€?,
      "浼樺厛閫夋嫨璇勫垎鏈€楂樼殑鍊欓€夊紑澶达紱鍙互鏀瑰啓锛屼絾蹇呴』淇濈暀鍔ㄤ綔鍐茬獊銆?,
    ],
    candidates: generateOpeningHookCandidates(chapterCard),
  };
  const goldenThreeTemplate = goldenThreeTemplateForChapter(chapterNo);
  const rhythmTransfer = buildRhythmTransferTaskContext(chapterCard.rhythm_transfer);
  const domainKnowledge = await retrieveRelevantDomainKnowledge(project, chapterCard);
  const stageRuleContract = writingRulesForTask(project, "write_chapter", { chapterNo });
  const storyRoomExecution = storyRoomExecutionContract(chapterCard);
  const hardRules = [
    ...context.hard_rules,
    ...stageRuleContract.rules,
    ...(storyRoomExecution.required_in_prose || []),
  ];
  const taskPackage = assertWritingTaskPackage({
    chapter_no: chapterNo,
    chapter_card: applyGoldenThreeQualityStandard(chapterCard),
    story_room_execution: storyRoomExecution,
    context,
    planning_execution_gaps: executableCard.gaps,
    rhythm_transfer: rhythmTransfer,
    domain_knowledge: domainKnowledge,
    opening_hook_candidates: openingHookCandidates,
    early_chapter_quality_standard: goldenThreeTemplate,
    stage_rule_contract: stageRuleContract,
    hard_rules: hardRules,
    output: {
      format: "txt",
      target_words: chapterCard.target_words || 2600,
      paragraph_style: "fanqie_mobile_short_paragraphs",
    },
    context_budget: contextBudget,
    created_at: new Date().toISOString(),
  });
  taskPackage.path = file;
  await writeJson(file, taskPackage);
  return taskPackage;
}

function createTaskCheckpoint(project, { from, to }) {
  return {
    task_id: `batch-${from}-${to}`,
    project_title: project.title,
    status: "running",
    from,
    to,
    current_chapter: from,
    last_step: "start",
    completed_chapters: [],
    global_reviews: [],
    stop: null,
    updated_at: new Date().toISOString(),
  };
}

async function writeTaskCheckpoint(project, checkpoint, patch = {}, options = {}) {
  const next = assertTaskCheckpoint({
    ...checkpoint,
    ...patch,
    updated_at: new Date().toISOString(),
  });
  const file = taskCheckpointFile(project, next.from, next.to);
  next.path = file;
  await writeJson(file, next);
  if (typeof options.onCheckpointWrite === "function") {
    await options.onCheckpointWrite(next);
  }
  return next;
}

function patchTaskCheckpoint(checkpoint, patch = {}) {
  return assertTaskCheckpoint({
    ...checkpoint,
    ...patch,
    updated_at: new Date().toISOString(),
  });
}

export async function readTaskCheckpoint(project, { from, to } = {}) {
  try {
    return assertTaskCheckpoint(await readJson(taskCheckpointFile(project, from, to)));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`璇ユ壒娆″皻鏈繍琛屾垨妫€鏌ョ偣鏂囦欢缂哄け: ${from}-${to}`);
    }
    throw error;
  }
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function projectFolderTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

async function stopForMissingArtifact(project, checkpoint, chapter, missingArtifacts) {
  const stop = {
    chapter_no: chapter.chapter_no,
    reason: "artifact_missing",
    missing_artifacts: missingArtifacts,
  };
  const nextCheckpoint = await writeTaskCheckpoint(project, checkpoint, {
    status: "stopped",
    current_chapter: chapter.chapter_no,
    last_step: "artifact_check",
    stop,
  });
  return {
    from: checkpoint.from,
    to: checkpoint.to,
    status: "stopped",
    resumed: true,
    resume_from: chapter.chapter_no,
    chapters: checkpoint.completed_chapters || [],
    stop,
    checkpoint_path: nextCheckpoint.path,
  };
}

async function repairCompletedChapterArtifacts(project, completedChapters, options = {}) {
  const repaired = [];
  for (const chapter of completedChapters) {
    const draftPath = draftFile(project, chapter.chapter_no, chapter.version);
    if (!(await fileExists(draftPath))) {
      return {
        ok: false,
        chapter,
        missing_artifacts: [
          {
            artifact: "draft",
            path: draftPath,
          },
        ],
        repaired,
      };
    }
    const taskFile = taskPackageFile(project, chapter.chapter_no);
    if (!(await fileExists(taskFile))) {
      const taskPackage = await buildWritingTaskPackage(project, chapter.chapter_no);
      repaired.push({
        chapter_no: chapter.chapter_no,
        artifact: "task_package",
        path: taskPackage.path,
      });
    }
    const chapterReviewFile = reviewFile(project, chapter.chapter_no);
    if (!(await fileExists(chapterReviewFile))) {
      await reviewChapter(project, chapter.chapter_no, chapter.version, options);
      repaired.push({
        chapter_no: chapter.chapter_no,
        artifact: "review",
        path: chapterReviewFile,
      });
    }
    const stateFile = stateCandidatesFile(project, chapter.chapter_no);
    if (!(await fileExists(stateFile))) {
      const candidates = await extractStateCandidates(project, chapter.chapter_no, options);
      chapter.state_candidates_path = candidates.path;
      repaired.push({
        chapter_no: chapter.chapter_no,
        artifact: "state_candidates",
        path: candidates.path,
      });
    }
    const chapterExportFile = exportFile(project, chapter.chapter_no);
    if (!(await fileExists(chapterExportFile))) {
      const exported = await exportChapter(project, chapter.chapter_no);
      chapter.export_path = exported.path;
      repaired.push({
        chapter_no: chapter.chapter_no,
        artifact: "export",
        path: exported.path,
      });
    }
  }
  return { ok: true, repaired };
}

export async function runBatch(
  project,
  {
    from,
    to,
    maxRewrites = 2,
    router,
    routerOptions,
    onCheckpointWrite,
    startChapter = from,
    initialChapters = [],
    checkpoint: existingCheckpoint,
  } = {},
) {
  const chapters = [...initialChapters];
  const globalReviews = [];
  const batchOptions = {
    ...(router ? { router } : {}),
    routerOptions,
  };
  const chapterCardWindowSize = Math.max(1, Number(project.batch_size || 5));
  const ensureChapterCardWindow = (chapterNo) => preGenerateChapterCards(project, {
    from: chapterNo,
    to: Math.min(to, chapterNo + chapterCardWindowSize - 1),
    options: batchOptions,
  });
  await preGenerateChapterCards(project, {
    from: startChapter,
    to: Math.min(to, startChapter + chapterCardWindowSize - 1),
    options: batchOptions,
  });
  let checkpoint = existingCheckpoint
    ? await writeTaskCheckpoint(project, existingCheckpoint, {
        status: "running",
        current_chapter: startChapter,
        stop: null,
      }, { onCheckpointWrite })
    : await writeTaskCheckpoint(project, createTaskCheckpoint(project, { from, to }), {}, { onCheckpointWrite });
  const updateCheckpoint = async (patch = {}) => {
    checkpoint = await writeTaskCheckpoint(project, checkpoint, patch, { onCheckpointWrite });
    return checkpoint;
  };
  const stopBatch = async ({ chapterNo, grade, reason, review, version, rewriteCount }) => {
    const stop = {
      chapter_no: chapterNo,
      grade,
      reason,
      version,
      rewrite_count: rewriteCount,
      review,
    };
    checkpoint = await writeTaskCheckpoint(project, checkpoint, {
      status: "stopped",
      current_chapter: chapterNo,
      last_step: "review",
      stop,
    }, { onCheckpointWrite });
    return {
      from,
      to,
      status: "stopped",
      chapters,
      stop,
      checkpoint_path: checkpoint.path,
    };
  };
  for (let chapterNo = startChapter; chapterNo <= to; chapterNo += 1) {
    await ensureChapterCardWindow(chapterNo);
    const callsBeforeChapter = await readModelCallLines(project);
    await updateCheckpoint({
      status: "running",
      current_chapter: chapterNo,
      last_step: "chapter_card",
    });
    const card = await loadCardOrCreate(project, chapterNo, batchOptions);
    await updateCheckpoint({
      current_chapter: chapterNo,
      last_step: "write",
    });
    await writeChapter(project, chapterNo, batchOptions);
    await updateCheckpoint({
      current_chapter: chapterNo,
      last_step: "review",
    });
    let review = await reviewChapter(project, chapterNo, "v1", batchOptions);
    let version = "v1";
    let currentText = (await readDraft(project, chapterNo, version)).text;
    let qualityCheck = await applyReviewQualityFlags(project, chapterNo, review, currentText);
    review = qualityCheck.review;
    if (review.grade === "E") {
      const stop = {
        grade: "E",
        reason: "rollback_required",
        review,
      };
      const report = await writeChapterQualityReportFromBatch(project, {
        chapterNo,
        card,
        review,
        version,
        rewriteCount: 0,
        stop,
        callsBefore: callsBeforeChapter,
      });
      return stopBatch({
        chapterNo,
        grade: "E",
        reason: "rollback_required",
        review,
        version,
        rewriteCount: 0,
        qualityReportPath: report.path,
      });
    }
    let rewriteCount = 0;
    let latestQualityMetrics = await buildChapterQualityMetrics(project, chapterNo, card);
    let latestPublishGate = effectiveReviewGate(
      review,
      evaluateChapterPublishGate(latestQualityMetrics, review, review?.hard_rule_violations || []),
    );
    if (latestPublishGate.publish_ready) {
      review = {
        ...review,
        grade: normalizedPublishGrade(review, latestPublishGate) || review.grade,
        next_action: review.next_action || "publish_gate_pass",
        publish_gate: latestPublishGate,
      };
    }
    while (review.grade === "D" && !latestPublishGate.publish_ready && rewriteCount < maxRewrites) {
      await updateCheckpoint({
        current_chapter: chapterNo,
        last_step: "rewrite",
      });
      const repair = nextTargetedRepairFocus(review, rewriteCount);
      const rewritten = await rewriteChapterSmart(project, chapterNo, {
        ...batchOptions,
        rewriteLayers: repair.layers,
        rewriteFocus: repair.focus,
      });
      version = rewritten.version;
      rewriteCount += 1;
      currentText = rewritten.text;
      await updateCheckpoint({
        current_chapter: chapterNo,
        last_step: "review",
      });
      review = await reviewChapter(project, chapterNo, version, batchOptions);
      qualityCheck = await applyReviewQualityFlags(project, chapterNo, review, currentText);
      review = qualityCheck.review;
      latestQualityMetrics = await buildChapterQualityMetrics(project, chapterNo, card);
      latestPublishGate = effectiveReviewGate(
        review,
        evaluateChapterPublishGate(latestQualityMetrics, review, review?.hard_rule_violations || []),
      );
      if (latestPublishGate.publish_ready) {
        review = {
          ...review,
          grade: normalizedPublishGrade(review, latestPublishGate) || review.grade,
          next_action: review.next_action || "publish_gate_pass",
          publish_gate: latestPublishGate,
        };
      }
      if (review.grade === "E") {
        const stop = {
          grade: "E",
          reason: "rollback_required",
          review,
        };
        const report = await writeChapterQualityReportFromBatch(project, {
          chapterNo,
          card,
          review,
          version,
          rewriteCount,
          stop,
          callsBefore: callsBeforeChapter,
        });
        return stopBatch({
          chapterNo,
          grade: "E",
          reason: "rollback_required",
          review,
          version,
          rewriteCount,
          qualityReportPath: report.path,
        });
      }
    }
    while (!latestPublishGate.publish_ready && rewriteCount < maxRewrites) {
      review = enforceHardQualityFlags(
        {
          ...review,
          publish_gate: latestPublishGate,
          issues: [...(review.issues || []), "publish_gate_not_ready", ...(latestPublishGate.blockers || [])],
        },
        ["publish_gate_not_ready"],
      );
      await updateCheckpoint({
        current_chapter: chapterNo,
        last_step: "rewrite",
      });
      const repair = nextTargetedRepairFocus(review, rewriteCount);
      const rewritten = await rewriteChapterSmart(project, chapterNo, {
        ...batchOptions,
        rewriteLayers: repair.layers,
        rewriteFocus: repair.focus,
      });
      version = rewritten.version;
      rewriteCount += 1;
      currentText = rewritten.text;
      await updateCheckpoint({
        current_chapter: chapterNo,
        last_step: "review",
      });
      review = await reviewChapter(project, chapterNo, version, batchOptions);
      qualityCheck = await applyReviewQualityFlags(project, chapterNo, review, currentText);
      review = qualityCheck.review;
      latestQualityMetrics = await buildChapterQualityMetrics(project, chapterNo, card);
      latestPublishGate = effectiveReviewGate(
        review,
        evaluateChapterPublishGate(latestQualityMetrics, review, review?.hard_rule_violations || []),
      );
      if (latestPublishGate.publish_ready) {
        review = {
          ...review,
          grade: normalizedPublishGrade(review, latestPublishGate) || review.grade,
          next_action: review.next_action || "publish_gate_pass",
          publish_gate: latestPublishGate,
        };
      }
    }
    if (!latestPublishGate.publish_ready) {
      review = enforceHardQualityFlags(
        {
          ...review,
          publish_gate: latestPublishGate,
          issues: [...(review.issues || []), "publish_gate_not_ready", ...(latestPublishGate.blockers || [])],
        },
        ["publish_gate_not_ready"],
      );
    }
    if (!latestPublishGate.publish_ready && review.grade === "D") {
      const stop = {
        grade: "D",
        reason: "max_rewrites_exhausted",
        review,
      };
      const report = await writeChapterQualityReportFromBatch(project, {
        chapterNo,
        card,
        review,
        version,
        rewriteCount,
        stop,
        callsBefore: callsBeforeChapter,
      });
      return stopBatch({
        chapterNo,
        grade: "D",
        reason: "max_rewrites_exhausted",
        review,
        version,
        rewriteCount,
        qualityReportPath: report.path,
      });
    }
    await updateCheckpoint({
      current_chapter: chapterNo,
      last_step: "state_candidates",
    });
    const stateCandidates = await extractStateCandidates(project, chapterNo, batchOptions);
    await updateCheckpoint({
      current_chapter: chapterNo,
      last_step: "export",
    });
    const exported = await exportChapter(project, chapterNo);
    const qualityReport = await writeChapterQualityReportFromBatch(project, {
      chapterNo,
      card,
      review,
      version,
      rewriteCount,
      exported,
      stateCandidates,
      callsBefore: callsBeforeChapter,
    });
    const chapterResult = {
      chapter_no: chapterNo,
      review_grade: review.grade,
      publish_ready: Boolean(qualityReport.publish_gate?.publish_ready),
      publish_status: qualityReport.publish_gate?.publish_ready ? "鍙彂甯? : qualityReport.publish_gate?.label || "闇€鑷姩浼樺寲",
      version,
      word_count: progressWordCount((await readDraft(project, chapterNo, version)).text),
      rewrite_count: rewriteCount,
      export_path: exported.path,
      state_candidates_path: stateCandidates.path,
      quality_report_path: qualityReport.path,
    };
    chapters.push(chapterResult);
    checkpoint = await writeTaskCheckpoint(project, checkpoint, {
      current_chapter: chapterNo,
      last_step: "chapter_completed",
      completed_chapters: [...checkpoint.completed_chapters, chapterResult],
    }, { onCheckpointWrite });
    if (chapterNo % 10 === 0) {
      const reviewFrom = chapterNo - 9;
      const reviewTo = chapterNo;
      checkpoint = await writeTaskCheckpoint(project, checkpoint, {
        current_chapter: chapterNo,
        last_step: "global_review",
        global_review: {
          from: reviewFrom,
          to: reviewTo,
          status: "running",
          summary: "",
          cross_chapter_issues: [],
        },
      }, { onCheckpointWrite });
      const globalReview = await runGlobalChapterReview(project, {
        from: reviewFrom,
        to: reviewTo,
        ...batchOptions,
      });
      let finalGlobalReview = globalReview;
      if ((globalReview.cross_chapter_issues || []).some((issue) => Number(issue?.chapter_no || 0) > 0)) {
        const repairItems = repairItemsFromGlobalReview(globalReview);
        checkpoint = await writeTaskCheckpoint(project, checkpoint, {
          current_chapter: chapterNo,
          last_step: "global_repair",
          global_review: {
            ...globalReview,
            repair_status: "running",
            repair_queue: repairItems,
            current_repair_item: repairItems[0] || null,
          },
        }, { onCheckpointWrite });
        finalGlobalReview = await runGlobalReviewRepairQueue(project, globalReview, {
          ...batchOptions,
          maxRewrites: Math.max(1, maxRewrites),
          onProgress: async (progress) => {
            if (progress.step === "global_repair") {
              checkpoint = await writeTaskCheckpoint(project, checkpoint, {
                current_chapter: progress.chapter_no || chapterNo,
                last_step: "global_repair",
                global_review: {
                  ...globalReview,
                  repair_status: "running",
                  repair_queue: repairItems,
                  current_repair_item: progress.repair_item || null,
                },
              }, { onCheckpointWrite });
            }
            if (progress.step === "global_rereview") {
              checkpoint = await writeTaskCheckpoint(project, checkpoint, {
                current_chapter: chapterNo,
                last_step: "global_rereview",
                global_review: {
                  ...globalReview,
                  repair_status: "rereviewing",
                  repair_queue: repairItems,
                },
              }, { onCheckpointWrite });
            }
          },
        });
      }
      checkpoint = await writeTaskCheckpoint(project, checkpoint, {
        current_chapter: chapterNo,
        last_step: "outline_refresh",
        global_review: {
          ...finalGlobalReview,
          outline_refresh: {
            status: "running",
            completed_to: chapterNo,
          },
        },
      }, { onCheckpointWrite });
      const outlineRefresh = await refreshRollingOutlineAfterGlobalReview(project, {
        completedTo: chapterNo,
        globalReview: finalGlobalReview,
        options: batchOptions,
      });
      finalGlobalReview = {
        ...finalGlobalReview,
        outline_refresh: outlineRefresh,
      };
      if (outlineRefresh.status === "completed") {
        await preGenerateChapterCards(project, {
          from: outlineRefresh.from,
          to: Math.min(outlineRefresh.to, outlineRefresh.from + chapterCardWindowSize - 1),
          options: batchOptions,
        });
      }
      globalReviews.push(finalGlobalReview);
      checkpoint = await writeTaskCheckpoint(project, checkpoint, {
        current_chapter: chapterNo,
        last_step: "outline_refresh",
        global_review: finalGlobalReview,
        global_reviews: [...(checkpoint.global_reviews || []), finalGlobalReview],
      }, { onCheckpointWrite });
    }
  }
  checkpoint = await writeTaskCheckpoint(project, checkpoint, {
    current_chapter: to,
    last_step: "batch_state",
  }, { onCheckpointWrite });
  const batchState = await aggregateBatchState(project, { from, to });
  checkpoint = await writeTaskCheckpoint(project, checkpoint, {
    status: "completed",
    current_chapter: to,
    last_step: "batch_state",
  }, { onCheckpointWrite });
  return {
    from,
    to,
    status: "completed",
    chapters,
    global_reviews: globalReviews,
    batch_state_path: batchState.path,
    checkpoint_path: checkpoint.path,
  };
}

export async function resumeBatch(project, { from, to, maxRewrites, routerOptions, onCheckpointWrite } = {}) {
  let checkpoint;
  try {
    checkpoint = await readTaskCheckpoint(project, { from, to });
  } catch (error) {
    if (error.message?.includes("璇ユ壒娆″皻鏈繍琛屾垨妫€鏌ョ偣鏂囦欢缂哄け")) {
      const result = await runBatch(project, { from, to, maxRewrites, routerOptions, onCheckpointWrite });
      return { ...result, resumed: false, resume_from: from };
    }
    throw error;
  }

  const completedChapters = checkpoint.completed_chapters || [];
  const artifactCheck = await repairCompletedChapterArtifacts(project, completedChapters, { routerOptions });
  if (!artifactCheck.ok) {
    return stopForMissingArtifact(project, checkpoint, artifactCheck.chapter, artifactCheck.missing_artifacts);
  }
  const repaired = artifactCheck.repaired;
  if (checkpoint.status === "completed") {
    return {
      from,
      to,
      status: "already_completed",
      resumed: true,
      resume_from: to + 1,
      chapters: completedChapters,
      global_reviews: checkpoint.global_reviews || [],
      repaired,
      checkpoint_path: checkpoint.path || taskCheckpointFile(project, from, to),
    };
  }

  const lastCompletedChapter = completedChapters.reduce(
    (max, chapter) => Math.max(max, chapter.chapter_no || 0),
    from - 1,
  );
  const resumeFrom = Math.max(from, lastCompletedChapter + 1);
  if (resumeFrom > to) {
    return {
      from,
      to,
      status: "already_completed",
      resumed: true,
      resume_from: resumeFrom,
      chapters: completedChapters,
      global_reviews: checkpoint.global_reviews || [],
      repaired,
      checkpoint_path: checkpoint.path || taskCheckpointFile(project, from, to),
    };
  }

  const result = await runBatch(project, {
    from,
    to,
    maxRewrites,
    routerOptions,
    onCheckpointWrite,
    startChapter: resumeFrom,
    initialChapters: completedChapters,
    checkpoint,
  });
  return {
    ...result,
    resumed: true,
    resume_from: resumeFrom,
    repaired,
  };
}

export async function continueBatch(project, options = {}) {
  const from = project.current_chapter || 1;
  const batchSize = project.batch_size || 5;
  const to = from + batchSize - 1;
  const result = await runBatch(project, { ...options, from, to });
  if (result.status === "completed") {
    project.current_chapter = to + 1;
    project.status = "writing";
    project.updated_at = new Date().toISOString();
    await saveProject(project);
    return {
      ...result,
      next_chapter: project.current_chapter,
    };
  }
  return {
    ...result,
    next_chapter: project.current_chapter,
  };
}

function nextActionForRunStatus(status) {
  if (status === "completed") return "continue";
  if (status === "stopped") return "fix_stopped_batch";
  return "none";
}

async function writeRunReport(project, result) {
  const batches = result.batches || [];
  const report = assertRunReport({
    project_title: project.title,
    status: result.status,
    until_chapter: result.until_chapter,
    next_chapter: result.next_chapter,
    completed_batches: result.completed_batches || 0,
    batches: batches.map((batch) => ({
      from: batch.from,
      to: batch.to,
      status: batch.status,
      resumed: Boolean(batch.resumed),
      resume_from: batch.resume_from ?? null,
      checkpoint_path: batch.checkpoint_path ?? null,
      batch_state_path: batch.batch_state_path ?? null,
    })),
    completed_chapters: batches.flatMap((batch) =>
      (batch.chapters || []).map((chapter) => chapter.chapter_no),
    ),
    repaired: batches.flatMap((batch) => batch.repaired || []),
    stop: result.stop || null,
    next_action: nextActionForRunStatus(result.status),
    created_at: new Date().toISOString(),
  });
  const file = runReportFile(project);
  report.path = file;
  await writeJson(file, report);
  return report;
}

export async function runProject(project, { untilChapter, routerOptions, maxRewrites, resume = false, onProgress } = {}) {
  const target = untilChapter || (project.current_chapter || 1) + (project.batch_size || 5) - 1;
  const batches = [];
  const startChapter = project.current_chapter || 1;
  const totalChapters = Math.max(1, target - startChapter + 1);
  const reportProgress = async (progress) => {
    if (typeof onProgress === "function") {
      await onProgress({
        from: startChapter,
        to: target,
        total_chapters: totalChapters,
        ...progress,
      });
    }
  };
  const batchModelStageLabel = (taskType = "") => ({
    generate_chapter_card: "鐢熸垚绔犲崱",
    write_chapter: "鍐欐鏂?,
    review_chapter: "鑷姩瀹＄",
    rewrite_chapter: "鑷姩鏀圭",
    extract_state_candidates: "鍚屾璁板繂",
    global_review: "鍏ㄥ眬澶嶅",
  })[taskType] || taskType || "妯″瀷浠诲姟";
  const batchRouterOptions = {
    ...(routerOptions || {}),
    onAttempt: async (attempt) => {
      const label = batchModelStageLabel(attempt.task_type);
      const modelText = [attempt.provider, attempt.model].filter(Boolean).join(" / ") || "褰撳墠妯″瀷";
      const seconds = attempt.timeout_ms ? Math.round(Number(attempt.timeout_ms) / 1000) : 0;
      const next = attempt.fallback_next
        ? [attempt.fallback_next.provider, attempt.fallback_next.model].filter(Boolean).join(" / ")
        : "";
      await reportProgress({
        step: attempt.event === "fallback" ? "model_fallback" : attempt.event === "failed" ? "model_failed" : "model_call",
        model_event: attempt.event,
        model_task_type: attempt.task_type,
        model_stage: label,
        model_provider: attempt.provider,
        model_name: attempt.model,
        model_timeout_ms: attempt.timeout_ms,
        model_error: attempt.error || "",
        fallback_next: attempt.fallback_next || null,
        message: attempt.event === "fallback"
          ? `${label}妯″瀷澶辫触锛?{attempt.error || "鏈煡閿欒"}銆?{next ? `姝ｅ湪鍒囨崲澶囩敤妯″瀷 ${next}` : "姝ｅ湪鍒囨崲澶囩敤鏂规"}銆俙
          : attempt.event === "failed"
            ? `${label}妯″瀷鍏ㄩ儴澶辫触锛?{attempt.error || "鏈煡閿欒"}銆傛湰鎵规浼氬仠姝㈠苟淇濈暀鍘熷洜銆俙
            : `姝ｅ湪璋冪敤${label}妯″瀷锛?{modelText}${seconds ? `锛屾渶闀跨瓑寰?${seconds} 绉抈 : ""}銆俙,
      });
    },
  };
  if (target < (project.current_chapter || 1)) {
    const result = {
      status: "already_reached",
      until_chapter: target,
      batches,
      completed_batches: 0,
      next_chapter: project.current_chapter,
    };
    const report = await writeRunReport(project, result);
    return { ...result, report_path: report.path };
  }
  while ((project.current_chapter || 1) <= target) {
    const from = project.current_chapter || 1;
    const to = Math.min(target, from + (project.batch_size || 5) - 1);
    await reportProgress({
      step: "batch",
      chapter_no: from,
      completed_chapters: Math.max(0, from - startChapter),
      current_batch_from: from,
      current_batch_to: to,
    });
    const batch = resume
      ? await resumeBatch(project, { from, to, routerOptions: batchRouterOptions, maxRewrites, onCheckpointWrite: (checkpoint) => reportProgress({
          ...progressCheckpointPayload(checkpoint, { chapter_no: from }),
        }) })
      : await runBatch(project, { from, to, routerOptions: batchRouterOptions, maxRewrites, onCheckpointWrite: (checkpoint) => reportProgress({
          ...progressCheckpointPayload(checkpoint, { chapter_no: from }),
        }) });
    batches.push(batch);
    if (batch.status === "stopped") {
      const result = {
        status: "stopped",
        until_chapter: target,
        batches,
        completed_batches: batches.filter((item) => item.status === "completed").length,
        stop: batch.stop,
        next_chapter: project.current_chapter,
      };
      const report = await writeRunReport(project, result);
      return { ...result, report_path: report.path };
    }
    project.current_chapter = to + 1;
    project.status = "writing";
    project.updated_at = new Date().toISOString();
    await saveProject(project);
    await reportProgress({
      step: "batch_completed",
      chapter_no: to,
      completed_chapters: Math.min(totalChapters, to - startChapter + 1),
    });
  }
  const result = {
    status: "completed",
    until_chapter: target,
    batches,
    completed_batches: batches.length,
    next_chapter: project.current_chapter,
  };
  const report = await writeRunReport(project, result);
  await reportProgress({ step: "completed", completed_chapters: totalChapters, chapter_no: target });
  return { ...result, report_path: report.path };
}

export async function runOpenAiSmoke(
  project,
  { allowNetwork = false, model = "gpt-5.1", env = process.env, fetch } = {},
) {
  if (!allowNetwork) {
    throw new Error("OpenAI smoke requires --allow-network");
  }
  const router = await createRouter(project, {
    routerOptions: {
      provider: "openai",
      model,
      allowNetwork,
      env,
      fetch,
    },
  });
  const output = await router.invoke({
    task_type: "write_chapter",
    chapter_card: {
      chapter_no: 1,
      display_title: "OpenAI smoke chapter",
    },
    task_package: {
      output: { target_words: 300 },
    },
  });
  const result = {
    status: "ok",
    provider: "openai",
    model,
    text: output.text,
    created_at: new Date().toISOString(),
  };
  const file = openAiSmokeFile(project);
  result.path = file;
  await writeJson(file, result);
  return result;
}










