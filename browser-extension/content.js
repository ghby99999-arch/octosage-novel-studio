const DEFAULT_LOCAL_INGEST_URL = "http://127.0.0.1:8787/api/portfolio/data/ingest";
const LEGACY_LOCAL_PROJECT_INGEST_URL = "http://127.0.0.1:8787/api/data/ingest";
const DEFAULT_REFERENCE_READ_URL = "http://127.0.0.1:8787/api/reference-read/run";

function readNumberAfter(label, text) {
  const pattern = new RegExp(`${label}[^0-9%]{0,20}([0-9]+(?:\\.[0-9]+)?)\\s*%?`, "i");
  const match = text.match(pattern);
  return match ? Number(match[1]) : null;
}

function collectVisibleMetrics() {
  const text = document.body.innerText || "";
  const metrics = {};
  const tailHookScore = readNumberAfter("tail_hook_score|章尾钩子|钩子强度", text);
  const openingHookScore = readNumberAfter("opening_hook_score|开头钩子|首章留存", text);
  const retentionPrediction = readNumberAfter("retention_prediction|追读率|追更比|完读率", text);
  const microHookDensity = readNumberAfter("micro_hook_density|微钩子密度", text);
  const dropRiskSegments = readNumberAfter("drop_risk_segments|弃读风险段", text);
  const coolpointDelivered = readNumberAfter("coolpoint_delivered|爽点兑现", text);
  if (Number.isFinite(tailHookScore)) metrics.tail_hook_score = tailHookScore;
  if (Number.isFinite(openingHookScore)) metrics.opening_hook_score = openingHookScore;
  if (Number.isFinite(retentionPrediction)) metrics.retention_prediction = retentionPrediction;
  if (Number.isFinite(microHookDensity)) metrics.micro_hook_density = microHookDensity;
  if (Number.isFinite(dropRiskSegments)) metrics.drop_risk_segments = dropRiskSegments;
  if (Number.isFinite(coolpointDelivered)) metrics.coolpoint_delivered = coolpointDelivered;
  return { metrics };
}

function chromeStorageGet(defaults) {
  return new Promise((resolve) => {
    if (!globalThis.chrome?.storage?.local) {
      resolve(defaults);
      return;
    }
    chrome.storage.local.get(defaults, resolve);
  });
}

async function syncVisibleMetrics(options = {}) {
  const stored = await chromeStorageGet({
    projectPath: "",
    rootPath: "",
    chapterNo: 1,
    localIngestUrl: DEFAULT_LOCAL_INGEST_URL,
    outcome: "high_retention",
  });
  const project_path = options.projectPath || stored.projectPath || "";
  const root = options.rootPath || stored.rootPath || "";
  if (!project_path) return { status: "missing_project_path" };
  if (!root) return { status: "missing_portfolio_root" };
  const { metrics } = collectVisibleMetrics();
  if (!Object.keys(metrics).length) return { status: "no_metrics_found" };
  const response = await fetch(options.localIngestUrl || stored.localIngestUrl || DEFAULT_LOCAL_INGEST_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      root,
      project_path,
      chapter_no: Number(options.chapterNo || stored.chapterNo || 1),
      platform: location.hostname.includes("fanqie") ? "fanqie" : location.hostname,
      source: "browser_extension_visible_dom",
      outcome: options.outcome || stored.outcome || "high_retention",
      metrics,
      raw: {
        url: location.href,
        title: document.title,
        saved_source_text: false,
      },
    }),
  });
  return response.json();
}

window.novelStudioSyncVisibleMetrics = syncVisibleMetrics;

function collectVisibleReferenceChapter(options = {}) {
  const text = document.body.innerText || "";
  return {
    chapter_no: Number(options.chapterNo || 1),
    url: location.href,
    title: document.title,
    text,
    saved_source_text: false,
  };
}

async function syncVisibleReferenceStructure(options = {}) {
  const stored = await chromeStorageGet({
    projectPath: "",
    referenceName: "benchmark-book",
    referenceChapterNo: 1,
    referenceReadUrl: DEFAULT_REFERENCE_READ_URL,
  });
  const project = options.projectPath || stored.projectPath || "";
  if (!project) return { status: "missing_project_path" };
  const chapter = collectVisibleReferenceChapter({
    chapterNo: options.chapterNo || stored.referenceChapterNo || 1,
  });
  const response = await fetch(options.referenceReadUrl || stored.referenceReadUrl || DEFAULT_REFERENCE_READ_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project,
      name: options.referenceName || stored.referenceName || "benchmark-book",
      confirm: true,
      chapter_limit: 1,
      chapters: [chapter],
      raw: {
        url: location.href,
        title: document.title,
        saved_source_text: false,
      },
    }),
  });
  return response.json();
}

window.novelStudioSyncVisibleReferenceStructure = syncVisibleReferenceStructure;
