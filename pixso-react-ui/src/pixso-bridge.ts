type JsonRecord = Record<string, unknown>;
type BridgeAction = (target?: HTMLElement | null) => unknown | Promise<unknown>;

const state = {
  selectedTool: localStorage.getItem("octosage:video-tool") || "jimeng",
  selectedPlatform: localStorage.getItem("octosage:publish-platform") || "fanqie",
  workspaceTheme: localStorage.getItem("octosage:workspace-theme") || "dark",
  workspaceRoot:
    localStorage.getItem("octosage:workspace-root")
    || new URLSearchParams(window.location.search).get("defaultRoot")
    || "",
};

if (state.workspaceRoot && !localStorage.getItem("octosage:workspace-root")) {
  localStorage.setItem("octosage:workspace-root", state.workspaceRoot);
}
window.__OCTOSAGE_WORKSPACE_ROOT__ = state.workspaceRoot;

const asRecord = (value: unknown): JsonRecord => (value && typeof value === "object" ? value as JsonRecord : {});

const postJson = async (url: string, body: JsonRecord = {}) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String((payload as JsonRecord).error || response.statusText));
  return payload;
};

const getJson = async (url: string) => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String((payload as JsonRecord).error || response.statusText));
  return payload;
};

const getProject = () => {
  const fromUrl = new URLSearchParams(window.location.search).get("project") || "";
  if (fromUrl) {
    setProject(fromUrl);
    return fromUrl;
  }
  return localStorage.getItem("octosage:last-project") || "";
};
const projectQuery = (projectPath = getProject()) => projectPath ? `?project=${encodeURIComponent(projectPath)}` : "";

const setProject = (value: unknown) => {
  if (typeof value === "string" && value) {
    localStorage.setItem("octosage:last-project", value);
    const desktop = window.octosageDesktop || window.novelStudioDesktop;
    void desktop?.setCurrentProject?.(value).catch(() => undefined);
  }
};

const getWorkspaceRoot = () => localStorage.getItem("octosage:workspace-root") || state.workspaceRoot || "";

const setWorkspaceRoot = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return "";
  const workspaceRoot = value.trim();
  state.workspaceRoot = workspaceRoot;
  localStorage.setItem("octosage:workspace-root", workspaceRoot);
  localStorage.removeItem("octosage:last-project");
  window.__OCTOSAGE_WORKSPACE_ROOT__ = workspaceRoot;
  window.dispatchEvent(new CustomEvent("octosage:workspace-root", { detail: { workspaceRoot } }));
  window.dispatchEvent(new CustomEvent("octosage:data-refresh"));
  return workspaceRoot;
};

const persistDesktopWorkspaceRoot = async (workspaceRoot: string) => {
  const desktop = window.octosageDesktop || window.novelStudioDesktop;
  if (desktop?.setWorkspaceRoot) {
    await desktop.setWorkspaceRoot(workspaceRoot);
  }
};

const hydrateDesktopSettings = async () => {
  const desktop = window.octosageDesktop || window.novelStudioDesktop;
  if (!desktop?.getSettings) return;
  const settings = await desktop.getSettings().catch(() => null) as JsonRecord | null;
  const workspaceRoot = typeof settings?.workspaceRoot === "string" ? settings.workspaceRoot : "";
  if (workspaceRoot && workspaceRoot !== getWorkspaceRoot()) {
    setWorkspaceRoot(workspaceRoot);
  }
  const currentProject = typeof settings?.currentProject === "string" ? settings.currentProject : "";
  if (currentProject && !new URLSearchParams(window.location.search).get("project")) {
    setProject(currentProject);
  }
};

const go = (path: string) => {
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === path || window.location.pathname === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

const ensureToast = () => {
  let toast = document.querySelector<HTMLDivElement>("#octosage-toast");
  if (toast) return toast;
  toast = document.createElement("div");
  toast.id = "octosage-toast";
  toast.style.cssText = [
    "position:fixed",
    "right:24px",
    "bottom:24px",
    "z-index:99999",
    "max-width:520px",
    "padding:12px 14px",
    "border-radius:8px",
    "background:rgba(18,18,22,.96)",
    "color:#fff",
    "font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif",
    "box-shadow:0 18px 45px rgba(0,0,0,.24)",
    "opacity:0",
    "transform:translateY(8px)",
    "transition:opacity .18s ease,transform .18s ease",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(toast);
  return toast;
};

let toastTimer: number | undefined;
const notify = (message: string, persistent = false) => {
  const toast = ensureToast();
  toast.textContent = message;
  window.clearTimeout(toastTimer);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });
  if (!persistent) {
    toastTimer = window.setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
    }, 3600);
  }
  console.log("[OctoSage]", message);
};

const emitActionError = (message: string, label = "操作没有完成") => {
  window.dispatchEvent(new CustomEvent("octosage:action-error", {
    detail: {
      label,
      message,
      at: new Date().toISOString(),
    },
  }));
};

const setBusyState = (message = "") => {
  document.body.dataset.octoBusy = message ? "true" : "false";
  window.dispatchEvent(new CustomEvent("octosage:busy", { detail: { message } }));
};

const notifyDataRefresh = () => window.dispatchEvent(new CustomEvent("octosage:data-refresh"));

const providerLabels: Record<string, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  doubao: "豆包",
  wenxin: "文心",
  qwen: "Qwen",
  kimi: "Kimi",
};

const modelSmokeStorageKey = "octosage:model-smoke-status";

const readModelSmokeStatus = (): JsonRecord => {
  try {
    return JSON.parse(localStorage.getItem(modelSmokeStorageKey) || "{}") as JsonRecord;
  } catch {
    return {};
  }
};

const writeModelSmokeStatus = (provider: string, patch: JsonRecord) => {
  if (!provider) return;
  const next = {
    ...readModelSmokeStatus(),
    [provider]: {
      ...asRecord(readModelSmokeStatus()[provider]),
      ...patch,
      provider,
      updated_at: new Date().toISOString(),
    },
  };
  localStorage.setItem(modelSmokeStorageKey, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("octosage:model-smoke", { detail: { provider, status: next[provider] } }));
};

const providerFromTarget = (target?: HTMLElement | null) =>
  target?.closest<HTMLElement>("[data-octo-provider]")?.dataset.octoProvider || "";

const modelFromTarget = (target?: HTMLElement | null) =>
  target?.closest<HTMLElement>("[data-octo-model]")?.dataset.octoModel || "";

const runProviderSmoke = async (provider: string, model: string, { announce = true } = {}) => {
  if (!provider) throw new Error("没有找到要测试的模型。");
  const label = providerLabels[provider] || provider;
  writeModelSmokeStatus(provider, { state: "checking", message: "正在连接..." });
  try {
    const result = await postJson("/api/settings/model-smoke", {
      allow_network: true,
      provider,
      ...(model ? { model } : {}),
    }) as JsonRecord;
    const preview = String(result.text_preview || "");
    writeModelSmokeStatus(provider, {
      state: "ok",
      message: preview ? `连接成功：${preview.slice(0, 36)}` : "连接成功",
    });
    if (announce) notify(`${label} 连接成功`);
    return result;
  } catch (error) {
    const message = friendlyErrorMessage(error);
    writeModelSmokeStatus(provider, { state: "fail", message });
    if (announce) notify(`${label} 连接失败：${message}`, true);
    return null;
  }
};

const notifyTaskProgress = (task: JsonRecord, label = "") => {
  window.dispatchEvent(new CustomEvent("octosage:task-progress", {
    detail: {
      label,
      task,
      progress: asRecord(task.progress),
      status: String(task.status || ""),
      type: String(task.type || ""),
    },
  }));
};

const friendlyErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error || "");
  if (!raw) return "操作没有完成，请稍后重试。";
  const compactRaw = raw
    .replace(/<!doctype html[\s\S]*/i, "上游返回 HTML 错误页")
    .replace(/<html[\s\S]*/i, "上游返回 HTML 错误页")
    .replace(/\s+/g, " ")
    .trim();
  const rules: Array<[RegExp, string]> = [
    [/Failed to parse URL|Invalid URL|model.*not.*exist|invalid.*model|model_not_found|模型不存在|模型名称/i, "模型配置不可用。请检查 Base URL 是否带了引号/多余字符，或确认百炼已开通 qwen3.6-plus；必要时会降级到 qwen-plus。"],
    [/502|503|504|Bad gateway|上游返回 HTML 错误页|Cloudflare/i, "模型服务或中转暂时不可用。请稍后重试，或更换该模型的 Base URL。"],
    [/project path is required|project\.json|ENOENT/i, "没有找到当前项目。请先在网文书架创建或选择一本书。"],
    [/API Key|OPENAI_API_KEY|DEEPSEEK_API_KEY|DOUBAO_API_KEY|QIANFAN_API_KEY|DASHSCOPE_API_KEY|MOONSHOT_API_KEY/i, "还没有配置可用模型 API Key。请先到系统配置里添加至少一个真实 API Key。"],
    [/401|403|unauthorized|forbidden/i, "模型或平台拒绝了请求，请检查 API Key、账号权限或额度。"],
    [/429|quota|rate limit|insufficient/i, "模型额度或频率受限，请稍后重试，或换一个可用账号。"],
    [/timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|fetch failed|network/i, "网络或本地服务暂时不可用，请检查网络、代理或发布助手。"],
    [/mock|演示/i, "当前章节是演示内容，不能导出、转视频或发布。请配置真实模型后重新写作。"],
    [/missing|正文|章节|no such file/i, "还没有生成可用章节。请先在网文工作台写作。"],
    [/WebBridge|daemon|not installed/i, "发布助手还没有准备好，请先检测或启动助手。"],
  ];
  for (const [pattern, message] of rules) {
    if (pattern.test(compactRaw)) return message;
  }
  return compactRaw.length > 120 ? `${compactRaw.slice(0, 120)}...` : compactRaw;
};

const workspaceThemes: Record<string, {
  label: string;
  bg: string;
  side: string;
  surface: string;
  surface2: string;
  soft: string;
  text: string;
  ink: string;
  muted: string;
  faint: string;
  line: string;
  border: string;
  manuscript: string;
  hover: string;
}> = {
  light: {
    label: "亮色",
    bg: "#ffffff",
    side: "#f7f7fb",
    surface: "#ffffff",
    surface2: "#f6f7fb",
    soft: "#f6f7fb",
    text: "#15151a",
    ink: "#15151a",
    muted: "#767683",
    faint: "#a3a3ad",
    line: "rgba(21, 21, 26, 0.08)",
    border: "rgba(21, 21, 26, 0.10)",
    manuscript: "#ffffff",
    hover: "#eceef5",
  },
  warm: {
    label: "暖色",
    bg: "#fcfbf6",
    side: "#f7f2ea",
    surface: "#fffdf8",
    surface2: "#f3eee5",
    soft: "#f3eee5",
    text: "#211b16",
    ink: "#211b16",
    muted: "#7d7168",
    faint: "#a5978b",
    line: "rgba(33, 27, 22, 0.1)",
    border: "rgba(33, 27, 22, 0.12)",
    manuscript: "#fffdf8",
    hover: "#ece4d8",
  },
  mist: {
    label: "浅灰",
    bg: "#f7f8fa",
    side: "#eef1f5",
    surface: "#ffffff",
    surface2: "#eef1f5",
    soft: "#eef1f5",
    text: "#15151a",
    ink: "#15151a",
    muted: "#697181",
    faint: "#98a1ad",
    line: "rgba(21, 21, 26, 0.09)",
    border: "rgba(21, 21, 26, 0.11)",
    manuscript: "#ffffff",
    hover: "#e4e8ef",
  },
  dark: {
    label: "暗色",
    bg: "#151310",
    side: "#1f1b17",
    surface: "#24201c",
    surface2: "#302a25",
    soft: "#302a25",
    text: "#f4eee7",
    ink: "#24180d",
    muted: "#b5aaa0",
    faint: "#8f8174",
    line: "rgba(244, 238, 231, 0.12)",
    border: "rgba(244, 238, 231, 0.14)",
    manuscript: "#fffaf1",
    hover: "#39322c",
  },
};

const applyWorkspaceTheme = (themeKey: string) => {
  const theme = workspaceThemes[themeKey] || workspaceThemes.dark;
  state.workspaceTheme = themeKey;
  localStorage.setItem("octosage:workspace-theme", themeKey);
  document.documentElement.dataset.octoTheme = themeKey;
  document.documentElement.style.setProperty("--octo-workspace-bg", theme.bg);
  document.documentElement.style.setProperty("--octo-workspace-side", theme.side);
  document.documentElement.style.setProperty("--octo-surface", theme.surface);
  document.documentElement.style.setProperty("--octo-surface-2", theme.surface2);
  document.documentElement.style.setProperty("--octo-soft", theme.soft);
  document.documentElement.style.setProperty("--octo-text", theme.text);
  document.documentElement.style.setProperty("--octo-ink", theme.ink);
  document.documentElement.style.setProperty("--octo-muted", theme.muted);
  document.documentElement.style.setProperty("--octo-faint", theme.faint);
  document.documentElement.style.setProperty("--octo-line", theme.line);
  document.documentElement.style.setProperty("--octo-border", theme.border);
  document.documentElement.style.setProperty("--octo-manuscript-bg", theme.manuscript);
  document.documentElement.style.setProperty("--octo-hover", theme.hover);
  window.dispatchEvent(new CustomEvent("octosage:workspace-theme", { detail: { themeKey } }));
  return theme;
};

const refreshUiData = async () => {
  const project = getProject();
  const status = project ? await getJson(`/api/status?project=${encodeURIComponent(project)}`) as JsonRecord : {};
  setProject(asRecord(status).project_path);
  const dashboard = project ? await getJson(`/api/dashboard?project=${encodeURIComponent(getProject())}`) as JsonRecord : {};
  window.__OCTOSAGE_DASHBOARD__ = dashboard;
  notifyDataRefresh();
  return { status, dashboard };
};

const showSettings = async () => {
  const data = await getJson("/api/settings/api-keys") as { keys?: Array<JsonRecord> };
  window.__OCTOSAGE_API_KEYS__ = data.keys as Array<JsonRecord> || [];
  window.dispatchEvent(new CustomEvent("octosage:api-keys", { detail: data }));
  return data;
};

const requireProject = () => {
  if (!getProject()) {
    go("/novels");
    throw new Error("请先创建或选择一本书。");
  }
};

const getWorkspaceReady = async () => {
  requireProject();
  return getJson(`/api/workspace/ready?project=${encodeURIComponent(getProject())}`) as Promise<JsonRecord>;
};

const requireWritingReady = async () => {
  const snapshot = await getWorkspaceReady();
  const ready = asRecord(snapshot.ready);
  if (!ready.has_any_model_key) {
    go("/settings");
    throw new Error("请先在系统配置里填写真实模型 API Key。");
  }
  return snapshot;
};

const requireCompletedChapters = async () => {
  const snapshot = await getWorkspaceReady();
  const ready = asRecord(snapshot.ready);
  if (!ready.can_export) {
    go("/novel/workbench");
    throw new Error("还没有真实章节正文。请先在网文工作台写作。");
  }
  return snapshot;
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const isWritingTask = (task: JsonRecord) => {
  const type = String(task.type || "");
  return type === "run_single_chapter" || type === "run_project";
};

const writingResultSummary = (task: JsonRecord) => {
  const result = asRecord(task.result);
  const type = String(task.type || "");
  if (type === "run_single_chapter") {
    if (result.status === "approved" && result.export_path) {
      return `第 ${Number(result.chapter_no || 1)} 章写作完成，正文已显示在工作台。`;
    }
    const stop = asRecord(result.stop);
    throw new Error(`写作未完成：${String(stop.reason || result.status || "没有生成正文")}`);
  }
  if (type === "run_project") {
    const batches = Array.isArray(result.batches) ? result.batches : [];
    const exported = batches
      .flatMap((batch) => Array.isArray(asRecord(batch).chapters) ? asRecord(batch).chapters as JsonRecord[] : [])
      .filter((chapter) => chapter.export_path).length;
    if (result.status === "completed" && exported > 0) return `连续写作完成，已生成 ${exported} 章。`;
    const stop = asRecord(result.stop);
    throw new Error(`连续写作未完成：${String(stop.reason || result.status || "没有生成正文")}`);
  }
  return "";
};

const summarizeActionResult = (label: string, result: unknown) => {
  const record = result as JsonRecord;
  const status = String(record?.status || "");
  if (["blocked", "stopped", "failed", "error"].includes(status)) throw new Error(String(record.message || record.error || status));
  if (status === "planned") return `${label}已生成计划。`;
  if (status === "browser_ready") return `${label}已生成浏览器安全交接包，最终提交仍由你确认。`;
  if (status === "browser_driver_required") return `${label}需要启动可见浏览器助手。`;
  const path = String(record?.path || record?.manifest_path || record?.storyboard_path || record?.screenplay_path || record?.browser_handoff_path || "");
  if (path) return `${label}完成：${path}`;
  if (status === "saved") return `${label}已保存`;
  if (status === "created") return `${label}已创建`;
  return "";
};

const pollDelay = (attempt: number) => {
  if (attempt < 10) return 1000;
  if (attempt < 30) return 3000;
  return 5000;
};

const pollTask = async (taskId: string, label: string) => {
  let lastStatus = "";
  for (let i = 0; i < 160; i += 1) {
    const project = getProject();
    const query = project ? `?project=${encodeURIComponent(project)}` : "";
    const task = await getJson(`/api/tasks/${encodeURIComponent(taskId)}${query}`) as JsonRecord;
    notifyTaskProgress(task, label);
    const status = String(task.status || "");
    if (status && status !== lastStatus) {
      lastStatus = status;
      const progress = asRecord(task.progress);
      const chapterNo = Number(progress.chapter_no || window.__OCTOSAGE_DASHBOARD__?.current_chapter || 1);
      const step = String(progress.step || status);
      if (status === "running") {
        setBusyState(`正在处理第 ${chapterNo} 章 · ${step}`);
      } else if (!(isWritingTask(task) && status === "completed")) {
        notify(`${label}${status === "completed" ? "完成" : status === "failed" ? "失败" : "进行中"}`);
      }
    }
    if (status === "completed") {
      await refreshUiData().catch(() => undefined);
      const summary = isWritingTask(task) ? writingResultSummary(task) : "";
      if (summary) notify(summary);
      notifyTaskProgress(task, label);
      notifyDataRefresh();
      setBusyState("");
      return task;
    }
    if (status === "failed") {
      setBusyState("");
      notifyTaskProgress(task, label);
      throw new Error(String(task.error || `${label}失败`));
    }
    await sleep(pollDelay(i));
  }
  throw new Error(`${label}超时，请稍后回到工作台查看结果。`);
};

const withFeedback = async (label: string, action: () => Promise<unknown>) => {
  notify(`${label}中...`);
  setBusyState(`${label}中...`);
  try {
    const result = await action();
    const record = result as JsonRecord;
    const id = typeof record?.id === "string" ? record.id : "";
    const taskId = typeof record?.task_id === "string" ? record.task_id : (id && !id.includes("webbridge") ? id : "");
    if (taskId) {
      notify(`${label}已开始`);
      return await pollTask(taskId, label);
    }
    notify(summarizeActionResult(label, result) || `${label}完成`);
    await refreshUiData().catch(() => undefined);
    notifyDataRefresh();
    setBusyState("");
    return result;
  } catch (error) {
    setBusyState("");
    const message = friendlyErrorMessage(error);
    emitActionError(message, `${label}失败`);
    notify(`${label}失败：${message}`, true);
    return null;
  }
};

const projectBody = (extra: JsonRecord = {}) => ({ project: getProject(), ...extra });
const currentDirectories = (): JsonRecord => asRecord(window.__OCTOSAGE_DASHBOARD__?.directories);
const currentChapterNo = () => Math.max(1, Number(window.__OCTOSAGE_DASHBOARD__?.current_chapter || 1));
const completedChapterNo = () => Math.max(1, Number(
  window.__OCTOSAGE_DASHBOARD__?.latest_completed_chapter
    || window.__OCTOSAGE_DASHBOARD__?.completed_chapters
    || currentChapterNo()
    || 1,
));
const selectedChapterNo = () => Math.max(1, Number(localStorage.getItem("octosage:selected-chapter") || completedChapterNo()));
const currentRange = () => ({ from: 1, to: completedChapterNo() });
const nextBatchRange = (size = 5) => {
  const from = currentChapterNo();
  return { from, to: from + size - 1 };
};

const openLocalPath = async (filePath: unknown) => {
  const localPath = String(filePath || "");
  if (!localPath) {
    notify("路径还没有读取到。");
    return null;
  }
  const desktop = window.octosageDesktop || window.novelStudioDesktop;
  if (desktop?.openPath) return desktop.openPath(localPath);
  return postJson("/api/open-path", { path: localPath });
};

const confirmPublishAssistant = () => {
  const platformMap: Record<string, string> = {
    fanqie: "番茄作家后台",
    qidian: "起点作家后台",
    "17k": "17K 作家后台",
  };
  const title = String(window.__OCTOSAGE_DASHBOARD__?.project_title || "当前作品");
  const range = currentRange();
  const platform = platformMap[state.selectedPlatform] || state.selectedPlatform;
  return window.confirm([
    `即将准备 ${platform} 的辅助填表资料。`,
    "",
    `书名：${title}`,
    `章节：第 ${range.from}-${range.to} 章`,
    `平台：${platform}`,
    "",
    "系统不会点击最终发布/提交按钮。",
    "最终提交永远由用户确认；OctoSage 不会静默执行远程安装脚本。",
  ].join("\n"));
};

const loginFormData = (target?: HTMLElement | null) => {
  const root = target?.closest<HTMLElement>(".octo-auth-card") || document.body;
  const input = (name: string) => root.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value?.trim() || "";
  return {
    nickname: input("nickname"),
    account: input("account"),
    email: input("email"),
  };
};

const setLocalAccount = (name: string, meta = "本地账号 · 已保存") => {
  const account = {
    name: name || "本地账号",
    meta,
    signed_in_at: new Date().toISOString(),
  };
  localStorage.setItem("octosage:account", JSON.stringify(account));
  window.dispatchEvent(new CustomEvent("octosage:account", { detail: { account } }));
  return account;
};

const openDocUrl = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

const getSupportSummary = async () => {
  const project = getProject();
  if (!project) return {};
  return getJson(`/api/support/summary?project=${encodeURIComponent(project)}`) as Promise<JsonRecord>;
};

const actions = {
  home: () => go("/"),
  goHome: () => go("/"),
  goNovels: () => go("/novels"),
  goReference: () => go(`/reference${projectQuery()}`),
  goComics: () => go("/comics"),
  goPublish: () => go(`/novel/workbench${projectQuery()}`),
  goNovelWorkbench: () => go(`/novel/workbench${projectQuery()}`),
  goNovelPlanning: () => go(`/novel/workbench${projectQuery()}`),
  goNovelQuality: () => go(`/novel/workbench${projectQuery()}`),
  goNovelPublish: () => go(`/novel/workbench${projectQuery()}`),
  goComicWorkbench: () => go(`/comic/workbench${projectQuery()}`),
  write: () => go(`/novel/workbench${projectQuery()}`),
  video: () => go(`/comic/workbench${projectQuery()}`),
  publish: () => go(`/novel/workbench${projectQuery()}`),
  dashboard: () => go("/"),
  toggleCreationNav: () => undefined,
  openNewBook: () => window.dispatchEvent(new CustomEvent("octosage:open-new-book")),
  settings: () => {
    go("/settings");
    return withFeedback("刷新系统配置", showSettings);
  },
  health: () => getJson("/api/health"),

  writeChapter: () => withFeedback("续写下一章", async () => {
    await requireWritingReady();
    if (!location.pathname.startsWith("/novel/workbench")) {
      go(`/novel/workbench${projectQuery()}`);
    }
    return postJson("/api/run", projectBody());
  }),
  runBatch: () => withFeedback("连续写5章", async () => {
    await requireWritingReady();
    if (!location.pathname.startsWith("/novel/workbench")) {
      go(`/novel/workbench${projectQuery()}`);
    }
    return postJson("/api/run-project", projectBody({ until_chapter: nextBatchRange(5).to, resume: true }));
  }),
  quality: () => withFeedback("审本章", async () => {
    await requireCompletedChapters();
    const no = selectedChapterNo();
    const result = await getJson(`/api/chapter/review?project=${encodeURIComponent(getProject())}&chapter_no=${no}`);
    notifyDataRefresh();
    return result;
  }),
  premiumGate: () => withFeedback("精品线检查", async () => {
    await requireCompletedChapters();
    return postJson("/api/premium-gate", projectBody({ ...currentRange(), target_score: 95 }));
  }),
  exportMerged: () => withFeedback("导出正文合并稿", async () => {
    await requireCompletedChapters();
    return postJson("/api/export/merged", projectBody(currentRange()));
  }),
  workspaceReady: () => withFeedback("检查工作台状态", getWorkspaceReady),

  videoPack: () => withFeedback("导出全量视频素材包", async () => {
    await requireCompletedChapters();
    go(`/comic/workbench${projectQuery()}`);
    return postJson("/api/video/full-pack", projectBody({ ...currentRange(), tool: state.selectedTool }));
  }),
  videoScript: () => withFeedback("生成剧本", async () => {
    await requireCompletedChapters();
    return postJson("/api/video/script", projectBody({ chapter_no: selectedChapterNo() }));
  }),
  videoStoryboard: () => withFeedback("生成分镜", async () => {
    await requireCompletedChapters();
    return postJson("/api/video/storyboard", projectBody({ chapter_no: selectedChapterNo(), tool: state.selectedTool }));
  }),
  videoPrompts: () => withFeedback("生成视频提示词", async () => {
    await requireCompletedChapters();
    return postJson("/api/video/prompts", projectBody({ chapter_no: selectedChapterNo(), tool: state.selectedTool }));
  }),
  charRefs: () => withFeedback("生成角色参考", async () => {
    await requireCompletedChapters();
    return postJson("/api/video/char-refs", projectBody(currentRange()));
  }),
  sceneRefs: () => withFeedback("生成场景参考", async () => {
    await requireCompletedChapters();
    return postJson("/api/video/scene-refs", projectBody(currentRange()));
  }),
  saveVideoDraft: () => {
    const saveButton = [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "保存") as HTMLButtonElement | undefined;
    if (saveButton && !saveButton.disabled) {
      saveButton.click();
      return true;
    }
    notify("请先生成或打开一个可编辑的视频素材，再点击保存。", true);
    return false;
  },
  selectJimeng: () => {
    state.selectedTool = "jimeng";
    localStorage.setItem("octosage:video-tool", "jimeng");
    notify("视频工具：即梦");
  },
  selectRunway: () => {
    state.selectedTool = "runway";
    localStorage.setItem("octosage:video-tool", "runway");
    notify("视频工具：Runway");
  },
  selectKling: () => {
    state.selectedTool = "kling";
    localStorage.setItem("octosage:video-tool", "kling");
    notify("视频工具：可灵");
  },

  publishPackage: () => withFeedback("生成投稿包", async () => {
    await requireCompletedChapters();
    return postJson("/api/publish/package", projectBody({ ...currentRange(), platform: state.selectedPlatform }));
  }),
  publishAdapters: () => withFeedback("读取发布平台规则", () => getJson("/api/publish/adapters")),
  publishProfiles: () => withFeedback("读取发布平台资料", () => getJson("/api/publish/platform-profiles")),
  publishPlan: () => withFeedback("生成发布方案", async () => {
    await requireCompletedChapters();
    return postJson("/api/publish/plan", projectBody({ ...currentRange(), platform: state.selectedPlatform }));
  }),
  publishPlatform: () => withFeedback("准备辅助填表", async () => {
    await requireCompletedChapters();
    if (!confirmPublishAssistant()) throw new Error("已取消辅助填表。");
    return postJson("/api/publish/browser", projectBody({
      ...currentRange(),
      platform: state.selectedPlatform,
      confirmed: true,
      launch_browser: true,
    }));
  }),
  selectFanqie: () => {
    state.selectedPlatform = "fanqie";
    localStorage.setItem("octosage:publish-platform", "fanqie");
    notify("发布平台：番茄");
  },
  selectQidian: () => {
    state.selectedPlatform = "qidian";
    localStorage.setItem("octosage:publish-platform", "qidian");
    notify("发布平台：起点");
  },
  select17k: () => {
    state.selectedPlatform = "17k";
    localStorage.setItem("octosage:publish-platform", "17k");
    notify("发布平台：17K");
  },
  kimiWebbridgeStatus: () => withFeedback("检测发布助手", () => getJson("/api/publish/webbridge/status")),
  kimiWebbridgeStart: () => withFeedback("启动发布助手", () => postJson("/api/publish/webbridge/start")),
  kimiWebbridgeInstall: async () => {
    const result = await getJson("/api/publish/webbridge/install") as JsonRecord;
    const command = String(result.install_command || "irm https://cdn.kimi.com/webbridge/install.ps1 | iex");
    await navigator.clipboard.writeText(command).catch(() => undefined);
    notify(`安装命令已复制：${command}`);
    return result;
  },

  dynamicTemplates: () => withFeedback("更新动态模板库", () => postJson("/api/incubation/templates", projectBody({ root: getWorkspaceRoot() || undefined }))),
  premiumIncubation: () => withFeedback("一键精品孵化", () => postJson("/api/incubation/premium", projectBody({ root: getWorkspaceRoot() || undefined, until_chapter: currentChapterNo() + 4, target_chapters: 5 }))),
  referenceLibrary: () => withFeedback("推荐对标库", () => postJson("/api/reference/library", projectBody({ root: getWorkspaceRoot() || undefined }))),
  refreshDashboard: () => withFeedback("刷新数据", refreshUiData),
  refreshSettings: () => withFeedback("刷新系统配置", showSettings),

  saveApiKey: (target?: HTMLElement | null) => withFeedback("保存 API Key", async () => {
    const row = target?.closest<HTMLElement>("[data-api-key-name]");
    const provider = providerFromTarget(target);
    const model = modelFromTarget(target);
    const name = row?.dataset.apiKeyName || "";
    const input = row?.querySelector<HTMLInputElement>("input[data-api-key-input]");
    const value = input?.value?.trim() || "";
    if (!name) throw new Error("没有找到要保存的 API 类型。");
    if (!value) throw new Error("请先输入 API Key。");
    const result = await postJson("/api/settings/api-keys", { name, value });
    if (input) input.value = "";
    await showSettings();
    if (provider) {
      await runProviderSmoke(provider, model, { announce: false });
    }
    return result;
  }),
  modelSmoke: (target?: HTMLElement | null) => withFeedback("测试模型连接", () =>
    runProviderSmoke(providerFromTarget(target), modelFromTarget(target))),
  chooseWorkspace: async () => {
    const startPath = getWorkspaceRoot() || getProject();
    const desktop = window.octosageDesktop || window.novelStudioDesktop;
    if (desktop?.chooseDirectory) {
      const result = await desktop.chooseDirectory({ startPath, persistWorkspace: true });
      if (result) {
        setWorkspaceRoot(result);
        await persistDesktopWorkspaceRoot(result);
        notify(`工作区已切换：${result}`);
      }
      return result;
    }
    const fallback = window.prompt("请输入工作区路径", startPath);
    if (fallback && fallback.trim()) {
      const workspaceRoot = setWorkspaceRoot(fallback);
      await persistDesktopWorkspaceRoot(workspaceRoot);
      notify(`工作区已切换：${workspaceRoot}`);
      return workspaceRoot;
    }
    return "";
  },
  openWorkspaceRoot: () => withFeedback("打开工作区", () => openLocalPath(getWorkspaceRoot() || getProject())),
  openProjectDir: () => withFeedback("打开项目目录", () => openLocalPath(currentDirectories().project || getProject())),
  openChaptersDir: () => withFeedback("打开章节目录", () => openLocalPath(currentDirectories().chapters)),
  openExportsDir: () => withFeedback("打开导出目录", () => openLocalPath(currentDirectories().exports)),
  openPathFromDataset: (target?: HTMLElement | null) => openLocalPath(target?.dataset.octoOpenPath),
  setWorkspaceTheme: (themeKey?: unknown) => applyWorkspaceTheme(String(themeKey || "dark")),
  cycleWorkspaceTheme: () => {
    const order = ["dark", "warm", "light", "mist"];
    const currentIndex = order.indexOf(state.workspaceTheme);
    const nextKey = order[(currentIndex + 1) % order.length] || "dark";
    const theme = applyWorkspaceTheme(nextKey);
    notify(`工作区背景：${theme.label}`);
    return nextKey;
  },

  goLogin: () => go("/login"),
  goRegister: () => go("/register"),
  loginLocal: (target?: HTMLElement | null) => {
    const form = loginFormData(target);
    const accountName = form.account || form.email || "本地账号";
    setLocalAccount(accountName);
    notify(`登录状态已保存：${accountName}`);
    go("/");
  },
  registerLocal: (target?: HTMLElement | null) => {
    const form = loginFormData(target);
    const accountName = form.nickname || form.account || form.email || "本地账号";
    setLocalAccount(accountName);
    notify(`本地账号已创建：${accountName}`);
    go("/");
  },
  copySupportWechat: async () => {
    const wechat = "OctoSage-Help";
    await navigator.clipboard.writeText(wechat).catch(() => undefined);
    notify(`客服微信：${wechat}`);
    return wechat;
  },
  openQuickStartDoc: async () => {
    const support = await getSupportSummary();
    const url = String(asRecord(support.docs).quick_start_url || "/docs/QUICKSTART.md");
    openDocUrl(url);
    return url;
  },
  openChangelogDoc: async () => {
    const support = await getSupportSummary();
    const url = String(asRecord(support.docs).changelog_url || "/docs/CHANGELOG.md");
    openDocUrl(url);
    return url;
  },
  exportDiagnostics: () => withFeedback("导出诊断包", () => postJson("/api/support/diagnostics/export", { project: getProject() })),
};

const idActions: Record<string, keyof typeof actions> = {};

const safePublishPreview = { confirmed: false };
void safePublishPreview;

function findActionFromNode(target: HTMLElement | null): keyof typeof actions | null {
  if (!target) return null;
  if (target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']")) return null;
  const explicit = target.closest<HTMLElement>("[data-octo-action]")?.dataset.octoAction as keyof typeof actions | undefined;
  if (explicit && actions[explicit]) return explicit;
  let node: HTMLElement | null = target.closest("[id]");
  while (node && node !== document.body) {
    const action = idActions[node.id];
    if (action) return action;
    node = node.parentElement;
  }
  return null;
}

const runBridgeAction = async (action: keyof typeof actions, target?: HTMLElement | null) => {
  try {
    return await (actions[action] as BridgeAction)(target);
  } catch (error) {
    setBusyState("");
    const message = friendlyErrorMessage(error);
    emitActionError(message);
    notify(`操作失败：${message}`, true);
    return null;
  }
};

declare global {
  interface Window {
    OctoSageBridge?: typeof actions;
    novelStudioDesktop?: {
      openPath?: (filePath: string) => Promise<unknown>;
      chooseDirectory?: (input?: string | { startPath?: string; persistWorkspace?: boolean }) => Promise<string>;
      getSettings?: () => Promise<JsonRecord>;
      setWorkspaceRoot?: (root: string) => Promise<unknown>;
      setCurrentProject?: (projectPath: string) => Promise<unknown>;
    };
    octosageDesktop?: {
      openPath?: (filePath: string) => Promise<unknown>;
      chooseDirectory?: (input?: string | { startPath?: string; persistWorkspace?: boolean }) => Promise<string>;
      getSettings?: () => Promise<JsonRecord>;
      setWorkspaceRoot?: (root: string) => Promise<unknown>;
      setCurrentProject?: (projectPath: string) => Promise<unknown>;
    };
    __OCTOSAGE_DASHBOARD__?: JsonRecord;
    __OCTOSAGE_API_KEYS__?: Array<JsonRecord>;
    __OCTOSAGE_WORKSPACE_ROOT__?: string;
  }
}

window.OctoSageBridge = actions;
applyWorkspaceTheme(state.workspaceTheme);
void hydrateDesktopSettings().then(() => refreshUiData()).catch(() => undefined);
void actions.health()
  .then(() => refreshUiData())
  .catch(() => undefined);

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  // Skip if the button has a React onClick handler (indicated by data-octo-react attribute)
  if (target?.closest("[data-octo-react]")) return;
  const action = findActionFromNode(target);
  if (!action) return;
  event.preventDefault();
  void runBridgeAction(action, target);
}, true);

document.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName?.toLowerCase();
  const isTyping = tag === "input" || tag === "textarea" || target?.isContentEditable;
  if (event.ctrlKey && event.key === "Enter") {
    event.preventDefault();
    void runBridgeAction("writeChapter", target);
    return;
  }
  if (event.ctrlKey && event.key.toLowerCase() === "r") {
    event.preventDefault();
    void runBridgeAction("quality", target);
    return;
  }
  if (event.ctrlKey && event.key.toLowerCase() === "e") {
    event.preventDefault();
    void runBridgeAction("exportMerged", target);
    return;
  }
  if (isTyping || (event.key !== "Enter" && event.key !== " ")) return;
  const action = findActionFromNode(target);
  if (!action) return;
  event.preventDefault();
  void runBridgeAction(action, target);
}, true);

window.addEventListener("popstate", () => void refreshUiData().catch(() => undefined));
document.addEventListener("DOMContentLoaded", () => {
  void refreshUiData().catch(() => undefined);
});

if (location.pathname === "/settings") void showSettings().catch(() => undefined);
