import http from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";
import { access, copyFile, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  allocatePortfolioBudget,
  calibratePublishPlatformSelectors,
  collectDomainKnowledgeFromSources,
  createCalibratedVisiblePublishBrowserDriver,
  createPlatformPublishPlan,
  createPortfolio,
  createDomainKnowledgeBuildPlan,
  createPremiumIncubationPlan,
  createProject,
  createPublicReferenceReadPlan,
  createReferenceReadPlan,
  createSafeAutoReaderAdapter,
  detectPortfolioRisers,
  estimateSingleChapterCost,
  exportChapterScreenplay,
  exportChapter,
  exportFullVideoPack,
  exportMerged,
  exportPublishPackage,
  ensurePublishReadyOrThrow,
  generateDomainSourceCandidates,
  generateProjectCharacterRefs,
  generateProjectSceneRefs,
  generateVideoPromptsForChapter,
  getLatestPremiumIncubationReport,
  growPublicReferenceLibrary,
  growPublicReferenceLibraryFromReadSources,
  indexProjectMemory,
  importDomainKnowledge,
  ingestPortfolioProjectObservation,
  ingestQualityMetricObservation,
  listPlatformPublishAdapters,
  loadProject,
  loadProjectConfig,
  recommendDynamicTemplates,
  recommendPublicReferenceFingerprints,
  searchProjectMemory,
  publishToPlatform,
  runProject,
  readLatestGlobalReview,
  runDomainKnowledgeBuild,
  runBatch,
  runPortfolioFrontlist,
  runPremiumIncubation,
  runPremiumRepairSweep,
  runReferenceStructureRead,
  runSingleChapterQualityLoop,
  runVisibleBrowserPublishAssistant,
  reviewChapter,
  refreshDynamicTemplateLibrary,
  readDomainKnowledgeSourceAudit,
  rebuildDomainKnowledgeFromAudit,
  repairChapterToPublish,
  repairQueueSummaryFromPremiumReport,
  saveProjectConfig,
  simulateReaders,
  summarizeProjectCost,
  writePremiumGateReport,
  writePremiumReadinessReport,
  writeRhythmTransferPlan,
  writeWebStatus,
  writeRhythmTransferPlanFromPublicReference,
} from "./core/workflow.mjs";
import { writingRulesForProject } from "./core/rules.mjs";
import { writingRulesForTask } from "./core/writing-rule-registry.mjs";
import {
  domainKnowledgeBaseFile,
  domainKnowledgePlanFile,
  chapterCardFile,
  chapterQualityCheckpointFile,
  draftFile,
  exportFile,
  publishChaptersFile,
  publishManifestFile,
  publishMetadataFile,
  publishSubmissionFile,
  qualityReportFile,
  referenceLibraryFile,
  referenceReadAuditFile,
  referenceStructureFile,
  reviewFile,
  rhythmTransferPlanFile,
  runReportFile,
  stateCandidatesFile,
  taskPackageFile,
  videoChapterPromptFile,
  videoChapterScreenplayFile,
  videoChapterStoryboardFile,
  videoManifestFile,
  webStatusFile,
} from "./core/paths.mjs";
import { createPersistentTaskStore } from "./task-store.mjs";
import { createModelRouter } from "./core/model-router.mjs";
import { listPublishPlatformProfiles } from "./core/browser/publish-browser-driver.mjs";
import { writeJson, writeText } from "./core/fsx.mjs";
import {
  auditStoryRoomChapterPlan,
  buildOpeningThirtyChapterPlan,
  buildStoryRoomChapterOutlineBlock,
} from "./core/story-room-contract.mjs";

const SERVER_VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
const PRODUCT_NAME = "OctoSage";
const PRODUCT_VERSION_LABEL = "V1.100";
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const ASSETS_ROOT = path.resolve(fileURLToPath(new URL("../assets/", import.meta.url)));
const PIXSO_UI_ROOT = path.resolve(fileURLToPath(new URL("../pixso-react-ui/dist/", import.meta.url)));
const KIMI_WEBBRIDGE_INSTALL_URL = "https://cdn.kimi.com/webbridge/install.ps1";
const KIMI_WEBBRIDGE_INSTALL_COMMAND = `irm ${KIMI_WEBBRIDGE_INSTALL_URL} | iex`;
const PUBLISH_SAFETY_LINE = "最终提交永远由用户确认；OctoSage 不会静默执行远程安装脚本，也不会点击平台最终发布按钮。";
const KIMI_WEBBRIDGE_INSTALL_DIR = path.join(process.env.USERPROFILE || process.env.HOME || process.cwd(), ".kimi-webbridge");
const KIMI_WEBBRIDGE_BIN = path.join(KIMI_WEBBRIDGE_INSTALL_DIR, "bin", "kimi-webbridge.exe");
const KIMI_WEBBRIDGE_PID_FILE = path.join(KIMI_WEBBRIDGE_INSTALL_DIR, "daemon.pid");
const LOCAL_COVER_WIDTH = 900;
const LOCAL_COVER_HEIGHT = 1200;
const MODEL_HEALTH_FILE = path.join(
  process.env.LOCALAPPDATA || process.env.APPDATA || process.cwd(),
  "OctoSage",
  "model-health.json",
);
const API_KEY_ENV_NAMES = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DOUBAO_API_KEY",
  "DOUBAO_BASE_URL",
  "QIANFAN_API_KEY",
  "QIANFAN_BASE_URL",
  "DASHSCOPE_API_KEY",
  "DASHSCOPE_BASE_URL",
  "MOONSHOT_API_KEY",
  "MOONSHOT_BASE_URL",
];

const API_KEY_PROVIDER_ROUTES = [
  { env: "OPENAI_API_KEY", provider: "openai", model: "gpt-5.1" },
  { env: "DEEPSEEK_API_KEY", provider: "deepseek", model: "deepseek-v4-flash" },
  { env: "DOUBAO_API_KEY", provider: "doubao", model: "doubao-seed-1-6" },
  { env: "QIANFAN_API_KEY", provider: "wenxin", model: "ernie-5.1" },
  { env: "DASHSCOPE_API_KEY", provider: "qwen", model: "qwen3.6-plus" },
  { env: "MOONSHOT_API_KEY", provider: "kimi", model: "kimi-k2.6" },
];

function normalizeUserSettingValue(name = "", value = "") {
  let text = String(value || "").trim();
  text = text.replace(/^["']+|["']+$/g, "").trim();
  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      const parsed = JSON.parse(text);
      const lowerName = String(name || "").toLowerCase();
      const picked = lowerName.endsWith("base_url")
        ? parsed.base_url || parsed.baseUrl || parsed.url || parsed.endpoint
        : parsed.api_key || parsed.apiKey || parsed.key || parsed.token || parsed.secret_key;
      if (picked) text = String(picked).trim();
    } catch {
      // Keep the original value so the provider can return a precise auth error.
    }
  }
  text = text.replace(/^["']+|["']+$/g, "").trim();
  if (/BASE_URL$/i.test(name)) text = text.replace(/\/+$/, "");
  return text;
}

function readWindowsRegistryEnv(scope, name) {
  if (process.platform !== "win32") return "";
  const key = scope === "machine"
    ? "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment"
    : "HKCU\\Environment";
  try {
    const output = execFileSync("reg.exe", ["query", key, "/v", name], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const line = output.split(/\r?\n/).find((item) => new RegExp(`^\\s*${name}\\s+`).test(item));
    if (!line) return "";
    return line.replace(new RegExp(`^\\s*${name}\\s+REG_\\w+\\s+`), "").trim();
  } catch {
    return "";
  }
}

function hydrateApiKeysFromWindowsEnv() {
  if (process.platform !== "win32") return;
  for (const name of API_KEY_ENV_NAMES) {
    if (process.env[name]) {
      process.env[name] = normalizeUserSettingValue(name, process.env[name]);
      continue;
    }
    const value = readWindowsRegistryEnv("user", name) || readWindowsRegistryEnv("machine", name);
    if (value) process.env[name] = normalizeUserSettingValue(name, value);
  }
}

hydrateApiKeysFromWindowsEnv();

const TASK_MODEL_BLUEPRINT = [
  {
    task_type: "project_planning",
    label: "开书规划/人物关系",
    recommended: { provider: "deepseek", model: "deepseek-v4-flash", env: "DEEPSEEK_API_KEY" },
    fallbacks: [
      { provider: "deepseek", model: "deepseek-v4-pro", env: "DEEPSEEK_API_KEY" },
      { provider: "qwen", model: "qwen3.6-plus", env: "DASHSCOPE_API_KEY" },
    ],
    reason: "开书规划是交互路径，优先 DeepSeek V4-Flash 快速生成结构化方向骨架；V4-Pro 留给每10章全局复审和跨章推理。",
  },
  {
    task_type: "title_suggestion",
    label: "书名生成",
    recommended: { provider: "wenxin", model: "ernie-5.1", env: "QIANFAN_API_KEY" },
    fallbacks: [
      { provider: "deepseek", model: "deepseek-v4-flash", env: "DEEPSEEK_API_KEY" },
      { provider: "qwen", model: "qwen3.6-plus", env: "DASHSCOPE_API_KEY" },
      { provider: "qwen", model: "qwen-plus", env: "DASHSCOPE_API_KEY" },
    ],
    reason: "书名需要中文商业标题感、平台关键词和悬念；优先文心，DeepSeek/Qwen 负责结构化候选兜底。",
  },
  {
    task_type: "generate_chapter_card",
    label: "章卡/细纲",
    recommended: { provider: "deepseek", model: "deepseek-v4-flash", env: "DEEPSEEK_API_KEY" },
    fallbacks: [
      { provider: "deepseek", model: "deepseek-v4-flash", env: "DEEPSEEK_API_KEY" },
      { provider: "qwen", model: "qwen3.6-plus", env: "DASHSCOPE_API_KEY" },
      { provider: "qwen", model: "qwen-plus", env: "DASHSCOPE_API_KEY" },
      { provider: "deepseek", model: "deepseek-v4-pro", env: "DEEPSEEK_API_KEY" },
      { provider: "doubao", model: "doubao-seed-1-6", env: "DOUBAO_API_KEY" },
      { provider: "openai", model: "gpt-5.1", env: "OPENAI_API_KEY" },
    ],
    reason: "章卡/细纲优先结构化、逻辑拆解和成本；DeepSeek V4-Flash 适合快速输出 JSON，若单次 JSON 破损先重试/切同类结构化模型，最后才退到 OpenAI。",
  },
  {
    task_type: "write_chapter",
    label: "正文写作",
    recommended: { provider: "wenxin", model: "ernie-5.1", env: "QIANFAN_API_KEY" },
    fallbacks: [
      { provider: "deepseek", model: "deepseek-v4-flash", env: "DEEPSEEK_API_KEY" },
      { provider: "openai", model: "gpt-5.1", env: "OPENAI_API_KEY" },
      { provider: "kimi", model: "kimi-k2.6", env: "MOONSHOT_API_KEY" },
    ],
    reason: "正文优先中文叙事语感、段落自然度和手机阅读节奏；备用先选结构稳定和可控路线，Kimi 只作为非核心长上下文/对话活度备选。",
  },
  {
    task_type: "review_chapter",
    label: "即时审稿",
    recommended: { provider: "qwen", model: "qwen3.6-plus", env: "DASHSCOPE_API_KEY" },
    fallbacks: [
      { provider: "qwen", model: "qwen-plus", env: "DASHSCOPE_API_KEY" },
      { provider: "deepseek", model: "deepseek-v4-pro", env: "DEEPSEEK_API_KEY" },
      { provider: "openai", model: "gpt-5.1", env: "OPENAI_API_KEY" },
    ],
    reason: "逐章质检需要批判性强、不放水和结构化输出；qwen3.6-plus 适合即时审稿，qwen-plus 只作为百炼降级备用，DeepSeek V4-Pro 适合全局/长上下文复核。",
  },
  {
    task_type: "global_review",
    label: "全局复审",
    recommended: { provider: "deepseek", model: "deepseek-v4-pro", env: "DEEPSEEK_API_KEY" },
    fallbacks: [
      { provider: "qwen", model: "qwen3.6-plus", env: "DASHSCOPE_API_KEY" },
      { provider: "qwen", model: "qwen-plus", env: "DASHSCOPE_API_KEY" },
      { provider: "openai", model: "gpt-5.1", env: "OPENAI_API_KEY" },
    ],
    reason: "每10章/每卷复审需要跨章一致性、人物行为、伏笔和节奏重复检查；优先长上下文强推理模型。",
  },
  {
    task_type: "rewrite_chapter",
    label: "定点修稿",
    recommended: { provider: "deepseek", model: "deepseek-v4-flash", env: "DEEPSEEK_API_KEY" },
    fallbacks: [
      { provider: "wenxin", model: "ernie-5.1", env: "QIANFAN_API_KEY" },
      { provider: "openai", model: "gpt-5.1", env: "OPENAI_API_KEY" },
      { provider: "kimi", model: "kimi-k2.6", env: "MOONSHOT_API_KEY" },
    ],
    reason: "定点修稿优先修事实、时代、资金账、章卡执行和门禁阻断，需要结构化推理和局部可控；文心保留为语感润色后备，不再优先处理硬逻辑返工。",
  },
  {
    task_type: "extract_state_candidates",
    label: "状态/记忆提取",
    recommended: { provider: "deepseek", model: "deepseek-v4-flash", env: "DEEPSEEK_API_KEY" },
    fallbacks: [{ provider: "openai", model: "gpt-5.1", env: "OPENAI_API_KEY" }],
    reason: "JSON 结构化提取稳定，适合低成本批量处理。",
  },
  {
    task_type: "dialogue_tuner",
    label: "对话润色",
    recommended: { provider: "doubao", model: "doubao-seed-1-6", env: "DOUBAO_API_KEY" },
    fallbacks: [{ provider: "kimi", model: "kimi-k2.6", env: "MOONSHOT_API_KEY" }],
    reason: "口语化、短句和角色互动更适合局部对话处理。",
  },
  {
    task_type: "domain_knowledge",
    label: "领域知识",
    recommended: { provider: "qwen", model: "qwen3.6-plus", env: "DASHSCOPE_API_KEY" },
    fallbacks: [
      { provider: "qwen", model: "qwen-plus", env: "DASHSCOPE_API_KEY" },
      { provider: "deepseek", model: "deepseek-v4-pro", env: "DEEPSEEK_API_KEY" },
      { provider: "openai", model: "gpt-5.1", env: "OPENAI_API_KEY" },
    ],
    reason: "领域知识、拆书和全局一致性需要长上下文与结构化归纳；优先 Qwen，DeepSeek V4-Pro 作全局复核备选。",
  },
  {
    task_type: "reference_analysis",
    label: "拆书/一键仿写",
    recommended: { provider: "deepseek", model: "deepseek-v4-pro", env: "DEEPSEEK_API_KEY" },
    fallbacks: [
      { provider: "qwen", model: "qwen3.6-plus", env: "DASHSCOPE_API_KEY" },
      { provider: "qwen", model: "qwen-plus", env: "DASHSCOPE_API_KEY" },
      { provider: "openai", model: "gpt-5.1", env: "OPENAI_API_KEY" },
    ],
    reason: "拆书和仿写计划要抽象节奏、钩子、付费点和人物推进，不复制原文；优先长上下文结构归纳。",
  },
  {
    task_type: "screenplay_adaptation",
    label: "漫剧剧本",
    recommended: { provider: "kimi", model: "kimi-k2.6", env: "MOONSHOT_API_KEY" },
    fallbacks: [
      { provider: "wenxin", model: "ernie-5.1", env: "QIANFAN_API_KEY" },
      { provider: "deepseek", model: "deepseek-v4-flash", env: "DEEPSEEK_API_KEY" },
    ],
    reason: "剧本改编重对话、场面和节奏；Kimi 优先，文心负责中文润色兜底。",
  },
  {
    task_type: "storyboard",
    label: "分镜表",
    recommended: { provider: "deepseek", model: "deepseek-v4-pro", env: "DEEPSEEK_API_KEY" },
    fallbacks: [{ provider: "openai", model: "gpt-5.1", env: "OPENAI_API_KEY" }],
    reason: "分镜需要镜头、景别、时长和情绪结构化规划；优先长上下文推理。",
  },
  {
    task_type: "video_prompt",
    label: "视频提示词",
    recommended: { provider: "openai", model: "gpt-5.1", env: "OPENAI_API_KEY" },
    fallbacks: [{ provider: "kimi", model: "kimi-k2.6", env: "MOONSHOT_API_KEY" }],
    reason: "英文镜头描述和视觉约束更精确。",
  },
];

function apiKeyStatusFromEnv(env = process.env) {
  const labels = {
    OPENAI_API_KEY: "OpenAI",
    DEEPSEEK_API_KEY: "DeepSeek",
    DOUBAO_API_KEY: "Doubao",
    QIANFAN_API_KEY: "Qianfan",
    QIANFAN_BASE_URL: "Qianfan Base URL",
    DASHSCOPE_API_KEY: "DashScope",
    DASHSCOPE_BASE_URL: "DashScope Base URL",
    MOONSHOT_API_KEY: "Kimi",
    MOONSHOT_BASE_URL: "Kimi Base URL",
    DEEPSEEK_BASE_URL: "DeepSeek Base URL",
    DOUBAO_BASE_URL: "Doubao Base URL",
  };
  return API_KEY_ENV_NAMES.map((name) => {
    const value = env[name] || "";
    return {
      name,
      label: labels[name] || name,
      configured: Boolean(value),
      masked: value ? `${value.slice(0, 4)}...${value.slice(-4)}` : "",
    };
  });
}

function displayModelName(provider = "", model = "") {
  const normalizedProvider = String(provider || "").toLowerCase();
  const normalizedModel = String(model || "");
  if (normalizedProvider === "deepseek" && normalizedModel === "deepseek-chat") {
    return "DeepSeek V4-Flash（旧接口名 deepseek-chat）";
  }
  if (normalizedProvider === "deepseek" && normalizedModel === "deepseek-reasoner") {
    return "DeepSeek V4-Flash 思考模式（旧接口名 deepseek-reasoner）";
  }
  return normalizedModel;
}

function firstConfiguredModelRoute(env = process.env) {
  return API_KEY_PROVIDER_ROUTES.find((route) => Boolean(env[route.env])) || null;
}

function isRouteConfigured(route = {}, env = process.env) {
  return Boolean(route?.env && env[route.env]);
}

function modelRouteKey(provider = "", model = "") {
  return `${String(provider || "").toLowerCase()}::${String(model || "").toLowerCase()}`;
}

function redactServerModelError(message = "") {
  return String(message || "")
    .replace(/ak-[A-Za-z0-9_-]+/g, "ak-***")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
    .replace(/org-[A-Za-z0-9_-]+/g, "org-***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
    .replace(/api[_-]?key['":=\s]+[A-Za-z0-9._-]+/gi, "api_key=***")
    .slice(0, 260);
}

let modelHealthLoaded = false;
const modelHealthMap = new Map();

function loadModelHealth() {
  if (modelHealthLoaded) return;
  modelHealthLoaded = true;
  try {
    const parsed = JSON.parse(readFileSync(MODEL_HEALTH_FILE, "utf8"));
    const items = Array.isArray(parsed?.models) ? parsed.models : [];
    for (const item of items) {
      if (item?.provider && item?.model) {
        modelHealthMap.set(modelRouteKey(item.provider, item.model), item);
      }
    }
  } catch {
    // Health starts empty on first launch or if the file is unavailable.
  }
}

async function saveModelHealth() {
  try {
    await mkdir(path.dirname(MODEL_HEALTH_FILE), { recursive: true });
    await writeFile(MODEL_HEALTH_FILE, JSON.stringify({
      updated_at: new Date().toISOString(),
      models: [...modelHealthMap.values()],
    }, null, 2), "utf8");
  } catch {
    // Health is advisory; routing still works if persistence fails.
  }
}

function classifyModelError(error = "") {
  const text = String(error || "").toLowerCase();
  if (/insufficient|balance|quota|billing|payment|余额|欠费|额度/.test(text)) {
    return { status: "unavailable", reason: "余额或额度不足", unavailableMs: 60 * 60 * 1000 };
  }
  if (/unauthori[sz]ed|forbidden|invalid.*key|api key|apikey|permission|401|403|鉴权|权限|密钥/.test(text)) {
    return { status: "unavailable", reason: "鉴权或权限失败", unavailableMs: 60 * 60 * 1000 };
  }
  if (/429|rate.?limit|too many requests|限流|频率/.test(text)) {
    return { status: "unavailable", reason: "限流或并发受限", unavailableMs: 15 * 60 * 1000 };
  }
  if (/timeout|timed out|aborted|econnreset|etimedout|超时/.test(text)) {
    return { status: "degraded", reason: "调用超时或连接中断", unavailableMs: 0 };
  }
  return { status: "degraded", reason: "调用失败", unavailableMs: 0 };
}

function slowLatencyThresholdForTask(taskType = "") {
  const taskTimeout = timeoutMsForTaskType(taskType);
  if (taskTimeout) return Math.max(15_000, Math.round(taskTimeout * 0.75));
  return 45_000;
}

function routeHealth(route = {}) {
  loadModelHealth();
  const key = modelRouteKey(route.provider, route.model);
  const item = modelHealthMap.get(key);
  if (!item) return { status: "unknown", label: "待验证" };
  if (item.status === "unavailable" && item.unavailable_until && Date.parse(item.unavailable_until) <= Date.now()) {
    return { ...item, status: "degraded", label: item.reason || "等待复测" };
  }
  return item;
}

function healthRank(status = "unknown") {
  return {
    healthy: 0,
    unknown: 1,
    slow: 2,
    degraded: 3,
    unavailable: 4,
  }[status] ?? 1;
}

function isRouteUnavailableByHealth(route = {}) {
  const health = routeHealth(route);
  if (health.status !== "unavailable") return false;
  if (!health.unavailable_until) return true;
  return Date.parse(health.unavailable_until) > Date.now();
}

function configuredRoutesByHealth(item = {}, env = process.env, { includeUnavailable = false, includeDegraded = true } = {}) {
  const candidates = [item.recommended, ...(item.fallbacks || [])].filter(Boolean);
  return candidates
    .map((route, index) => ({ route, index, health: routeHealth(route) }))
    .filter((entry) => isRouteConfigured(entry.route, env))
    .filter((entry) => includeUnavailable || !isRouteUnavailableByHealth(entry.route))
    .filter((entry) => includeDegraded || !["degraded", "slow"].includes(entry.health.status))
    .sort((a, b) => healthRank(a.health.status) - healthRank(b.health.status) || a.index - b.index)
    .map((entry) => entry.route);
}

function firstConfiguredTaskRoute(item = {}, env = process.env) {
  if (isRouteConfigured(item.recommended, env) && !isRouteUnavailableByHealth(item.recommended)) {
    return item.recommended;
  }
  return configuredRoutesByHealth(item, env)[0] || null;
}

function configuredTaskFallbackRoutes(item = {}, active = {}, env = process.env) {
  const taskType = String(item.task_type || "");
  const fastCritical = new Set(["title_suggestion", "project_planning", "generate_chapter_card"]);
  const maxFallbacks = taskType === "generate_chapter_card" ? 2 : fastCritical.has(taskType) ? 1 : 3;
  return configuredRoutesByHealth(item, env, { includeDegraded: taskType === "generate_chapter_card" || !fastCritical.has(taskType) })
    .filter((route) => route.provider !== active?.provider || route.model !== active?.model)
    .slice(0, maxFallbacks)
    .map((route) => {
      const timeoutMs = taskType === "generate_chapter_card"
        ? (/pro|3\.6|gpt/i.test(String(route.model || "")) ? 90_000 : 60_000)
        : undefined;
      return {
        provider: route.provider,
        model: route.model,
        ...(route.baseUrl ? { baseUrl: route.baseUrl } : {}),
        ...(timeoutMs ? { timeoutMs } : {}),
      };
    });
}

function providerBaseUrl(provider = "", env = process.env) {
  const keyByProvider = {
    openai: "OPENAI_BASE_URL",
    deepseek: "DEEPSEEK_BASE_URL",
    doubao: "DOUBAO_BASE_URL",
    wenxin: "QIANFAN_BASE_URL",
    qwen: "DASHSCOPE_BASE_URL",
    kimi: "MOONSHOT_BASE_URL",
  };
  const key = keyByProvider[String(provider || "").toLowerCase()];
  return key && env[key] ? env[key] : "";
}

function routeBaseUrlPatch(provider = "", env = process.env) {
  const baseUrl = providerBaseUrl(provider, env);
  return baseUrl ? { base_url: baseUrl, baseUrl } : {};
}

function buildTaskModelPlan(env = process.env) {
  const first = API_KEY_PROVIDER_ROUTES
    .filter((route) => Boolean(env[route.env]))
    .find((route) => !isRouteUnavailableByHealth(route)) || firstConfiguredModelRoute(env);
  return TASK_MODEL_BLUEPRINT.map((item) => {
    const active = firstConfiguredTaskRoute(item, env) || first || item.recommended;
    const configured = firstConfiguredTaskRoute(item, env);
    const configuredAll = configuredRoutesByHealth(item, env, { includeUnavailable: true });
    const skipped = configuredAll.filter((route) => isRouteUnavailableByHealth(route));
    return {
      task_type: item.task_type,
      label: item.label,
      recommended: item.recommended,
      active: active
        ? { provider: active.provider, model: active.model, env: active.env || null }
        : null,
      active_health: active ? routeHealth(active) : null,
      configured: Boolean(configured),
      degraded: Boolean((configured && routeHealth(configured).status !== "healthy") || (!configured && first)),
      skipped_unavailable: skipped.map((route) => ({
        provider: route.provider,
        model: route.model,
        health: routeHealth(route),
      })),
      reason: item.reason,
      fallback_candidates: (item.fallbacks || []).map((route) => ({
        ...route,
        health: routeHealth(route),
      })),
    };
  });
}

function recordModelHealthSync({ provider = "", model = "", task_type = "", status = "", duration_ms = 0, error = "" } = {}) {
  if (!provider || !model || String(provider).startsWith("mock")) return null;
  loadModelHealth();
  const key = modelRouteKey(provider, model);
  const previous = modelHealthMap.get(key) || { provider, model, ok_count: 0, fail_count: 0 };
  const safeError = redactServerModelError(error);
  let nextStatus = status;
  let reason = "";
  let unavailableUntil = "";
  if (status === "ok" || status === "fallback_ok" || status === "success" || status === "slow_first_token") {
    const slowThreshold = slowLatencyThresholdForTask(task_type);
    nextStatus = status === "slow_first_token" || Number(duration_ms || 0) >= slowThreshold ? "slow" : "healthy";
    reason = status === "slow_first_token"
      ? `首字输出偏慢：${Math.round(Number(duration_ms || 0) / 1000)} 秒`
      : nextStatus === "slow"
        ? `响应偏慢：${Math.round(Number(duration_ms || 0) / 1000)} 秒`
        : "连接正常";
  } else {
    const classified = classifyModelError(safeError);
    nextStatus = classified.status;
    reason = classified.reason;
    if (classified.unavailableMs) {
      unavailableUntil = new Date(Date.now() + classified.unavailableMs).toISOString();
    }
  }
  const next = {
    ...previous,
    provider,
    model,
    status: nextStatus,
    reason,
    last_task_type: task_type || previous.last_task_type || "",
    last_latency_ms: Number(duration_ms || 0) || previous.last_latency_ms || 0,
    last_error: nextStatus === "healthy" || nextStatus === "slow" ? "" : safeError,
    checked_at: new Date().toISOString(),
    unavailable_until: unavailableUntil || "",
    ok_count: (previous.ok_count || 0) + (nextStatus === "healthy" || nextStatus === "slow" ? 1 : 0),
    fail_count: (previous.fail_count || 0) + (nextStatus === "degraded" || nextStatus === "unavailable" ? 1 : 0),
  };
  modelHealthMap.set(key, next);
  void saveModelHealth();
  return next;
}

function modelHealthAttemptRecorder(attempt = {}) {
  if (!attempt?.provider || !attempt?.model) return;
  if (attempt.event === "success") {
    const diagnosis = attempt.timeout_diagnosis || {};
    recordModelHealthSync({
      provider: attempt.provider,
      model: attempt.model,
      task_type: attempt.task_type,
      status: diagnosis.category === "slow_first_token" ? "slow_first_token" : "success",
      duration_ms: attempt.duration_ms,
      error: diagnosis.category === "slow_first_token" ? "首字输出偏慢" : "",
    });
  } else if (attempt.event === "fallback" || attempt.event === "failed") {
    recordModelHealthSync({
      provider: attempt.provider,
      model: attempt.model,
      task_type: attempt.task_type,
      status: "error",
      duration_ms: attempt.duration_ms,
      error: attempt.error,
    });
  }
}

function buildTaskRouteMap(env = process.env) {
  return Object.fromEntries(
    buildTaskModelPlan(env)
      .filter((item) => item.active?.provider)
      .map((planned) => {
        const blueprint = TASK_MODEL_BLUEPRINT.find((entry) => entry.task_type === planned.task_type) || {};
        return [
          planned.task_type,
          {
            provider: planned.active.provider,
            model: planned.active.model,
            allow_network: planned.active.provider !== "mock" && !String(planned.active.provider || "").startsWith("mock"),
            ...routeBaseUrlPatch(planned.active.provider, env),
            fallback_enabled: true,
            fallbacks: configuredTaskFallbackRoutes(blueprint, planned.active, env),
          },
        ];
      }),
  );
}

function withModelHealthRecorder(routerOptions = null) {
  if (!routerOptions) return routerOptions;
  const existing = typeof routerOptions.onAttempt === "function" ? routerOptions.onAttempt : null;
  return {
    ...routerOptions,
    onAttempt: async (attempt) => {
      modelHealthAttemptRecorder(attempt);
      if (existing) await existing(attempt);
    },
  };
}

function routerOptionsForTaskType(taskType, env = process.env) {
  const item = TASK_MODEL_BLUEPRINT.find((entry) => entry.task_type === taskType);
  const timeoutMs = timeoutMsForTaskType(taskType);
  const maxRetries = maxRetriesForTaskType(taskType);
  const route = item ? firstConfiguredTaskRoute(item, env) : null;
  if (route) {
    return withModelHealthRecorder({
      provider: route.provider,
      model: route.model,
      allowNetwork: true,
      ...routeBaseUrlPatch(route.provider, env),
      timeoutMs,
      maxRetries,
      retryDelayMs: 500,
      fallbackEnabled: true,
      fallbacks: configuredTaskFallbackRoutes(item, route, env),
    });
  }
  const first = firstConfiguredModelRoute(env);
  return first ? withModelHealthRecorder({
    provider: first.provider,
    model: first.model,
    allowNetwork: true,
    ...routeBaseUrlPatch(first.provider, env),
    timeoutMs,
    maxRetries,
    retryDelayMs: 500,
  }) : null;
}

function timeoutMsForTaskType(taskType = "") {
  const caps = {
    title_suggestion: 30_000,
    project_planning: 45_000,
    generate_chapter_card: 60_000,
    write_chapter: 90_000,
    review_chapter: 120_000,
    rewrite_chapter: 90_000,
    extract_state_candidates: 45_000,
    global_review: 180_000,
    reference_analysis: 180_000,
    domain_knowledge: 120_000,
    screenplay_adaptation: 120_000,
    storyboard: 120_000,
    video_prompt: 90_000,
  };
  return caps[taskType];
}

function maxRetriesForTaskType(taskType = "") {
  if ([
    "title_suggestion",
    "project_planning",
    "generate_chapter_card",
    "write_chapter",
    "review_chapter",
    "rewrite_chapter",
    "extract_state_candidates",
    "global_review",
  ].includes(taskType)) {
    return 0;
  }
  return 1;
}

function publishGateSummary(gate = null) {
  if (typeof gate === "boolean") {
    return {
      status: gate ? "publish_ready" : "needs_rewrite",
      publish_ready: gate,
      label: gate ? "可发布" : "需自动优化",
      blockers: [],
      values: {},
      thresholds: {},
    };
  }
  if (!gate) {
    return {
      status: "pending",
      publish_ready: false,
      label: "待审",
      blockers: [],
      values: {},
      thresholds: {},
    };
  }
  return {
    status: gate.publish_ready ? "publish_ready" : (gate.status || "needs_rewrite"),
    publish_ready: Boolean(gate.publish_ready),
    label: gate.publish_ready ? "可发布" : (gate.label || "需自动优化"),
    blockers: Array.isArray(gate.blockers) ? gate.blockers : [],
    values: gate.values || {},
    thresholds: gate.thresholds || {},
  };
}

function publishGateFromReview(review = null, fallbackGate = null) {
  const summary = publishGateSummary(review?.publish_gate ?? fallbackGate);
  if (summary.publish_ready || summary.blockers.length || !review) return summary;
  const issues = Array.isArray(review.issues) ? review.issues.map((item) => String(item || "").trim()).filter(Boolean) : [];
  return {
    ...summary,
    blockers: issues,
  };
}

function assertRealWritingReady({ allowMock = false } = {}) {
  if (allowMock) {
    return { provider: "mock", model: "mock", allowNetwork: false };
  }
  const route = firstConfiguredModelRoute();
  if (!route) {
    throw new HttpError(409, "请先在系统配置里填写至少一个真实模型 API Key，再开始写作。");
  }
  return withModelHealthRecorder({ taskRoutes: buildTaskRouteMap(), allowNetwork: true });
}

function realWritingRouterOptionsForRequest(body = {}) {
  const explicitProvider = body.provider || body.model;
  if (explicitProvider) {
    return withModelHealthRecorder({
      provider: body.provider,
      model: body.model,
      allowNetwork: Boolean(body.allow_network),
    });
  }
  return assertRealWritingReady();
}

const MOCK_MANUSCRIPT_MESSAGE = "这一章是演示/mock 生成内容，不会作为正式正文展示。请配置真实模型 API Key 后重新写作。";

function detectMockManuscript(text = "") {
  return [
    /(^|\n)CHAPTER-MOCK-\d+(\n|$)/,
    /(^|\n)CHAPTER-CONTEXT-\d+(\n|$)/,
    /(^|\n)Visible result:\s*/i,
  ].some((pattern) => pattern.test(String(text || "")));
}

async function readChapterManuscript(project, chapterNo, version = "v1") {
  const exportPath = await firstExistingPath(legacyChapterFileCandidates(exportFile(project, chapterNo), chapterNo), exportFile(project, chapterNo));
  const draftPath = await firstExistingPath(legacyChapterFileCandidates(draftFile(project, chapterNo, version), chapterNo), draftFile(project, chapterNo, version));
  let source = "";
  let pathUsed = "";
  let text = "";
  const hasExport = await fileExists(exportPath);
  const hasDraft = await fileExists(draftPath);

  if (hasExport) {
    source = "export";
    pathUsed = exportPath;
    text = await readFile(exportPath, "utf8");
  } else if (hasDraft) {
    source = "draft";
    pathUsed = draftPath;
    text = await readFile(draftPath, "utf8");
  }

  const cleanText = text.trim();
  const firstLine = cleanText.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  const isMock = detectMockManuscript(cleanText);
  return {
    source,
    path: pathUsed,
    text,
    cleanText,
    firstLine,
    isMock,
    exportPath,
    draftPath,
    hasExport,
    hasDraft,
  };
}

async function assertCompletedChapterRange(project, { from = 1, to = 1, requirePublishReady = true } = {}) {
  const missing = [];
  const mock = [];
  const blocked = [];
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    const quality = await readChapterJsonIfExists(qualityReportFile(project, chapterNo), chapterNo);
    const version = quality?.final_version || "v1";
    const manuscript = await readChapterManuscript(project, chapterNo, version);
    if (!manuscript.cleanText) {
      missing.push(chapterNo);
      continue;
    }
    if (manuscript.isMock) {
      mock.push(chapterNo);
    }
    if (requirePublishReady && quality?.publish_gate?.publish_ready !== true) {
      blocked.push({
        chapterNo,
        blockers: Array.isArray(quality?.publish_gate?.blockers) ? quality.publish_gate.blockers : ["publish_gate_not_ready"],
      });
    }
  }
  if (missing.length) {
    throw new HttpError(409, `还没有生成可用正文：缺少第 ${missing.join(", ")} 章。请先到创作中心写作。`);
  }
  if (mock.length) {
    throw new HttpError(409, `第 ${mock.join(", ")} 章是演示/mock 内容，请配置真实模型 API Key 后重新写作，不能导出、生成视频或发布。`);
  }
  if (blocked.length) {
    const first = blocked[0];
    throw new HttpError(409, `第 ${first.chapterNo} 章还没有达到可发布水准：${first.blockers.join(", ")}。请先自动重写到发布门禁通过。`);
  }
}

async function buildChapterPreview(project, chapterNo) {
  const quality = await readChapterJsonIfExists(qualityReportFile(project, chapterNo), chapterNo);
  const version = quality?.final_version || "v1";
  const manuscript = await readChapterManuscript(project, chapterNo, version);
  if (manuscript.cleanText && manuscript.isMock) {
    return {
      status: "mock",
      is_mock: true,
      chapter_no: chapterNo,
      source: manuscript.source,
      title: manuscript.firstLine || `第 ${chapterNo} 章（演示）`,
      text_preview: "",
      word_count: 0,
      export_path: manuscript.hasExport ? manuscript.exportPath : "",
      draft_path: manuscript.hasDraft ? manuscript.draftPath : "",
      message: MOCK_MANUSCRIPT_MESSAGE,
    };
  }
  return {
    status: manuscript.cleanText ? "ready" : "empty",
    is_mock: false,
    chapter_no: chapterNo,
    source: manuscript.source,
    title: manuscript.cleanText ? `${project.title} · 第 ${chapterNo} 章` : "尚未生成正文",
    text_preview: manuscript.cleanText ? manuscript.cleanText.slice(0, 900) : "",
    word_count: manuscript.cleanText.replace(/\s/g, "").length,
    export_path: manuscript.hasExport ? manuscript.exportPath : "",
    draft_path: manuscript.hasDraft ? manuscript.draftPath : "",
    message: manuscript.cleanText ? "已读取真实章节正文" : "当前章节还没有真实正文。请先点击“继续写下一章”。",
  };
}

async function buildChapterContent(project, chapterNo) {
  const { quality, review, activeReview, publishGate, version, latestReviewWins } = await selectChapterArtifacts(project, chapterNo);
  const manuscript = await readChapterManuscript(project, chapterNo, version);
  const finalGrade = activeReview?.grade || quality?.final_grade || null;
  const stopped = !latestReviewWins && (quality?.status === "stopped" || Boolean(quality?.stop));
  const contentStatus = manuscript.cleanText
    ? stopped && !publishGate.publish_ready
      ? "review_failed"
      : "ready"
    : "empty";

  if (manuscript.cleanText && manuscript.isMock) {
    return {
      status: "mock",
      is_mock: true,
      chapter_no: chapterNo,
      title: manuscript.firstLine || `第 ${chapterNo} 章（演示）`,
      text: "",
      word_count: 0,
      source: manuscript.source,
      path: manuscript.path,
      export_path: manuscript.hasExport ? manuscript.exportPath : "",
      draft_path: manuscript.hasDraft ? manuscript.draftPath : "",
      grade: null,
      publish_gate: publishGate,
      publish_ready: false,
      publish_status: publishGate.label,
      review_created_at: review?.created_at || null,
      quality_score: null,
      message: MOCK_MANUSCRIPT_MESSAGE,
    };
  }

  const cleanText = manuscript.cleanText;
  return {
    status: contentStatus,
    is_mock: false,
    chapter_no: chapterNo,
    title: cleanText ? manuscript.firstLine || `第 ${chapterNo} 章` : `第 ${chapterNo} 章`,
    text: cleanText,
    word_count: cleanText.replace(/\s/g, "").length,
    source: manuscript.source,
    path: manuscript.path,
    export_path: manuscript.hasExport ? manuscript.exportPath : "",
    draft_path: manuscript.hasDraft ? manuscript.draftPath : "",
    grade: finalGrade,
    publish_gate: publishGate,
    publish_ready: publishGate.publish_ready,
    publish_status: cleanText
      ? stopped && !publishGate.publish_ready
        ? "未过门禁"
        : publishGate.label
      : "待写",
    review_created_at: review?.created_at || null,
    quality_score: quality?.overall_score ?? quality?.score ?? null,
    stop: stopped ? quality?.stop || null : null,
    message: cleanText
      ? stopped && !publishGate.publish_ready
        ? "这一章有正文，但自动质检未通过发布门禁。请查看正文红标原因或点击自动修到发布。"
        : "已读取完整章节正文"
      : "这一章还没有生成正文。",
  };
}

function normalizeScoreBars(review = {}, quality = {}) {
  const scores = review?.scores || {};
  const metrics = quality?.quality_metrics || {};
  const retention = metrics.retention_prediction?.score;
  const dropRisk = metrics.drop_risk_segments
    ? Math.max(0, 100 - Number(metrics.drop_risk_segments.risk_density || 0) * 100)
    : null;
  const microHook = metrics.micro_hook_density
    ? Math.min(100, Math.round(Number(metrics.micro_hook_density.density || 0) / 1.2 * 100))
    : null;
  const coolpoint = metrics.coolpoint_delivered
    ? Math.min(100, Number(metrics.coolpoint_delivered.effective_count || 0) * 50)
    : null;
  return [
    { key: "opening_hook", label: "开篇钩子", value: scores.opening_hook },
    { key: "cool_point", label: "爽点兑现", value: scores.cool_point ?? coolpoint },
    { key: "pacing", label: "节奏", value: scores.pacing },
    { key: "tail_hook", label: "章尾钩子", value: scores.tail_hook ?? metrics.tail_hook_score?.score },
    { key: "micro_hook_density", label: "微钩子密度", value: microHook },
    { key: "drop_risk_inverse", label: "弃读安全", value: dropRisk },
    { key: "retention_prediction", label: "追读预测", value: retention },
  ].filter((item) => Number.isFinite(Number(item.value))).map((item) => ({
    ...item,
    value: Math.max(0, Math.min(100, Math.round(Number(item.value)))),
  }));
}

async function buildChapterReview(project, chapterNo) {
  const { quality, review, activeReview: actualReview, publishGate } = await selectChapterArtifacts(project, chapterNo);
  const metrics = quality?.quality_metrics || {};
  const dropRiskSegments = metrics.drop_risk_segments?.segments || [];
  const riskySegments = Array.isArray(dropRiskSegments)
    ? dropRiskSegments.filter((segment) => segment.high_risk || Number(segment.risk_points || 0) > 0)
    : [];
  return {
    status: actualReview || quality ? "ready" : "empty",
    chapter_no: chapterNo,
    grade: actualReview?.grade || quality?.final_grade || null,
    scores: normalizeScoreBars(actualReview, quality),
    issues: Array.isArray(actualReview?.issues) ? actualReview.issues : [],
    keep: Array.isArray(actualReview?.keep) ? actualReview.keep : [],
    remove: Array.isArray(actualReview?.remove) ? actualReview.remove : [],
    rewrite_direction: actualReview?.rewrite_direction || "",
    next_action: actualReview?.next_action || "",
    publish_gate: publishGate,
    publish_ready: publishGate.publish_ready,
    publish_status: publishGate.label,
    quality_metrics: metrics,
    risky_segments: riskySegments.map((segment) => ({
      index: segment.index,
      reasons: segment.reasons || [],
      preview: segment.preview || "",
      risk_points: segment.risk_points || 0,
    })),
    report_path: quality?.path || await firstExistingPath(legacyChapterFileCandidates(qualityReportFile(project, chapterNo), chapterNo)),
    review_path: review?.path || await firstExistingPath(legacyChapterFileCandidates(reviewFile(project, chapterNo), chapterNo)),
    message: actualReview || quality ? "已读取审稿结果" : "这一章还没有审稿结果。",
  };
}

async function buildChapterList(project) {
  const progress = await inferProjectProgress(project);
  const report = await readJsonIfExists(runReportFile(project));
  const reportChapters = Array.isArray(report?.completed_chapters)
    ? report.completed_chapters.map((item) => positiveIntegerOrNull(item)).filter(Boolean)
    : [];
  const completedNumbers = Array.isArray(progress.completed_chapter_numbers)
    ? progress.completed_chapter_numbers.map((item) => positiveIntegerOrNull(item)).filter(Boolean)
    : [];
  const limit = Math.max(
    1,
    progress.current_chapter || 1,
    progress.latest_completed_chapter || 0,
    ...reportChapters,
    ...completedNumbers,
  );
  const chapters = [];

  for (let chapterNo = 1; chapterNo <= limit; chapterNo += 1) {
    const content = await buildChapterContent(project, chapterNo);
    const hasReview = Boolean(await firstExistingPath(legacyChapterFileCandidates(reviewFile(project, chapterNo), chapterNo)));
    const hasQuality = Boolean(await firstExistingPath(legacyChapterFileCandidates(qualityReportFile(project, chapterNo), chapterNo)));
    const hasCard = Boolean(await firstExistingPath(legacyChapterFileCandidates(chapterCardFile(project, chapterNo), chapterNo)));
    const hasTaskPackage = Boolean(await firstExistingPath(legacyChapterFileCandidates(taskPackageFile(project, chapterNo), chapterNo)));
    const hasState = Boolean(await firstExistingPath(legacyChapterFileCandidates(stateCandidatesFile(project, chapterNo), chapterNo)));
    const shouldShow = content.status === "ready"
      || hasReview
      || hasQuality
      || hasCard
      || hasTaskPackage
      || hasState
      || chapterNo === progress.current_chapter;
    if (shouldShow) {
      const pendingStatus = content.is_next
        ? "待写"
        : hasQuality
          ? "未过门禁"
          : hasReview
            ? "需重写"
            : hasCard
              ? "有章卡待写"
              : hasTaskPackage || hasState
                ? "断档待补"
                : "待审";
      chapters.push({
        chapter_no: chapterNo,
        title: content.title || `第 ${chapterNo} 章`,
        status: content.status === "ready" || content.status === "review_failed"
          ? content.status
          : hasTaskPackage || hasState
            ? "partial"
            : content.status,
        is_mock: Boolean(content.is_mock),
        source: content.source,
        word_count: content.word_count,
        grade: content.status === "ready" || content.status === "review_failed" ? content.grade : null,
        publish_gate: content.publish_gate || null,
        publish_ready: Boolean(content.publish_ready),
        publish_status: content.status === "ready" || content.status === "review_failed" ? content.publish_status : pendingStatus,
        has_review: hasReview,
        has_quality_report: hasQuality,
        is_next: chapterNo === progress.current_chapter && content.status !== "ready",
        path: content.path,
      });
    }
  }

  return {
    project_title: project.title,
    project_path: project.path,
    current_chapter: progress.current_chapter,
    latest_completed_chapter: progress.latest_completed_chapter,
    completed_chapters: progress.completed_chapters,
    chapters,
  };
}

function safeReadTextIfExists(file, fallback = "") {
  return readFile(file, "utf8").catch((error) => {
    if (error.code === "ENOENT") return fallback;
    throw error;
  });
}

async function buildVideoWorkspace(project, { chapterNo = 1, tool = "jimeng" } = {}) {
  const screenplayJsonPath = videoChapterScreenplayFile(project, chapterNo, "json");
  const screenplayFountainPath = videoChapterScreenplayFile(project, chapterNo, "fountain");
  const storyboardPath = videoChapterStoryboardFile(project, chapterNo);
  const promptPath = videoChapterPromptFile(project, chapterNo, tool);
  const manifest = await readJsonIfExists(videoManifestFile(project));
  const characterRefs = await readJsonIfExists(path.join(project.path, "视频素材包", "01_character_refs.json"));
  const sceneRefs = await readJsonIfExists(path.join(project.path, "视频素材包", "02_scene_refs.json"));
  const screenplay = await readJsonIfExists(screenplayJsonPath);
  const storyboard = await readJsonIfExists(storyboardPath);
  const prompts = await safeReadTextIfExists(promptPath);
  const fountain = await safeReadTextIfExists(screenplayFountainPath);
  return {
    status: manifest || screenplay || storyboard || prompts ? "ready" : "empty",
    project_title: project.title,
    chapter_no: chapterNo,
    tool,
    manifest,
    character_refs: characterRefs,
    scene_refs: sceneRefs,
    screenplay,
    storyboard,
    prompts,
    fountain,
    paths: {
      manifest: manifest?.path || videoManifestFile(project),
      character_refs: characterRefs?.path || path.join(project.path, "视频素材包", "01_character_refs.json"),
      scene_refs: sceneRefs?.path || path.join(project.path, "视频素材包", "02_scene_refs.json"),
      screenplay_json: screenplay?.path || screenplayJsonPath,
      screenplay_fountain: screenplayFountainPath,
      storyboard: storyboard?.path || storyboardPath,
      prompts: promptPath,
    },
    message: manifest || screenplay || storyboard || prompts
      ? "已读取视频剧本、分镜和提示词。"
      : "这一章还没有视频素材。请先点击“剧本”或“分镜”。",
  };
}

async function saveVideoWorkspace(project, { chapterNo = 1, tool = "jimeng", kind = "", content = "" } = {}) {
  const text = String(content || "");
  if (!text.trim()) throw new HttpError(400, "保存内容不能为空。");
  if (kind === "prompts") {
    const target = videoChapterPromptFile(project, chapterNo, tool);
    await writeText(target, text.trimEnd() + "\n");
    return { status: "saved", kind, path: target };
  }
  if (kind === "fountain") {
    const target = videoChapterScreenplayFile(project, chapterNo, "fountain");
    await writeText(target, text.trimEnd() + "\n");
    return { status: "saved", kind, path: target };
  }
  if (kind === "storyboard") {
    const parsed = JSON.parse(text);
    const target = videoChapterStoryboardFile(project, chapterNo);
    await writeJson(target, parsed);
    return { status: "saved", kind, path: target };
  }
  throw new HttpError(400, "不支持的视频素材类型。");
}

function screenplayFromIdea({ title = "新短剧", idea = "", episodes = 12 } = {}) {
  const cleanTitle = sanitizeBookTitle(title) || "新短剧";
  const cleanIdea = String(idea || "一个主角在压力中抓住机会完成逆袭的短剧故事。").trim();
  const count = Math.max(1, Math.min(200, Number(episodes || 12)));
  return [
    `# ${cleanTitle}`,
    "",
    `一句话故事：${cleanIdea}`,
    "",
    "## 第一集",
    "",
    "INT. 主场景 - DAY",
    "",
    `主角站在混乱现场，意识到机会藏在危机里。`,
    "",
    "主角",
    "这件事如果按老办法做，一定会输。",
    "",
    "对手冷笑，周围人都在等他出丑。",
    "",
    "主角拿起账册或线索，开始用新的方法重新拆解局面。",
    "",
    "CUT TO BLACK: 第一个反转即将出现。",
    "",
    "## 分集规划",
    "",
    ...Array.from({ length: count }, (_, index) => `- 第 ${index + 1} 集：围绕“${cleanIdea}”推进一个冲突、一个反转、一个钩子。`),
  ].join("\n");
}

async function createComicProject({ root, title, idea, episodes = 12, genre = "漫剧/短剧" } = {}) {
  const project = await createProject({
    root,
    title: sanitizeBookTitle(title) || "新短剧",
    idea: String(idea || "新建短剧项目").trim(),
    platform: "comic",
    genre,
  });
  project.channel = "comic";
  project.target_episodes = Math.max(1, Math.min(200, Number(episodes || 12)));
  project.status = "comic_planning";
  project.updated_at = new Date().toISOString();
  await writeJson(path.join(project.path, "project.json"), project);

  const fountain = screenplayFromIdea({ title: project.title, idea: project.idea, episodes: project.target_episodes });
  await writeText(videoChapterScreenplayFile(project, 1, "fountain"), fountain.trimEnd() + "\n");
  await writeJson(videoChapterScreenplayFile(project, 1, "json"), {
    project_title: project.title,
    chapter_no: 1,
    screenplay: {
      title: project.title,
      chapter_no: 1,
      saved_source_text: false,
      scenes: [
        {
          heading: "INT. 主场景 - DAY",
          location: "主场景",
          segments: [
            { type: "action", text: "主角站在混乱现场，意识到机会藏在危机里。", is_chapter_end: false },
            { type: "dialogue", character: "主角", line: "这件事如果按老办法做，一定会输。", text: "主角：这件事如果按老办法做，一定会输。", is_chapter_end: false },
            { type: "action", text: "对手冷笑，周围人都在等他出丑。", is_chapter_end: false },
            { type: "action", text: "主角拿起账册或线索，开始用新的方法重新拆解局面。", is_chapter_end: true },
          ],
        },
      ],
      fountain,
    },
    created_at: new Date().toISOString(),
    path: videoChapterScreenplayFile(project, 1, "json"),
  });
  await writeJson(videoManifestFile(project), {
    project_title: project.title,
    status: "draft",
    type: "comic_project",
    target_episodes: project.target_episodes,
    created_at: new Date().toISOString(),
    path: videoManifestFile(project),
  });
  return {
    status: "created",
    project_title: project.title,
    project_path: project.path,
    target_episodes: project.target_episodes,
  };
}

async function assertVideoSourceReady(project, { from = 1, to = from } = {}) {
  if (project.platform === "comic" || project.channel === "comic") return;
  let allHaveScreenplay = true;
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    if (!await fileExists(videoChapterScreenplayFile(project, chapterNo, "json"))) {
      allHaveScreenplay = false;
      break;
    }
  }
  if (allHaveScreenplay) return;
  await assertCompletedChapterRange(project, { from, to });
}

const VIDEO_ASSET_CATEGORIES = new Set(["role", "scene", "audio", "subtitle", "other"]);

function videoImportedAssetsDir(project) {
  return path.join(project.path, "视频素材包", "00_imported_assets");
}

function videoImportedAssetsManifestFile(project) {
  return path.join(videoImportedAssetsDir(project), "manifest.json");
}

function sanitizeAssetName(value = "asset") {
  const parsed = path.parse(String(value || "asset"));
  const name = (parsed.name || "asset")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}._-]+/gu, "")
    .slice(0, 60) || "asset";
  const ext = (parsed.ext || "").replace(/[\\/:*?"<>|]/g, "").slice(0, 16);
  return `${name}${ext}`;
}

function normalizeVideoAssetCategory(value = "other") {
  const category = String(value || "other");
  return VIDEO_ASSET_CATEGORIES.has(category) ? category : "other";
}

async function listVideoAssets(project) {
  const manifestPath = videoImportedAssetsManifestFile(project);
  const manifest = await readJsonIfExists(manifestPath, { assets: [] });
  const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
  return {
    status: assets.length ? "ready" : "empty",
    project_title: project.title,
    project_path: project.path,
    assets,
    paths: {
      dir: videoImportedAssetsDir(project),
      manifest: manifestPath,
    },
  };
}

async function saveVideoAsset(project, body = {}) {
  const name = sanitizeAssetName(body.name || "asset");
  const category = normalizeVideoAssetCategory(body.category);
  const mime = String(body.type || body.mime || "application/octet-stream").slice(0, 120);
  const encoded = String(body.content_base64 || body.contentBase64 || "");
  if (!encoded) throw new HttpError(400, "请选择要导入的素材文件。");
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) throw new HttpError(400, "素材文件为空。");
  if (buffer.length > 8 * 1024 * 1024) throw new HttpError(413, "单个素材不能超过 8MB。");

  const dir = videoImportedAssetsDir(project);
  await mkdir(dir, { recursive: true });
  const storedName = `${timestampSuffix()}_${name}`;
  const target = path.join(dir, storedName);
  await writeFile(target, buffer);

  const current = await listVideoAssets(project);
  const asset = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    stored_name: storedName,
    category,
    type: mime,
    size: buffer.length,
    path: target,
    added_at: new Date().toISOString(),
  };
  const assets = [asset, ...current.assets].slice(0, 200);
  await writeJson(videoImportedAssetsManifestFile(project), {
    project_title: project.title,
    project_path: project.path,
    updated_at: new Date().toISOString(),
    assets,
  });
  return {
    status: "saved",
    asset,
    assets,
    paths: {
      dir,
      manifest: videoImportedAssetsManifestFile(project),
    },
  };
}

async function buildPublishWorkspace(project, { platform = project.platform || "fanqie", from = 1, to = 30 } = {}) {
  const manifestPath = publishManifestFile(project, platform);
  const metadataPath = publishMetadataFile(project, platform);
  const chaptersPath = publishChaptersFile(project, platform, from, to);
  const submissionPath = publishSubmissionFile(project, platform);
  const manifest = await readJsonIfExists(manifestPath);
  const metadata = await readJsonIfExists(metadataPath);
  const submission = await readJsonIfExists(submissionPath);
  const chapters = await safeReadTextIfExists(chaptersPath);
  return {
    status: manifest || metadata || submission || chapters ? "ready" : "empty",
    platform,
    range: { from, to },
    manifest,
    metadata,
    submission,
    chapters,
    paths: {
      manifest: manifest?.path || manifestPath,
      metadata: metadataPath,
      chapters: chaptersPath,
      submission: submissionPath,
    },
    message: manifest || metadata || submission || chapters
      ? "已读取投稿包草稿。"
      : "还没有投稿包。请先点击“生成投稿包”。",
  };
}

async function savePublishWorkspace(project, { platform = project.platform || "fanqie", from = 1, to = 30, kind = "", content = "" } = {}) {
  const text = String(content || "");
  if (!text.trim()) throw new HttpError(400, "保存内容不能为空。");
  if (kind === "chapters") {
    const target = publishChaptersFile(project, platform, from, to);
    await writeText(target, text.trimEnd() + "\n");
    return { status: "saved", kind, path: target };
  }
  if (kind === "metadata") {
    const parsed = JSON.parse(text);
    const target = publishMetadataFile(project, platform);
    await writeJson(target, parsed);
    return { status: "saved", kind, path: target };
  }
  if (kind === "submission") {
    const parsed = JSON.parse(text);
    const target = publishSubmissionFile(project, platform);
    await writeJson(target, parsed);
    return { status: "saved", kind, path: target };
  }
  throw new HttpError(400, "不支持的投稿包类型。");
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileMtimeMs(filePath) {
  try {
    return (await stat(filePath)).mtimeMs;
  } catch {
    return 0;
  }
}

function legacyPadChapter(chapterNo) {
  const text = String(chapterNo);
  return text.padStart(Math.max(3, text.length), "0");
}

function legacyChapterFileCandidates(filePath, chapterNo) {
  const canonical = String(filePath || "");
  const legacy = legacyPadChapter(chapterNo);
  const candidates = [canonical];
  if (legacy) {
    const replaced = canonical
      .replace(new RegExp(`第0${legacy}章`, "g"), `第${legacy}章`)
      .replace(new RegExp(`chapter_0${legacy}`, "g"), `chapter_${legacy}`);
    if (replaced !== canonical) candidates.push(replaced);
  }
  return candidates;
}

async function firstExistingPath(paths = [], fallback = "") {
  for (const filePath of paths) {
    if (await fileExists(filePath)) return filePath;
  }
  return fallback;
}

async function latestVersionedDraftPath(project, chapterNo) {
  const draftsDir = path.join(project.path, "正文");
  let entries = [];
  try {
    entries = await readdir(draftsDir);
  } catch {
    return "";
  }
  const matches = [];
  for (const name of entries) {
    const match = /^第0*(\d+)章_v(\d+)\.txt$/i.exec(name);
    if (!match) continue;
    if (Number(match[1]) !== Number(chapterNo)) continue;
    const filePath = path.join(draftsDir, name);
    matches.push({
      version: Number(match[2]),
      path: filePath,
      mtimeMs: await fileMtimeMs(filePath),
    });
  }
  matches.sort((left, right) => right.version - left.version || right.mtimeMs - left.mtimeMs);
  return matches[0]?.path || "";
}

function versionFromDraftPath(filePath = "") {
  const match = /_v(\d+)\.txt$/i.exec(String(filePath || ""));
  return match ? `v${match[1]}` : "";
}

async function selectChapterArtifacts(project, chapterNo) {
  const quality = await readChapterJsonIfExists(qualityReportFile(project, chapterNo), chapterNo);
  const review = await readChapterJsonIfExists(reviewFile(project, chapterNo), chapterNo);
  const latestDraftPath = await latestVersionedDraftPath(project, chapterNo);
  const qualityMtime = quality?.path ? await fileMtimeMs(quality.path) : 0;
  const reviewMtime = review?.path ? await fileMtimeMs(review.path) : 0;
  const latestDraftMtime = latestDraftPath ? await fileMtimeMs(latestDraftPath) : 0;
  const latestReviewWins = Boolean(review && (reviewMtime >= qualityMtime || latestDraftMtime > qualityMtime));
  const activeReview = latestReviewWins ? review : quality?.review || review || null;
  const activeGate = latestReviewWins
    ? publishGateFromReview(activeReview, review?.publish_gate)
    : publishGateSummary(quality?.publish_gate || activeReview?.publish_gate || null);
  const version = latestReviewWins && latestDraftPath
    ? versionFromDraftPath(latestDraftPath)
    : quality?.final_version || versionFromDraftPath(latestDraftPath) || "v1";
  return {
    quality,
    review,
    activeReview,
    publishGate: activeGate,
    version,
    latestReviewWins,
    latestDraftPath,
  };
}

function sanitizeBookTitle(value = "") {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "")
    .replace(/[。！？,.，、；;：:]/g, "")
    .trim()
    .slice(0, 26);
}

function uniqueTitles(titles = []) {
  const seen = new Set();
  return titles
    .map((title) => sanitizeBookTitle(title))
    .filter((title) => title.length >= 2)
    .filter((title) => {
      if (seen.has(title)) return false;
      seen.add(title);
      return true;
    })
    .slice(0, 3);
}

  function extractKeywordsForTitle(idea = "", genre = "") {
    const text = `${idea} ${genre}`;
    const candidates = [
      "北宋", "南宋", "大宋", "临安", "茶引", "茶商", "茶铺", "账册", "契约", "盐商",
      "宋朝", "明朝", "唐朝", "三国", "梦幻西游", "外卖", "校园", "创业", "生意",
      "供应链", "商战", "官场", "种田", "长生", "反派", "高武", "游戏", "茶叶",
      "团购", "短视频", "AI", "软件", "程序员", "算法", "系统", "重生", "穿越",
      "玄幻", "历史", "末世", "赘婿", "神豪", "日常", "娱乐", "都市", "修仙",
    ].filter((item) => text.includes(item));
    return candidates.length ? candidates.slice(0, 4) : ["逆袭"];
  }

  function fallbackTitleSuggestions({ idea = "", platform = "fanqie", genre = "" } = {}) {
    const ideaText = String(idea || "").trim();
    const keywords = extractKeywordsForTitle(ideaText, genre);
    const genreWords = new Set(String(genre || "").split(/[\/,，\s]+/).filter(Boolean));
    const first = keywords.find((item) => ideaText.includes(item) && !["穿越", "重生", "历史", "都市"].includes(item))
      || keywords.find((item) => !genreWords.has(item) && !["穿越", "重生", "历史", "都市"].includes(item))
      || keywords.find((item) => !["穿越", "重生", "历史"].includes(item))
      || keywords[0]
      || "逆袭";
    const second = keywords.find((item) => item !== first && ideaText.includes(item) && !["穿越", "重生", "历史", "都市"].includes(item))
      || keywords.find((item) => item !== first && !genreWords.has(item) && !["穿越", "重生", "历史", "都市"].includes(item))
      || (String(genre || "").split(/[\/,，\s]+/).find((item) => item && item !== first && item !== "历史" && item !== "都市") || "人生");
    const text = `${ideaText} ${genre}`;
    const hasYear = text.match(/(19|20)\d{2}/)?.[0] || "";
    const hasBusiness = /外卖|创业|商业|生意|赚钱|首富|公司|商战|茶叶|茶商|茶铺|茶引|账册|契约|供应链|商号/.test(text);
    const hasTech = /AI|软件|程序|代码|算法|黑客|人工智能/.test(text);
    const hasHistory = /北宋|南宋|宋朝|大宋|临安|茶引|明朝|唐朝|三国|历史|穿越/.test(text);
  const hasGame = /游戏|梦幻西游|长安城|副本|玩家/.test(text);
  const hasSystem = /系统|面板|签到|词条/.test(text);

  if (platform === "qidian") {
      if (hasHistory && hasBusiness) return uniqueTitles([`重生${first}：从${second}开始改写商路`, `${first}商路：一纸契约定江南`, `回到${first}，我用账册改命`]);
      if (hasHistory) return uniqueTitles([`穿越${first}：从${second}开始改写天下`, `${first}风云：我的时代从一局生意开始`, `回到${first}，我重开山河`]);
    if (hasGame) return uniqueTitles([`${first}：长安城里的商业棋局`, `我在${first}里重启人生`, `${first}世界的幕后玩家`]);
    if (hasBusiness) return uniqueTitles([`${hasYear ? `重启${hasYear}` : "重生"}：商业版图从一单开始`, `都市之从${first}到首富`, `我的商业时代重新开始`]);
    if (hasTech) return uniqueTitles([`${hasYear ? `重启${hasYear}` : "重生"}：我的技术商业时代`, `从代码开始重写人生`, `被裁后我用算法翻盘`]);
    return uniqueTitles([`${first}之后，我重写人生剧本`, `从低谷开始的${second}时代`, `我的时代重新开始`]);
  }

    if (hasHistory && hasBusiness) return uniqueTitles([`重生${first}：开局用${second}救茶铺`, `人在${first}，我靠账册改命`, `回到${first}，一纸契约定江南`]);
    if (hasHistory) return uniqueTitles([`穿越${first}：开局从${second}赚钱`, `人在${first}，我靠生意改命`, `回到${first}，从小买卖到权倾天下`]);
  if (hasGame) return uniqueTitles([`${first}：开局长安城摆摊`, `梦回长安，我在${first}赚疯了`, `我靠${first}副本逆袭成神`]);
  if (hasBusiness) return uniqueTitles([`${hasYear ? `重生${hasYear}` : "重生"}：从${first}到商业帝国`, `开局一单${first}，我成了首富`, `回到过去，我靠${first}逆袭`]);
  if (hasTech) return uniqueTitles([`${hasYear ? `重生${hasYear}` : "重生"}：从技术翻盘到商业帝国`, `被裁后，我靠代码逆袭`, `开局一套软件，我杀回巅峰`]);
  if (hasSystem) return uniqueTitles([`开局觉醒${first}系统，我杀疯了`, `${first}系统：我把人生刷成神作`, `绑定${first}后，我一路逆袭`]);
  return uniqueTitles([`${first}重启，我不再低头`, `开局${first}，我逆转人生`, `重来一次，我把${second}写成传奇`]);
}

function parseTitleSuggestionText(text = "") {
  const lines = String(text || "")
    .split(/\r?\n|[；;]/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)、]|[①②③一二三]\s*[、.])\s*/, "").trim())
    .filter(Boolean);
  const json = parseJsonMaybe(String(text || "").trim());
  if (Array.isArray(json)) return uniqueTitles(json);
  if (Array.isArray(json?.titles)) return uniqueTitles(json.titles);
  return uniqueTitles(lines);
}

const ideaRuleProfiles = [
  {
    match: /历史|宋朝|大宋|明朝|唐朝|三国|种田/,
    label: "历史经营",
    roles: ["北宋小吏", "明朝寒门账房", "唐末落魄书生", "江南盐商遗孤", "边镇驿卒之子", "县学穷秀才", "流放商户之女的账房", "退伍弓手"],
    backstories: ["前世做过县域供应链", "曾替大厂做过风控和账期模型", "在粮油批发市场摸爬滚打十年", "熟悉茶盐布匹的真实损耗", "懂灾年价格、脚夫成本和仓储周转"],
    advantages: ["能看懂账本里的隐形亏空", "知道灾年粮价和水路节点", "会把会员、预售和账期放进古代商号", "能识别假货、劣货和空转人情债", "能把小民信用做成可复制规则"],
    firstActions: ["用一张税单救回濒临倒闭的茶坊", "把滞销布匹改成县学刚需", "用小额预售盘活一条街的脚夫", "替商号清掉第一笔坏账并拿到掌柜信任", "从一车被截的粮里反查出幕后秤局"],
    hooks: ["封门前最后一车货被人半价截走", "最小一笔坏账会拖垮全族", "官差当天就要来抄家", "未婚妻家拿着欠契上门退亲", "雨夜粮商偷偷改秤被主角当场看破"],
    publicProofs: ["账房当众改出活路", "街坊排队交定金", "脚夫第一次主动替他作证", "县学先生拿着新价单来问原因", "掌柜在祠堂前改口"],
    conflicts: ["寒门商业信用对抗地方士族规则", "商号、官府、粮商三方围猎", "新式经营触碰旧权力利益", "救家业与守底线之间的拉扯", "小民生意如何在乱世里保住秩序"],
    patches: ["每一步赚钱都要落在账本、货物、脚夫、税单或契约上", "现代经营法只能变成古人能理解的小规则", "不能用现代工业和金融词硬压古代场景"],
    selling: "历史经营、账本破局、小生意撬动大秩序",
  },
  {
    match: /玄幻|仙侠|升级|高武|修仙/,
    label: "玄幻升级",
    roles: ["废脉少年", "宗门杂役", "高武替补生", "被逐出师门的药童", "矿山少年", "外门欠债弟子", "小城拳馆陪练", "禁地守夜人"],
    backstories: ["前世死在一次错误突破里", "曾替药堂背过废丹黑锅", "知道底层修士最缺的不是功法而是资源路径", "被宗门用错的测灵法误判多年", "见过高阶强者失败时真正的破绽"],
    advantages: ["能看见功法缺陷", "只能复制失败经验", "能听见灵药枯萎原因", "能把废矿炼成低阶灵材", "每次突破都能换一个规则漏洞"],
    firstActions: ["反向教学救下天才师兄", "在废土里种出第一株异草", "用一次故意失败看穿全队短板", "替药堂救活一炉废丹", "把废矿做成宗门刚需"],
    hooks: ["他指出天才师兄死穴后被逼上擂台", "杂役田被人毁掉，土里却冒出异草", "公开测试里他故意输掉一招", "药堂长老要他背废丹黑锅", "矿洞塌方前他发现灵纹异常"],
    publicProofs: ["擂台上天才师兄险胜却沉默", "废田异草引来外门围观", "考核长老第一次改分", "药堂废丹当场回炉成丹", "矿山管事连夜封口"],
    conflicts: ["救命能力越强寿元债越深", "秘境成长引来宗门和外敌争夺", "失败数据库背后的旧案和武道黑幕", "资源闭环对抗宗门阶层", "外挂代价不断反噬主角选择"],
    patches: ["外挂必须有代价和边界", "每次变强都要经过场景行动，不靠解释升级", "资源来源要能被读者看见"],
    selling: "规则升级、代价外挂、持续变强",
  },
  {
    match: /游戏|系统|网游|副本|梦幻西游/,
    label: "游戏系统",
    roles: ["老玩家", "游戏策划", "被封号主播", "生活职业玩家", "公会边缘指挥", "开服前夜重生者", "搬砖工作室弃子", "冷门门派玩家"],
    backstories: ["前世亲历版本大改和公会洗牌", "曾写过副本数值文档", "靠交易行吃过饭也栽过坑", "知道隐藏 NPC 的情绪触发条件", "懂玩家心理和开服资源价格曲线"],
    advantages: ["知道冷门生活技能的版本价值", "只能看见失败率", "记得副本漏洞但不能滥用", "懂玩家交易心理", "能预判一次关键版本改动"],
    firstActions: ["放弃热门职业抢下第一笔隐藏订单", "把失败率变成组队避坑情报", "利用一个漏洞通关但不破坏生态", "靠生活技能垄断开服材料", "提前囤下被低估的消耗品"],
    hooks: ["全服嘲笑他选废职业", "别人看到奖励，他只看到九成失败率", "系统宣布追杀异常玩家", "公会把他踢出队伍后团灭", "隐藏 NPC 在开服十分钟后永久消失"],
    publicProofs: ["排行榜第一次洗牌", "交易行价格被他一单拉动", "踢他的公会在公告里道歉", "隐藏 NPC 只认他的道具", "直播间观众从嘲笑变成催单"],
    conflicts: ["情报优势引发公会围剿和版本变动", "失败率背后隐藏服务器真实规则", "用漏洞救世界还是毁世界", "玩家生态与商业垄断冲突", "知道版本但不能无限剧透"],
    patches: ["攻略不能全知全能，只能领先几个关键窗口", "游戏经济必须有供需和对手反制", "不要让系统替主角完成选择"],
    selling: "规则差、冷门路线封神、玩家生态博弈",
  },
  {
    match: /都市|日常|娱乐|神豪/,
    label: "都市日常",
    roles: ["过气综艺编导", "小城修车店老板", "被裁中年人", "深夜便利店店长", "短视频剪辑师", "社区旧货店老板", "失业产品经理", "退圈经纪人"],
    backstories: ["做过真实用户增长却被老板抢功", "最懂小城人情和消费痛点", "曾亲手把一个项目从零做到爆款", "懂普通人的体面和隐形需求", "被流量造假坑过一次"],
    advantages: ["懂真实素人的内容张力", "能听见顾客没说出口的遗憾", "拿到城市消费趋势清单", "能看见旧物的情绪价值", "知道爆款视频的反常识剪法"],
    firstActions: ["临场换掉整套综艺台本", "从一辆报废车里牵出第一单生意", "从夜市小摊验证消费趋势", "替顾客修好一件没人要的旧物", "把一段失败素材剪成爆款"],
    hooks: ["节目开录前赞助撤资", "报废车里藏着没寄出的辞职信", "离职当天他发现被忽视的爆品窗口", "顾客要扔的旧物牵出一桩误会", "明星临时毁约，素材全废"],
    publicProofs: ["第一条视频评论区反转", "顾客带着邻居回头", "赞助商临时改口加钱", "旧物故事登上同城热榜", "竞争对手开始照抄他的服务"],
    conflicts: ["真实内容对抗流量造假", "小店变成城市信任节点", "趋势判断与家庭压力拉扯", "烟火气生意如何规模化", "普通人的体面和商业效率冲突"],
    patches: ["神豪感要来自解决问题后的资源涌入，不靠凭空到账", "日常爽点必须有具体人和具体物", "主角不能只讲道理，要用服务或作品说话"],
    selling: "烟火气、情绪价值、低谷翻盘",
  },
  {
    match: /.*/,
    label: "都市重生商战",
    roles: ["2016年被裁程序员", "退婚当天的假富二代", "父亲生意崩盘前的重生者", "大学创业社边缘人", "负债外卖员", "校园论坛小透明", "县城供应链业务员", "被合伙人踢走的产品经理"],
    backstories: ["前世本来是程序员，被裁后才去送外卖养家", "曾做过本地生活平台的地推和系统工具", "亲眼见过父亲合同踩坑和平台大战", "懂商户痛点、履约成本和学生流量", "知道未来几年本地生活的窗口期"],
    advantages: ["重生信息差", "技术和商户资源整合能力", "把误解转化成流量的能力", "看懂供应链漏洞", "能用小工具提高线下效率", "懂校园流量和商户预算之间的桥"],
    firstActions: ["从校园外卖做出第一条履约链路", "把退婚宴变成第一场带货", "用一张采购单证明合同陷阱", "替小店做出第一个订单工具", "用校园墙流量验证第一个商户套餐"],
    hooks: ["退掉昂贵租车时发现未来债务源头正在重演", "所有人等他崩溃，他却现场开卖", "父亲签下必亏合同前他看出致命陷阱", "商户当众说学生创业不靠谱", "债主电话打进课堂"],
    publicProofs: ["食堂门口排出第一条队", "商户第一次愿意预付推广费", "校园墙截图把误解变成流量", "父亲合同当场被改出活路", "同学嘲笑的订单变成寝室楼复购"],
    conflicts: ["从校园小单到本地生活平台的规则战", "假富二代标签如何变成真实商业信用", "救家业和重建行业规则", "技术能力与线下执行之间的磨合", "信息差红利耗尽后的组织能力考验"],
    patches: ["如果主角会写软件，必须交代前史或职业技能来源", "赚钱不能靠喊口号，要有订单、商户、履约和复购", "重生记忆只提供方向，执行必须现场完成"],
    selling: "重生信息差、校园商业、公开验证",
  },
];

function ideaProfileFor({ platform = "", genre = "", subgenre = "" } = {}) {
  const text = `${platform} ${genre} ${subgenre}`;
  return ideaRuleProfiles.find((profile) => profile.match.test(text)) || ideaRuleProfiles[ideaRuleProfiles.length - 1];
}

function sampleWithoutRepeat(items = [], used = new Set()) {
  const candidates = items.filter((item) => !used.has(item));
  const source = candidates.length ? candidates : items;
  const picked = source[Math.floor(Math.random() * source.length)] || "";
  used.add(picked);
  return picked;
}

function fallbackIdeaSuggestions({ platform = "fanqie", genre = "", subgenre = "" } = {}) {
  const profile = ideaProfileFor({ platform, genre, subgenre });
  const used = new Set();
  const ideas = [];
  const styleHints = platform === "qidian"
    ? ["格局更大，第一卷就要埋下势力或行业级对抗", "标题和卖点偏大气，但首章仍要用具体事件落地", "主角路线要能支撑长线世界展开"]
    : ["首章前300字必须有误解、压力或结果反差", "每章要有可见爽点和读者能懂的收益", "卖点要直给，行动要快"];

  for (let i = 0; i < 3; i += 1) {
    const role = sampleWithoutRepeat(profile.roles, used);
    const backstory = sampleWithoutRepeat(profile.backstories, used);
    const advantage = sampleWithoutRepeat(profile.advantages, used);
    const action = sampleWithoutRepeat(profile.firstActions, used);
    const hook = sampleWithoutRepeat(profile.hooks, used);
    const proof = sampleWithoutRepeat(profile.publicProofs, used);
    const conflict = sampleWithoutRepeat(profile.conflicts, used);
    const patch = sampleWithoutRepeat(profile.patches, used);
    const styleHint = styleHints[(Math.floor(Math.random() * styleHints.length) + i) % styleHints.length];

    ideas.push([
      `题材方向：${profile.label}。`,
      `主角：${role}，${backstory}，所以他的能力不是凭空来的。`,
      `核心优势：${advantage}。`,
      `首章前300字钩子：${hook}；不要先讲设定，先让冲突砸到脸上。`,
      `第一阶段行动：${action}，并用${proof}完成公开验证。`,
      `长期矛盾：${conflict}。`,
      `商业卖点：${profile.selling}。`,
      `可信度补丁：${patch}；${styleHint}。`,
    ].join(""));
  }

  return ideas;
}

function parseIdeaSuggestionText(input = "") {
  const json = typeof input === "string" ? parseJsonMaybe(String(input || "").trim()) : null;
  const raw = Array.isArray(input)
    ? input
    : Array.isArray(json)
      ? json
      : Array.isArray(json?.ideas)
        ? json.ideas
        : null;
  const lines = raw || String(input || "")
    .split(/\r?\n|[；;]/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)、]|[①②③一二三]\s*[、.])\s*/, "").trim())
    .filter(Boolean);
  const seen = new Set();
  return lines
    .map((item) => {
      if (item && typeof item === "object") {
        return [
          item.idea,
          item.premise,
          item.hook ? `首章钩子：${item.hook}` : "",
          item.conflict ? `长期矛盾：${item.conflict}` : "",
          item.patch ? `可信度补丁：${item.patch}` : "",
        ].filter(Boolean).join("；");
      }
      return String(item || "").trim();
    })
    .filter((item) => item.length >= 18)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 3);
}

function titleKeywordHits(title = "", { idea = "", genre = "" } = {}) {
  const keywords = extractKeywordsForTitle(idea, genre);
  return keywords.filter((keyword) => keyword && title.includes(keyword)).length;
}

function isUsableBookTitle(title = "", context = {}) {
  const text = sanitizeBookTitle(title);
  if (text.length < 4 || text.length > 28) return false;
  if (/[{}[\]"']/.test(title)) return false;
  if (/用户|需要|根据|给定|创意|生成|书名|标题|JSON|输出|候选|中文网文|任务|以下|要求/.test(text)) return false;
  if (/突出|围绕|聚焦|体现|展现|讲述|描写|主打|核心爽点|商业卖点|平台规则|故事核心|题材方向/.test(text)) return false;
  if (/^第?[一二三四五六七八九十\d]+[个条项]/.test(text)) return false;
  if (/的核心|的故事|的路线|的卖点|的爽点/.test(text)) return false;
  const keywords = extractKeywordsForTitle(context.idea, context.genre);
  const concreteKeywords = keywords.filter((keyword) => !["逆袭", "重生", "穿越", "系统", "都市", "历史"].includes(keyword));
  const hits = titleKeywordHits(text, context);
  const concreteHits = concreteKeywords.filter((keyword) => text.includes(keyword)).length;
  if (concreteKeywords.length && concreteHits < 1) return false;
  const hasUsefulSignal = hits > 0
    || /重生|穿越|开局|回到|梦回|大宋|长安|校园|外卖|商业|商战|茶|程序员|游戏|副本|修仙|高武|系统/.test(text);
  return hasUsefulSignal;
}

function usableTitlesOrFallback(titles = [], fallback = [], context = {}) {
  const usable = uniqueTitles(titles).filter((title) => isUsableBookTitle(title, context));
  if (usable.length >= 2) return usable.slice(0, 3);
  const merged = [...usable, ...fallback].filter((title) => isUsableBookTitle(title, context));
  return uniqueTitles(merged).slice(0, 3);
}

function escapeXml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function coverPaletteForIdea({ idea = "", genre = "" } = {}) {
  const text = `${idea} ${genre}`;
  if (/历史|宋|唐|明|茶|商|账|契|盐/.test(text)) return ["#2a1510", "#9a3412", "#f6d365", "#fff7ed"];
  if (/玄幻|修仙|仙|宗门|灵气|高武/.test(text)) return ["#111827", "#4f46e5", "#22d3ee", "#eef2ff"];
  if (/游戏|电竞|系统|副本|梦幻西游/.test(text)) return ["#08111f", "#2563eb", "#a3e635", "#eff6ff"];
  if (/末世|废土|灾变/.test(text)) return ["#14110f", "#525252", "#f97316", "#fafaf9"];
  if (/娱乐|明星|直播|短视频/.test(text)) return ["#3b0764", "#db2777", "#fde047", "#fdf2f8"];
  return ["#111827", "#7c3aed", "#f59e0b", "#f8fafc"];
}

function splitCoverTitle(title = "") {
  const clean = sanitizeBookTitle(title) || "未命名新书";
  if (clean.length <= 6) return [clean];
  if (clean.length <= 12) return [clean.slice(0, 6), clean.slice(6)];
  return [clean.slice(0, 6), clean.slice(6, 12), clean.slice(12, 18)];
}

function coverMotifForIdea({ idea = "", genre = "" } = {}) {
  const text = `${idea} ${genre}`;
  if (/茶|宋|账|契|商/.test(text)) return "账册、茶引、契约、铜钱、宋式街巷";
  if (/外卖|校园|创业/.test(text)) return "校园夜路、手机订单、外卖箱、增长曲线";
  if (/游戏|系统|副本/.test(text)) return "数据面板、战术地图、发光界面";
  if (/玄幻|修仙|高武/.test(text)) return "山门、灵纹、剑光、层云";
  if (/末世|废土/.test(text)) return "破碎城市、警戒灯、补给箱";
  return "主角背影、城市灯光、命运转折";
}

function buildLocalCoverSvg({ title = "未命名新书", author = "章鱼作者", idea = "", genre = "", platform = "" } = {}) {
  const [bg, accent, glow, paper] = coverPaletteForIdea({ idea, genre });
  const titleText = splitCoverTitle(title)
    .map((line, index) => `<text x="450" y="${442 + index * 96}" text-anchor="middle" class="title">${escapeXml(line)}</text>`)
    .join("\n");
  const motif = coverMotifForIdea({ idea, genre });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${LOCAL_COVER_WIDTH}" height="${LOCAL_COVER_HEIGHT}" viewBox="0 0 ${LOCAL_COVER_WIDTH} ${LOCAL_COVER_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="58%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${glow}"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="36%" r="55%">
      <stop offset="0%" stop-color="${paper}" stop-opacity=".36"/>
      <stop offset="70%" stop-color="${paper}" stop-opacity="0"/>
    </radialGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="28" stdDeviation="24" flood-color="#000" flood-opacity=".32"/>
    </filter>
    <style>
      .eyebrow { font: 700 28px "Microsoft YaHei", "PingFang SC", sans-serif; letter-spacing: 6px; fill: ${paper}; opacity: .72; }
      .title { font: 900 76px "Microsoft YaHei", "PingFang SC", sans-serif; fill: #fff; letter-spacing: 0; }
      .author { font: 700 30px "Microsoft YaHei", "PingFang SC", sans-serif; fill: ${paper}; opacity: .92; }
      .motif { font: 500 24px "Microsoft YaHei", "PingFang SC", sans-serif; fill: ${paper}; opacity: .78; }
    </style>
  </defs>
  <rect width="900" height="1200" fill="url(#bg)"/>
  <rect width="900" height="1200" fill="url(#halo)"/>
  <path d="M84 188 C225 108 352 126 451 189 C584 274 691 264 816 190 L816 1008 C662 1054 525 1047 420 1008 C286 958 180 980 84 1040 Z" fill="#ffffff" opacity=".10"/>
  <path d="M132 792 C266 724 352 764 450 810 C559 862 666 855 768 792" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".24"/>
  <path d="M150 840 C278 790 366 820 450 858 C562 908 658 898 750 842" fill="none" stroke="${paper}" stroke-width="3" stroke-linecap="round" opacity=".42"/>
  <g filter="url(#softShadow)">
    <rect x="96" y="230" width="708" height="600" rx="38" fill="#06070a" opacity=".28"/>
    <rect x="116" y="250" width="668" height="560" rx="30" fill="#ffffff" opacity=".08"/>
  </g>
  <text x="450" y="176" text-anchor="middle" class="eyebrow">${escapeXml(platform || genre || "OCTOSAGE")}</text>
  ${titleText}
  <text x="450" y="900" text-anchor="middle" class="motif">${escapeXml(motif)}</text>
  <line x1="318" y1="956" x2="582" y2="956" stroke="${paper}" stroke-width="2" opacity=".55"/>
  <text x="450" y="1018" text-anchor="middle" class="author">${escapeXml(author)}</text>
</svg>`;
}

function projectCoverRelativeUrl(project, coverPath = "") {
  if (!coverPath) return "";
  return `/api/project/cover?project=${encodeURIComponent(project.path)}&path=${encodeURIComponent(coverPath)}&t=${Date.now()}`;
}

function doubaoImageGenerationUrl(rawBaseUrl = "") {
  const value = String(rawBaseUrl || "").trim().replace(/\/+$/, "");
  if (!value) return "https://ark.cn-beijing.volces.com/api/v3/images/generations";
  if (/\/images\/generations$/i.test(value)) return value;
  if (/\/chat\/completions$/i.test(value)) return value.replace(/\/chat\/completions$/i, "/images/generations");
  if (/\/api\/v3$/i.test(value) || /\/v3$/i.test(value)) return `${value}/images/generations`;
  return `${value}/api/v3/images/generations`;
}

function parseGeneratedImagePayload(payload = {}) {
  const candidates = [
    payload?.data?.[0]?.url,
    payload?.data?.[0]?.image_url,
    payload?.images?.[0]?.url,
    payload?.result?.images?.[0]?.url,
    payload?.image_url,
    payload?.url,
  ].filter(Boolean);
  const b64 = payload?.data?.[0]?.b64_json
    || payload?.data?.[0]?.base64
    || payload?.images?.[0]?.b64_json
    || payload?.images?.[0]?.base64
    || payload?.result?.images?.[0]?.b64_json
    || payload?.result?.images?.[0]?.base64;
  return { url: candidates[0] || "", b64: b64 || "" };
}

async function saveRemoteImageToFile(imageUrl, targetPath) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`豆包封面图片下载失败：HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("豆包封面图片为空。");
  await writeFile(targetPath, buffer);
  return buffer.length;
}

function buildCoverGenerationPrompt({ title = "", author = "", idea = "", genre = "", platform = "" } = {}) {
  return [
    "为中文网文制作竖版商业小说封面，比例 3:4，适合书架缩略图和平台封面。",
    `书名：${title}`,
    `作者：${author}`,
    `题材：${genre || "商业网文"}`,
    `平台风格：${platform || "通用网文平台"}`,
    `故事创意：${idea || "主角在压力中抓住机会逆袭"}`,
    `核心视觉元素：${coverMotifForIdea({ idea, genre })}`,
    "画面要求：主视觉清晰，有商业感和爽文张力，背景有场景信息，避免低俗、血腥、侵权角色和真实明星脸。",
    "文字要求：封面必须包含书名和作者名，书名醒目，作者名较小；不要出现乱码、英文水印、模型签名。",
  ].join("\n");
}

async function tryGenerateDoubaoCover({ targetPath, title, author, idea, genre, platform } = {}) {
  const apiKey = process.env.DOUBAO_API_KEY;
  if (!apiKey || typeof fetch !== "function") return null;
  const endpoint = doubaoImageGenerationUrl(process.env.DOUBAO_IMAGE_BASE_URL || process.env.DOUBAO_BASE_URL || "");
  const model = process.env.DOUBAO_IMAGE_MODEL || "doubao-seedream-5-0-260128";
  const prompt = buildCoverGenerationPrompt({ title, author, idea, genre, platform });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      size: "1024x1365",
      response_format: "url",
    }),
  });
  const payloadText = await response.text();
  let payload = {};
  try {
    payload = payloadText ? JSON.parse(payloadText) : {};
  } catch {
    payload = { raw: payloadText };
  }
  if (!response.ok) {
    throw new Error(`豆包图片生成失败：HTTP ${response.status} ${payload?.error?.message || payloadText.slice(0, 200)}`);
  }
  const image = parseGeneratedImagePayload(payload);
  if (image.b64) {
    await writeFile(targetPath, Buffer.from(String(image.b64).replace(/^data:image\/\w+;base64,/, ""), "base64"));
    return { source: `doubao/${model}`, prompt, bytes: 0 };
  }
  if (image.url) {
    const bytes = await saveRemoteImageToFile(image.url, targetPath);
    return { source: `doubao/${model}`, prompt, bytes };
  }
  throw new Error("豆包图片生成没有返回可用图片 URL 或 base64。");
}

async function generateBookCover(project, { title = "", author = "", idea = "", genre = "", platform = "" } = {}) {
  const finalTitle = sanitizeBookTitle(title || project.title || "未命名新书") || "未命名新书";
  const finalAuthor = String(author || project.author_name || "章鱼作者").trim() || "章鱼作者";
  const finalIdea = String(idea || project.idea || "").trim();
  const finalGenre = String(genre || project.genre || "").trim();
  const finalPlatform = String(platform || project.platform || "").trim();
  const dir = path.join(project.path, "封面");
  await mkdir(dir, { recursive: true });
  let coverPath = path.join(dir, "cover.svg");
  let source = "local-cover-composer";
  let prompt = [
    `书名：${finalTitle}`,
    `作者：${finalAuthor}`,
    `创意：${finalIdea || "商业网文封面"}`,
    `题材：${finalGenre || "网文"}`,
    `平台：${finalPlatform || "通用"}`,
    `视觉元素：${coverMotifForIdea({ idea: finalIdea, genre: finalGenre })}`,
  ].join("\n");
  try {
    const doubaoPath = path.join(dir, "cover.png");
    const doubao = await tryGenerateDoubaoCover({
      targetPath: doubaoPath,
      title: finalTitle,
      author: finalAuthor,
      idea: finalIdea,
      genre: finalGenre,
      platform: finalPlatform,
    });
    if (doubao) {
      coverPath = doubaoPath;
      source = doubao.source;
      prompt = doubao.prompt;
    } else {
      await writeFile(coverPath, buildLocalCoverSvg({
        title: finalTitle,
        author: finalAuthor,
        idea: finalIdea,
        genre: finalGenre,
        platform: finalPlatform,
      }), "utf8");
    }
  } catch (error) {
    prompt = `${prompt}\n豆包封面生成失败，已使用本地封面兜底：${error?.message || String(error)}`;
    await writeFile(coverPath, buildLocalCoverSvg({
      title: finalTitle,
      author: finalAuthor,
      idea: finalIdea,
      genre: finalGenre,
      platform: finalPlatform,
    }), "utf8");
  }
  const nextProject = {
    ...project,
    title: finalTitle,
    author_name: finalAuthor,
    cover_path: coverPath,
    cover_url: projectCoverRelativeUrl(project, coverPath),
    cover_prompt: prompt,
    updated_at: new Date().toISOString(),
  };
  await writeJson(path.join(project.path, "project.json"), nextProject);
  return {
    status: "ready",
    source,
    title: finalTitle,
    author_name: finalAuthor,
    cover_path: coverPath,
    cover_url: nextProject.cover_url,
    prompt,
  };
}

async function suggestBookIdeas({ platform = "fanqie", genre = "都市", subgenre = "重生" } = {}) {
  const fallback = fallbackIdeaSuggestions({ platform, genre, subgenre });
  const seed = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const route = routerOptionsForTaskType("project_planning") || routerOptionsForTaskType("title_suggestion");
  if (!route) {
    return { status: "fallback", source: "local-rules", ideas: fallback };
  }
  try {
    const router = createModelRouter(route);
    const result = await router.invoke({
      task_type: "idea_suggestion",
      platform,
      genre,
      subgenre,
      instruction: [
        "你是中文商业网文开书策划。",
        `目标平台：${platform}，类型：${genre}/${subgenre}。`,
        `本次随机种子：${seed}。必须生成和常见模板不同的新组合，不要重复上一次输出。`,
        "生成 3 个可以直接开书的高质量创意方案。",
        "每个创意必须是一段完整中文，包含：主角处境、核心优势或外挂、第一阶段行动、首章前300字钩子、长期矛盾、可信度补丁。",
        "要求有商业爽点、强行动入口、可持续长线，不要空泛，不要套旧项目人物名，不要只写一句设定。",
        "只输出 JSON：{\"ideas\":[\"创意1\",\"创意2\",\"创意3\"]}",
      ].join("\n"),
    });
    const ideas = parseIdeaSuggestionText(result?.ideas || result?.text || result?.output || result);
    if (ideas.length) return { status: "ready", source: `${route.provider}/${route.model}`, ideas };
  } catch {
    return { status: "fallback", source: "local-rules", ideas: fallback };
  }
  return { status: "fallback", source: "local-rules", ideas: fallback };
}

async function suggestBookTitles({ idea = "", platform = "fanqie", genre = "" } = {}) {
  const fallback = fallbackTitleSuggestions({ idea, platform, genre });
  const route = routerOptionsForTaskType("title_suggestion");
  if (!route) {
    return { status: "fallback", source: "local-rules", titles: fallback };
  }
  try {
    const router = createModelRouter(route);
    const result = await router.invoke({
      task_type: "title_suggestion",
      idea,
      platform,
      genre,
      instruction: [
        "你是中文网文商业书名策划。",
        "根据一句话创意、目标平台和题材，生成 3 个中文网文书名。",
        "要求：贴合创意，不要套用无关重生/系统词；番茄风格更直给爽点，起点风格更大气；每个书名 8-18 个汉字左右。",
        "只输出 JSON：{\"titles\":[\"书名1\",\"书名2\",\"书名3\"]}",
      ].join("\n"),
    });
    const rawTitles = result?.titles || parseTitleSuggestionText(result?.text || result?.output || "");
    const titles = usableTitlesOrFallback(rawTitles, fallback, { idea, genre });
    if (titles.length) return { status: "ready", source: `${route.provider}/${route.model}`, titles };
  } catch {
    return { status: "fallback", source: "local-rules", titles: fallback };
  }
  return { status: "fallback", source: "local-rules", titles: fallback };
}

function safeDestinationDir(value = "") {
  const destination = String(value || "").trim();
  if (!destination) return "";
  const resolved = path.resolve(destination);
  const parsed = path.parse(resolved);
  if (!resolved || resolved === parsed.root) {
    throw new HttpError(400, "导出位置不能是磁盘根目录。请选择一个具体文件夹。");
  }
  return resolved;
}

function safeExportFileName(value = "") {
  const name = sanitizeBookTitle(value) || "OctoSage";
  return name.replace(/\.+$/g, "") || "OctoSage";
}

async function copyExportToDestination(sourcePath, destinationDir, project, suffix = "") {
  if (!destinationDir) return sourcePath;
  await mkdir(destinationDir, { recursive: true });
  const ext = path.extname(sourcePath) || ".txt";
  const base = `${safeExportFileName(project?.title || "OctoSage")}${suffix}`;
  const target = path.join(destinationDir, `${base}${ext}`);
  await copyFile(sourcePath, target);
  return target;
}

async function exportChaptersToSingleFiles(project, { from = 1, to = 1, destination = "" } = {}) {
  const files = [];
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    const exported = await exportChapter(project, chapterNo);
    let finalPath = exported.path;
    if (destination) {
      await mkdir(destination, { recursive: true });
      finalPath = path.join(
        destination,
        `${safeExportFileName(project.title)}_第${String(chapterNo).padStart(3, "0")}章.txt`,
      );
      await copyFile(exported.path, finalPath);
    }
    files.push(finalPath);
  }
  return {
    status: "exported",
    format: "single",
    path: destination || path.dirname(files[0] || ""),
    files,
    from,
    to,
    chapter_count: files.length,
  };
}

async function unlinkIfExists(filePath) {
  try {
    await unlink(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function rollbackChapter(project, chapterNo) {
  const targets = [
    exportFile(project, chapterNo),
    draftFile(project, chapterNo, "v1"),
    draftFile(project, chapterNo, "v2"),
    draftFile(project, chapterNo, "v3"),
    reviewFile(project, chapterNo),
    qualityReportFile(project, chapterNo),
    chapterCardFile(project, chapterNo),
    chapterQualityCheckpointFile(project, chapterNo),
  ];
  const deleted = [];
  for (const target of targets) {
    if (await unlinkIfExists(target)) deleted.push(target);
  }
  const config = await loadProjectConfig(project);
  const nextChapter = Math.max(1, chapterNo);
  const nextConfig = {
    ...config,
    current_chapter: Math.min(Number(config.current_chapter || nextChapter), nextChapter),
  };
  await saveProjectConfig(project, nextConfig);
  return {
    status: "rolled_back",
    chapter_no: chapterNo,
    deleted,
    current_chapter: nextConfig.current_chapter,
  };
}

function parseJsonMaybe(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isKimiWebbridgeStalePid(raw = "", error = "") {
  const text = `${raw}\n${error}`;
  return /PID file exists but HTTP probe failed|write pid:.*daemon\.pid: The file exists|daemon may be starting or stuck|connectex: No connection could be made/i.test(text);
}

async function kimiWebbridgeStatus() {
  const installed = await fileExists(KIMI_WEBBRIDGE_BIN);
  const result = {
    id: "kimi-webbridge",
    label: "Kimi WebBridge",
    installed,
    install_dir: KIMI_WEBBRIDGE_INSTALL_DIR,
    bin_path: KIMI_WEBBRIDGE_BIN,
    install_url: KIMI_WEBBRIDGE_INSTALL_URL,
    install_command: KIMI_WEBBRIDGE_INSTALL_COMMAND,
    safe_install_note: "安装命令会从 Kimi CDN 下载并运行本地 daemon。软件不会静默执行远程脚本，需要用户主动确认。",
    daemon: {
      checked: false,
      running: false,
      raw: "",
      error: "",
    },
  };

  if (!installed) return result;

  try {
    const { stdout, stderr } = await execFileAsync(KIMI_WEBBRIDGE_BIN, ["status"], {
      timeout: 8000,
      windowsHide: true,
    });
    const raw = `${stdout || ""}${stderr ? `\n${stderr}` : ""}`.trim();
    const parsed = parseJsonMaybe(raw);
    const stale_pid = isKimiWebbridgeStalePid(raw);
    result.daemon = {
      checked: true,
      running: Boolean(parsed?.running) || (!stale_pid && !/not\s+running|stopped|failed|error/i.test(raw)),
      stale_pid,
      raw,
      error: "",
    };
  } catch (error) {
    const message = error?.message || String(error);
    result.daemon = {
      checked: true,
      running: false,
      stale_pid: isKimiWebbridgeStalePid("", message),
      raw: "",
      error: message,
    };
  }

  return result;
}

async function clearStaleKimiWebbridgePid() {
  if (!(await fileExists(KIMI_WEBBRIDGE_PID_FILE))) return false;
  await unlink(KIMI_WEBBRIDGE_PID_FILE);
  return true;
}

async function startKimiWebbridge() {
  const status = await kimiWebbridgeStatus();
  if (!status.installed) {
    return {
      ...status,
      started: false,
      next_step: "先安装 Kimi WebBridge，再启动发布助手。",
    };
  }

  const start = async () => execFileAsync(KIMI_WEBBRIDGE_BIN, ["start"], {
    timeout: 12000,
    windowsHide: true,
  });

  try {
    let repaired_stale_pid = false;
    if (status.daemon?.stale_pid) {
      repaired_stale_pid = await clearStaleKimiWebbridgePid();
    }
    const { stdout, stderr } = await start();
    return {
      ...(await kimiWebbridgeStatus()),
      started: true,
      repaired_stale_pid,
      raw: `${stdout || ""}${stderr ? `\n${stderr}` : ""}`.trim(),
    };
  } catch (error) {
    const message = error?.message || String(error);
    if (isKimiWebbridgeStalePid("", message)) {
      const repaired_stale_pid = await clearStaleKimiWebbridgePid();
      try {
        const { stdout, stderr } = await start();
        return {
          ...(await kimiWebbridgeStatus()),
          started: true,
          repaired_stale_pid,
          raw: `${stdout || ""}${stderr ? `\n${stderr}` : ""}`.trim(),
        };
      } catch (retryError) {
        return {
          ...(await kimiWebbridgeStatus()),
          started: false,
          repaired_stale_pid,
          error: retryError?.message || String(retryError),
        };
      }
    }

    return {
      ...(await kimiWebbridgeStatus()),
      started: false,
      error: message,
    };
  }
}

  async function saveUserApiKey(name, value) {
    if (process.platform !== "win32") {
      throw new Error("API Key UI save currently supports Windows setx only");
    }
    const normalizedValue = normalizeUserSettingValue(name, value);
    await execFileAsync("setx", [name, normalizedValue]);
    process.env[name] = normalizedValue;
  }

  async function runModelSmoke({ provider = "", model = "", allowNetwork = false } = {}) {
    const requestedProvider = String(provider || "");
    const route = requestedProvider && requestedProvider !== "mock"
      ? { provider: requestedProvider, model: String(model || "") }
      : firstConfiguredModelRoute();
    if (!route) {
      throw new HttpError(409, "请先保存至少一个真实模型 API Key，再测试模型连接。");
    }
    const selectedProvider = String(route.provider);
    const selectedModel = String(model || route.model || "");
    const isRealProvider = selectedProvider !== "mock" && !selectedProvider.startsWith("mock");

    if (isRealProvider && !allowNetwork) {
      return {
        status: "blocked",
        provider: selectedProvider,
        model: selectedModel,
        requires_confirmation: true,
        message: "真实模型测试需要用户明确确认联网和可能产生费用；当前只完成本地安全检查。",
      };
    }

    const router = createModelRouter({
      provider: selectedProvider,
      model: selectedModel,
      allowNetwork,
      ...routeBaseUrlPatch(selectedProvider, process.env),
    });
    const smokeStartedAt = Date.now();
    let output = null;
    let health = null;
    try {
      output = await router.invoke({
        task_type: "write_chapter",
        chapter_card: {
          chapter_no: 1,
          display_title: "模型连接测试",
        },
        task_package: {
          output: { target_words: 120 },
        },
      });
      health = recordModelHealthSync({
        provider: selectedProvider,
        model: selectedModel,
        task_type: "model_smoke",
        status: "success",
        duration_ms: Date.now() - smokeStartedAt,
      });
    } catch (error) {
      recordModelHealthSync({
        provider: selectedProvider,
        model: selectedModel,
        task_type: "model_smoke",
        status: "error",
        duration_ms: Date.now() - smokeStartedAt,
        error: error?.message || String(error),
      });
      throw error;
    }

    return {
      status: "ok",
      provider: selectedProvider,
      model: selectedModel,
      health,
      text_preview: String(output.text || "").slice(0, 120),
      created_at: new Date().toISOString(),
    };
  }

  async function openLocalPath(filePath) {
    const targetPath = String(filePath || "");
    if (!targetPath) throw new Error("path is required");
    if (process.platform === "win32") {
      await execFileAsync("explorer.exe", [targetPath]);
      return { status: "opened", path: targetPath };
    }
    if (process.platform === "darwin") {
      await execFileAsync("open", [targetPath]);
      return { status: "opened", path: targetPath };
    }
    await execFileAsync("xdg-open", [targetPath]);
    return { status: "opened", path: targetPath };
  }

function jsonResponse(response, statusCode, data) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(data, null, 2)}\n`);
}

function htmlResponse(response, html) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

function textResponse(response, statusCode, text) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(text);
}

async function assetResponse(response, requestPathname) {
  const relative = decodeURIComponent(requestPathname.replace(/^\/assets\//, ""));
  const normalized = path.normalize(relative).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.resolve(ASSETS_ROOT, normalized);
  if (!filePath.startsWith(`${ASSETS_ROOT}${path.sep}`)) {
    textResponse(response, 403, "Forbidden");
    return true;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml; charset=utf-8",
  };
  if (!contentTypes[ext]) {
    textResponse(response, 404, "Not found");
    return true;
  }
  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypes[ext],
      "cache-control": "public, max-age=3600",
    });
    response.end(data);
  } catch {
    textResponse(response, 404, "Not found");
  }
  return true;
}

async function projectCoverResponse(response, project, requestedPath = "") {
  requestedPath = requestedPath || project.cover_path || "";
  const coverPath = requestedPath ? path.resolve(requestedPath) : "";
  const projectRoot = path.resolve(project.path);
  if (!coverPath) {
    textResponse(response, 404, "Cover not found");
    return true;
  }
  const relative = path.relative(projectRoot, coverPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    textResponse(response, 403, "Forbidden");
    return true;
  }
  const ext = path.extname(coverPath).toLowerCase();
  const contentTypes = {
    ".svg": "image/svg+xml; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  if (!contentTypes[ext]) {
    textResponse(response, 415, "Unsupported cover type");
    return true;
  }
  try {
    const data = await readFile(coverPath);
    response.writeHead(200, {
      "content-type": contentTypes[ext],
      "cache-control": "no-store",
    });
    response.end(data);
  } catch {
    textResponse(response, 404, "Cover not found");
  }
  return true;
}

async function docResponse(response, requestPathname) {
  const relative = decodeURIComponent(requestPathname.replace(/^\/docs\//, ""));
  const normalized = path.normalize(relative || "").replace(/^(\.\.[/\\])+/, "");
  const mapped = normalized === "CHANGELOG.md"
    ? path.join(REPO_ROOT, "CHANGELOG.md")
    : path.join(REPO_ROOT, "docs", normalized);
  const filePath = mapped.startsWith(REPO_ROOT) && /\.(md|txt)$/i.test(mapped) ? mapped : "";
  if (!filePath) {
    textResponse(response, 404, "Not found");
    return true;
  }
  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(data);
  } catch {
    textResponse(response, 404, "Not found");
  }
  return true;
}

async function pixsoUiResponse(response, requestPathname = "/") {
  const pathname = requestPathname === "/pixso" ? "/pixso/" : requestPathname;
  const relative = pathname.startsWith("/pixso/")
    ? decodeURIComponent(pathname.replace(/^\/pixso\//, ""))
    : "index.html";
  const normalized = path.normalize(relative || "index.html").replace(/^(\.\.[/\\])+/, "");
  const requestedPath = path.resolve(PIXSO_UI_ROOT, normalized);
  const filePath = requestedPath.startsWith(`${PIXSO_UI_ROOT}${path.sep}`) && path.extname(requestedPath)
    ? requestedPath
    : path.join(PIXSO_UI_ROOT, "index.html");
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml; charset=utf-8",
    ".otf": "font/otf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypes[ext] || "application/octet-stream",
      "cache-control": ext === ".html" ? "no-store" : "public, max-age=3600",
    });
    response.end(data);
  } catch {
    textResponse(response, 404, "Pixso UI not built. Run npm.cmd run build in pixso-react-ui.");
  }
}

function sseResponse(response, task) {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "close",
  });
  response.end(`event: task\ndata: ${JSON.stringify(task)}\n\n`);
}

function sseWrite(response, event, data) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function readRequestJson(request, { maxBodyBytes = DEFAULT_MAX_BODY_BYTES } = {}) {
  const contentType = request.headers["content-type"] || "";
  if (!String(contentType).toLowerCase().includes("application/json")) {
    throw new HttpError(415, "content-type must be application/json");
  }
  const contentLength = Number(request.headers["content-length"] || 0);
  if (contentLength > maxBodyBytes) {
    throw new HttpError(413, `request body too large: ${contentLength} > ${maxBodyBytes}`);
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      throw new HttpError(413, `request body too large: ${total} > ${maxBodyBytes}`);
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

function parsePositiveInteger(value, fallback, name) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${name} must be a positive integer: ${value}`);
  }
  return number;
}

function timestampSuffix(date = new Date()) {
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

  function routerOptionsFromBody(body = {}, fallback = undefined) {
    if (!body.provider && !body.model) return fallback;
    return {
      provider: body.provider,
      model: body.model,
      allowNetwork: Boolean(body.allow_network),
    };
}

async function projectFromQuery(url) {
  const projectPath = url.searchParams.get("project") || url.searchParams.get("path");
  if (!projectPath) {
    throw new Error("project path is required");
  }
  return loadProject(projectPath);
}

async function projectFromBody(body) {
  if (!body.project) {
    throw new Error("project path is required");
  }
  return loadProject(body.project);
}

async function buildProjectStatus(project) {
  const status = await writeWebStatus(project);
  const config = await loadProjectConfig(project);
  const cost = await summarizeProjectCost(project);
  const progress = await inferProjectProgress(project);
  const projectPath = project.path;
  const apiKeys = apiKeyStatusFromEnv();
  return {
    ...status,
    ...progress,
    project_path: projectPath,
    directories: {
      project: projectPath,
      chapters: `${projectPath}\\正文`,
      chapter_cards: `${projectPath}\\章节卡`,
      reviews: `${projectPath}\\审稿`,
      state: `${projectPath}\\状态`,
      exports: `${projectPath}\\导出`,
      tasks: `${projectPath}\\tasks`,
    },
    provider: config.model.provider,
    default_model: config.model.default_writer,
    model_routes: buildTaskModelPlan(),
    api_keys: apiKeys,
    ready: {
      has_project: Boolean(project.path),
      can_write: Boolean(project.path),
      can_export: (progress.latest_completed_chapter || 0) > 0,
      has_any_model_key: apiKeys.some((key) => key.configured),
      selected_model_route: firstConfiguredModelRoute(),
    },
    estimated_cost_cny: cost.estimated_cost_cny,
  };
}

async function readJsonIfExists(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readChapterJsonIfExists(file, chapterNo, fallback = null) {
  for (const candidate of legacyChapterFileCandidates(file, chapterNo)) {
    const value = await readJsonIfExists(candidate, null);
    if (value) {
      if (value && typeof value === "object" && !value.path) value.path = candidate;
      return value;
    }
  }
  return fallback;
}

function positiveIntegerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

const workflowStepLabels = {
  chapter_card: "章卡",
  card: "章卡",
  write: "正文",
  review: "审稿",
  rewrite: "自动改稿",
  state_candidates: "记忆同步",
  state: "记忆同步",
  export: "正式入库",
  chapter_completed: "完成",
  completed: "完成",
};

function compactText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function compactFactText(item = {}) {
  return compactText(
    item.state
      || item.change
      || item.item
      || item.event
      || item.hook
      || item.fact
      || item.description
      || item.note
      || item.value
      || item.name
      || item.summary
      || item.preview,
    "",
  );
}

function modelCallSummary(call = {}) {
  const provider = call.provider || call.selected_provider || call.route?.provider || "";
  const model = call.model || call.selected_model || call.route?.model || "";
  return {
    task_type: call.task_type || call.taskType || "",
    label: call.label || call.task_label || call.task_type || "",
    provider,
    model,
    display_model: displayModelName(provider, model),
    cost_cny: Number(call.cost_cny || call.estimated_cost_cny || 0),
    elapsed_ms: Number(call.elapsed_ms || call.duration_ms || 0),
  };
}

function buildPipelineSteps({ card, content, review, quality, state, checkpoint } = {}) {
  const lastStep = checkpoint?.last_step || "";
  const stopped = quality?.status === "stopped" || Boolean(quality?.stop);
  const finalGrade = quality?.final_grade || review?.grade || content?.grade || null;
  return [
    {
      key: "chapter_card",
      label: "章卡",
      status: card ? "done" : lastStep === "chapter_card" ? "running" : "pending",
      detail: card?.display_title || card?.title || "",
    },
    {
      key: "write",
      label: "正文",
      status: content?.status === "ready" ? "done" : lastStep === "write" ? "running" : "pending",
      detail: content?.word_count ? `${content.word_count} 字` : "",
    },
    {
      key: "review",
      label: "审稿",
      status: review || quality ? "done" : lastStep === "review" ? "running" : "pending",
      detail: finalGrade ? `${finalGrade}级` : "",
    },
    {
      key: "rewrite",
      label: "自动改稿/重写",
      status: Number(quality?.rewrite_count || 0) > 0 ? "done" : lastStep === "rewrite" ? "running" : "skipped",
      detail: Number(quality?.rewrite_count || 0) > 0 ? `${quality.rewrite_count} 次` : "达标未触发",
    },
    {
      key: "memory",
      label: "记忆同步",
      status: state ? "done" : lastStep === "state_candidates" || lastStep === "state" ? "running" : "pending",
      detail: state ? `${[
        ...(state.characters || []),
        ...(state.foreshadowing_added || []),
        ...(state.timeline || []),
      ].length} 条` : "",
    },
    {
      key: "export",
      label: "正式入库",
      status: content?.export_path || quality?.export_path ? "done" : lastStep === "export" ? "running" : "pending",
      detail: stopped ? "未通过门禁" : "",
    },
  ];
}

async function buildChapterEditorReport(project, chapterNo) {
  const [card, content, review, quality, state, checkpoint] = await Promise.all([
    readChapterJsonIfExists(chapterCardFile(project, chapterNo), chapterNo),
    buildChapterContent(project, chapterNo),
    buildChapterReview(project, chapterNo),
    readChapterJsonIfExists(qualityReportFile(project, chapterNo), chapterNo),
    readChapterJsonIfExists(stateCandidatesFile(project, chapterNo), chapterNo),
    readChapterJsonIfExists(chapterQualityCheckpointFile(project, chapterNo), chapterNo),
  ]);
  const latestVersion = versionFromDraftPath(content?.draft_path || content?.path || "");
  const latestReviewWins = Boolean(review?.review_path && quality?.path && (
    await fileMtimeMs(review.review_path) >= await fileMtimeMs(quality.path)
    || await fileMtimeMs(content?.draft_path || content?.path || "") > await fileMtimeMs(quality.path)
  ));
  const finalGrade = review?.grade || quality?.final_grade || content?.grade || null;
  const publishGate = latestReviewWins
    ? publishGateFromReview(review, review?.publish_gate)
    : publishGateSummary(quality?.publish_gate || review?.publish_gate || content?.publish_gate || null);
  const normalizedStatus = publishGate.publish_ready
    ? "approved"
    : latestReviewWins && content?.status === "ready"
      ? "approved"
      : quality?.status || (content?.status === "ready" ? "approved" : "empty");
  const rewriteCount = Number(quality?.rewrite_count || 0);
  const memoryCount = state ? [
    ...(state.characters || []),
    ...(state.relationships || []),
    ...(state.business_state || []),
    ...(state.money_orders || []),
    ...(state.foreshadowing_added || []),
    ...(state.foreshadowing_resolved || []),
    ...(state.timeline || []),
    ...(state.risks || []),
  ].length : 0;
  return {
    status: normalizedStatus,
    chapter_no: chapterNo,
    final_grade: finalGrade,
    publish_gate: publishGate,
    publish_ready: publishGate.publish_ready,
    publish_status: publishGate.label,
    final_version: latestReviewWins && latestVersion ? latestVersion : quality?.final_version || latestVersion || "v1",
    rewrite_count: rewriteCount,
    pipeline: buildPipelineSteps({ card, content, review, quality, state, checkpoint }),
    model_calls: Array.isArray(quality?.model_calls) ? quality.model_calls.map(modelCallSummary) : [],
    quality_metrics: quality?.quality_metrics || review?.quality_metrics || {},
    auto_rules: [
      { key: "chapter_card", label: "章卡约束", ok: Boolean(card) },
      { key: "review", label: "发布级审稿", ok: Boolean(review?.status === "ready" || quality) },
      { key: "rewrite", label: "未过自动改稿", ok: publishGate.publish_ready || rewriteCount > 0 },
      { key: "publish_gate", label: "发布门禁", ok: publishGate.publish_ready },
      { key: "memory", label: "上下文记忆同步", ok: Boolean(state) },
      { key: "export", label: "达标正式入库", ok: Boolean(content?.export_path || quality?.export_path) },
    ],
    memory_sync: {
      status: state ? "synced" : "pending",
      count: memoryCount,
      characters: (state?.characters || []).slice(0, 5),
      foreshadowing_added: (state?.foreshadowing_added || []).slice(0, 5),
      foreshadowing_resolved: (state?.foreshadowing_resolved || []).slice(0, 5),
      timeline: (state?.timeline || []).slice(0, 5),
      risks: (state?.risks || []).slice(0, 5),
      path: state?.path || await firstExistingPath(legacyChapterFileCandidates(stateCandidatesFile(project, chapterNo), chapterNo)),
    },
    stop: publishGate.publish_ready || latestReviewWins ? null : quality?.stop || null,
    failure_summary: publishGate.publish_ready || latestReviewWins ? null : quality?.failure_summary || null,
    report_path: quality?.path || await firstExistingPath(legacyChapterFileCandidates(qualityReportFile(project, chapterNo), chapterNo)),
    message: quality || state || review?.status === "ready"
      ? "已读取真实自动编辑产物。"
      : "这一章还没有完整自动编辑报告。点击写作后会逐步生成。",
  };
}

async function buildProjectMemory(project) {
  const progress = await inferProjectProgress(project);
  const chapterNumbers = progress.completed_chapter_numbers || [];
  const memory = {
    status: chapterNumbers.length ? "ready" : "empty",
    project_title: project.title,
    completed_chapters: chapterNumbers.length,
    characters: [],
    relationships: [],
    business_state: [],
    money_orders: [],
    foreshadowing_added: [],
    foreshadowing_resolved: [],
    timeline: [],
    risks: [],
    source_files: [],
    updated_at: null,
  };
  for (const chapterNo of chapterNumbers) {
    const state = await readChapterJsonIfExists(stateCandidatesFile(project, chapterNo), chapterNo);
    if (!state) continue;
    memory.source_files.push(state.path || await firstExistingPath(legacyChapterFileCandidates(stateCandidatesFile(project, chapterNo), chapterNo)));
    for (const key of ["characters", "relationships", "business_state", "money_orders", "foreshadowing_added", "foreshadowing_resolved", "timeline", "risks"]) {
      const items = Array.isArray(state[key]) ? state[key] : [];
      for (const item of items) {
        memory[key].push({ chapter_no: chapterNo, text: compactFactText(item), ...item });
      }
    }
    memory.updated_at = state.meta?.created_at || memory.updated_at;
  }
  memory.summary = {
    characters: memory.characters.length,
    foreshadowing_open: Math.max(0, memory.foreshadowing_added.length - memory.foreshadowing_resolved.length),
    timeline: memory.timeline.length,
    risks: memory.risks.length,
    source_files: memory.source_files.length,
  };
  return memory;
}

async function inferProjectProgress(project) {
  const runReport = await readJsonIfExists(runReportFile(project));
  const gradeCounts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  const completedChapters = [];
  const projectCurrent = positiveIntegerOrNull(project.current_chapter) || 1;
  const reportNext = positiveIntegerOrNull(runReport?.next_chapter);
  const reportCompleted = Array.isArray(runReport?.completed_chapters)
    ? runReport.completed_chapters
        .map((chapterNo) => positiveIntegerOrNull(chapterNo))
        .filter(Boolean)
    : [];
  const scanLimit = Math.max(projectCurrent, reportNext || 1, ...reportCompleted, 200);

  let latestCompletedChapter = 0;
  let latestGrade = null;
  for (let chapterNo = 1; chapterNo <= scanLimit; chapterNo += 1) {
    const review = await readChapterJsonIfExists(reviewFile(project, chapterNo), chapterNo);
    const grade = review?.grade;
    const quality = await readChapterJsonIfExists(qualityReportFile(project, chapterNo), chapterNo);
    const version = quality?.final_version || "v1";
    const manuscript = await readChapterManuscript(project, chapterNo, version);
    const hasFormalExport = manuscript.hasExport && manuscript.cleanText && !manuscript.isMock;
    if (hasFormalExport && Object.prototype.hasOwnProperty.call(gradeCounts, grade)) {
      gradeCounts[grade] += 1;
      completedChapters.push(chapterNo);
      latestCompletedChapter = Math.max(latestCompletedChapter, chapterNo);
      latestGrade = grade;
    }
  }

  if (!latestCompletedChapter && reportCompleted.length) {
    const formalReportCompleted = [];
    for (const chapterNo of reportCompleted) {
      const quality = await readChapterJsonIfExists(qualityReportFile(project, chapterNo), chapterNo);
      const manuscript = await readChapterManuscript(project, chapterNo, quality?.final_version || "v1");
      if (manuscript.hasExport && manuscript.cleanText && !manuscript.isMock) {
        formalReportCompleted.push(chapterNo);
      }
    }
    if (formalReportCompleted.length) {
      latestCompletedChapter = Math.max(...formalReportCompleted);
      completedChapters.push(...formalReportCompleted.filter((chapterNo) => !completedChapters.includes(chapterNo)));
    }
  }

  const nextChapter = Math.max(projectCurrent, reportNext || 1, latestCompletedChapter + 1 || 1);
  return {
    current_chapter: nextChapter,
    next_chapter: nextChapter,
    latest_completed_chapter: latestCompletedChapter || null,
    completed_chapters: completedChapters.length,
    completed_chapter_numbers: completedChapters,
    latest_grade: latestGrade,
    grade_counts: gradeCounts,
    run_report: runReport || null,
    stale_project_current_chapter: projectCurrent < nextChapter ? projectCurrent : null,
  };
}

async function buildDashboard(project) {
  const status = await buildProjectStatus(project);
  const cost = await summarizeProjectCost(project);
  const progress = await inferProjectProgress(project);
  const gradeCounts = progress.grade_counts;
  const latestActivity = [];
  const scanLimit = Math.max(progress.current_chapter || 1, 200);

  for (let chapterNo = 1; chapterNo <= scanLimit; chapterNo += 1) {
    const review = await readJsonIfExists(reviewFile(project, chapterNo));
    const grade = review?.grade;
    if (Object.prototype.hasOwnProperty.call(gradeCounts, grade)) {
      latestActivity.push({
        type: "review",
        chapter_no: chapterNo,
        grade,
        created_at: review.created_at || null,
      });
    }
  }

  const runReport = progress.run_report;
  if (runReport) {
    latestActivity.push({
      type: "run_report",
      status: runReport.status || null,
      next_chapter: runReport.next_chapter || null,
      created_at: runReport.created_at || null,
    });
  }

  latestActivity.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  return {
    project_title: project.title,
    project_path: project.path,
    directories: status.directories,
    current_chapter: progress.current_chapter,
    next_chapter: progress.next_chapter,
    latest_completed_chapter: progress.latest_completed_chapter,
    completed_chapters: progress.completed_chapters,
    estimated_cost_cny: cost.estimated_cost_cny,
    total_model_calls: cost.total_calls,
    model_routes: status.model_routes,
    api_keys: status.api_keys,
    ready: status.ready,
    grade_counts: gradeCounts,
    latest_grade: progress.latest_grade,
    latest_activity: latestActivity.slice(0, 8),
  };
}

async function listProjects(root) {
  if (!root) {
    throw new Error("root is required");
  }
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectPath = `${root}\\${entry.name}`;
    try {
      const project = await loadProject(projectPath);
      const progress = await inferProjectProgress(project);
      projects.push({
        title: project.title,
        path: project.path,
        author_name: project.author_name || "",
        cover_path: project.cover_path || "",
        cover_url: project.cover_path ? projectCoverRelativeUrl(project, project.cover_path) : project.cover_url || "",
        cover_prompt: project.cover_prompt || "",
        platform: project.platform || "",
        channel: project.channel || "",
        genre: project.genre || "",
        current_chapter: progress.current_chapter || project.current_chapter,
        latest_completed_chapter: progress.latest_completed_chapter,
        completed_chapters: progress.completed_chapters,
        latest_grade: progress.latest_grade,
        status: progress.completed_chapters > 0 ? "进行中" : "待开写",
        updated_at: project.updated_at || project.created_at,
      });
    } catch {
      // Ignore non-project directories.
    }
  }
  projects.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  return {
    root,
    projects,
    empty_message: projects.length ? "" : "还没有项目，在上方创建第一个。",
  };
}

function ensureInsideWorkspace(root, projectPath) {
  const resolvedRoot = path.resolve(String(root || ""));
  const resolvedProject = path.resolve(String(projectPath || ""));
  const relative = path.relative(resolvedRoot, resolvedProject);
  if (!resolvedRoot || !resolvedProject || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new HttpError(400, "项目不在当前工作区内，不能从这里移除。");
  }
  if (relative.includes(path.sep)) {
    throw new HttpError(400, "只能移除工作区第一层的作品目录。");
  }
  return { resolvedRoot, resolvedProject };
}

async function trashProject({ root, projectPath }) {
  const { resolvedRoot, resolvedProject } = ensureInsideWorkspace(root, projectPath);
  const project = await loadProject(resolvedProject);
  const trashRoot = path.join(resolvedRoot, ".octosage-trash");
  await mkdir(trashRoot, { recursive: true });
  const baseName = path.basename(resolvedProject);
  const target = path.join(trashRoot, `${baseName}_${timestampSuffix()}`);
  await rename(resolvedProject, target);
  return {
    status: "trashed",
    title: project.title,
    original_path: resolvedProject,
    trash_path: target,
    message: "作品已移到工作区回收站，可从文件夹中手动恢复。",
  };
}

async function buildChapterCard(project, chapterNo) {
  const target = chapterCardFile(project, chapterNo);
  const card = await readJsonIfExists(target);
  return {
    status: card ? "ready" : "empty",
    chapter_no: chapterNo,
    card,
    path: target,
    text: card ? JSON.stringify(card, null, 2) : "",
    message: card ? "已读取本章章卡。" : "这一章还没有章卡。",
  };
}

async function saveChapterCard(project, { chapterNo = 1, content = "" } = {}) {
  const text = String(content || "");
  if (!text.trim()) throw new HttpError(400, "章卡内容不能为空。");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {
      chapter_no: chapterNo,
      note: text,
      updated_at: new Date().toISOString(),
    };
  }
  const target = chapterCardFile(project, chapterNo);
  await writeJson(target, parsed);
  return { status: "saved", chapter_no: chapterNo, path: target };
}

async function buildProjectOutline(project) {
  const candidates = [
    path.join(project.path, "项目圣经.md"),
    path.join(project.path, "大纲.md"),
    path.join(project.path, "outline.md"),
    path.join(project.path, "bible.md"),
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return {
        status: "ready",
        path: candidate,
        text: await readFile(candidate, "utf8"),
      };
    }
  }
  return {
    status: "empty",
    path: candidates[0],
    text: "",
    message: "还没有项目圣经或大纲文件。",
  };
}

function resolveProjectArtifactPath(project, requestedPath = "") {
  const raw = String(requestedPath || "");
  if (!raw) throw new HttpError(400, "artifact path is required");
  const resolved = path.resolve(raw);
  const projectRoot = path.resolve(project.path);
  const relative = path.relative(projectRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new HttpError(400, "只能读取当前作品文件夹内的规划文件。");
  }
  return resolved;
}

async function buildProjectArtifact(project, requestedPath = "") {
  const target = resolveProjectArtifactPath(project, requestedPath);
  if (!(await fileExists(target))) {
    return {
      status: "empty",
      path: target,
      text: "",
      message: "这个规划文件还没有生成。",
    };
  }
  const text = await readFile(target, "utf8");
  return {
    status: text.trim() ? "ready" : "empty",
    path: target,
    text,
  };
}

async function saveProjectArtifact(project, { path: artifactPath = "", content = "" } = {}) {
  const text = String(content || "");
  if (!text.trim()) throw new HttpError(400, "规划内容不能为空。");
  const target = resolveProjectArtifactPath(project, artifactPath);
  await writeText(target, text.trimEnd() + "\n");
  return { status: "saved", path: target };
}

async function saveProjectOutline(project, content = "") {
  const text = String(content || "");
  if (!text.trim()) throw new HttpError(400, "大纲内容不能为空。");
  const target = path.join(project.path, "项目圣经.md");
  await writeText(target, text.trimEnd() + "\n");
  return { status: "saved", path: target };
}

async function countFilesInDir(dir, pattern = null) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile() && (!pattern || pattern.test(entry.name))).length;
}

async function buildProjectTree(project) {
  const treePath = path.join(project.path, "项目树.json");
  const tasksDir = path.join(project.path, "tasks");
  const tree = await readJsonIfExists(treePath, null);
  const planningAssets = [
    { key: "bible", label: "项目圣经", path: path.join(project.path, "项目圣经.md"), description: "主线、人设、商业承诺和长期伏笔。" },
      { key: "outline", label: "总纲", path: path.join(project.path, "大纲", "总纲.md"), description: "整本书的故事骨架和阶段目标。" },
      { key: "settings", label: "设定库", path: path.join(project.path, "设定", "设定库.md"), description: "人物、世界、平台、商业规则等设定。" },
      { key: "relationships", label: "人物关系", path: path.join(project.path, "设定", "人物关系.md"), description: "核心人物功能位、关系牵引和冲突连接。" },
      { key: "volume", label: "全书卷纲", path: path.join(project.path, "卷纲", "全书卷纲.md"), description: "按目标字数拆出的分卷节奏、阶段反转和长线升级。" },
    { key: "fine_outline", label: "前30章细纲", path: path.join(project.path, "细纲", "前30章.md"), description: "开局三十章的逐章目标、冲突、爽点和钩子。" },
    { key: "planning_review", label: "规划审核", path: path.join(project.path, "reports", "project_planning_review.md"), description: "开书规划门禁、逻辑可信度和返工记录。" },
  ];
  const planning = await Promise.all(planningAssets.map(async (asset) => ({
    ...asset,
    status: await fileExists(asset.path) ? "ready" : "missing",
  })));
  const planningReview = tree?.planning_review || await readJsonIfExists(path.join(project.path, "reports", "project_planning_review.json"), null);
  const cardCount = await countFilesInDir(path.join(project.path, "章卡"), /\.json$/i);
  const draftCount = await countFilesInDir(path.join(project.path, "正文"), /\.txt$/i);
  const reviewCount = await countFilesInDir(path.join(project.path, "审稿"), /\.json$/i);
  const referenceFiles = await readdir(tasksDir, { withFileTypes: true }).catch(() => []);
  const referenceStructureCount = referenceFiles.filter((entry) => entry.isFile() && /^reference_.*_structure\.json$/i.test(entry.name)).length;
  const rhythmPlanCount = referenceFiles.filter((entry) => entry.isFile() && /^rhythm_transfer_.*\.json$/i.test(entry.name)).length;
  const referenceLibraryPath = path.join(tasksDir, "reference_library.json");
  const referenceLibrary = await readJsonIfExists(referenceLibraryPath, { references: [] });
  const domainKnowledgePath = path.join(tasksDir, "domain_knowledge.json");
  const domainKnowledge = await readJsonIfExists(domainKnowledgePath, { entries: [] });
  const memoryIndexPath = path.join(tasksDir, "memory_index.json");
  const memoryIndex = await readJsonIfExists(memoryIndexPath, null);
  return {
    status: "ready",
    path: treePath,
    tree,
    branches: [
      {
        key: "planning",
        label: "开书规划",
        status: planningReview?.status && planningReview.status !== "pass"
          ? "review_failed"
          : planning.every((item) => item.status === "ready") ? "ready" : "partial",
        description: planningReview?.score ? `规划审核 ${planningReview.score}/100` : "",
        children: planning,
      },
      {
        key: "chapters",
        label: "章节生产",
        status: draftCount > 0 ? "ready" : "empty",
        children: [
          { key: "cards", label: "章卡", status: cardCount > 0 ? "ready" : "empty", count: cardCount, path: path.join(project.path, "章卡") },
          { key: "drafts", label: "正文", status: draftCount > 0 ? "ready" : "empty", count: draftCount, path: path.join(project.path, "正文") },
          { key: "reviews", label: "审稿", status: reviewCount > 0 ? "ready" : "empty", count: reviewCount, path: path.join(project.path, "审稿") },
        ],
      },
      {
        key: "quality",
        label: "自动编辑质量线",
        status: memoryIndex ? "ready" : "empty",
        children: [
          { key: "memory", label: "项目记忆库", status: memoryIndex ? "ready" : "empty", path: memoryIndexPath },
          { key: "domain", label: "领域知识库", status: (domainKnowledge.entries || []).length ? "ready" : "empty", count: (domainKnowledge.entries || []).length, path: domainKnowledgePath },
        ],
      },
      {
        key: "reference",
        label: "拆书与节奏迁移",
        status: referenceStructureCount || rhythmPlanCount ? "ready" : "empty",
        children: [
          { key: "reference_library", label: "对标书结构库", status: (referenceLibrary.references || []).length ? "ready" : "empty", count: (referenceLibrary.references || []).length, path: referenceLibraryPath },
          { key: "reference_structures", label: "拆书结构指纹", status: referenceStructureCount ? "ready" : "empty", count: referenceStructureCount, path: tasksDir },
          { key: "rhythm_plans", label: "节奏迁移方案", status: rhythmPlanCount ? "ready" : "empty", count: rhythmPlanCount, path: tasksDir },
        ],
      },
    ],
    actions: [
      { key: "reference_read", label: "拆对标书", description: "导入授权可见章节，只保存结构指纹，不保存原文。" },
      { key: "domain_build", label: "建领域知识", description: "把题材资料整理成写作时自动调用的知识库。" },
      { key: "write", label: "写作质检闭环", description: "写正文后自动审稿、低分重写、同步记忆。" },
    ],
  };
}

function planningJsonFromText(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(raw);
  const body = fenced ? fenced[1].trim() : raw;
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    const first = body.indexOf("{");
    const last = body.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        const parsed = JSON.parse(body.slice(first, last + 1));
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {
      }
    }
    const balanced = extractFirstJsonObject(body);
    if (balanced) {
      try {
        const parsed = JSON.parse(balanced);
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {
      }
    }
    return null;
  }
}

function extractFirstJsonObject(text = "") {
  const source = String(text || "");
  const start = source.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

function normalizeTargetWordsInput(value, fallback = 2000000) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(50000, Math.min(10000000, Math.round(numeric)));
}

function normalizeCharacterNameList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12);
  }
  return String(value || "")
    .split(/[、,，;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function projectConstraintLines(project) {
  const supporting = normalizeCharacterNameList(project.supporting_characters);
  return [
    `目标总字数：${normalizeTargetWordsInput(project.target_words).toLocaleString("zh-CN")} 字`,
    `类型与标签：${project.genre || "未填写"}`,
    `金手指/核心优势：${project.golden_finger || "未填写，系统会按题材随机生成并写入规划"}`,
    `主角姓名：${project.protagonist_name || "未填写，必须由系统自动生成并写入人物关系"}`,
    `配角姓名：${supporting.length ? supporting.join("、") : "未填写，必须由系统自动生成 3-6 个核心配角并写入人物关系"}`,
    "第一章商业/能力动作必须提前锁定：资金来源、资源获取路径、信息来源、低成本试错、成本风险、利润波动、章尾信息控制。",
  ];
}

function projectLockedInputLines(project) {
  const supporting = normalizeCharacterNameList(project.supporting_characters);
  return [
    `目标总字数：${normalizeTargetWordsInput(project.target_words).toLocaleString("zh-CN")} 字`,
    `类型与标签：${project.genre || "未填写"}`,
    `金手指/核心优势：${project.golden_finger || "未填写，系统会按题材随机生成并写入规划"}`,
    `主角姓名：${project.protagonist_name || "未填写，必须由系统自动生成并写入人物关系"}`,
    `配角姓名：${supporting.length ? supporting.join("、") : "未填写，必须由系统自动生成 3-6 个核心配角并写入人物关系"}`,
    `金手指使用原则：${project.golden_finger || "系统生成的核心优势"}只能帮助判断方向，不能直接生成已谈好的合同、已存在的客户或无代价利润；必须通过行动、证据、成本、限制和现场反应展示。`,
  ];
}

function appendLockedInputSection(text = "", heading = "开书锁定输入", lines = []) {
  const source = String(text || "").trimEnd();
  const missing = lines.filter((line) => line && !source.includes(line));
  if (!missing.length) return source;
  return [
    source,
    "",
    `## ${heading}`,
    "",
    ...missing.map((line) => `- ${line}`),
  ].filter((line, index) => index < 2 || line !== "").join("\n").trimEnd();
}

function enforceProjectPlanningLocks(project, planning = {}) {
  const lines = projectLockedInputLines(project);
  const chapterLines = [
    ...lines,
    "细纲执行要求：每章章卡和正文都必须读取本锁定输入；第一章前300字不得倒叙解释金手指，必须用现场行动和可见结果展示。",
  ];
  return {
    ...planning,
    bible: appendLockedInputSection(planning.bible, "开书锁定输入", lines),
    settings: appendLockedInputSection(planning.settings, "开书锁定输入", lines),
    relationships: appendLockedInputSection(planning.relationships, "人物与能力锁定", lines),
    volume: appendLockedInputSection(planning.volume, "长篇承载锁定", lines),
    chapterPlan: appendLockedInputSection(planning.chapterPlan, "细纲硬约束", chapterLines),
  };
}

function openingRuleProfile(project) {
  const text = `${project.genre || ""} ${project.idea || ""}`;
  if (/悬疑|刑侦|推理|诡秘|民俗|探案|法医|都市异闻|长线谜团/.test(text)) {
    return {
      label: "悬疑探案",
      rules: [
        "谜题链必须公平：线索、误导、嫌疑人动机和信息遮蔽要提前埋入设定。",
        "每章至少推进一个线索或反转，不能只靠氛围拖延。",
        "案件逻辑、人物行动路径和证据来源必须能复盘。",
      ],
    };
  }
  if (/科幻|末世|星际|机甲|赛博|基因|人工智能|废土|宇宙文明|灾变|基地建设/.test(text)) {
    return {
      label: "科幻末世",
      rules: [
        "技术或灾变规则必须有边界、代价和可验证现象。",
        "生存、资源、组织和外部威胁要形成长期升级压力。",
        "不要用概念替代场景，每章要有具体危机、选择和结果。",
      ],
    };
  }
  if (/历史|宋朝|大宋|明朝|唐朝|三国|穿越|种田|茶|寒门|科举|争霸|权谋|盐商|基建/.test(text)) {
    return {
      label: "历史经营",
      rules: [
        "时代约束：技术、制度、交通、货币和权力结构必须符合年代。",
        "经营链路：每个赚钱动作都要有原料、渠道、成本、风险和对手。",
        "人物信息路径：官员、商户、家族人物不能凭空出现。",
      ],
    };
  }
  if (/玄幻|修仙|高武|升级|宗门|灵气|仙侠|废柴|家族|御兽|凡人流|剑修|丹药|阵法|洪荒|西游/.test(text)) {
    return {
      label: "玄幻升级",
      rules: [
        "境界体系要清楚：资源、代价、战力边界和越级条件必须写进设定。",
        "敌我阶梯要可持续：每个阶段都有地图、资源和更强阻力。",
        "功法和外挂不能无代价解决一切。",
      ],
    };
  }
  if (/奇幻|领主|西幻|魔法|骑士|地下城|冒险团|龙族|神明|王国经营|蒸汽朋克|巫师/.test(text)) {
    return {
      label: "奇幻领主",
      rules: [
        "世界规则、魔法代价、领地资源和阵营关系必须先锁定。",
        "主角每阶段都要扩张可见资产：土地、人口、军队、技术、贸易或信仰。",
        "敌人不能只靠邪恶标签推动，要有地缘、资源、信仰或王权动机。",
      ],
    };
  }
  if (/武侠|江湖|门派|镖局|刀剑|侠客|武馆|朝堂|复仇/.test(text)) {
    return {
      label: "武侠江湖",
      rules: [
        "江湖规矩、门派利益、武力边界和朝堂压力必须可复盘。",
        "恩怨推进要有旧债、新债和可见代价，不能只靠偶遇开打。",
        "每个高手出场要有信息路径、立场和后续牵引。",
      ],
    };
  }
  if (/游戏|副本|玩家|梦幻西游|网游|面板|电竞|开服|公会|交易行|卡牌|模拟经营|全民转职|规则怪谈|无限流|聊天群|模拟器|词条|系统流|绑定系统|签到系统|抽奖系统|任务系统|属性系统/.test(text)) {
    return {
      label: "游戏系统",
      rules: [
        "系统规则和数值边界必须先锁定，不能临时开挂。",
        "副本、奖励、社交生态和玩家误判要形成循环爽点。",
        "每章必须有具体任务、可见奖励或规则升级。",
      ],
    };
  }
  if (/军事|特种兵|谍战|战争|军工|雇佣兵|抗战|现代战争|指挥官|后勤/.test(text)) {
    return {
      label: "军事行动",
      rules: [
        "任务目标、情报来源、行动约束、装备边界和组织纪律必须可信。",
        "爽点来自战术执行、团队配合和代价承担，不靠无脑神枪手。",
        "每个战果都要有后勤、情报、风险和外部反应。",
      ],
    };
  }
  if (/体育|足球|篮球|青训|教练|运动员|冠军|竞技|联赛/.test(text)) {
    return {
      label: "体育竞技",
      rules: [
        "训练、比赛、商业和队友关系要形成循环推进。",
        "成长必须有数据、技术动作、战术位置或心理变化支撑。",
        "每场比赛要有明确目标、对位压力、临场选择和赛后影响。",
      ],
    };
  }
  if (/现实|职场|乡村|行业文|治愈|烟火气|小人物逆袭/.test(text)) {
    return {
      label: "现实行业",
      rules: [
        "行业细节要具体：岗位、流程、成本、客户、规则和现实阻力必须落地。",
        "爽点来自解决真实问题后的公开反馈，不靠凭空成功。",
        "人物关系要有生活压力和利益牵引，避免纯工具人。",
      ],
    };
  }
  if (/现言|古言|豪门|甜宠|先婚后爱|破镜重圆|宫斗|宅斗|女强|女性成长|追妻|医妃|侯府|庶女/.test(text)) {
    return {
      label: "情感成长",
      rules: [
        "情感线必须有契约、误会、选择、代价和阶段性修复。",
        "女性成长或关系推进要靠行动证据，不靠单方解释和强行偏爱。",
        "家族、职场、宫廷或阶层压力要进入人物动机，不能只当背景板。",
      ],
    };
  }
  if (/轻小说|青春|社团|异世界|搞笑|超能力/.test(text)) {
    return {
      label: "轻小说青春",
      rules: [
        "角色关系、口吻和日常事件要形成可持续互动。",
        "设定必须服务人物选择和笑点/反差，不要堆概念。",
        "每章要有清晰小目标、互动变化和章尾期待。",
      ],
    };
  }
  if (/都市|日常|娱乐|神豪|恋爱|家庭/.test(text) && !/商战|创业|重生|外卖|公司|软件|程序/.test(text)) {
    return {
      label: "都市日常",
      rules: [
        "关系张力和生活锚点要比空泛成功更重要。",
        "爽点来自误会转化、公开验证、人物反应和短周期结果。",
        "对话必须角色化，避免所有人像总结报告。",
      ],
    };
  }
  return {
    label: "重生商战",
    rules: [
      "时间线可信：当前年份不能提前出现未来结果。",
      "能力来源可信：技术、商业、人脉必须来自前史、重生信息差或剧情积累。",
      "第一桶金路径清楚：痛点、资源、成本、执行、公开验证都要落地。",
      "每章都要有可见结果，避免纯解释型创业复盘。",
    ],
  };
}

function serverLocalProjectPlanning(project) {
  const title = project.title || "新书";
  const idea = String(project.idea || title || "").trim();
  const genre = project.genre || "网文";
  const platform = project.platform || "fanqie";
  const ruleProfile = openingRuleProfile(project);
  const targetWords = normalizeTargetWordsInput(project.target_words);
  const estimatedChapters = Math.max(30, Math.ceil(targetWords / 2600));
  const estimatedVolumes = Math.max(1, Math.ceil(estimatedChapters / 50));
  const volumeCount = estimatedVolumes;
  const stageCount = Math.min(Math.max(12, Math.ceil(estimatedChapters / 60)), 18);
  const chaptersPerStage = Math.ceil(estimatedChapters / stageCount);
  const protagonistName = String(project.protagonist_name || "").trim();
  const supportingCharacters = normalizeCharacterNameList(project.supporting_characters);
  const protagonistLine = protagonistName
    ? `主角姓名锁定为：${protagonistName}。规划和正文不得擅自更名。`
    : "主角姓名未填写，开书规划必须自动生成一个符合题材气质的主角姓名，并在人物关系里说明能力来源。";
  const supportingLine = supportingCharacters.length
    ? `核心配角姓名锁定为：${supportingCharacters.join("、")}。每个人都必须有功能位、动机和首次出场路径。`
    : "配角姓名未填写，开书规划必须自动生成 3-6 个核心配角，并给出功能位、动机和首次出场路径。";
  const needsCredibilityBridge = /外卖|快递|保安|摆摊|打工/.test(idea)
    && /软件|程序|开发|代码|黑客|AI|人工智能|算法/.test(idea);
  const credibility = needsCredibilityBridge
    ? "如果主角具备软件/技术能力，必须提前交代：他原本有相关学习或从业经历，因裁员、家庭压力或创业失败暂时从事外卖等工作，不能凭空突然会写软件。"
    : "所有能力必须有来源：重生信息差、过往职业经历、家庭背景、学习积累或剧情中明确获得的资源。";
  const bible = [
    `# ${title}`,
    "",
    `一句话创意：${idea}`,
    "",
    "## 核心卖点",
    "",
    `- 题材与平台：${platform} / ${genre}`,
    `- 目标总字数：${targetWords.toLocaleString("zh-CN")} 字。必须拆成可连载的阶段弧，不允许只有短期开局热闹、后面无长线。`,
    `- ${protagonistLine}`,
    `- ${supportingLine}`,
    "- 第一章前 300 字必须出现明确冲突、目标或反差，不用大段背景说明开篇。",
    "- 每章至少有一个可见进展，一个读者能感知的收益或反转。",
    `- 预计章节容量：约 ${estimatedChapters} 章，按 ${stageCount} 个阶段、${estimatedVolumes} 个卷纲节点承载。`,
    "",
    `## ${ruleProfile.label}开书规则`,
    "",
    ...ruleProfile.rules.map((rule) => `- ${rule}`),
    "",
    "## 逻辑可信线",
    "",
    `- ${credibility}`,
    "- 每个商业动作必须有成本、资源、时间和阻力，不允许凭空成功。",
    "- 第一章商业动作必须先锁定：资金来源、资源获取路径、信息来源、低成本试单、成本风险、利润波动和章尾信息控制。",
    "- 金手指只能帮助判断方向，不能直接生成已谈好的合同、已存在的客户或无代价利润。",
    "- 角色行为要服务当下处境，不用旁白替人物证明聪明。",
    "",
    "## 自动编辑硬规则",
    "",
    "- 写完即审稿；D/E 级不入库，必须重写或回退章卡。",
    "- 第一章重点审前 300 字：开头钩子、主角目标、信息差、行动感。",
    "- 状态记忆每章同步，人物能力、伏笔、时间线和商业状态不能丢。",
    "- 正文生成必须先读项目圣经、总纲、全书卷纲、当前卷纲、前30章细纲、章卡和状态记忆；不得脱离这些规划临场乱写。",
    "",
  ].join("\n");
  const settings = [
    `# ${title} · 设定库`,
    "",
    `- 初始创意：${idea}`,
    `- 目标总字数：${targetWords.toLocaleString("zh-CN")} 字`,
    `- 主角约束：${protagonistLine}`,
    `- 配角约束：${supportingLine}`,
    `- 能力解释：${credibility}`,
    "- 待锁定：主角姓名、年龄、前史、第一场景、主要阻力、第一章可见结果。",
    "- 长期伏笔池和每 10 章回收检查点会随写作自动更新。",
    "",
  ].join("\n");
  const relationships = [
    `# ${title} · 人物关系`,
    "",
    "## 核心关系组",
    "",
    "- 主角：行动中心，所有能力和选择必须有可信来源。",
    "- 搭档/同盟：补足主角信息、人脉或执行短板，负责制造互动节奏。",
    "- 对手/阻力：代表资源、规则、旧秩序或认知差距，不只负责找茬。",
    "- 家人/情感牵引：提供现实压力和主角不能退的理由。",
    "- 关键商户/平台方/师长：承担资源交换、规则门槛和阶段升级。",
    "",
    "## 关系推进规则",
    "",
    "- 每个主要人物出场都要带一个明确诉求。",
    "- 关系变化必须由事件推动：帮忙、误会、交易、竞争、背叛或共同利益。",
    "- 新人物会在写作后进入状态记忆；开书阶段先锁定人物功能位和冲突连接。",
    "",
  ].join("\n");
  const stageLines = Array.from({ length: stageCount }, (_, index) => {
    const stageNo = index + 1;
    const from = index * chaptersPerStage + 1;
    const to = Math.min(estimatedChapters, (index + 1) * chaptersPerStage);
    const label = stageNo === 1
      ? "开局验证"
      : stageNo === 2
        ? "规则成型"
        : stageNo === stageCount
          ? "终局兑现"
          : `升级扩张${stageNo - 2}`;
    return `- 第 ${stageNo} 阶段（约第 ${from}-${to} 章，${label}）：阶段必须有目标、对手、资源升级、关系变化、伏笔债和结尾反转。`;
  });
  const volumeLines = Array.from({ length: volumeCount }, (_, index) => {
    const volumeNo = index + 1;
    const from = index * 50 + 1;
    const to = Math.min(estimatedChapters, (index + 1) * 50);
    return `## 第 ${volumeNo} 卷 · 第 ${from}-${to} 章\n- 卷目标：围绕“${idea || title}”推进一个可见升级，不重复上一卷爽点。\n- 核心阻力：资源、规则、人物关系和外部竞争至少两条同时加压。\n- 兑现要求：卷末必须回收本卷关键伏笔，并抬出下一卷更高层级目标。`;
  });
  const volume = [
    `# ${title} · 全书卷纲`,
    "",
    `目标总字数：${targetWords.toLocaleString("zh-CN")} 字。预计约 ${estimatedChapters} 章。`,
    "",
    "## 全书阶段弧",
    "",
    ...stageLines,
    "",
    "## 分卷承载",
    "",
    ...volumeLines,
    "",
    "## 第一卷执行细化",
    "",
    "- 第 1 章：用强场面进入创意，前 300 字给冲突/目标/反差。",
    "- 第 1 章商业可行性：写清启动资金从哪里来、第一家商户/客户信息从哪里来、先做什么低成本试单、可能亏在哪里、章尾只露一个新变量。",
    "- 第 2-3 章：兑现第一个小结果，证明主角能力来源可信。",
    "- 第 4-10 章：扩大执行面，引入规则阻力、竞争者或资源短缺。",
    "- 第 11-20 章：关系线和商业线同时加压，避免单线重复。",
    "- 第 21-30 章：集中兑现伏笔，完成第一阶段成果并抬出下一卷目标。",
    "",
  ].join("\n");
  const chapterPlan = buildOpeningThirtyChapterPlan(project, { estimatedChapters });
  return { bible, settings, relationships, volume, chapterPlan, source: "local-rules" };
}

function normalizeServerPlanning(project, parsed, fallback) {
  const markdownValue = (value, heading = "") => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) {
      return value.map((item) => {
        if (typeof item === "string") return `- ${item}`;
        return markdownValue(item);
      }).filter(Boolean).join("\n");
    }
    if (typeof value === "object") {
      const lines = [];
      if (heading) lines.push(`# ${heading}`, "");
      for (const [key, item] of Object.entries(value)) {
        if (item === null || item === undefined || item === "") continue;
        const label = String(key).replace(/_/g, " ");
        if (Array.isArray(item)) {
          lines.push(`## ${label}`);
          for (const child of item) {
            const text = markdownValue(child);
            if (text) lines.push(text.startsWith("- ") ? text : `- ${text.replace(/\n/g, "\n  ")}`);
          }
          lines.push("");
        } else if (typeof item === "object") {
          lines.push(`## ${label}`, markdownValue(item), "");
        } else {
          lines.push(`- ${label}：${String(item).trim()}`);
        }
      }
      return lines.join("\n").trim();
    }
    return String(value).trim();
  };
  const textOrFallback = (value, fallbackValue, heading) => {
    const text = markdownValue(value, heading).trim();
    if (!text || text === "[object Object]" || text.length < 80) return fallbackValue;
    return text;
  };
  const fallbackKeys = [];
  const pickText = (key, value, fallbackValue, heading) => {
    const text = markdownValue(value, heading).trim();
    if (!text || text === "[object Object]" || text.length < 80) {
      fallbackKeys.push(key);
      return fallbackValue;
    }
    return text;
  };
  const planning = {
    bible: pickText("bible", parsed?.bible || parsed?.project_bible || parsed?.["项目圣经"], fallback.bible, project.title || "项目圣经"),
    settings: pickText("settings", parsed?.settings || parsed?.setting_library || parsed?.["设定库"], fallback.settings, "设定库"),
    relationships: pickText("relationships", parsed?.relationships || parsed?.character_relationships || parsed?.["人物关系"], fallback.relationships, "人物关系"),
    volume: pickText("volume", parsed?.volume || parsed?.volume_outline || parsed?.["卷纲"], fallback.volume, "全书卷纲"),
    chapterPlan: pickText("chapter_plan", parsed?.chapter_plan || parsed?.fine_outline || parsed?.["前30章细纲"] || parsed?.["前10章细纲"], fallback.chapterPlan, "前30章细纲"),
    source: parsed ? "model" : fallback.source,
  };
  const invalid = [planning.bible, planning.settings, planning.relationships, planning.volume, planning.chapterPlan]
    .some((text) => !text || text.includes("[object Object]") || text.length < 80);
  return invalid || fallbackKeys.length
    ? { ...planning, source: parsed ? "model-partial-fallback" : fallback.source, fallback_keys: fallbackKeys }
    : planning;
}

function targetChapterCountForProject(project) {
  return Math.max(30, Math.ceil(normalizeTargetWordsInput(project.target_words) / 2600));
}

function extractMaxCoveredChapter(text = "") {
  const normalized = String(text || "");
  let max = 0;
  for (const match of normalized.matchAll(/第\s*(\d+)\s*[-~—至到]\s*(\d+)\s*章/g)) {
    max = Math.max(max, Number(match[1] || 0), Number(match[2] || 0));
  }
  for (const match of normalized.matchAll(/第\s*(\d+)\s*章/g)) {
    max = Math.max(max, Number(match[1] || 0));
  }
  return max;
}

function buildFullLengthStageLines(project, modelStages = []) {
  const title = project.title || "新书";
  const idea = String(project.idea || title || "").trim();
  const estimatedChapters = targetChapterCountForProject(project);
  const stageCount = Math.min(Math.max(12, Math.ceil(estimatedChapters / 60)), 18);
  const chaptersPerStage = Math.ceil(estimatedChapters / stageCount);
  const usableStages = Array.isArray(modelStages) ? modelStages : [];
  return Array.from({ length: stageCount }, (_, index) => {
    const stageNo = index + 1;
    const from = index * chaptersPerStage + 1;
    const to = Math.min(estimatedChapters, (index + 1) * chaptersPerStage);
    const item = usableStages[index];
    const raw = typeof item === "string"
      ? item
      : item
        ? [item.goal, item.conflict, item.payoff, item.next_hook].filter(Boolean).join("；")
        : "";
    const stageCore = raw || `围绕“${idea || title}”完成第 ${stageNo} 次资产、关系或规则升级`;
    return `- 第 ${stageNo} 阶段（第 ${from}-${to} 章）：${stageCore}；必须包含阶段目标、核心对手、资源升级、关系变化、伏笔债、卷末反转。`;
  });
}

function expandPlanningFromBrief(project, parsed, fallback) {
  if (!parsed || typeof parsed !== "object") return null;
  const title = project.title || "新书";
  const idea = String(project.idea || title || "").trim();
  const text = (value) => Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).filter(Boolean).join("\n")
    : String(value || "").trim();
  const list = (value) => {
    if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).filter(Boolean);
    return String(value || "").split(/\n+/).map((item) => item.trim()).filter(Boolean);
  };
  const premise = text(parsed.premise || parsed.core || parsed.story_core) || idea;
  const sellingPoints = list(parsed.selling_points || parsed.hooks || parsed.core_hooks).slice(0, 8);
  const constraints = list(parsed.logic_constraints || parsed.rules || parsed.constraints).slice(0, 10);
  const characters = Array.isArray(parsed.characters) ? parsed.characters.slice(0, 8) : [];
  const relationshipBeats = list(parsed.relationships || parsed.relationship_beats).slice(0, 12);
  const stages = Array.isArray(parsed.stages || parsed.volume_beats)
    ? (parsed.stages || parsed.volume_beats).slice(0, 12)
    : [];
  const chapterBeats = Array.isArray(parsed.chapter_beats || parsed.first_30)
    ? (parsed.chapter_beats || parsed.first_30).slice(0, 10)
    : [];
  if (!premise && !sellingPoints.length && !characters.length && !stages.length && !chapterBeats.length) return null;

  const characterLines = characters.map((item, index) => {
    if (typeof item === "string") return `- ${item}`;
    return `- ${item.name || `角色${index + 1}`}：${[item.role, item.motive, item.first_appearance, item.function].filter(Boolean).join("；") || JSON.stringify(item)}`;
  });
  const estimatedChapters = targetChapterCountForProject(project);
  const stageLines = buildFullLengthStageLines(project, stages);
  const chapterLines = Array.from({ length: 30 }, (_, index) => {
    const item = chapterBeats[index];
    const chapterNo = index + 1;
    if (!item) return buildStoryRoomChapterOutlineBlock(project, chapterNo);
    if (typeof item === "string") {
      return buildStoryRoomChapterOutlineBlock(project, chapterNo, { event: item });
    }
    return buildStoryRoomChapterOutlineBlock(project, chapterNo, item);
  }).filter(Boolean);

  return {
    bible: [
      fallback.bible,
      "",
      "## 模型增强方向",
      "",
      `- 故事核心：${premise}`,
      ...sellingPoints.map((item) => `- 卖点：${item}`),
      ...constraints.map((item) => `- 逻辑硬约束：${item}`),
    ].join("\n").trim(),
    settings: [
      fallback.settings,
      "",
      "## 模型补充设定",
      "",
      ...constraints.map((item) => `- ${item}`),
    ].join("\n").trim(),
    relationships: [
      `# ${title} · 人物关系`,
      "",
      "## 模型生成人物",
      "",
      ...(characterLines.length ? characterLines : fallback.relationships.split("\n").filter((line) => line.trim())),
      "",
      "## 关系推进",
      "",
      ...(relationshipBeats.length ? relationshipBeats.map((item) => `- ${item}`) : ["- 每个主要人物出场都要带明确诉求，并通过事件改变关系。"]),
    ].join("\n").trim(),
    volume: [
      `# ${title} · 全书卷纲`,
      "",
      `一句话创意：${idea}`,
      `目标总字数：${normalizeTargetWordsInput(project.target_words).toLocaleString("zh-CN")} 字。预计约 ${estimatedChapters} 章。`,
      "",
      "## 模型阶段弧",
      "",
      ...(stageLines.length ? stageLines : fallback.volume.split("\n").filter((line) => line.trim())),
    ].join("\n").trim(),
    chapterPlan: [
      `# ${title} · 前 30 章滚动细纲`,
      "",
      "本细纲由模型方向骨架和后端长篇承载规则共同生成；后续每 10 章全局复审并滚动刷新。",
      "",
      ...chapterLines,
    ].join("\n").trim(),
    source: "model-brief-expanded",
  };
}

function chapterOutlineBlock(chapterNo, summary = "", project = {}) {
  const text = String(summary || "").trim();
  if (!text) return "";
  return buildStoryRoomChapterOutlineBlock(project, chapterNo, { event: text });
}

function replaceChapterPlanRange(chapterPlan = "", from = 1, to = 1, chapterSummaries = [], project = {}) {
  let next = String(chapterPlan || "");
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    const summary = String(chapterSummaries[chapterNo - from] || "").trim();
    if (!summary) continue;
    const block = chapterOutlineBlock(chapterNo, summary, project);
    const pattern = new RegExp(`## 第 ${chapterNo} 章[\\s\\S]*?(?=\\n## 第 ${chapterNo + 1} 章|$)`);
    if (pattern.test(next)) {
      next = next.replace(pattern, block.trimEnd());
    } else {
      next = `${next.trimEnd()}\n\n${block}`;
    }
  }
  return next.trimEnd();
}

async function deepenChapterPlanBatches(project, planning, route, onProgress) {
  if (!route || sourceNeedsPlanningConfirmation(planning)) return planning;
  const ranges = [
    [6, 15],
    [16, 25],
    [26, 30],
  ];
  let chapterPlan = planning.chapterPlan || "";
  const errors = [];
  const router = createModelRouter({
    ...route,
    timeoutMs: Math.min(Number(route.timeoutMs || route.timeout_ms || 45_000), 45_000),
    maxRetries: 0,
    fallbackEnabled: false,
    fallbacks: [],
  });
  for (const [from, to] of ranges) {
    try {
      if (typeof onProgress === "function") {
        await onProgress({
          step: "outline_deepen",
          message: `正在深化第 ${from}-${to} 章细纲，避免后半段泛化。`,
          preview_text: projectPlanningPreview(project, { ...planning, chapterPlan }),
          text_preview: projectPlanningPreview(project, { ...planning, chapterPlan }),
        });
      }
      const result = await router.invoke({
        task_type: "outline_deepen",
        project,
        from,
        to,
        planning_context: {
          bible: truncatePlanningSection(planning.bible, 1200),
          relationships: truncatePlanningSection(planning.relationships, 900),
          volume: truncatePlanningSection(planning.volume, 1200),
          chapter_plan: truncatePlanningSection(chapterPlan, 1800),
        },
      });
      const chapters = Array.isArray(result?.chapters)
        ? result.chapters.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
      const expected = to - from + 1;
      if (chapters.length < Math.min(3, expected)) {
        errors.push(`第 ${from}-${to} 章深化返回不足：${chapters.length}/${expected}`);
        continue;
      }
      chapterPlan = replaceChapterPlanRange(chapterPlan, from, to, chapters, project);
    } catch (error) {
      errors.push(`第 ${from}-${to} 章深化失败：${String(error?.message || error).slice(0, 180)}`);
    }
  }
  return {
    ...planning,
    chapterPlan,
    outline_deepen_errors: errors,
    source: errors.length ? `${planning.source}-outline-partial` : `${planning.source}-outline-deepened`,
  };
}

function truncatePlanningSection(text = "", max = 900) {
  const normalized = String(text || "").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trimEnd()}\n...`;
}

function projectPlanningPreview(project, planning = null) {
  const title = project.title || "新书";
  const idea = String(project.idea || "").trim();
  if (planning) {
    return [
      `# ${title} · 开书规划`,
      "",
      "## 项目圣经",
      truncatePlanningSection(planning.bible, 850),
      "",
      "## 设定库",
      truncatePlanningSection(planning.settings, 650),
      "",
      "## 人物关系",
      truncatePlanningSection(planning.relationships, 700),
      "",
      "## 全书卷纲",
      truncatePlanningSection(planning.volume, 700),
      "",
      "## 前30章细纲",
      truncatePlanningSection(planning.chapterPlan, 950),
    ].join("\n");
  }
  return [
    `# ${title} · 开书规划生成中`,
    "",
    `创意：${idea || "正在读取项目创意"}`,
    ...projectConstraintLines(project).flatMap((line) => ["", line]),
    "",
    "章鱼正在把新书拆成可写的项目树：",
    "",
    "- 项目圣经：主线、人设、商业承诺、逻辑硬规则",
    "- 总纲：整本书阶段目标、预计章节和长期升级路线",
    "- 设定库：能力来源、世界规则、平台规则",
    "- 人物关系：主角、同盟、对手、情感牵引、资源方",
    "- 全书卷纲：按目标字数拆分卷、阶段弧和关键反转",
    "- 前30章细纲：每章目标、冲突、爽点、章尾钩子",
    "",
    "完成后这些内容会进入左侧项目树，正文生成会先读这些规划再动笔。",
  ].join("\n");
}

function buildServerOutlineFromPlanning(project, planning) {
  const title = project.title || "新书";
  const idea = String(project.idea || "").trim();
  return [
    `# ${title} · 总纲`,
    "",
    `一句话创意：${idea || title}`,
    "",
    "## 整体方向",
    "",
    truncatePlanningSection(planning.bible, 900),
    "",
    "## 全书卷纲",
    "",
    truncatePlanningSection(planning.volume, 1200),
    "",
    "## 前30章执行重点",
    "",
    truncatePlanningSection(planning.chapterPlan, 1400),
  ].join("\n").trimEnd();
}

function planningProgressSections(project, planning) {
  const sections = [
    { key: "bible", label: "项目圣经", text: planning.bible },
    { key: "outline", label: "总纲", text: buildServerOutlineFromPlanning(project, planning) },
    { key: "settings", label: "设定库", text: planning.settings },
    { key: "relationships", label: "人物关系", text: planning.relationships },
    { key: "volume", label: "全书卷纲", text: planning.volume },
    { key: "fine_outline", label: "前30章细纲", text: planning.chapterPlan },
  ];
  let preview = `# ${project.title || "新书"} · 开书规划\n\n`;
  return sections.map((section, index) => {
    preview += `## ${section.label}\n${truncatePlanningSection(section.text, index < 2 ? 900 : 650)}\n\n`;
    return {
      ...section,
      preview: preview.trimEnd(),
      assets: sections.slice(0, index + 1).map((item) => ({ label: item.label })),
    };
  });
}

function planningReviewText(review) {
  const checks = Array.isArray(review?.checks) ? review.checks : [];
  return [
    `# 开书规划审核 · ${review.status === "pass" ? "通过" : "需要返工"}`,
    "",
    `总分：${review.score}/100`,
    "",
    "## 审核结论",
    review.summary || (review.status === "pass" ? "规划具备进入正文生产的基础。" : "规划还存在影响连载质量的问题。"),
    "",
    "## 审核项",
    ...checks.map((item) => {
      const status = item.status === "pass" ? "通过" : item.status === "warn" ? "提醒" : "未通过";
      return `- ${status}｜${item.label}${item.issue ? `：${item.issue}` : ""}${item.fix ? `；修复：${item.fix}` : ""}`;
    }),
    "",
    "## 下一步",
    review.next_action === "rewrite_planning"
      ? "已自动把未通过项写回规划提示，要求重新生成规划。"
      : review.status === "pass"
        ? "可以生成第一章正文。正文生产会继续按章卡、审稿、定点修补、发布门禁执行。"
        : "需要人工补充创意或重新规划。",
    "",
  ].join("\n");
}

function localPlanningReview(project, planning) {
  const text = [
    planning?.bible,
    planning?.settings,
    planning?.relationships,
    planning?.volume,
    planning?.chapterPlan,
  ].map((item) => String(item || "")).join("\n\n");
  const idea = String(project.idea || "");
  const protagonist = String(project.protagonist_name || "").trim();
  const supporting = normalizeCharacterNameList(project.supporting_characters);
  const targetWords = normalizeTargetWordsInput(project.target_words);
  const expectedChapters = targetChapterCountForProject(project);
  const coveredChapters = extractMaxCoveredChapter(planning?.volume);
  const stageCount = (String(planning?.volume || "").match(/第\s*\d+\s*阶段/g) || []).length;
  const volumeCount = (String(planning?.volume || "").match(/第\s*\d+\s*卷/g) || []).length;
  const allowedNames = new Set([
    ...normalizeCharacterNameList(project.protagonist_name),
    ...supporting,
  ].filter(Boolean));
  const forbiddenLeaks = ["张明轩", "后台数字", "陆川", "赵鹏", "老周", "梦幻西游", "长安城"]
    .filter((term) => text.includes(term)
      && !idea.includes(term)
      && !String(project.title || "").includes(term)
      && !allowedNames.has(term));
  const ideaKeywords = (idea.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,}/g) || [])
    .filter((word) => word.length >= 2 && !/一个|发现|之后|开始|自己|通过|因为|但是|然后|已经|即将|从一|靠|并|后/.test(word))
    .slice(0, 10);
  const matchedIdeaKeywords = ideaKeywords.filter((word) => text.includes(word));
  const needsCredibilityBridge = /外卖|快递|保安|摆摊|打工/.test(idea)
    && /软件|程序|开发|代码|黑客|AI|人工智能|算法/.test(idea);
  const needsBusinessFeasibility = /重生|创业|商业|商战|经营|外卖|摆摊|茶|茶叶|供应链|公司|赚钱|首富|校园|商户|订单|账册|契约|税单|店铺|平台|成本|利润|现金流/.test(`${idea} ${project.genre || ""}`);
  const firstChapterText = (() => {
    const value = String(planning?.chapterPlan || "");
    const match = value.match(/第\s*1\s*章[\s\S]*?(?=\n##?\s*第\s*2\s*章|$)/);
    return match ? match[0] : value.slice(0, 1600);
  })();
  const storyRoomAudit = auditStoryRoomChapterPlan(planning?.chapterPlan || "");
  const checks = [
    {
      key: "premise",
      label: "核心创意可长篇连载",
      ok: text.length >= 1800 && /主线|长期|阶段|冲突|目标/.test(text),
      issue: "规划没有把一句话创意扩成长期主线和阶段冲突。",
      fix: "补充整本书主线、阶段升级和每阶段主要矛盾。",
    },
    {
      key: "target_words",
      label: "目标字数有阶段弧",
      ok: /目标总字数/.test(text) && coveredChapters >= Math.floor(expectedChapters * 0.9),
      issue: `目标总字数没有被完整承载：预计约 ${expectedChapters} 章，当前卷纲最多覆盖到第 ${coveredChapters || 0} 章。`,
      fix: `按 ${targetWords.toLocaleString("zh-CN")} 字补齐至少 ${expectedChapters} 章的阶段弧、分卷承载、前30章目标和长期升级路线。`,
    },
    {
      key: "protagonist",
      label: "主角姓名和能力来源明确",
      ok: protagonist ? text.includes(protagonist) : /主角姓名|主角：|姓名|能力来源|前史/.test(text),
      issue: protagonist ? `规划没有使用用户指定主角名 ${protagonist}。` : "没有自动生成主角姓名或能力来源。",
      fix: "锁定主角姓名、前史、能力来源、初始缺口和行动风格。",
    },
    {
      key: "supporting",
      label: "配角有功能位和动机",
      ok: supporting.length
        ? supporting.every((name) => text.includes(name))
        : /同盟|对手|情感|资源方|师长|商户|功能位|动机/.test(text),
      issue: supporting.length ? "用户指定配角没有全部进入人物关系。" : "配角没有形成可执行的人物关系网。",
      fix: "为每个核心配角补足功能位、私欲、首次出场路径和与主角的冲突牵引。",
    },
    {
      key: "idea_fidelity",
      label: "严格贴合当前创意",
      ok: !ideaKeywords.length || matchedIdeaKeywords.length >= Math.min(5, Math.ceil(ideaKeywords.length * 0.6)),
      issue: `规划没有贴合当前创意关键词：需要围绕 ${ideaKeywords.join("、")}，当前只命中 ${matchedIdeaKeywords.join("、") || "无"}。`,
      fix: "重新生成规划，必须使用当前创意的时代、行业、矛盾、主角路径和关键物件，不得泛化成相似题材。",
    },
    {
      key: "first_300",
      label: "第一章前300字有门禁",
      ok: /前\s*300|300\s*字|开头钩子|弃读|第一章/.test(text),
      issue: "规划没有单独约束第一章前300字。",
      fix: "补充第一章前300字必须出现冲突、目标、行动、反差或结果预期。",
    },
    {
      key: "first_move_money_source",
      label: "第一章资金来源可信",
      ok: !needsBusinessFeasibility || /资金来源|启动资金|现金|余额|借款|押金|成本|本金|预算|钱从哪里来|垫付/.test(firstChapterText),
      issue: "第一章商业动作没有提前说明启动资金或成本来源，正文容易写成凭空开局。",
      fix: "在第1章细纲里补充启动资金来源、可用现金、垫付/借款/押金边界，以及主角为什么能承担第一步成本。",
    },
    {
      key: "first_move_resource_path",
      label: "第一章资源获取路径可信",
      ok: !needsBusinessFeasibility || /商户|供应商|店主|食堂|档口|茶商|货源|渠道|合同|契约|介绍|名单|线索|资源获取|信息路径/.test(firstChapterText),
      issue: "第一章没有写清商户/供应商/客户信息从哪里来，正文容易出现“我去过所以我知道”的跳跃。",
      fix: "在第1章细纲里补充资源获取路径：前世记忆、现场观察、账册/菜单/排队/收据/学校通知/熟人介绍等可见证据。",
    },
    {
      key: "first_move_trial_plan",
      label: "第一章先试单再放大",
      ok: !needsBusinessFeasibility || /试单|试卖|小样|低成本|验证|样本|首单|试跑|试水|试点|先验证|试错/.test(firstChapterText),
      issue: "第一章商业动作没有低成本验证，容易直接跳成已经谈好、已经赚钱、已经规模化。",
      fix: "在第1章细纲里补充低成本试单：只做一桌/一单/一家商户/一条路线，先得到现场反馈再放大。",
    },
    {
      key: "first_move_profit_risk",
      label: "利润模型有波动和风险",
      ok: !needsBusinessFeasibility || /风险|波动|损耗|退单|砍价|压价|履约|失败|不稳定|试错成本|时间成本|竞争|赔/.test(firstChapterText),
      issue: "第一章利润模型太理想化，没有商户砍价、履约损耗、退单、时间成本或失败风险。",
      fix: "在第1章细纲里补充利润不是稳赚：写清毛利、损耗、商户议价、履约时间和失败后果。",
    },
    {
      key: "first_tail_info_control",
      label: "第一章章尾信息控制",
      ok: !needsBusinessFeasibility || /章尾|钩子|只露|不暴露|信息控制|悬念|下一步|没有说破|更大线索|留到/.test(firstChapterText),
      issue: "第一章章尾没有信息控制，容易把关键人物或大机会一次说透，削弱追读。",
      fix: "在第1章细纲里补充章尾只露结果/异常/来电/账册线索，不提前解释完整计划或直接揭开关键人物。",
    },
    {
      key: "first_30",
      label: "前30章细纲可执行",
      ok: storyRoomAudit.status === "pass",
      issue: `前30章细纲不是可执行故事室章纲：章节 ${storyRoomAudit.chapter_count}/30，完整章节 ${storyRoomAudit.complete_chapters}/30，字段覆盖 ${Math.round(storyRoomAudit.average_coverage * 100)}%，泛模板命中 ${storyRoomAudit.generic_hits}。`,
      fix: "重写前30章滚动细纲；每章必须包含章节功能、触发事件、主角欲望、行动选择、可见证据、公开反馈、代价残留、关系推进、章尾债务，不允许用泛化写作建议替代剧情设计。",
    },
    {
      key: "story_room_contract",
      label: "章纲有事件发动机",
      ok: storyRoomAudit.status === "pass" && !storyRoomAudit.missing_fields.length,
      issue: `章纲缺少故事发动机字段：${storyRoomAudit.missing_fields.join("、") || "字段覆盖不足"}。`,
      fix: "把章纲改成可拍出来的场景契约：先有触发事件，再有主角欲望、行动选择、可见证据、公开反馈、代价残留和章尾债务。",
    },
    {
      key: "long_capacity",
      label: "能承载目标总字数",
      ok: coveredChapters >= Math.floor(expectedChapters * 0.9) && stageCount >= 12 && /每\s*10\s*章|滚动细纲/.test(text),
      issue: `长篇承载不足：预计约 ${expectedChapters} 章，需要至少 12 个阶段并覆盖到结尾；当前阶段 ${stageCount} 个、分卷 ${volumeCount} 个、最高第 ${coveredChapters || 0} 章。`,
      fix: `生成完整长篇规划：至少 12-18 个阶段，覆盖到第 ${expectedChapters} 章，每阶段写清目标、对手、资源升级、关系变化、伏笔债、卷末反转，并保留每10章复审刷新规则。`,
    },
    {
      key: "credibility",
      label: "职业和能力逻辑可信",
      ok: !needsCredibilityBridge || /程序员|开发|裁员|自学|从业|项目|技术/.test(text),
      issue: "创意涉及打工/外卖和技术能力，但规划没有解释能力来源。",
      fix: "补一段背景：主角原本有技术学习或从业经历，因现实压力暂时送外卖/打工。",
    },
    {
      key: "platform_fit",
      label: "平台节奏匹配",
      ok: /番茄|追读|爽点|钩子|反转|误会|公开验证|可见结果/.test(text),
      issue: "规划没有体现平台追读节奏。",
      fix: "强化可见结果、公开验证、章尾钩子和短周期爽点兑现。",
    },
    {
      key: "template_leak",
      label: "无旧项目模板泄漏",
      ok: forbiddenLeaks.length === 0,
      issue: forbiddenLeaks.length ? `疑似混入旧项目词：${forbiddenLeaks.join("、")}` : "",
      fix: "清除旧项目人物、场景、固定开头句，重新按当前创意生成。",
    },
  ];
  const normalized = checks.map(({ ok, ...item }) => ({
    ...item,
    status: ok ? "pass" : "fail",
    issue: ok ? "" : item.issue,
    fix: ok ? "" : item.fix,
  }));
  const passCount = normalized.filter((item) => item.status === "pass").length;
  const score = Math.round((passCount / normalized.length) * 100);
  const failed = normalized.filter((item) => item.status === "fail");
  return {
    status: failed.length ? "needs_rewrite" : "pass",
    score,
    checks: normalized,
    issues: failed.map((item) => item.issue).filter(Boolean),
    fixes: failed.map((item) => item.fix).filter(Boolean),
    summary: failed.length
      ? `发现 ${failed.length} 个开书规划问题，已要求自动返工。`
      : "开书规划通过：可以进入第一章正文生成。",
    next_action: failed.length ? "rewrite_planning" : "approve",
    reviewed_at: new Date().toISOString(),
  };
}

function planningReviewPreview(project, planning, review) {
  return [
    projectPlanningPreview(project, planning),
    "",
    "## 规划审核",
    `总分：${review.score}/100`,
    `结论：${review.status === "pass" ? "通过，可以进入正文生成" : "未通过，正在自动返工"}`,
    ...(review.issues || []).slice(0, 6).map((issue) => `- ${issue}`),
  ].join("\n");
}

function sourceNeedsPlanningConfirmation(planning = {}) {
  const source = String(planning.source || "");
  return source.includes("model-error-fallback") || source.includes("model-unparsed-fallback");
}

function applyPlanningSourceGate(planning, review) {
  if (!sourceNeedsPlanningConfirmation(planning)) return review;
  const sourceIssue = planning.source === "model-unparsed-fallback"
    ? "规划模型返回内容无法解析，当前规划由本地规则兜底生成，质量不能等同模型规划。"
    : `规划模型调用失败，当前规划由本地规则兜底生成：${planning.model_error || "未知原因"}`;
  const checks = Array.isArray(review.checks) ? review.checks.slice() : [];
  checks.push({
    key: "model_planning_source",
    label: "真实模型规划来源",
    ok: false,
    status: "fail",
    issue: sourceIssue,
    fix: "请点击重新生成规划，或在确认本地兜底稿可用后再进入正文生成。",
  });
  const issues = [...(review.issues || []), sourceIssue];
  const fixes = [...(review.fixes || []), "重新调用开书规划模型，生成非兜底的项目圣经、人物关系、全书卷纲和前30章细纲。"];
  return {
    ...review,
    status: "needs_confirmation",
    score: Math.min(Number(review.score || 0), 85),
    checks,
    issues,
    fixes,
    summary: "当前是本地兜底规划，不应直接当作最终精品规划。",
    next_action: "retry_or_confirm_planning",
  };
}

function blockedPlanningDiagnostic(project, planning, review) {
  const title = project.title || "新书";
  const modelError = planning.model_error || "规划模型未返回可用结果。";
  const preview = planning.model_output_preview || "";
  return [
    `# ${title} · 开书规划未完成`,
    "",
    "这不是可用于写正文的最终规划。",
    "",
    "## 根因",
    "",
    `- 来源：${planning.source || "unknown"}`,
    `- 错误：${modelError}`,
    preview ? `- 模型返回预览：${preview}` : "- 模型没有返回可展示正文。",
    "",
    "## 当前处理",
    "",
    "- 已停止本地规则伪修复，避免把模板规划误当成 AI 规划。",
    "- 请重新生成规划；如果仍失败，优先检查模型返回是否为空、JSON 是否闭合、API 是否超时。",
    "",
    "## 用户创意",
    "",
    project.idea || "",
    "",
    "## 规划审核",
    "",
    ...(review?.issues || []).map((issue) => `- ${issue}`),
  ].join("\n");
}

function planningRewriteFallback(project, planning, review) {
  const fixLines = (review.fixes || []).map((fix) => `- ${fix}`).join("\n");
  const patch = [
    "",
    "## 规划审核自动修复记录",
    "",
    "本轮规划审核发现以下问题，已作为硬约束写回规划：",
    fixLines || "- 保持当前规划，但后续正文仍需逐章审稿和发布门禁。",
    "",
  ].join("\n");
  return {
    ...planning,
    bible: `${planning.bible || ""}${patch}`.trim(),
    settings: `${planning.settings || ""}\n\n## 审核补强\n${fixLines || "- 保持设定一致性。"}`.trim(),
    relationships: `${planning.relationships || ""}\n\n## 审核补强\n- 所有新增人物必须有动机、信息路径、行动路径和未来用途。`.trim(),
    volume: `${planning.volume || ""}\n\n## 审核补强\n- 总字数目标必须拆成预计章节、全书阶段弧、分卷承载和每卷升级结果。\n- 每卷必须有目标、对手、资源升级、关系变化、伏笔债和卷末反转。`.trim(),
    chapterPlan: `${planning.chapterPlan || ""}\n\n## 审核补强\n- 第一章前300字必须用场面、动作、冲突进入，不用解释型开头。\n- 第一章商业/能力动作必须提前写清资金来源、资源获取路径、信息来源、低成本试单、成本风险、利润波动和章尾信息控制。\n- 至少补齐前30章滚动细纲；每章必须有目标、冲突、主角行动、爽点兑现和章尾钩子。\n- 每写完10章自动全局复审并刷新下一段细纲，保证长篇上下文不丢。`.trim(),
    source: `${planning.source || "planning"}-review-patched`,
  };
}

async function generateProjectPlanning(project, { routerOptions, useModel = true, onProgress } = {}) {
  const fallback = serverLocalProjectPlanning(project);
  const baseRoute = useModel ? (routerOptions || routerOptionsForTaskType("project_planning")) : null;
  const configuredTimeout = Number(baseRoute?.timeoutMs || baseRoute?.timeout_ms || 0);
  const route = baseRoute
    ? {
        ...baseRoute,
        timeoutMs: configuredTimeout > 0 ? Math.min(configuredTimeout, 45_000) : 45_000,
        maxRetries: 0,
      }
    : null;
  let planning = fallback;
  if (typeof onProgress === "function") {
    await onProgress({
      step: "model_planning",
      message: route
        ? "正在调用开书规划模型，生成项目圣经、人物关系、全书卷纲和前30章细纲。"
        : "未找到规划模型，正在使用本地规则生成可写项目树。",
      preview_text: projectPlanningPreview(project),
      text_preview: projectPlanningPreview(project),
    });
  }
  if (route) {
    try {
      const routeFallbacks = Array.isArray(route.fallbacks) ? route.fallbacks : [];
      const attempts = [route, ...routeFallbacks]
        .filter((item) => item?.provider)
        .map((item) => ({
          ...route,
          ...item,
          allowNetwork: item.allowNetwork ?? item.allow_network ?? route.allowNetwork,
          timeoutMs: Math.min(Number(item.timeoutMs || item.timeout_ms || route.timeoutMs || 60_000), 60_000),
          maxRetries: 0,
          fallbackEnabled: false,
          fallbacks: [],
        }));
      let lastModelError = "";
      for (let index = 0; index < attempts.length; index += 1) {
        const attempt = attempts[index];
        if (typeof onProgress === "function") {
          await onProgress({
            step: "model_planning",
            message: `${index === 0 ? "正在调用" : "正在切换备用"}规划模型：${attempt.provider}/${attempt.model || "default"}。`,
            model_attempt: {
              provider: attempt.provider,
              model: attempt.model,
              timeout_ms: attempt.timeoutMs,
              index: index + 1,
              total: attempts.length,
            },
            preview_text: projectPlanningPreview(project, planning),
            text_preview: projectPlanningPreview(project, planning),
          });
        }
        try {
        const router = createModelRouter(attempt);
        const stageRuleContract = writingRulesForTask(project, "project_planning");
        const result = await router.invoke({
          task_type: "project_planning",
          project,
          writing_rules: [
            ...writingRulesForProject(project),
            ...stageRuleContract.rules,
          ],
          stage_rule_contract: stageRuleContract,
          instruction: [
              "你是中文商业网文开书总编辑。",
              "根据项目创意、类型和平台，只生成紧凑的开书方向骨架；不要输出长篇 Markdown。",
              "必须严格读取并执行以下开书硬约束：",
              ...projectConstraintLines(project).map((line) => `- ${line}`),
              `当前题材规则：${openingRuleProfile(project).label}`,
              ...openingRuleProfile(project).rules.map((rule) => `- ${rule}`),
              "如果主角或配角姓名未填写，你必须自动生成姓名；如果已填写，所有规划资产必须使用用户填写的姓名，不能擅自换名。",
              "目标总字数必须体现在 stages 里：给出能承载整本书的阶段弧，不要只写开局。",
              "必须解决逻辑可信度：角色能力、职业经历、资源来源要能自洽。",
              "第一章必须单独强调前 300 字钩子、目标、行动感和弃读风险控制。",
              "同步生成核心人物关系：主角、同盟、对手、情感牵引、资源方之间的功能关系和冲突牵引。",
              "只输出一个闭合 JSON 对象，不要 Markdown，不要解释。",
              "字段：premise:string, selling_points:string[3], logic_constraints:string[4], characters:string[4], relationships:string[4], stages:string[6], chapter_beats:string[5]。",
              "characters 用“姓名:功能位/动机/首次出场”；stages 和 chapter_beats 都只写短句。不要输出嵌套对象，不要多余字段，整份 JSON 控制在 700 中文字以内并闭合。",
            ].join("\n"),
          });
          const rawText = result?.text || result?.output || "";
          const rawDebug = result?.raw || "";
          const parsed = planningJsonFromText(rawText);
          if (parsed) {
            planning = expandPlanningFromBrief(project, parsed, fallback)
              || normalizeServerPlanning(project, parsed, fallback);
            planning.source = planning.source === "model-brief-expanded"
              ? `${attempt.provider}/${attempt.model || "default"}-brief-expanded`
              : `${attempt.provider}/${attempt.model || "default"}`;
            lastModelError = "";
            break;
          }
          const truncated = String(rawText || rawDebug || "").trim().length > 0
            && extractFirstJsonObject(rawText || rawDebug) === "";
          lastModelError = truncated
            ? "规划模型返回 JSON 未闭合，疑似输出过长被截断。"
            : "规划模型返回内容不是可解析 JSON。";
          planning = {
            ...fallback,
            source: "model-unparsed-fallback",
            model_error: lastModelError,
            model_output_preview: String(rawText || rawDebug || "").slice(0, 800),
          };
        } catch (error) {
          lastModelError = String(error?.message || error || "规划模型调用失败").slice(0, 800);
          planning = {
            ...fallback,
            source: "model-error-fallback",
            model_error: lastModelError,
          };
          if (typeof onProgress === "function") {
            await onProgress({
              step: "model_fallback",
              message: `规划模型 ${attempt.provider}/${attempt.model || "default"} 未返回：${lastModelError}`,
              model_attempt: {
                provider: attempt.provider,
                model: attempt.model,
                timeout_ms: attempt.timeoutMs,
                index: index + 1,
                total: attempts.length,
              },
              preview_text: projectPlanningPreview(project, planning),
              text_preview: projectPlanningPreview(project, planning),
            });
          }
        }
      }
      if (lastModelError && !String(planning.source || "").includes("model-unparsed-fallback")) {
        planning = {
          ...planning,
          source: "model-error-fallback",
          model_error: lastModelError,
        };
      }
    } catch (error) {
      const modelError = String(error?.message || error || "规划模型调用失败").slice(0, 800);
      planning = {
        ...fallback,
        source: "model-error-fallback",
        model_error: modelError,
      };
      if (typeof onProgress === "function") {
        await onProgress({
          step: "model_fallback",
          message: `规划模型暂时未返回，已切换本地规划：${modelError}`,
          preview_text: projectPlanningPreview(project, planning),
          text_preview: projectPlanningPreview(project, planning),
        });
      }
    }
  }
  if (typeof onProgress === "function") {
    const hasRealModelPlanning = !sourceNeedsPlanningConfirmation(planning)
      && !String(planning.source || "").includes("local-rules");
    const sourceLabel = hasRealModelPlanning
      ? "规划模型已返回，正在整理为项目树。"
      : "规划模型未完整返回，正在用本地规则补齐缺失部分。";
    await onProgress({
      step: "normalize",
      message: sourceLabel,
      preview_text: projectPlanningPreview(project, planning),
      text_preview: projectPlanningPreview(project, planning),
      sections: {
        source: planning.source,
        fallback_keys: planning.fallback_keys || [],
      },
    });
  }
  planning = enforceProjectPlanningLocks(project, await deepenChapterPlanBatches(project, planning, route, onProgress));
  let planningReview = applyPlanningSourceGate(planning, localPlanningReview(project, planning));
  if (typeof onProgress === "function") {
    await onProgress({
      step: "planning_review",
      message: planningReview.status === "pass"
        ? `规划审核通过：${planningReview.score}/100`
        : `规划审核未过：${planningReview.score}/100，正在准备自动返工。`,
      review: planningReview,
      preview_text: planningReviewPreview(project, planning, planningReview),
      text_preview: planningReviewPreview(project, planning, planningReview),
    });
  }
  if (planningReview.status !== "pass") {
    let rewritten = null;
    const shouldRetryWithModel = route && !sourceNeedsPlanningConfirmation(planning);
    if (shouldRetryWithModel) {
      try {
        if (typeof onProgress === "function") {
          await onProgress({
            step: "planning_rewrite",
            message: `规划审核发现 ${planningReview.issues.length} 个问题，正在让规划模型按审核意见重写。`,
            review: planningReview,
            preview_text: planningReviewPreview(project, planning, planningReview),
            text_preview: planningReviewPreview(project, planning, planningReview),
          });
        }
      const router = createModelRouter(route);
      const stageRuleContract = writingRulesForTask(project, "project_planning");
      const result = await router.invoke({
        task_type: "project_planning",
        project,
        writing_rules: [
          ...writingRulesForProject(project),
          ...stageRuleContract.rules,
        ],
        stage_rule_contract: stageRuleContract,
        instruction: [
            "你是中文商业网文开书总编辑，现在要按审核意见重写开书规划。",
            "必须严格执行以下开书硬约束：",
            ...projectConstraintLines(project).map((line) => `- ${line}`),
            `当前题材规则：${openingRuleProfile(project).label}`,
            ...openingRuleProfile(project).rules.map((rule) => `- ${rule}`),
            "上一版规划审核未通过，必须修复以下问题：",
            ...(planningReview.issues || []).map((issue) => `- ${issue}`),
            "对应修复要求：",
            ...(planningReview.fixes || []).map((fix) => `- ${fix}`),
            "输出仍然只能是 JSON，字段为 bible、settings、relationships、volume、chapter_plan，其中 volume 是全书卷纲，chapter_plan 是前30章滚动细纲。",
          ].join("\n"),
        });
        const parsed = planningJsonFromText(result?.text || result?.output || "");
        if (parsed) rewritten = normalizeServerPlanning(project, parsed, fallback);
      } catch (error) {
        planningReview.model_rewrite_error = String(error?.message || error || "规划返工模型调用失败").slice(0, 800);
      }
    } else if (typeof onProgress === "function") {
      await onProgress({
        step: "planning_rewrite",
        message: sourceNeedsPlanningConfirmation(planning)
          ? "规划模型超时或返回异常，已停止自动伪修复，正在保存失败原因供诊断。"
          : "正在用本地规则补强开书规划。",
        review: planningReview,
        preview_text: planningReviewPreview(project, planning, planningReview),
        text_preview: planningReviewPreview(project, planning, planningReview),
      });
    }
    if (sourceNeedsPlanningConfirmation(planning) && !rewritten) {
      planningReview = {
        ...planningReview,
        rewrite_source: "blocked",
        model_rewrite_error: planning.model_error || "规划模型未返回可用结果，未进行本地伪修复。",
      };
    } else {
      const originalPlanning = planning;
      const originalReview = planningReview;
      const candidatePlanning = rewritten || planningRewriteFallback(project, planning, planningReview);
      const candidateReview = applyPlanningSourceGate(candidatePlanning, localPlanningReview(project, candidatePlanning));
      if (candidateReview.status !== "pass"
        && Number(candidateReview.score || 0) < Number(originalReview.score || 0)) {
        planning = originalPlanning;
        planningReview = {
          ...originalReview,
          rewrite_source: "discarded_degraded",
          model_rewrite_error: "规划返工后分数下降，已保留返工前更好的规划。",
        };
      } else {
        planning = candidatePlanning;
      }
    }
      planning = enforceProjectPlanningLocks(project, planning);
      const secondReview = applyPlanningSourceGate(planning, localPlanningReview(project, planning));
    planningReview = {
      ...secondReview,
      first_pass: planningReview,
      rewrite_source: planningReview.rewrite_source || (rewritten ? "model" : "local_patch"),
      model_rewrite_error: planningReview.model_rewrite_error || null,
    };
    if (typeof onProgress === "function") {
      await onProgress({
        step: "planning_review_done",
        message: planningReview.status === "pass"
          ? `规划返工后审核通过：${planningReview.score}/100`
          : `规划返工后仍有问题：${planningReview.score}/100，已保存审核报告。`,
        review: planningReview,
        preview_text: planningReviewPreview(project, planning, planningReview),
        text_preview: planningReviewPreview(project, planning, planningReview),
      });
    }
  } else if (typeof onProgress === "function") {
    await onProgress({
      step: "planning_review_done",
      message: `规划审核通过：${planningReview.score}/100`,
      review: planningReview,
      preview_text: planningReviewPreview(project, planning, planningReview),
      text_preview: planningReviewPreview(project, planning, planningReview),
    });
  }
  await mkdir(path.join(project.path, "大纲"), { recursive: true });
  await mkdir(path.join(project.path, "设定"), { recursive: true });
  await mkdir(path.join(project.path, "卷纲"), { recursive: true });
  await mkdir(path.join(project.path, "细纲"), { recursive: true });
  await mkdir(path.join(project.path, "reports"), { recursive: true });
  const blockedByModel = sourceNeedsPlanningConfirmation(planning);
  const diagnosticText = blockedByModel
    ? blockedPlanningDiagnostic(project, planning, planningReview)
    : "";
  const outline = blockedByModel ? diagnosticText : buildServerOutlineFromPlanning(project, planning);
  const volumeOutlinePath = path.join(project.path, "卷纲", "全书卷纲.md");
  const legacyVolumeOutlinePath = path.join(project.path, "卷纲", "第一卷.md");
  const fineOutlinePath = path.join(project.path, "细纲", "前30章.md");
  const legacyFineOutlinePath = path.join(project.path, "细纲", "前10章.md");
  const writePlan = [
    { label: "项目圣经", path: path.join(project.path, "项目圣经.md"), text: blockedByModel ? diagnosticText : planning.bible },
    { label: "总纲", path: path.join(project.path, "大纲", "总纲.md"), text: outline },
    { label: "设定库", path: path.join(project.path, "设定", "设定库.md"), text: blockedByModel ? diagnosticText : planning.settings },
    { label: "人物关系", path: path.join(project.path, "设定", "人物关系.md"), text: blockedByModel ? diagnosticText : planning.relationships },
    { label: "全书卷纲", path: volumeOutlinePath, text: blockedByModel ? diagnosticText : planning.volume },
    { label: "前30章细纲", path: fineOutlinePath, text: blockedByModel ? diagnosticText : planning.chapterPlan },
    { label: "规划审核", path: path.join(project.path, "reports", "project_planning_review.md"), text: planningReviewText(planningReview) },
  ];
  const progressSections = planningProgressSections(project, planning);
  for (let index = 0; index < writePlan.length; index += 1) {
    const item = writePlan[index];
    await writeText(item.path, String(item.text || "").trimEnd() + "\n");
    if (typeof onProgress === "function") {
      const section = progressSections[index];
      await onProgress({
        step: "write_asset",
        message: `正在写入${item.label}`,
        current_asset: item.label,
        assets: writePlan.slice(0, index + 1).map((asset) => ({ label: asset.label, path: asset.path })),
        preview_text: section?.preview || projectPlanningPreview(project, planning),
        text_preview: section?.preview || projectPlanningPreview(project, planning),
        review: planningReview,
      });
    }
  }
  await writeText(legacyVolumeOutlinePath, String(planning.volume || "").trimEnd() + "\n");
  await writeText(legacyFineOutlinePath, String(planning.chapterPlan || "").trimEnd() + "\n");
  const reviewPath = path.join(project.path, "reports", "project_planning_review.json");
  await writeJson(reviewPath, planningReview);
  const treePath = path.join(project.path, "项目树.json");
  await writeJson(treePath, {
    title: project.title,
    idea: project.idea,
    platform: project.platform,
    genre: project.genre,
    target_words: normalizeTargetWordsInput(project.target_words),
    golden_finger: project.golden_finger || "",
    protagonist_name: project.protagonist_name || "",
    supporting_characters: normalizeCharacterNameList(project.supporting_characters),
    status: planningReview.status === "pass" ? "planning-ready" : "planning-review-failed",
    source: planning.source,
    model_error: planning.model_error || null,
    model_output_preview: planning.model_output_preview || null,
    outline_deepen_errors: planning.outline_deepen_errors || [],
    fallback_keys: planning.fallback_keys || [],
    planning_review: {
      status: planningReview.status,
      score: planningReview.score,
      path: reviewPath,
      report_path: path.join(project.path, "reports", "project_planning_review.md"),
      issues: planningReview.issues || [],
    },
    generated_at: new Date().toISOString(),
  });
  const previewText = projectPlanningPreview(project, planning);
  const sections = {
    bible: planning.bible,
    outline,
    settings: planning.settings,
    relationships: planning.relationships,
    volume: planning.volume,
    chapter_plan: planning.chapterPlan,
  };
  return {
    status: planningReview.status === "pass" ? "planning-ready" : "planning-review-failed",
    source: planning.source,
    model_error: planning.model_error || null,
    model_output_preview: planning.model_output_preview || null,
    outline_deepen_errors: planning.outline_deepen_errors || [],
    fallback_keys: planning.fallback_keys || [],
    planning_review: planningReview,
    project_title: project.title,
    project_path: project.path,
    preview_text: previewText,
    text_preview: previewText,
    sections,
    assets: [
      { label: "项目圣经", path: path.join(project.path, "项目圣经.md") },
      { label: "总纲", path: path.join(project.path, "大纲", "总纲.md") },
      { label: "设定库", path: path.join(project.path, "设定", "设定库.md") },
      { label: "人物关系", path: path.join(project.path, "设定", "人物关系.md") },
      { label: "全书卷纲", path: volumeOutlinePath },
      { label: "前30章细纲", path: fineOutlinePath },
      { label: "规划审核", path: path.join(project.path, "reports", "project_planning_review.md") },
    ],
    tree_path: treePath,
    next_actions: ["生成第一章正文", "连续生成五章正文"],
  };
}

async function buildReferenceResults(project) {
  const library = await readJsonIfExists(referenceLibraryFile(project), { references: [] });
  const tasksDir = path.join(project.path, "tasks");
  const entries = await readdir(tasksDir, { withFileTypes: true }).catch(() => []);
  const structures = [];
  const audits = [];
  const rhythmPlans = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(tasksDir, entry.name);
    if (/^reference_.*_structure\.json$/i.test(entry.name)) {
      const data = await readJsonIfExists(filePath, null);
      if (data) structures.push({ ...data, path: filePath });
    }
    if (/^reference_read_.*_audit\.json$/i.test(entry.name)) {
      const data = await readJsonIfExists(filePath, null);
      if (data) audits.push({ ...data, path: filePath });
    }
    if (/^rhythm_transfer_.*\.json$/i.test(entry.name)) {
      const data = await readJsonIfExists(filePath, null);
      if (data) rhythmPlans.push({ ...data, path: filePath });
    }
  }

  const config = await loadProjectConfig(project);
  return {
    status: "ready",
    project: {
      title: project.title,
      path: project.path,
      idea: project.idea,
    },
    active_rhythm_transfer_plan: config.writing?.rhythm_transfer_plan || null,
    library,
    references: (library.references || []).map((reference) => ({
      ...reference,
      structure_path: referenceStructureFile(project, reference.reference_name || "reference"),
      audit_path: referenceReadAuditFile(project, reference.reference_name || "reference"),
    })),
    structures: structures.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))),
    audits: audits.sort((a, b) => String(b.finished_at || b.started_at || "").localeCompare(String(a.finished_at || a.started_at || ""))),
    rhythm_plans: rhythmPlans.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))),
    plugin: {
      installed_path: path.resolve(fileURLToPath(new URL("../browser-extension/", import.meta.url))),
      function_name: "novelStudioSyncVisibleReferenceStructure",
      default_endpoint: "/api/reference-read/run",
      usage: "在授权可见的对标书章节页面打开浏览器插件，选择当前项目后同步可见章节结构；只保存结构指纹，不保存原文。",
    },
  };
}

async function activateReferenceRhythmTransfer(project, {
  referenceName = "",
  from = 1,
  to = 10,
  planName = "",
  targetIdea = "",
} = {}) {
  const referenceProfile = await readJsonIfExists(referenceStructureFile(project, referenceName), null);
  if (!referenceProfile) {
    throw new HttpError(404, `没有找到拆书结果：${referenceName}`);
  }
  const safePlanName = planName || `reference-${referenceName}`;
  const plan = await writeRhythmTransferPlan(project, {
    name: safePlanName,
    referenceProfile,
    from,
    to,
    targetIdea: targetIdea || project.idea,
  });
  await saveProjectConfig(project, {
    writing: {
      rhythm_transfer_plan: safePlanName,
    },
  });
  return {
    status: "activated",
    active_rhythm_transfer_plan: safePlanName,
    plan,
    plan_path: rhythmTransferPlanFile(project, safePlanName),
  };
}

function workspaceRootForProject(project) {
  return path.dirname(project.path);
}

function ideasFromProject(project) {
  const base = String(project.idea || "2016年重生回大学，从外卖做起").trim();
  return [
    base,
    `${base}，前三章强化爽点和章尾钩子`,
    `${base}，换一个更强商业冲突开局`,
  ];
}

async function buildUsableWorkspaceSnapshot(project) {
  const root = workspaceRootForProject(project);
  const progress = await inferProjectProgress(project);
  const projects = await listProjects(root);
  const apiKeys = apiKeyStatusFromEnv();
  const webbridge = await kimiWebbridgeStatus().catch((error) => ({
    id: "kimi-webbridge",
    running: false,
    error: error?.message || String(error),
  }));
  return {
    product: PRODUCT_NAME,
    version: SERVER_VERSION,
    product_version_label: PRODUCT_VERSION_LABEL,
    root,
    project: {
      title: project.title,
      path: project.path,
      idea: project.idea,
      platform: project.platform,
      genre: project.genre,
    },
    progress,
    projects: projects.projects,
    api_keys: apiKeys,
    model_routes: buildTaskModelPlan(),
    publish_assistant: webbridge,
    ready: {
      has_project: Boolean(project.path),
      can_write: Boolean(project.path),
      can_export: (progress.latest_completed_chapter || 0) > 0,
      has_any_model_key: apiKeys.some((key) => key.configured),
      selected_model_route: firstConfiguredModelRoute(),
      webbridge_running: Boolean(webbridge.running || webbridge.extension_connected || webbridge.daemon?.running),
    },
  };
}

async function listRecentServerTasks(project, limit = 8) {
  const tasksDir = path.join(project.path, "tasks");
  const entries = await readdir(tasksDir, { withFileTypes: true }).catch(() => []);
  const tasks = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^task-\d+\.json$/i.test(entry.name)) continue;
    const task = await readJsonIfExists(path.join(tasksDir, entry.name));
    if (!task?.task_id) continue;
    tasks.push(task);
  }
  tasks.sort((a, b) => String(b.finished_at || b.started_at || b.created_at || "").localeCompare(
    String(a.finished_at || a.started_at || a.created_at || ""),
  ));
  return tasks.slice(0, limit).map((task) => ({
    task_id: task.task_id,
    type: task.type,
    status: task.status,
    created_at: task.created_at || null,
    started_at: task.started_at || null,
    finished_at: task.finished_at || null,
    path: task.path || null,
  }));
}

async function buildSupportSummary(project) {
  const dashboard = await buildDashboard(project);
  const workspace = await buildUsableWorkspaceSnapshot(project);
  const recentTasks = await listRecentServerTasks(project, 8);
  const diagnosticsDir = path.join(project.path, "reports");
  return {
    product: PRODUCT_NAME,
    version: SERVER_VERSION,
    product_version_label: PRODUCT_VERSION_LABEL,
    project: {
      title: project.title,
      path: project.path,
      idea: project.idea,
      platform: project.platform,
      genre: project.genre,
    },
    docs: {
      quick_start_path: path.resolve(fileURLToPath(new URL("../docs/QUICKSTART.md", import.meta.url))),
      user_guide_path: path.resolve(fileURLToPath(new URL("../docs/USER_GUIDE.md", import.meta.url))),
      commercial_shell_path: path.resolve(fileURLToPath(new URL("../docs/COMMERCIAL_SHELL.md", import.meta.url))),
      changelog_path: path.resolve(fileURLToPath(new URL("../CHANGELOG.md", import.meta.url))),
      quick_start_url: "/docs/QUICKSTART.md",
      user_guide_url: "/docs/USER_GUIDE.md",
      commercial_shell_url: "/docs/COMMERCIAL_SHELL.md",
      changelog_url: "/docs/CHANGELOG.md",
    },
    diagnostics_dir: diagnosticsDir,
    support: {
      wechat: "OctoSage-Help",
      channel: "本地客服微信",
      export_label: "导出诊断包",
      commercial_status: "本地正式版就绪",
      payment_status: "待接入支付",
      login_status: localStorageSafeAccountLabel(project),
    },
    usage: {
      total_projects: Array.isArray(workspace.projects) ? workspace.projects.length : 0,
      current_chapter: dashboard.current_chapter,
      completed_chapters: dashboard.completed_chapters,
      latest_grade: dashboard.latest_grade,
      total_model_calls: dashboard.total_model_calls,
      estimated_cost_cny: dashboard.estimated_cost_cny,
      latest_activity: dashboard.latest_activity || [],
      recent_tasks: recentTasks,
    },
    workspace,
  };
}

async function exportSupportDiagnostics(project) {
  const snapshot = await buildSupportSummary(project);
  const output = path.join(project.path, "reports", `support_diagnostics_${timestampSuffix()}.json`);
  await writeJson(output, {
    ...snapshot,
    generated_at: new Date().toISOString(),
  });
  return {
    status: "created",
    path: output,
    snapshot,
  };
}

function localStorageSafeAccountLabel(project) {
  return project?.title ? `本地登录 · ${project.title}` : "本地登录";
}

export function createLocalServer({
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  taskStore = null,
  defaultProject = null,
} = {}) {
  const sharedTaskStorePromise = taskStore ? Promise.resolve(taskStore) : null;
  const storePromises = new Map();

  async function storeForProject(project) {
    if (sharedTaskStorePromise) return sharedTaskStorePromise;
    const key = project.path;
    if (!storePromises.has(key)) {
      storePromises.set(key, createPersistentTaskStore({ project }));
    }
    return storePromises.get(key);
  }

  async function enqueueTask(project, type, fn) {
    const store = await storeForProject(project);
    const task = await store.enqueue(type, fn);
    return task;
  }

  async function routeProjectFromQuery(url) {
    const projectPath = url.searchParams.get("project") || url.searchParams.get("path") || defaultProject?.path;
    if (!projectPath) {
      throw new Error("project path is required");
    }
    return loadProject(projectPath);
  }

  async function routeProjectFromBody(body) {
    if (body.project) return loadProject(body.project);
    if (defaultProject?.path) return loadProject(defaultProject.path);
    throw new Error("project path is required");
  }

  async function routeRootFromBody(body) {
    if (body.root) return String(body.root);
    if (body.project) {
      const project = await loadProject(body.project);
      return workspaceRootForProject(project);
    }
    if (defaultProject?.path) {
      return workspaceRootForProject(defaultProject);
    }
    throw new Error("root is required");
  }

  async function routeApi(request, response, url) {
    if (request.method === "GET" && url.pathname === "/api/health") {
      jsonResponse(response, 200, {
        status: "ok",
        version: SERVER_VERSION,
        product: PRODUCT_NAME,
        product_version_label: PRODUCT_VERSION_LABEL,
        default_project: defaultProject ? {
          title: defaultProject.title,
          path: defaultProject.path,
          current_chapter: defaultProject.current_chapter,
        } : null,
      });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/projects") {
      jsonResponse(response, 200, await listProjects(url.searchParams.get("root") || process.cwd()));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/settings/api-keys") {
      jsonResponse(response, 200, { keys: apiKeyStatusFromEnv() });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/settings/api-keys") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const name = String(body.name || "");
      const value = String(body.value || "");
      if (!API_KEY_ENV_NAMES.includes(name)) throw new Error(`unsupported API key: ${name}`);
      if (!value) throw new Error("API key value is required");
      await saveUserApiKey(name, value);
      jsonResponse(response, 200, { status: "saved", name });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/settings/model-smoke") {
      const body = await readRequestJson(request, { maxBodyBytes });
      jsonResponse(response, 200, await runModelSmoke({
        provider: body.provider || "mock",
        model: body.model || "mock",
        allowNetwork: Boolean(body.allow_network),
      }));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/open-path") {
      const body = await readRequestJson(request, { maxBodyBytes });
      jsonResponse(response, 200, await openLocalPath(body.path || body.filePath));
      return true;
    }

    if (request.method === "GET" && (url.pathname === "/api/project" || url.pathname === "/api/status")) {
      const project = await routeProjectFromQuery(url);
      jsonResponse(response, 200, await buildProjectStatus(project));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/project") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const requestedTitle = String(body.title || "新书").trim() || "新书";
      const root = String(body.root || process.cwd());
      const project = await createProject({
        root,
        title: requestedTitle,
        idea: body.idea || "",
        platform: body.platform || "fanqie",
        genre: body.genre || "都市",
        target_words: body.target_words || body.targetWords,
        author_name: body.author_name || body.authorName,
        golden_finger: body.golden_finger || body.goldenFinger,
        protagonist_name: body.protagonist_name || body.protagonistName,
        supporting_characters: body.supporting_characters || body.supportingCharacters,
        cover_path: body.cover_path || body.coverPath,
        cover_url: body.cover_url || body.coverUrl,
        cover_prompt: body.cover_prompt || body.coverPrompt,
        initializePlanning: body.initialize_planning !== false && body.initializePlanning !== false,
      });
      if (body.cover_preview || body.generate_cover || body.generateCover) {
        await generateBookCover(project, {
          title: requestedTitle,
          author: body.author_name || body.authorName,
          idea: body.idea || "",
          genre: body.genre || "都市",
          platform: body.platform || "fanqie",
        });
      }
      let planningTask = null;
      if (body.auto_planning || body.autoPlanning) {
        const useModel = !(body.allow_mock || body.allowMock || body.local_only || body.localOnly);
        const route = useModel ? routerOptionsForTaskType("project_planning") : null;
        planningTask = await enqueueTask(project, "project_planning", async ({ setProgress, abortSignal }) => {
          const initialPreview = projectPlanningPreview(project);
          await setProgress({
            step: "outline",
            message: "正在生成项目圣经、总纲、设定库、人物关系、全书卷纲和前30章细纲",
            preview_text: initialPreview,
            text_preview: initialPreview,
          });
          const result = await generateProjectPlanning(project, {
            routerOptions: route,
            useModel,
            onProgress: setProgress,
            abortSignal,
          });
          await setProgress({
            step: "completed",
            message: result.status === "planning-ready"
              ? "开书规划已通过审核"
              : "开书规划已生成，但审核仍有问题，请查看规划审核",
            assets: result.assets,
            preview_text: result.preview_text,
            text_preview: result.text_preview,
            sections: result.sections,
            review: result.planning_review,
          });
          return result;
        });
      }
      jsonResponse(response, 200, {
        status: "created",
        project_path: project.path,
        project_title: project.title,
        planning_task: planningTask,
        planning_task_id: planningTask?.task_id || null,
      });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/book-cover/generate") {
      const body = await readRequestJson(request, { maxBodyBytes });
      let project = null;
      if (body.project) {
        project = await routeProjectFromBody(body);
      } else {
        const root = String(body.root || process.cwd());
        const title = sanitizeBookTitle(body.title || "封面预览") || "封面预览";
        const previewRoot = path.join(root, ".octosage-cover-preview");
        const previewPath = path.join(previewRoot, title);
        await mkdir(previewPath, { recursive: true });
        project = {
          title,
          idea: body.idea || "",
          platform: body.platform || "fanqie",
          genre: body.genre || "都市",
          author_name: body.author_name || body.authorName || "章鱼作者",
          path: previewPath,
        };
      }
      jsonResponse(response, 200, await generateBookCover(project, {
        title: body.title || project.title,
        author: body.author_name || body.authorName || project.author_name,
        idea: body.idea || project.idea,
        genre: body.genre || project.genre,
        platform: body.platform || project.platform,
      }));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/project/trash") {
      const body = await readRequestJson(request, { maxBodyBytes });
      jsonResponse(response, 200, await trashProject({
        root: body.root || process.cwd(),
        projectPath: body.project || body.path,
      }));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/comic/project") {
      const body = await readRequestJson(request, { maxBodyBytes });
      jsonResponse(response, 200, await createComicProject({
        root: String(body.root || process.cwd()),
        title: body.title || "新短剧",
        idea: body.idea || "",
        episodes: body.episodes || 12,
        genre: body.genre || "漫剧/短剧",
      }));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/title-suggest") {
      const body = await readRequestJson(request, { maxBodyBytes });
      jsonResponse(response, 200, await suggestBookTitles({
        idea: body.idea || "",
        platform: body.platform || "fanqie",
        genre: body.genre || "",
      }));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/model/health") {
      loadModelHealth();
      jsonResponse(response, 200, {
        updated_at: new Date().toISOString(),
        models: [...modelHealthMap.values()],
      });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/idea-suggest") {
      const body = await readRequestJson(request, { maxBodyBytes });
      jsonResponse(response, 200, await suggestBookIdeas({
        platform: body.platform || "fanqie",
        genre: body.genre || "都市",
        subgenre: body.subgenre || "",
      }));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard") {
      const project = await routeProjectFromQuery(url);
      jsonResponse(response, 200, await buildDashboard(project));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/chapter/preview") {
      const project = await routeProjectFromQuery(url);
      const progress = await inferProjectProgress(project);
      const fallbackChapter = progress.latest_completed_chapter || progress.current_chapter || 1;
      const chapterNo = parsePositiveInteger(url.searchParams.get("chapter_no") || fallbackChapter, fallbackChapter, "chapter_no");
      jsonResponse(response, 200, await buildChapterPreview(project, chapterNo));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/chapters") {
      const project = await routeProjectFromQuery(url);
      jsonResponse(response, 200, await buildChapterList(project));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/chapter") {
      const project = await routeProjectFromQuery(url);
      const progress = await inferProjectProgress(project);
      const fallbackChapter = progress.latest_completed_chapter || progress.current_chapter || 1;
      const chapterNo = parsePositiveInteger(url.searchParams.get("chapter_no") || fallbackChapter, fallbackChapter, "chapter_no");
      jsonResponse(response, 200, await buildChapterContent(project, chapterNo));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/chapter/review") {
      const project = await routeProjectFromQuery(url);
      const progress = await inferProjectProgress(project);
      const fallbackChapter = progress.latest_completed_chapter || progress.current_chapter || 1;
      const chapterNo = parsePositiveInteger(url.searchParams.get("chapter_no") || fallbackChapter, fallbackChapter, "chapter_no");
      jsonResponse(response, 200, await buildChapterReview(project, chapterNo));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/chapter/editor-report") {
      const project = await routeProjectFromQuery(url);
      const progress = await inferProjectProgress(project);
      const fallbackChapter = progress.latest_completed_chapter || progress.current_chapter || 1;
      const chapterNo = parsePositiveInteger(url.searchParams.get("chapter_no") || fallbackChapter, fallbackChapter, "chapter_no");
      jsonResponse(response, 200, await buildChapterEditorReport(project, chapterNo));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/chapter/card") {
      const project = await routeProjectFromQuery(url);
      const progress = await inferProjectProgress(project);
      const fallbackChapter = progress.latest_completed_chapter || progress.current_chapter || 1;
      const chapterNo = parsePositiveInteger(url.searchParams.get("chapter_no") || fallbackChapter, fallbackChapter, "chapter_no");
      jsonResponse(response, 200, await buildChapterCard(project, chapterNo));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/project/memory") {
      const project = await routeProjectFromQuery(url);
      jsonResponse(response, 200, await buildProjectMemory(project));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/chapter/card") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const chapterNo = parsePositiveInteger(body.chapter_no ?? body.chapterNo ?? 1, 1, "chapter_no");
      jsonResponse(response, 200, await saveChapterCard(project, { chapterNo, content: body.content }));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/project/outline") {
      const project = await routeProjectFromQuery(url);
      jsonResponse(response, 200, await buildProjectOutline(project));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/project/artifact") {
      const project = await routeProjectFromQuery(url);
      jsonResponse(response, 200, await buildProjectArtifact(project, url.searchParams.get("path") || ""));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/project/artifact") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      jsonResponse(response, 200, await saveProjectArtifact(project, {
        path: body.path,
        content: body.content,
      }));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/project/outline") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      jsonResponse(response, 200, await saveProjectOutline(project, body.content));
      return true;
    }

  if (request.method === "GET" && url.pathname === "/api/project/tree") {
      const project = await routeProjectFromQuery(url);
      jsonResponse(response, 200, await buildProjectTree(project));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/project/global-reviews") {
      const project = await routeProjectFromQuery(url);
      jsonResponse(response, 200, await readLatestGlobalReview(project));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/project/planning") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const useModel = !(body.allow_mock || body.allowMock || body.local_only || body.localOnly);
      const route = useModel ? routerOptionsForTaskType("project_planning") : null;
      const task = await enqueueTask(project, "project_planning", async ({ setProgress, abortSignal }) => {
        const initialPreview = projectPlanningPreview(project);
        await setProgress({
          step: "outline",
          message: "正在生成项目圣经、总纲、设定库、人物关系、全书卷纲和前30章细纲",
          preview_text: initialPreview,
          text_preview: initialPreview,
        });
        const result = await generateProjectPlanning(project, {
          routerOptions: route,
          useModel,
          onProgress: setProgress,
          abortSignal,
        });
        await setProgress({
          step: "completed",
          message: "开书规划已生成",
          assets: result.assets,
          preview_text: result.preview_text,
          text_preview: result.text_preview,
          sections: result.sections,
        });
        return result;
      });
      jsonResponse(response, 200, task);
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/reference/results") {
      const project = await routeProjectFromQuery(url);
      jsonResponse(response, 200, await buildReferenceResults(project));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/reference/rhythm/activate") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      jsonResponse(response, 200, await activateReferenceRhythmTransfer(project, {
        referenceName: body.reference_name || body.referenceName || "reference",
        from: parsePositiveInteger(body.from ?? 1, 1, "from"),
        to: parsePositiveInteger(body.to ?? 10, 10, "to"),
        planName: body.plan_name || body.planName,
        targetIdea: body.target_idea || body.targetIdea,
      }));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/chapter/save") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const chapterNo = parsePositiveInteger(body.chapter_no ?? body.chapterNo ?? 1, 1, "chapter_no");
      const text = String(body.text || "");
      if (!text.trim()) throw new HttpError(400, "正文不能为空。");
      const target = exportFile(project, chapterNo);
      const draftTarget = draftFile(project, chapterNo, "v1");
      await writeText(target, text.trimEnd() + "\n");
      await writeText(draftTarget, text.trimEnd() + "\n");
      jsonResponse(response, 200, {
        status: "saved",
        chapter_no: chapterNo,
        path: target,
        draft_path: draftTarget,
        word_count: text.replace(/\s/g, "").length,
      });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/chapter/review-now") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const chapterNo = parsePositiveInteger(body.chapter_no ?? body.chapterNo ?? 1, 1, "chapter_no");
        await assertCompletedChapterRange(project, { from: chapterNo, to: chapterNo, requirePublishReady: false });
      const route = body.allow_mock || body.allowMock
        ? assertRealWritingReady({ allowMock: true })
        : (routerOptionsForTaskType("review_chapter") || assertRealWritingReady());
      const quality = await readJsonIfExists(qualityReportFile(project, chapterNo));
      const latestDraft = await latestVersionedDraftPath(project, chapterNo);
      const version = versionFromDraftPath(latestDraft) || quality?.final_version || (await readJsonIfExists(chapterQualityCheckpointFile(project, chapterNo)))?.version || "v1";
      const review = await reviewChapter(project, chapterNo, version, {
        routerOptions: routerOptionsFromBody(body, route),
      });
      jsonResponse(response, 200, {
        status: "reviewed",
        chapter_no: chapterNo,
        version,
        review,
        review_path: reviewFile(project, chapterNo),
      });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/chapter/rollback") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const chapterNo = parsePositiveInteger(body.chapter_no ?? body.chapterNo ?? 1, 1, "chapter_no");
      jsonResponse(response, 200, await rollbackChapter(project, chapterNo));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/workspace/ready") {
      const project = await routeProjectFromQuery(url);
      jsonResponse(response, 200, await buildUsableWorkspaceSnapshot(project));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/model/routes") {
      jsonResponse(response, 200, { routes: buildTaskModelPlan() });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/support/summary") {
      const project = await routeProjectFromQuery(url);
      jsonResponse(response, 200, await buildSupportSummary(project));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/support/diagnostics/export") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      jsonResponse(response, 200, await exportSupportDiagnostics(project));
      return true;
    }

    // referenceReadPlanAction / referenceReadRunAction / 对标书自动拆解
    // &#23545;&#26631;&#20070;&#33258;&#21160;&#25286;&#35299;
    if (request.method === "POST" && (url.pathname === "/api/reference-read/plan" || url.pathname === "/api/reference-read-plan")) {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const plan = await createReferenceReadPlan(project, {
        name: body.name || body.reference_name || "reference",
        startUrl: body.start_url || body.startUrl,
        chapterLimit: parsePositiveInteger(body.chapter_limit ?? body.chapterLimit ?? 30, 30, "chapter_limit"),
        platform: body.platform || "browser",
      });
      jsonResponse(response, 200, plan);
      return true;
    }

    if (request.method === "POST" && (url.pathname === "/api/reference-read/run" || url.pathname === "/api/reference-read-run")) {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const chapters = Array.isArray(body.chapters) ? body.chapters : [];
      const profile = await runReferenceStructureRead(project, {
        name: body.name || body.reference_name || "reference",
        confirmed: Boolean(body.confirm ?? body.confirmed),
        chapterLimit: parsePositiveInteger(body.chapter_limit ?? body.chapterLimit ?? 30, 30, "chapter_limit"),
        browserAdapter: {
          async readChapters() {
            return chapters;
          },
        },
      });
      jsonResponse(response, 200, profile);
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/reference-read/import-file") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const filePath = String(body.file_path || body.filePath || "").trim();
      if (!filePath) throw new HttpError(400, "file_path is required");
      const ext = path.extname(filePath).toLowerCase();
      if (![".txt", ".md"].includes(ext)) {
        throw new HttpError(415, "当前版本先支持 TXT / Markdown 电子书导入。EPUB/DOCX 会在解析器接入后开放。");
      }
      const text = await readFile(filePath, "utf8");
      if (!text.trim()) throw new HttpError(400, "导入文件没有可拆解正文。");
      const name = body.name || path.basename(filePath, ext) || "imported-book";
      const profile = await runReferenceStructureRead(project, {
        name,
        confirmed: true,
        chapterLimit: parsePositiveInteger(body.chapter_limit ?? body.chapterLimit ?? 30, 30, "chapter_limit"),
        browserAdapter: {
          async readChapters() {
            return [{
              chapter_no: 1,
              title: path.basename(filePath),
              url: filePath,
              text,
              saved_source_text: false,
            }];
          },
        },
      });
      jsonResponse(response, 200, {
        ...profile,
        imported_file: filePath,
      });
      return true;
    }

    // templatesRefreshAction / templatesRecommendAction / &#21047;&#26032;&#27169;&#26495;&#24211;
    if (request.method === "POST" && (url.pathname === "/api/incubation/templates" || url.pathname === "/api/templates/refresh")) {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = body.project ? await routeProjectFromBody(body) : null;
      const root = await routeRootFromBody(body).catch(() => project ? workspaceRootForProject(project) : null);
      if (!root) throw new Error("root is required");
      const library = await refreshDynamicTemplateLibrary({
        root,
        minRiseScore: Number(body.min_rise_score ?? body.minRiseScore ?? 0),
        limit: parsePositiveInteger(body.limit ?? 8, 8, "limit"),
      });
      if (url.pathname === "/api/templates/refresh") {
        jsonResponse(response, 200, library);
        return true;
      }
      const recommendations = await recommendDynamicTemplates({
        root,
        idea: body.idea || project?.idea || "",
        limit: parsePositiveInteger(body.recommend_limit ?? body.recommendLimit ?? 5, 5, "recommend_limit"),
      });
      jsonResponse(response, 200, { library, recommendations });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/templates/recommend") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const root = await routeRootFromBody(body);
      const templates = await recommendDynamicTemplates({
        root,
        idea: body.idea || "",
        limit: parsePositiveInteger(body.limit ?? 5, 5, "limit"),
      });
      jsonResponse(response, 200, { templates });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/incubation/premium") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const root = body.root || workspaceRootForProject(project);
      const plan = await createPremiumIncubationPlan({
        root,
        baseTitle: body.base_title || body.baseTitle || "精品孵化",
        ideas: Array.isArray(body.ideas) && body.ideas.length ? body.ideas : ideasFromProject(project),
        platform: body.platform || project.platform || "fanqie",
        genre: body.genre || project.genre || "都市",
        targetChapters: parsePositiveInteger(body.target_chapters ?? body.targetChapters ?? 5, 5, "target_chapters"),
      });
      const task = await enqueueTask(project, "premium_incubation", () => runPremiumIncubation({
        root,
        untilChapter: parsePositiveInteger(body.until_chapter ?? body.untilChapter ?? 5, 5, "until_chapter"),
        maxRewrites: parsePositiveInteger(body.max_rewrites ?? body.maxRewrites ?? 1, 1, "max_rewrites"),
        totalBudgetCny: Number(body.total_budget_cny ?? body.totalBudgetCny ?? 0),
        routerOptions: routerOptionsFromBody(body),
      }));
      sseResponse(response, { ...task, plan_path: plan.path, projects: plan.projects });
      return true;
    }

    // Public Reference Library
    // publicRefsGrowAction / publicRefsRecommendAction / publicReferencesReadPlanAction / publicReferencesReadRunAction
    if (request.method === "POST" && (
      url.pathname === "/api/reference/library"
      || url.pathname === "/api/public-references/grow"
      || url.pathname === "/api/public-refs-grow"
    )) {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = body.project ? await routeProjectFromBody(body) : null;
      const root = await routeRootFromBody(body).catch(() => project ? workspaceRootForProject(project) : null);
      if (!root) throw new Error("root is required");
      const library = await growPublicReferenceLibrary({
        root,
        sources: Array.isArray(body.sources) ? body.sources : [],
        sourceBatch: body.source_batch || body.sourceBatch || "ui-manual",
      });
      if (url.pathname === "/api/public-references/grow" || url.pathname === "/api/public-refs-grow") {
        jsonResponse(response, 200, library);
        return true;
      }
      const recommendations = await recommendPublicReferenceFingerprints({
        root,
        template: body.template || { genre: project?.genre, idea: project?.idea },
        limit: parsePositiveInteger(body.limit ?? 3, 3, "limit"),
      });
      jsonResponse(response, 200, { library, recommendations });
      return true;
    }

    if (request.method === "POST" && (url.pathname === "/api/public-references/recommend" || url.pathname === "/api/public-refs-recommend")) {
      const body = await readRequestJson(request, { maxBodyBytes });
      const root = await routeRootFromBody(body);
      const references = await recommendPublicReferenceFingerprints({
        root,
        template: body.template || {},
        limit: parsePositiveInteger(body.limit ?? 3, 3, "limit"),
      });
      jsonResponse(response, 200, { references });
      return true;
    }

    if (request.method === "POST" && (url.pathname === "/api/public-references/read-plan" || url.pathname === "/api/public-refs-read-plan")) {
      const body = await readRequestJson(request, { maxBodyBytes });
      const root = await routeRootFromBody(body);
      const plan = await createPublicReferenceReadPlan({
        root,
        sources: Array.isArray(body.sources) ? body.sources : [],
        chapterLimit: parsePositiveInteger(body.chapter_limit ?? body.chapterLimit ?? 30, 30, "chapter_limit"),
        sourceBatch: body.source_batch || body.sourceBatch || "manual",
      });
      jsonResponse(response, 200, plan);
      return true;
    }

    if (request.method === "POST" && (url.pathname === "/api/public-references/read-run" || url.pathname === "/api/public-refs-read-run")) {
      const body = await readRequestJson(request, { maxBodyBytes });
      const root = await routeRootFromBody(body);
      const sources = Array.isArray(body.sources) ? body.sources : [];
      const sourceChapterMap = new Map(
        sources.map((source) => [
          String(source.name || source.reference_name || source.start_url || source.url || ""),
          Array.isArray(source.chapters) ? source.chapters : [],
        ]),
      );
      const library = await growPublicReferenceLibraryFromReadSources({
        root,
        confirmed: Boolean(body.confirmed),
        readSources: sources,
        browserAdapterFactory: ({ source }) => ({
          async readChapters() {
            return sourceChapterMap.get(String(source.name || source.reference_name || source.start_url || source.url || "")) || [];
          },
        }),
        chapterLimit: parsePositiveInteger(body.chapter_limit ?? body.chapterLimit ?? 30, 30, "chapter_limit"),
        sourceBatch: body.source_batch || body.sourceBatch || "manual-visible-read",
      });
      jsonResponse(response, 200, library);
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/domain/build-plan") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      jsonResponse(response, 200, await createDomainKnowledgeBuildPlan(project));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/domain/build") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      jsonResponse(response, 200, await runDomainKnowledgeBuild(project, {
        confirmed: Boolean(body.confirmed),
        sources: body.sources,
      }));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/quality-report") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      jsonResponse(response, 200, await writePremiumReadinessReport(project, {
        from: parsePositiveInteger(body.from ?? 1, 1, "from"),
        to: parsePositiveInteger(body.to ?? 30, 30, "to"),
      }));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/premium-gate") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      jsonResponse(response, 200, await writePremiumGateReport(project, {
        from: parsePositiveInteger(body.from ?? 1, 1, "from"),
        to: parsePositiveInteger(body.to ?? 30, 30, "to"),
        targetScore: Number(body.target_score ?? body.targetScore ?? 95),
      }));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/run") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const writingRoute = body.allow_mock || body.allowMock
        ? assertRealWritingReady({ allowMock: true })
        : realWritingRouterOptionsForRequest(body);
      const progress = await inferProjectProgress(project);
      const chapterNo = parsePositiveInteger(
        body.chapter_no ?? body.chapterNo ?? progress.next_chapter ?? project.current_chapter ?? 1,
        progress.next_chapter ?? 1,
        "chapter_no",
      );
      const task = await enqueueTask(project, "run_single_chapter", ({ setProgress, abortSignal }) => runSingleChapterQualityLoop(
        project,
        chapterNo,
        {
          maxRewrites: parsePositiveInteger(body.max_rewrites ?? body.maxRewrites ?? 2, 2, "max_rewrites"),
          routerOptions: routerOptionsFromBody(body, writingRoute),
          onProgress: setProgress,
          abortSignal,
        },
      ));
      sseResponse(response, task);
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/chapter/repair-to-publish") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const writingRoute = body.allow_mock || body.allowMock
        ? assertRealWritingReady({ allowMock: true })
        : realWritingRouterOptionsForRequest(body);
      const chapterNo = parsePositiveInteger(body.chapter_no ?? body.chapterNo ?? 1, 1, "chapter_no");
      const task = await enqueueTask(project, "repair_chapter_to_publish", ({ setProgress, abortSignal }) => repairChapterToPublish(
        project,
        chapterNo,
        {
          maxRepairRounds: parsePositiveInteger(
            body.max_repair_rounds ?? body.maxRepairRounds ?? 6,
            6,
            "max_repair_rounds",
          ),
          routerOptions: routerOptionsFromBody(body, writingRoute),
          onProgress: setProgress,
          abortSignal,
        },
      ));
      sseResponse(response, task);
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/run-project") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const writingRoute = body.allow_mock || body.allowMock
        ? assertRealWritingReady({ allowMock: true })
        : realWritingRouterOptionsForRequest(body);
      const progress = await inferProjectProgress(project);
      project.current_chapter = progress.next_chapter || project.current_chapter || 1;
      const defaultUntil = (project.current_chapter || 1) + (project.batch_size || 5) - 1;
      const task = await enqueueTask(project, "run_project", ({ setProgress, abortSignal }) => runProject(project, {
        untilChapter: parsePositiveInteger(body.until_chapter ?? body.untilChapter ?? defaultUntil, defaultUntil, "until_chapter"),
        maxRewrites: parsePositiveInteger(body.max_rewrites ?? body.maxRewrites ?? 2, 2, "max_rewrites"),
        resume: Boolean(body.resume),
        routerOptions: routerOptionsFromBody(body, writingRoute),
        onProgress: setProgress,
        abortSignal,
      }));
      sseResponse(response, task);
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/export/merged") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const from = parsePositiveInteger(body.from ?? 1, 1, "from");
      const to = parsePositiveInteger(body.to ?? 30, 30, "to");
      const format = String(body.format || "merged");
      if (format === "docx") {
        throw new HttpError(409, "DOCX 导出正在接入中，请先使用 TXT 合并或单章 TXT。");
      }
      const destination = safeDestinationDir(body.destination || body.export_dir || body.exportDir || "");
      await assertCompletedChapterRange(project, { from, to });
      if (format === "single") {
        jsonResponse(response, 200, await exportChaptersToSingleFiles(project, { from, to, destination }));
        return true;
      }
      const exported = await exportMerged(project, { from, to });
      const finalPath = await copyExportToDestination(exported.path, destination, project, `_第${from}-${to}章_合并`);
      jsonResponse(response, 200, {
        ...exported,
        path: finalPath,
        source_path: exported.path,
        destination: destination || path.dirname(exported.path),
        format: "merged",
      });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/video/full-pack") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const from = parsePositiveInteger(body.from ?? 1, 1, "from");
      const to = parsePositiveInteger(body.to ?? 30, 30, "to");
      await assertVideoSourceReady(project, { from, to });
      jsonResponse(response, 200, await exportFullVideoPack(project, {
        from,
        to,
        tool: body.tool || "jimeng",
        style: body.style || "cinematic-realistic",
      }));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/video/char-refs") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      await assertCompletedChapterRange(project, {
        from: parsePositiveInteger(body.from ?? 1, 1, "from"),
        to: parsePositiveInteger(body.to ?? 1, 1, "to"),
      });
      jsonResponse(response, 200, await generateProjectCharacterRefs(project, body));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/video/scene-refs") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      await assertCompletedChapterRange(project, {
        from: parsePositiveInteger(body.from ?? 1, 1, "from"),
        to: parsePositiveInteger(body.to ?? 1, 1, "to"),
      });
      jsonResponse(response, 200, await generateProjectSceneRefs(project, body));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/video/script") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const chapterNo = parsePositiveInteger(body.chapter_no ?? body.chapterNo ?? 1, 1, "chapter_no");
      await assertVideoSourceReady(project, { from: chapterNo, to: chapterNo });
      jsonResponse(response, 200, await exportChapterScreenplay(
        project,
        chapterNo,
      ));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/video/workspace") {
      const project = await routeProjectFromQuery(url);
      const chapterNo = parsePositiveInteger(url.searchParams.get("chapter_no") || 1, 1, "chapter_no");
      const tool = url.searchParams.get("tool") || "jimeng";
      jsonResponse(response, 200, await buildVideoWorkspace(project, { chapterNo, tool }));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/video/workspace") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      jsonResponse(response, 200, await saveVideoWorkspace(project, {
        chapterNo: parsePositiveInteger(body.chapter_no ?? body.chapterNo ?? 1, 1, "chapter_no"),
        tool: body.tool || "jimeng",
        kind: body.kind,
        content: body.content,
      }));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/video/assets") {
      const project = await routeProjectFromQuery(url);
      jsonResponse(response, 200, await listVideoAssets(project));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/video/assets") {
      const body = await readRequestJson(request, { maxBodyBytes: Math.max(maxBodyBytes, 12 * 1024 * 1024) });
      const project = await routeProjectFromBody(body);
      jsonResponse(response, 200, await saveVideoAsset(project, body));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/video/storyboard") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const chapterNo = parsePositiveInteger(body.chapter_no ?? body.chapterNo ?? 1, 1, "chapter_no");
      await assertVideoSourceReady(project, { from: chapterNo, to: chapterNo });
      const result = await generateVideoPromptsForChapter(
        project,
        chapterNo,
        { ...body, tool: body.tool || "jimeng" },
      );
      // Auto-save storyboard to workspace so it persists on refresh
      try {
        await saveVideoWorkspace(project, {
          chapterNo,
          tool: body.tool || "jimeng",
          kind: "storyboard",
          content: JSON.stringify(result.storyboard || {}),
        });
      } catch { /* non-fatal */ }
      jsonResponse(response, 200, {
        project_title: result.project_title,
        chapter_no: result.chapter_no,
        storyboard: result.storyboard,
        storyboard_path: result.storyboard_path,
      });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/video/prompts") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const chapterNo = parsePositiveInteger(body.chapter_no ?? body.chapterNo ?? 1, 1, "chapter_no");
      await assertVideoSourceReady(project, { from: chapterNo, to: chapterNo });
      const result = await generateVideoPromptsForChapter(
        project,
        chapterNo,
        body,
      );
      // Auto-save prompts to workspace so they persist on refresh
      try {
        if (result.prompts) {
          await saveVideoWorkspace(project, {
            chapterNo,
            tool: body.tool || "jimeng",
            kind: "prompts",
            content: typeof result.prompts === "string" ? result.prompts : JSON.stringify(result.prompts),
          });
        }
      } catch { /* non-fatal */ }
      jsonResponse(response, 200, result);
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/publish/package") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const from = parsePositiveInteger(body.from ?? 1, 1, "from");
      const to = parsePositiveInteger(body.to ?? 30, 30, "to");
      await assertCompletedChapterRange(project, { from, to });
      jsonResponse(response, 200, await exportPublishPackage(project, {
        from,
        to,
        platform: body.platform || "fanqie",
        allowBlocked: true,
      }));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/publish/plan") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const from = parsePositiveInteger(body.from ?? 1, 1, "from");
      const to = parsePositiveInteger(body.to ?? 30, 30, "to");
      await assertCompletedChapterRange(project, { from, to });
      jsonResponse(response, 200, await createPlatformPublishPlan(project, {
        from,
        to,
        platform: body.platform || "fanqie",
      }));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/publish/platform") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const from = parsePositiveInteger(body.from ?? 1, 1, "from");
      const to = parsePositiveInteger(body.to ?? 30, 30, "to");
      await assertCompletedChapterRange(project, { from, to });
      await ensurePublishReadyOrThrow(project, {
        from,
        to,
        platform: body.platform || "fanqie",
      });
      jsonResponse(response, 200, await publishToPlatform(project, {
        from,
        to,
        platform: body.platform || "fanqie",
        adapterName: body.adapter_name || body.adapterName,
        confirmed: Boolean(body.confirmed),
      }));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/publish/browser") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      const from = parsePositiveInteger(body.from ?? 1, 1, "from");
      const to = parsePositiveInteger(body.to ?? 30, 30, "to");
      await assertCompletedChapterRange(project, { from, to });
      let browserDriver = null;
      let selectorConfig = null;
      if (body.launch_browser || body.launchBrowser) {
        const created = await createCalibratedVisiblePublishBrowserDriver(project, {
          allowBrowserLaunch: Boolean(body.confirmed),
          driverType: body.driver_type || body.driverType || "playwright",
          platform: body.platform || project.platform || "fanqie",
        });
        selectorConfig = created.selector_config || null;
        if (created.status !== "ready") {
          jsonResponse(response, 200, {
            status: created.status,
            platform: body.platform || project.platform || "fanqie",
            browser_attempt: {
              started: false,
              submitted: false,
            },
            selector_config: selectorConfig,
            next_step: created.next_step || null,
          });
          return true;
        }
        browserDriver = created.driver;
      }
      const result = await runVisibleBrowserPublishAssistant(project, {
        from,
        to,
        platform: body.platform || "fanqie",
        targetScore: body.target_score ? Number(body.target_score) : 95,
        confirmed: Boolean(body.confirmed),
        browserDriver,
      });
      if (selectorConfig && !result.selector_config) result.selector_config = selectorConfig;
      jsonResponse(response, 200, result);
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/publish/workspace") {
      const project = await routeProjectFromQuery(url);
      const from = parsePositiveInteger(url.searchParams.get("from") || 1, 1, "from");
      const to = parsePositiveInteger(url.searchParams.get("to") || 30, 30, "to");
      const platform = url.searchParams.get("platform") || project.platform || "fanqie";
      jsonResponse(response, 200, await buildPublishWorkspace(project, { platform, from, to }));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/publish/workspace") {
      const body = await readRequestJson(request, { maxBodyBytes });
      const project = await routeProjectFromBody(body);
      jsonResponse(response, 200, await savePublishWorkspace(project, {
        platform: body.platform || project.platform || "fanqie",
        from: parsePositiveInteger(body.from ?? 1, 1, "from"),
        to: parsePositiveInteger(body.to ?? 30, 30, "to"),
        kind: body.kind,
        content: body.content,
      }));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/publish/adapters") {
      jsonResponse(response, 200, { adapters: listPlatformPublishAdapters() });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/publish/platform-profiles") {
      jsonResponse(response, 200, { profiles: listPublishPlatformProfiles() });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/publish/webbridge/status") {
      jsonResponse(response, 200, await kimiWebbridgeStatus());
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/publish/webbridge/start") {
      jsonResponse(response, 200, await startKimiWebbridge());
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/publish/webbridge/install") {
      jsonResponse(response, 200, {
        id: "kimi-webbridge",
        label: "Kimi WebBridge",
        install_url: KIMI_WEBBRIDGE_INSTALL_URL,
        install_command: KIMI_WEBBRIDGE_INSTALL_COMMAND,
        recommended_safe_flow: [
          "复制安装命令到 PowerShell 前，先确认来源为 https://cdn.kimi.com/webbridge/install.ps1。",
          "安装会写入当前用户目录 .kimi-webbridge，并启动本地 daemon。",
          "安装完成后回到软件点击“检测发布助手”或“启动发布助手”。",
        ],
        software_policy: "OctoSage 不会静默执行远程安装脚本；需要用户主动确认安装。",
      });
      return true;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/tasks/")) {
      let store = null;
      if (url.searchParams.get("project") || url.searchParams.get("path") || defaultProject?.path) {
        const project = await routeProjectFromQuery(url);
        store = await storeForProject(project);
      } else if (storePromises.size === 1) {
        store = await Array.from(storePromises.values())[0];
      }
      if (!store) {
        textResponse(response, 404, "task store not initialized");
        return true;
      }
      const parts = url.pathname.split("/").filter(Boolean);
      const taskId = parts[2];
      if (parts[3] === "events") {
        const task = store.get(taskId);
        if (!task) {
          textResponse(response, 404, "task not found");
          return true;
        }
        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store",
          connection: "keep-alive",
        });
        const after = Number(url.searchParams.get("after") || 0);
        for (const item of store.events(taskId, { after }) || []) {
          sseWrite(response, "progress", item);
        }
        const unsubscribe = store.subscribe(taskId, (latest) => {
          sseWrite(response, "task", latest);
          if (["completed", "stopped", "failed"].includes(String(latest.status || ""))) {
            sseWrite(response, "done", latest);
            response.end();
          }
        });
        const heartbeat = setInterval(() => {
          response.write(": heartbeat\n\n");
        }, 15_000);
        request.on("close", () => {
          clearInterval(heartbeat);
          unsubscribe();
        });
        return true;
      }
      const task = store.get(taskId);
      if (!task) textResponse(response, 404, "task not found");
      else jsonResponse(response, 200, task);
      return true;
    }

    return false;
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");

      if (
        request.method === "GET" &&
        [
          "/",
          "/write",
          "/video",
          "/publish",
          "/dashboard",
          "/settings",
          "/login",
          "/register",
          "/novels",
          "/novel/workbench",
          "/novel/planning",
          "/novel/quality",
          "/novel/publish",
          "/reference",
          "/comics",
          "/comic/workbench",
        ].includes(url.pathname)
      ) {
        await pixsoUiResponse(response, "/");
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/pixso/")) {
        await pixsoUiResponse(response, url.pathname);
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/assets/")) {
        await assetResponse(response, url.pathname);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/project/cover") {
        const project = await routeProjectFromQuery(url);
        await projectCoverResponse(response, project, url.searchParams.get("path") || "");
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/docs/")) {
        await docResponse(response, url.pathname);
        return;
      }

      if (url.pathname.startsWith("/api/") && await routeApi(request, response, url)) {
        return;
      }

      textResponse(response, 404, "Not found");
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      jsonResponse(response, statusCode, { error: error?.message || String(error) });
    }
  });

  return { server };
}

export async function serveLocal({ host = "127.0.0.1", port = 8787, project = null } = {}) {
  const app = createLocalServer({ defaultProject: project });
  await new Promise((resolve) => app.server.listen(port, host, resolve));
  const address = app.server.address();
  return {
    ...app,
    url: `http://${host}:${address.port}`,
  };
}
