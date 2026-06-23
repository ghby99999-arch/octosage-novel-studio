import {
  EmptyState,
  formatChapterMeta,
  formatMoney,
  getWorkspaceRoot,
  JsonRecord,
  PixsoPageShell,
  projectQuery,
  safeText,
  usePixsoDashboard,
} from "@/views/PixsoAppShell";
import { AssetLinkList } from "@/components/ui/AssetLinkList";
import { LivePaper } from "@/components/ui/LivePaper";
import { StatusPill } from "@/components/ui/StatusPill";
import { StepRail, type StepRailItem } from "@/components/ui/StepRail";
import { OctoButton as Button, OctoProgressFlow } from "@/components/octo-ui";
import { ManuscriptEditor } from "@/views/novel/ManuscriptEditor";
import { PublishWorkbenchView } from "@/views/novel/PublishWorkbenchView";
import {
  cleanGradeText,
  cleanPublishLabel,
  publishBlockerText,
  QualityCenterView,
  QualityPublishPanel,
  qualityPanelState,
} from "@/views/novel/QualityPanels";
import {
  EditableArtifact,
  MemoryMiniView,
  planningBranchItems,
  ProjectArtifactViewer,
  WorkbenchCatalogPanel,
} from "@/views/novel/WorkbenchCatalog";
import { WritingLiveWorkspace, WritingProgress } from "@/views/novel/WritingProgress";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChapterContent,
  ChapterListItem,
  ChapterReview,
  EditorReport,
  ExportState,
  GlobalReviewsPayload,
  GlobalReviewSummary,
  ProjectMemory,
  ProjectTreeItem,
  ProjectTreePayload,
  SelectedArtifact,
  TaskProgressDetail,
  TextArtifact,
  WorkbenchArtifactView,
  WorkbenchLeftTab,
} from "@/views/novel/types";
import {
  fetchJson,
  gateFrom,
  postJson,
  postTask,
  wordCount,
} from "@/views/novel/utils";

const stepLabels: Record<string, string> = {
  queued: "排队中",
  started: "启动中",
  card: "生成章卡",
  chapter_card: "读取章卡",
  batch: "准备批次",
  write: "写稿中",
  review: "审稿中",
    rewrite: "改稿中",
    global_review: "全局复审",
    global_repair: "跨章返工",
    global_rereview: "全局复审复查",
    state: "提取记忆",
  export: "写入正文",
  batch_completed: "批次完成",
  completed: "已完成",
  failed: "失败",
  stopped: "已停止",
};

const progressStepLabel = (value = "") => {
  const labels: Record<string, string> = {
    queued: "排队中",
    started: "启动中",
    card: "生成章卡",
    card_done: "章卡完成",
    chapter_card: "读取章卡",
    batch: "准备批次",
    write: "写正文",
    write_done: "正文完成",
    review: "自动审稿",
    review_done: "审稿完成",
    rewrite: "自动改稿",
    rewrite_done: "改稿完成",
    global_review: "全局复审",
    global_repair: "跨章返工",
    global_rereview: "全局复审复查",
    model_planning: "模型规划",
    model_fallback: "本地补齐",
    normalize: "整理项目树",
    planning_review: "规划审核",
    planning_rewrite: "自动返工规划",
    planning_review_done: "审核完成",
    write_asset: "写入文件",
    state: "同步记忆",
    state_done: "记忆完成",
    export: "写入章节",
    export_done: "入库完成",
    batch_completed: "批次完成",
    completed: "已完成",
    stopped: "已停止",
    failed: "失败",
  };
  return labels[value] || stepLabels[value] || value || "进行中";
};

const pipelineStatusText = (status = "") => {
  if (status === "done") return "已完成";
  if (status === "running") return "进行中";
  if (status === "skipped") return "未触发";
  return "等待";
};

const modelRoleLabel = (taskType = "", fallback = "") => {
  const map: Record<string, string> = {
    generate_chapter_card: "章卡",
    write_chapter: "正文",
    review_chapter: "审稿",
    rewrite_chapter: "改稿",
    extract_state_candidates: "记忆",
  };
  return map[taskType] || fallback || taskType || "模型";
};

const stopReasonText = (value = "") => ({
  targeted_repair_exhausted: "已自动修完当前上限，仍未达发布线",
  max_rewrites_exhausted: "自动改稿轮数已用完，仍未达发布线",
  degraded_on_rewrite: "改稿后质量变差，已回退到较好版本",
  reviewer_invalid: "审查员无效，已暂停正文返工",
  rollback_required: "审稿判定不可用，需要回退重写",
  publish_gate_not_ready: "发布门禁未通过",
}[String(value || "")] || safeText(value, ""));

const stopRecoveryText = (value = "") => ({
  targeted_repair_exhausted: "下一步：重写本章或继续定点修",
  max_rewrites_exhausted: "下一步：重写本章或继续定点修",
  degraded_on_rewrite: "下一步：已回退稳定版，建议重写本章",
  reviewer_invalid: "下一步：检查审查员连接后重新质检",
  rollback_required: "下一步：回退并重新生成",
  publish_gate_not_ready: "下一步：继续自动修到发布线",
}[String(value || "")] || "");

const readableIssueText = (value = "") => {
  const text = String(value || "");
  if (!text) return "";
  if (/^[a-z_:-]+$/i.test(text)) return publishBlockerText(text);
  return text;
};

const uniqueStrings = (items: unknown[]) => (
  items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
);

const editorAnnotationReviewFrom = (
  review: ChapterReview | null,
  editorReport: EditorReport | null,
  gate: ReturnType<typeof gateFrom>,
): ChapterReview | null => {
  if (!review && !editorReport && !gate) return null;
  const blockers = uniqueStrings([
    ...(gate?.blockers || []),
    ...(review?.publish_gate?.blockers || []),
    ...(editorReport?.publish_gate?.blockers || []),
    ...(editorReport?.stop?.blockers || []),
  ]);
  const issues = uniqueStrings([
    ...(review?.issues || []),
    ...(editorReport?.failure_summary?.reasons || []),
    ...(editorReport?.stop?.blockers || []),
    ...blockers,
  ]);

  return {
    ...(review || {}),
    issues,
    publish_gate: gate
      ? {
          ...(review?.publish_gate || {}),
          ...gate,
          blockers,
        }
      : review?.publish_gate || null,
    publish_ready: Boolean(gate?.publish_ready || review?.publish_ready || editorReport?.publish_ready),
    publish_status: safeText(gate?.label || review?.publish_status || editorReport?.publish_status, ""),
  };
};

const reworkResultSummary = (
  lastReworkProgress: TaskProgressDetail | null,
  chapterNo: number,
  gate: ReturnType<typeof gateFrom>,
  visibleBlockedReasons: string[],
  editorReport: EditorReport | null,
) => {
  const progress = lastReworkProgress?.progress;
  if (!progress) return null;
  const activeChapter = Number(progress.chapter_no || progress.from || 0);
  if (activeChapter && chapterNo && activeChapter !== chapterNo) return null;

  const qualityEvents = Array.isArray(progress.quality_events) ? progress.quality_events : [];
  const hasRepairTrace = qualityEvents.length > 0
    || Boolean(progress.repair_label || progress.repair_taxonomy?.label || progress.repair_taxonomy?.stage_label)
    || /repair|rewrite/i.test(`${lastReworkProgress?.type || ""} ${progress.step || ""}`);
  if (!hasRepairTrace) return null;

  const fixedItems = uniqueStrings([
    progress.repair_label,
    progress.repair_taxonomy?.label,
    progress.repair_taxonomy?.stage_label,
    ...(progress.repair_issues || []),
    ...qualityEvents
      .filter((event) => ["done", "fixed", "pass", "repaired", "completed"].includes(String(event.status || "")))
      .map((event) => event.label || event.detail || event.key),
  ])
    .map(readableIssueText)
    .filter(Boolean);
  const remainingItems = uniqueStrings([
    ...visibleBlockedReasons,
    ...(gate?.blockers || []),
    ...(progress.blockers || []),
    ...(editorReport?.failure_summary?.reasons || []),
  ])
    .map(readableIssueText)
    .filter(Boolean);
  const fixedText = fixedItems.length ? fixedItems.slice(0, 3).join(" / ") : "本章门禁问题";
  const remainingText = remainingItems.length ? remainingItems.slice(0, 3).join(" / ") : "等待审查员复核";

  if (gate?.publish_ready || editorReport?.publish_ready) {
    return {
      tone: "ready",
      title: "已修复到可发布",
      detail: `已修复：${fixedText}`,
    };
  }

  return {
    tone: "blocked",
    title: "还需继续修",
    detail: `已修复：${fixedText}；还剩：${remainingText}`,
  };
};

const gateFailureSummary = (
  gate: ReturnType<typeof gateFrom>,
  visibleBlockedReasons: string[],
  editorReport: EditorReport | null,
) => {
  if (gate?.publish_ready || editorReport?.publish_ready) return null;
  const reasons = uniqueStrings([
    ...visibleBlockedReasons,
    ...(gate?.blockers || []),
    ...(editorReport?.publish_gate?.blockers || []),
    ...(editorReport?.stop?.blockers || []),
    ...(editorReport?.failure_summary?.reasons || []),
  ])
    .map(readableIssueText)
    .filter(Boolean);
  if (!reasons.length) return null;
  const riskCount = Number(editorReport?.stop?.risk_count || 0);

  return {
    title: "未过原因",
    detail: reasons.slice(0, 4).join(" / "),
    reasons: reasons.slice(0, 4),
    note: riskCount > 0 ? `正文已标注 ${riskCount} 处风险段` : "正文已标注可定位的问题段",
  };
};

const rewriteDeltaSummary = (
  lastReworkProgress: TaskProgressDetail | null,
  chapterNo: number,
  content: ChapterContent | null,
  gate: ReturnType<typeof gateFrom>,
  visibleBlockedReasons: string[],
  editorReport: EditorReport | null,
) => {
  const progress = lastReworkProgress?.progress;
  const activeChapter = Number(progress?.chapter_no || progress?.from || 0);
  if (activeChapter && chapterNo && activeChapter !== chapterNo) return null;
  const delta = editorReport?.rewrite_delta || progress?.rewrite_delta || null;
  const rewriteCount = Number(editorReport?.repair_rounds_this_run || progress?.repair_rounds_this_run || editorReport?.rewrite_count || progress?.rewrite_count || 0);
  const hasPreview = Boolean(progress?.before_rewrite_preview || progress?.after_rewrite_preview);
  const hasRepairTrace = Boolean(delta) || rewriteCount > 0 || hasPreview || (Array.isArray(progress?.quality_events) && progress.quality_events.length > 0);
  if (!hasRepairTrace) return null;

  const wordDelta = Number(delta?.word_count_delta || 0);
  const scoreDelta = Number(delta?.score_delta || 0);
  const blockersRemoved = Number(delta?.blockers_removed || 0);
  const blockersAdded = Number(delta?.blockers_added || 0);
  const afterReady = Boolean(delta?.after?.publish_ready || gate?.publish_ready || editorReport?.publish_ready);
  const afterWords = Number(delta?.after?.word_count || content?.word_count || progress?.word_count || wordCount(content?.text || ""));
  const reasons = Number(delta?.after?.blocker_count ?? visibleBlockedReasons.length);
  const metrics = editorReport?.failure_summary?.metrics || [];
  return {
    title: "本轮变化",
    items: [
      delta ? `分数：${scoreDelta > 0 ? "+" : ""}${scoreDelta}` : "",
      delta ? `字数：${afterWords}${wordDelta ? ` (${wordDelta > 0 ? "+" : ""}${wordDelta})` : ""}` : `字数：${afterWords || "待同步"}`,
      `门禁：${afterReady ? "已通过" : "未通过"}`,
      `失败原因：${reasons || "待复核"}`,
      delta ? `阻断：-${blockersRemoved}${blockersAdded ? ` / +${blockersAdded}` : ""}` : "",
      rewriteCount ? `修稿：${rewriteCount}轮` : "",
    ].filter(Boolean),
    note: delta?.word_count_collapsed
      ? "篇幅塌缩风险已触发，需要回退或停止继续修稿。"
      : metrics[0] || (delta ? "来自审稿后端的真实修前/修后变化，不伪造提分。" : hasPreview ? "已记录修前/修后片段，便于判断是否越修越差。" : "展示真实审查和修稿结果，不伪造提分。"),
  };
};

const publishGateStatusStrip = (
  repairSummary: ReturnType<typeof reworkResultSummary>,
  failureSummary: ReturnType<typeof gateFailureSummary>,
  rewriteSummary: ReturnType<typeof rewriteDeltaSummary>,
  gate: ReturnType<typeof gateFrom>,
  editorReport: EditorReport | null,
  readableStoppedReason = "",
) => {
  if (!repairSummary && !failureSummary && !rewriteSummary && !gate && !editorReport) return null;
  const ready = Boolean(gate?.publish_ready || editorReport?.publish_ready);
  const tone = ready ? "ready" : repairSummary?.tone === "blocked" || failureSummary ? "blocked" : "working";
  const title = ready ? "能发布" : repairSummary?.title || failureSummary?.title || "发布门禁";
  const fixed = repairSummary?.detail?.match(/已修复：([^；]+)/)?.[1] || "";
  const remaining = failureSummary?.reasons?.length
    ? failureSummary.reasons.slice(0, 3)
    : repairSummary?.detail?.match(/还剩：(.+)$/)?.[1]?.split(" / ").slice(0, 3) || [];
  const changeItems = rewriteSummary?.items || [];
  const canContinue = !ready && (Boolean(failureSummary) || Boolean(remaining.length));
  const reasonCount = remaining.length;
  const firstChange = changeItems[0] || "";
  const fixedText = fixed ? `已修掉：${fixed}` : ready ? "已修掉：发布阻断" : "";
  const stopText = readableStoppedReason || stopReasonText(safeText(editorReport?.stop?.reason, ""));
  const stopAction = stopRecoveryText(safeText(editorReport?.stop?.reason, ""));
  const summaryText = ready
    ? "门禁通过，可以进入投稿发布。"
    : [
        stopText,
        firstChange,
        fixedText,
        reasonCount ? `还剩 ${reasonCount} 项` : "",
      ].filter(Boolean).join(" · ") || (canContinue ? "还能继续自动修" : rewriteSummary?.note || "等待下一次审查结果。");
  return {
    tone,
    title,
    summaryText,
    reasonCount,
    remaining,
    stopAction,
    note: ready
      ? "门禁通过，可以进入投稿发布。"
      : canContinue
        ? "还能继续自动修，点击问题标签可定位正文标注。"
        : rewriteSummary?.note || "等待下一次审查结果。",
  };
};

export { NovelBookshelf } from "@/views/novel/NovelBookshelf";

const PlanningProgress = ({ detail }: { detail: TaskProgressDetail | null }) => {
  const progress = detail?.progress || {};
  const result = (detail?.task?.result as JsonRecord) || {};
  const assets = (Array.isArray(progress.assets) ? progress.assets : Array.isArray(result.assets) ? result.assets : []) as Array<{ label?: string; path?: string }>;
  const review = (progress.review || result.planning_review || {}) as JsonRecord;
  const step = progressStepLabel(String(progress.step || detail?.status || "outline"));
  const preview = safeText(progress.preview_text || progress.text_preview || result.preview_text || result.text_preview, "");
  const planningLabels = ["项目圣经", "总纲", "设定库", "人物关系", "全书卷纲", "前30章细纲", "规划审核"];
  const currentStep = String(progress.step || "");
  const isCompleted = detail?.status === "completed";
  const isFallback = String(progress.step || "") === "model_fallback" || /fallback/i.test(String(result.source || progress.source || ""));
  const stepItems: StepRailItem[] = planningLabels.map((label) => {
    const done = assets.some((asset) => asset.label === label);
    const running = (label === "规划审核" && currentStep.includes("planning_review"))
      || (!assets.length && !isCompleted && label === "项目圣经")
      || (assets.length && !done && !isCompleted && label === planningLabels[Math.min(assets.length, planningLabels.length - 1)]);
    return {
      key: label,
      label,
      state: done || isCompleted ? "done" : running ? "running" : "wait",
    };
  });

  return (
    <div className="octo-planning-panel">
      <div className="octo-planning-head">
        <div>
          <strong>开书规划生成中</strong>
          <em>{safeText(progress.message, "正在把创意拆成项目圣经、设定库、人物关系、全书卷纲和前30章细纲。")}</em>
        </div>
        <StatusPill tone={isCompleted ? "success" : isFallback ? "warning" : "running"} dot>{step}</StatusPill>
      </div>
      <StepRail items={stepItems} />
      <StatusPill tone={isFallback ? "warning" : "running"} className="octo-planning-source" dot>
        <strong>{isFallback ? "当前是本地兜底稿" : "正在调用规划模型"}</strong>
        <span>{isFallback ? "模型没有完整返回时会先补齐可读规划，但不会伪装成最终精品规划。" : "完成后会写入左侧项目树，并先展示规划正文。"}</span>
      </StatusPill>
      {review.score ? (
        <div className={`octo-planning-review ${review.status === "pass" ? "pass" : "fail"}`}>
          <strong>规划审核 {String(review.score)}/100</strong>
          <span>{review.status === "pass" ? "通过，可以进入正文生成" : review.status === "needs_confirmation" ? "兜底稿需要重试或确认" : "未通过，正在按问题自动返工"}</span>
        </div>
      ) : null}
      <LivePaper text={preview} className="octo-planning-live-paper" empty="等待规划模型输出..." />
      <AssetLinkList assets={assets.map((asset) => ({ label: safeText(asset.label, "规划资产"), path: asset.path }))} />
    </div>
  );
};

const PlanningReadyPanel = ({
  tree,
  planning,
  writing,
  disabledReason,
  onGeneratePlanning,
  onWriteSingle,
}: {
  tree: ProjectTreePayload | null;
  planning: boolean;
  writing: boolean;
  disabledReason?: string;
  onGeneratePlanning: () => void;
  onWriteSingle: () => void;
}) => {
  const branch = tree?.branches?.find((item) => item.key === "planning");
  const assets = branch?.children || [];
  const readyCount = assets.filter((asset) => asset.status === "ready").length;
  const isReady = branch?.status === "ready";
  const needsReview = Boolean(branch && branch.status && branch.status !== "ready" && assets.length);
  const statusTitle = isReady ? "开书规划已完成" : needsReview ? "开书规划需要重试" : "先生成开书规划";
  const statusCopy = isReady
    ? "项目圣经、人物关系、全书卷纲和前30章细纲已进入项目树。"
    : needsReview
      ? "规划资产已经写入项目树，但规划审核没有通过。请重试模型规划，或先打开规划审核查看原因。"
      : "先锁住故事骨架、人物关系、全书卷纲和前30章细纲。";
  return (
    <div className="octo-flow-card">
      <div className={`octo-flow-status ${isReady ? "ready" : needsReview ? "warning" : "pending"}`}>
        <i />
        <div>
          <strong>{statusTitle}</strong>
          <span>{statusCopy}</span>
        </div>
      </div>
      <div className="octo-flow-assets">
        {(assets.length ? assets : [
          { key: "bible", label: "项目圣经", status: "missing" },
          { key: "outline", label: "总纲", status: "missing" },
          { key: "settings", label: "设定库", status: "missing" },
          { key: "relationships", label: "人物关系", status: "missing" },
          { key: "volume", label: "全书卷纲", status: "missing" },
          { key: "fine_outline", label: "前30章细纲", status: "missing" },
        ]).map((asset) => (
          <span className={asset.status === "ready" ? "ready" : "missing"} key={asset.key || asset.label}>
            <b>{asset.status === "ready" ? "OK" : "待生成"}</b>
            {safeText(asset.label, "规划资产")}
          </span>
        ))}
      </div>
      <div className="octo-flow-actions">
        {!isReady ? (
          <Button variant="primary" className="octo-primary-action" disabled={planning} onClick={onGeneratePlanning}>
            {planning ? "规划生成中..." : needsReview ? "重试开书规划" : "生成开书规划"}
          </Button>
        ) : (
          <>
            <Button variant="primary" className="octo-primary-action" disabled={writing || Boolean(disabledReason)} title={disabledReason || undefined} onClick={onWriteSingle}>
              {writing ? "正文生成中..." : "生成第一章"}
            </Button>
            <Button variant="ghost" disabled={planning} onClick={onGeneratePlanning}>
              重新规划
            </Button>
          </>
        )}
      </div>
      {disabledReason ? <em className="octo-action-reason">{disabledReason}</em> : null}
      <p>{isReady ? `已就绪 ${readyCount}/${assets.length || 6} 项。正文生成后自动章卡、审稿、重写和记忆同步。` : needsReview ? `已写入 ${readyCount}/${assets.length || 6} 项，但未达到可开写标准。` : "规划会生成到左侧项目树，后续章卡、记忆和正文都挂在同一棵树下。"}</p>
    </div>
  );
};

const artifactViewLabel = (view: WorkbenchArtifactView) => ({
  planning: "开书规划",
  card: "本章章卡",
  memory: "项目记忆",
  quality: "发布门禁",
  publish: "投稿发布",
}[view] || "正文");

export const NovelWorkbench = () => {
  const data = usePixsoDashboard();
  const project = safeText(new URLSearchParams(window.location.search).get("project") || data.project_path, "");
  const title = safeText(data.project_title, "当前作品");
  const current = Number(data.current_chapter || 1);
  const latest = Number(data.latest_completed_chapter || data.completed_chapters || current || 1);
  const [chapters, setChapters] = useState<ChapterListItem[]>([]);
  const [selected, setSelected] = useState(Math.max(1, latest));
  const selectedRef = useRef(Math.max(1, latest));
  const [content, setContent] = useState<ChapterContent | null>(null);
  const [draft, setDraft] = useState("");
  const [review, setReview] = useState<ChapterReview | null>(null);
  const [editorReport, setEditorReport] = useState<EditorReport | null>(null);
  const [memory, setMemory] = useState<ProjectMemory | null>(null);
  const [leftTab, setLeftTab] = useState<WorkbenchLeftTab>("chapters");
  const [artifactView, setArtifactView] = useState<WorkbenchArtifactView>("manuscript");
  const [progress, setProgress] = useState<TaskProgressDetail | null>(null);
  const [lastReworkProgress, setLastReworkProgress] = useState<TaskProgressDetail | null>(null);
  const [exportState, setExportState] = useState<ExportState>({ open: false, from: 1, to: latest, format: "merged" });
  const [exportResult, setExportResult] = useState<{ path?: string } | null>(null);
  const [card, setCard] = useState<TextArtifact | null>(null);
  const [outline, setOutline] = useState<TextArtifact | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<SelectedArtifact | null>(null);
  const [projectArtifact, setProjectArtifact] = useState<TextArtifact | null>(null);
  const [projectTree, setProjectTree] = useState<ProjectTreePayload | null>(null);
  const [globalReviews, setGlobalReviews] = useState<GlobalReviewsPayload | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [actionError, setActionError] = useState("");
  const [planning, setPlanning] = useState(false);
  const [writing, setWriting] = useState(false);
  const hasModelKeys = Boolean(
    data.ready?.has_any_model_key
    || data.ready?.selected_model_route
    || data.api_keys?.some((key: JsonRecord) => key.configured)
    || (data.model_routes?.length && data.model_routes.some((route: JsonRecord) => route.active)),
  );
  const planningBranch = projectTree?.branches?.find((branch) => branch.key === "planning");
  const planningReady = planningBranch?.status === "ready";
  const planningReviewBlocked = Boolean(planningBranch && planningBranch.status && planningBranch.status !== "ready" && planningBranch.children?.length);
  const gate = gateFrom(content, review, editorReport);
  const gatePublishReady = Boolean(gate?.publish_ready || editorReport?.publish_ready || content?.publish_ready || review?.publish_ready);
  const currentBlocked = !gatePublishReady && (
    editorReport?.status === "stopped"
    || ["D", "E"].includes(String(editorReport?.final_grade || review?.grade || ""))
    || Boolean(gate && !gate.publish_ready)
  );
  const blockedReasons = [
    ...(gate?.blockers || []),
    ...(editorReport?.stop?.blockers || []),
  ].map(String).filter(Boolean);
  const stoppedReason = safeText(editorReport?.stop?.reason || (progress?.status === "stopped" ? progress?.progress?.reason : ""), "");
  const readableStoppedReason = stopReasonText(stoppedReason);
  const visibleBlockedReasons = [
    ...(editorReport?.failure_summary?.reasons || []),
    ...blockedReasons,
    ...(currentBlocked ? review?.issues || [] : []),
  ]
    .map(readableIssueText)
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
  const qualityStatus = qualityPanelState(content, review, editorReport, progress).status;
  const editorAnnotationReview = editorAnnotationReviewFrom(review, editorReport, gate);
  const repairSummary = reworkResultSummary(lastReworkProgress, selected, gate, visibleBlockedReasons, editorReport);
  const failureSummary = gateFailureSummary(gate, visibleBlockedReasons, editorReport);
  const rewriteSummary = rewriteDeltaSummary(lastReworkProgress, selected, content, gate, visibleBlockedReasons, editorReport);
  const gateStrip = publishGateStatusStrip(repairSummary, failureSummary, rewriteSummary, gate, editorReport, readableStoppedReason);
  const writingBlockedReason = !project
    ? "请先在网文创作里选择一本书。"
    : !hasModelKeys
      ? "模型 API 未连接，不能开始写作。请先到系统配置连接模型。"
      : !planningReady
        ? planningReviewBlocked
          ? "开书规划已生成但审核未过，请先重试规划或查看规划审核。"
          : "请先生成项目圣经、总纲、设定、人物关系、全书卷纲和前30章滚动细纲。"
        : "";
  const canStartWriting = !writing && !writingBlockedReason;
  const hasDesktopDirectoryPicker = Boolean((window.octosageDesktop || window.novelStudioDesktop)?.chooseDirectory);
  const latestModelCall = editorReport?.model_calls?.length
    ? editorReport.model_calls[editorReport.model_calls.length - 1]
    : null;
  const currentModelLabel = latestModelCall
    ? safeText(latestModelCall.display_model || latestModelCall.model, "按任务路由")
    : "按环节自动选择";
  const costLabel = `本书累计成本：${formatMoney(data.estimated_cost_cny)}`;
  const liveWritingProgress = useMemo(
    () => (progress && progress.type !== "project_planning" && progress.status !== "completed" ? progress : lastReworkProgress),
    [progress, lastReworkProgress],
  );
  const liveWritingChapter = Number(liveWritingProgress?.progress?.chapter_no || liveWritingProgress?.progress?.from || 0);
  const isViewingLiveWritingChapter = Boolean(liveWritingProgress && liveWritingChapter && selected === liveWritingChapter);
  const progressGlobalReview = progress?.progress?.global_review as GlobalReviewSummary | undefined;
  const latestGlobalReview = progressGlobalReview || globalReviews?.latest || null;
  const loadChapters = async () => {
    if (!project) return;
    const payload = await fetchJson<{ chapters?: ChapterListItem[] }>(`/api/chapters?project=${encodeURIComponent(project)}`);
    setChapters(payload.chapters || []);
  };

  const loadContent = async (chapterNo = selected) => {
    if (!project) return;
    const payload = await fetchJson<ChapterContent>(`/api/chapter?project=${encodeURIComponent(project)}&chapter_no=${chapterNo}`);
    setContent(payload);
    setDraft(payload.text || "");
  };

  const loadReview = async (chapterNo = selected) => {
    if (!project) return;
    const payload = await fetchJson<ChapterReview>(`/api/chapter/review?project=${encodeURIComponent(project)}&chapter_no=${chapterNo}`);
    setReview(payload);
  };

  const loadEditorReport = async (chapterNo = selected) => {
    if (!project) return;
    const payload = await fetchJson<EditorReport>(`/api/chapter/editor-report?project=${encodeURIComponent(project)}&chapter_no=${chapterNo}`);
    setEditorReport(payload);
  };

  const loadMemory = async () => {
    if (!project) return;
    const payload = await fetchJson<ProjectMemory>(`/api/project/memory?project=${encodeURIComponent(project)}`);
    setMemory(payload);
  };

  const loadCard = async (chapterNo = selected) => {
    if (!project) return;
    const payload = await fetchJson<TextArtifact>(`/api/chapter/card?project=${encodeURIComponent(project)}&chapter_no=${chapterNo}`);
    setCard(payload);
  };

  const loadOutline = async () => {
    if (!project) return;
    const payload = await fetchJson<TextArtifact>(`/api/project/outline?project=${encodeURIComponent(project)}`);
    setOutline(payload);
  };

  const loadProjectTree = async () => {
    if (!project) return null;
    const payload = await fetchJson<ProjectTreePayload>(`/api/project/tree?project=${encodeURIComponent(project)}`);
    setProjectTree(payload);
    return payload;
  };

  const loadProjectArtifact = async (artifact = selectedArtifact) => {
    if (!project || !artifact?.path) return;
    const payload = await fetchJson<TextArtifact>(`/api/project/artifact?project=${encodeURIComponent(project)}&path=${encodeURIComponent(artifact.path)}`);
    setProjectArtifact(payload);
  };

  const selectFirstPlanningArtifact = (tree = projectTree) => {
    const first = planningBranchItems(tree).find((item) => item.path && item.status === "ready")
      || planningBranchItems(tree).find((item) => item.path);
    if (!first?.path) return false;
    const next = { key: first.key, label: first.label, path: first.path };
    setSelectedArtifact(next);
    setProjectArtifact({ status: "loading", path: first.path, text: "", message: "正在读取规划内容..." });
    setLeftTab("tree");
    setArtifactView("planning");
    void loadProjectArtifact(next);
    return true;
  };

  const loadGlobalReviews = async () => {
    if (!project) return;
    const payload = await fetchJson<GlobalReviewsPayload>(`/api/project/global-reviews?project=${encodeURIComponent(project)}`);
    setGlobalReviews(payload);
  };

  useEffect(() => {
    selectedRef.current = selected;
    localStorage.setItem("octosage:selected-chapter", String(selected));
    void loadContent(selected);
    void loadReview(selected);
    void loadEditorReport(selected);
    void loadCard(selected);
    void loadOutline();
    void loadProjectTree();
    void loadGlobalReviews();
  }, [selected, project]);

  useEffect(() => {
    void loadChapters();
    const refresh = () => {
      void loadChapters();
      void loadContent(selected);
      void loadReview(selected);
      void loadEditorReport(selected);
      void loadCard(selected);
      void loadOutline();
      void loadProjectTree();
      void loadMemory();
      void loadGlobalReviews();
    };
    const task = (event: Event) => {
      const detail = (event as CustomEvent<TaskProgressDetail>).detail;
      setProgress(detail);
      const hasReworkEvents = Array.isArray(detail?.progress?.quality_events) && detail.progress.quality_events.length > 0;
      if (hasReworkEvents) setLastReworkProgress(detail);
      if (detail?.status === "completed" || detail?.status === "stopped") window.setTimeout(refresh, 500);
    };
    window.addEventListener("octosage:data-refresh", refresh);
    window.addEventListener("octosage:task-progress", task as EventListener);
    return () => {
      window.removeEventListener("octosage:data-refresh", refresh);
      window.removeEventListener("octosage:task-progress", task as EventListener);
    };
  }, [project, selected]);

  useEffect(() => {
    void loadMemory();
    void loadGlobalReviews();
  }, [project]);

  useEffect(() => {
    if (!project || planningReady || planning) return;
    const pending = localStorage.getItem("octosage:auto-planning-project");
    if (pending !== project) return;
    localStorage.removeItem("octosage:auto-planning-project");
    const pendingTask = localStorage.getItem("octosage:auto-planning-task");
    if (pendingTask) {
      localStorage.removeItem("octosage:auto-planning-task");
      window.setTimeout(() => {
        void watchPlanningTask(pendingTask);
      }, 200);
      return;
    }
    window.setTimeout(() => {
      void generatePlanning();
    }, 350);
  }, [project, planningReady, planning]);

  useEffect(() => {
    if (!project || selectedArtifact?.path) return;
    selectFirstPlanningArtifact(projectTree);
  }, [project, projectTree, selectedArtifact?.path]);

  useEffect(() => {
    if (!planningReady) return;
    if (planning) setPlanning(false);
    if (progress?.type === "project_planning") setProgress(null);
    if (artifactView === "manuscript" && content?.status !== "ready") {
      selectFirstPlanningArtifact(projectTree);
    }
  }, [planningReady, planning, progress?.type, artifactView, content?.status, projectTree]);

  useEffect(() => {
    if (!lastReworkProgress || !["completed", "stopped"].includes(String(progress?.status || ""))) return;
    const timer = window.setTimeout(() => setLastReworkProgress(null), 45000);
    return () => window.clearTimeout(timer);
  }, [lastReworkProgress, progress?.status]);

  const runAction = async (action: () => Promise<void>, fallback = "操作失败，请稍后重试。") => {
    setActionError("");
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || fallback);
      setActionError(message || fallback);
    }
  };

  const saveDraft = async () => {
    await runAction(async () => {
      await postJson("/api/chapter/save", { project, chapter_no: selected, text: draft });
      window.dispatchEvent(new CustomEvent("octosage:data-refresh"));
    }, "保存正文失败。");
  };

  const saveCard = async (value: string) => {
    await postJson("/api/chapter/card", { project, chapter_no: selected, content: value });
    await loadCard(selected);
    window.dispatchEvent(new CustomEvent("octosage:data-refresh"));
  };

  const saveOutline = async (value: string) => {
    await postJson("/api/project/outline", { project, content: value });
    await loadOutline();
    await loadProjectTree();
    window.dispatchEvent(new CustomEvent("octosage:data-refresh"));
  };

  const selectProjectArtifact = (item: ProjectTreeItem) => {
    if (!item.path) return;
    const next = { key: item.key, label: item.label, path: item.path };
    setSelectedArtifact(next);
    setProjectArtifact({ status: "loading", path: item.path, text: "", message: "正在读取规划内容..." });
    setLeftTab("tree");
    setArtifactView("planning");
    void loadProjectArtifact(next);
  };

  const saveSelectedArtifact = async (value: string) => {
    if (!selectedArtifact?.path) return saveOutline(value);
    await postJson("/api/project/artifact", { project, path: selectedArtifact.path, content: value });
    await loadProjectArtifact(selectedArtifact);
    await loadProjectTree();
    if (selectedArtifact.key === "bible") await loadOutline();
    window.dispatchEvent(new CustomEvent("octosage:data-refresh"));
  };

  const reviewCurrentChapter = async () => {
    if (!project) return;
    setReviewing(true);
    try {
      await runAction(async () => {
        await postJson("/api/chapter/review-now", { project, chapter_no: selected });
        await loadReview(selected);
        await loadEditorReport(selected);
        await loadChapters();
        window.dispatchEvent(new CustomEvent("octosage:data-refresh"));
      }, "重新质检失败。");
    } finally {
      setReviewing(false);
    }
  };

  const generatePlanning = async () => {
    if (!project) return;
    setPlanning(true);
    setLeftTab("tree");
    setArtifactView("planning");
    try {
      const task = await postJson<JsonRecord>("/api/project/planning", { project });
      setProgress({ label: "开书规划", task, progress: task.progress as TaskProgressDetail["progress"], status: String(task.status || ""), type: String(task.type || "project_planning") });
      window.dispatchEvent(new CustomEvent("octosage:task-progress", {
        detail: { label: "开书规划", task, progress: task.progress, status: task.status, type: task.type },
      }));
      window.dispatchEvent(new CustomEvent("octosage:busy", { detail: { message: "开书规划生成中..." } }));
      for (let attempt = 0; attempt < 180; attempt += 1) {
        const latestTask = await fetchJson<JsonRecord>(`/api/tasks/${encodeURIComponent(String(task.task_id))}?project=${encodeURIComponent(project)}`);
        const detail = {
          label: "开书规划",
          task: latestTask,
          progress: latestTask.progress as TaskProgressDetail["progress"],
          status: String(latestTask.status || ""),
          type: String(latestTask.type || "project_planning"),
        };
        setProgress(detail);
        window.dispatchEvent(new CustomEvent("octosage:task-progress", { detail }));
        if (latestTask.status === "completed") {
          setProgress(null);
          break;
        }
        if (latestTask.status === "failed") throw new Error(String(latestTask.error || "开书规划生成失败"));
        await new Promise((resolve) => window.setTimeout(resolve, attempt < 10 ? 800 : 1800));
      }
      await loadOutline();
      const tree = await loadProjectTree();
      selectFirstPlanningArtifact(tree);
      window.dispatchEvent(new CustomEvent("octosage:data-refresh"));
    } finally {
      await loadOutline();
      const tree = await loadProjectTree();
      selectFirstPlanningArtifact(tree);
      setPlanning(false);
      window.dispatchEvent(new CustomEvent("octosage:busy", { detail: { message: "" } }));
    }
  };

  const watchPlanningTask = async (taskId: string) => {
    if (!project || !taskId) return;
    setPlanning(true);
    setLeftTab("tree");
    setArtifactView("planning");
    try {
      for (let attempt = 0; attempt < 180; attempt += 1) {
        const latestTask = await fetchJson<JsonRecord>(`/api/tasks/${encodeURIComponent(taskId)}?project=${encodeURIComponent(project)}`);
        const detail = {
          label: "开书规划",
          task: latestTask,
          progress: latestTask.progress as TaskProgressDetail["progress"],
          status: String(latestTask.status || ""),
          type: String(latestTask.type || "project_planning"),
        };
        setProgress(detail);
        window.dispatchEvent(new CustomEvent("octosage:task-progress", { detail }));
        if (latestTask.status === "completed") {
          setProgress(null);
          break;
        }
        if (latestTask.status === "failed") throw new Error(String(latestTask.error || "开书规划生成失败"));
        await new Promise((resolve) => window.setTimeout(resolve, attempt < 10 ? 800 : 1800));
      }
      await loadOutline();
      const tree = await loadProjectTree();
      selectFirstPlanningArtifact(tree);
      window.dispatchEvent(new CustomEvent("octosage:data-refresh"));
    } finally {
      await loadOutline();
      const tree = await loadProjectTree();
      selectFirstPlanningArtifact(tree);
      setPlanning(false);
      window.dispatchEvent(new CustomEvent("octosage:busy", { detail: { message: "" } }));
    }
  };

  const refreshWorkbench = async (chapterNo = selected) => {
    await Promise.allSettled([
      loadChapters(),
      loadContent(chapterNo),
      loadReview(chapterNo),
      loadEditorReport(chapterNo),
      loadCard(chapterNo),
      loadOutline(),
      loadProjectTree(),
      loadMemory(),
      loadGlobalReviews(),
    ]);
  };

  const applyWritingTaskSnapshot = async (latestTask: JsonRecord, chapterNo: number, tick = 0) => {
    const detail: TaskProgressDetail = {
      label: "写下一章",
      task: latestTask,
      progress: latestTask.progress as TaskProgressDetail["progress"],
      status: String(latestTask.status || ""),
      type: String(latestTask.type || "run_single_chapter"),
    };
    setProgress(detail);
    if (Array.isArray(detail.progress?.quality_events) && detail.progress.quality_events.length > 0) {
      setLastReworkProgress(detail);
    }
    window.dispatchEvent(new CustomEvent("octosage:task-progress", { detail }));
    const activeChapter = Number(detail.progress?.chapter_no || detail.progress?.from || chapterNo);
    if (tick % 2 === 0) {
      void loadChapters();
      void loadProjectTree();
      void loadGlobalReviews();
      if (activeChapter && selectedRef.current === activeChapter) void loadCard(activeChapter);
    }
    if (["card_done", "write_done", "review_done", "rewrite", "rewrite_done", "state_done", "export_done"].includes(String(detail.progress?.step || ""))) {
      void loadChapters();
      void loadProjectTree();
      if (activeChapter && selectedRef.current === activeChapter) {
        void loadCard(activeChapter);
        void loadReview(activeChapter);
        void loadEditorReport(activeChapter);
      }
    }
    if (latestTask.status === "completed" || latestTask.status === "stopped") {
      await refreshWorkbench(selectedRef.current || activeChapter || chapterNo);
      window.dispatchEvent(new CustomEvent("octosage:data-refresh"));
      if (latestTask.status === "stopped") {
        setLastReworkProgress(detail);
        setProgress(detail);
      }
      return "done";
    }
    if (latestTask.status === "failed") throw new Error(String(latestTask.error || "写作任务失败"));
    return "running";
  };

  const watchWritingTaskEvents = (task: JsonRecord, chapterNo: number) => new Promise<boolean>((resolve, reject) => {
    if (typeof window.EventSource !== "function" || !task.task_id) {
      resolve(false);
      return;
    }
    const source = new window.EventSource(`/api/tasks/${encodeURIComponent(String(task.task_id))}/events?project=${encodeURIComponent(project)}`);
    let tick = 0;
    let closed = false;
    const close = (ok: boolean, error?: unknown) => {
      if (closed) return;
      closed = true;
      window.clearTimeout(timeout);
      source.close();
      if (error) reject(error);
      else resolve(ok);
    };
    const timeout = window.setTimeout(() => close(false), 15 * 60 * 1000);
    const handleTask = (payload: JsonRecord) => {
      void applyWritingTaskSnapshot(payload, chapterNo, tick += 1)
        .then((status) => {
          if (status === "done") close(true);
        })
        .catch((error) => close(false, error));
    };
    source.addEventListener("progress", (event) => {
      const item = JSON.parse((event as MessageEvent).data || "{}") as JsonRecord;
      handleTask({
        task_id: task.task_id,
        type: task.type || "run_single_chapter",
        status: item.status || "running",
        progress: item.progress || {},
        result: item.result || null,
        error: item.error || null,
      });
    });
    source.addEventListener("task", (event) => {
      handleTask(JSON.parse((event as MessageEvent).data || "{}") as JsonRecord);
    });
    source.addEventListener("done", (event) => {
      handleTask(JSON.parse((event as MessageEvent).data || "{}") as JsonRecord);
    });
    source.onerror = () => close(false);
  });

  const runWritingTask = async (targetChapter?: number) => {
    if (!project || writing || writingBlockedReason) return;
    const chapterNo = Number(targetChapter || current || selected || 1);
    setWriting(true);
    setLeftTab("chapters");
    setArtifactView("manuscript");
    setSelected(chapterNo);
    setProgress({
      label: "写下一章",
      status: "running",
      type: "run_single_chapter",
      progress: {
        step: "chapter_card",
        chapter_no: chapterNo,
        from: chapterNo,
        total_chapters: 1,
        completed_chapters: 0,
        message: `正在准备第 ${chapterNo} 章项目菜单、章卡和正文任务。`,
      },
    });
    window.dispatchEvent(new CustomEvent("octosage:busy", { detail: { message: `正在写第 ${chapterNo} 章...` } }));
    await refreshWorkbench(chapterNo);
    try {
      const task = await postTask<JsonRecord>("/api/run", { project, chapter_no: chapterNo });
      const streamed = await watchWritingTaskEvents(task, chapterNo);
      if (streamed) return;
      for (let attempt = 0; attempt < 240; attempt += 1) {
        const latestTask = await fetchJson<JsonRecord>(`/api/tasks/${encodeURIComponent(String(task.task_id))}?project=${encodeURIComponent(project)}`);
        const status = await applyWritingTaskSnapshot(latestTask, chapterNo, attempt);
        if (status === "done") break;
        await new Promise((resolve) => window.setTimeout(resolve, attempt < 10 ? 900 : 1600));
      }
    } finally {
      setWriting(false);
      window.dispatchEvent(new CustomEvent("octosage:busy", { detail: { message: "" } }));
    }
  };

  const rewriteCurrentChapter = async () => {
    if (!project) return;
    if (!currentBlocked && !window.confirm(`确定重写第 ${selected} 章吗？这会回退本章并重新生成。`)) return;
    setRollingBack(true);
    setArtifactView("manuscript");
    try {
      await runAction(async () => {
        if (!currentBlocked) {
          await postJson("/api/chapter/rollback", { project, chapter_no: selected });
          window.dispatchEvent(new CustomEvent("octosage:data-refresh"));
          await runWritingTask(selected);
          return;
        }
        setProgress({
          label: "继续自动修到发布",
          status: "running",
          type: "repair_chapter_to_publish",
          progress: {
            step: "review",
            chapter_no: selected,
            from: selected,
            total_chapters: 1,
            completed_chapters: 0,
            message: `正在读取第 ${selected} 章未通过原因，准备定点修补。`,
          },
        });
        window.dispatchEvent(new CustomEvent("octosage:busy", { detail: { message: `正在修补第 ${selected} 章...` } }));
        const task = await postTask<JsonRecord>("/api/chapter/repair-to-publish", {
          project,
          chapter_no: selected,
          max_repair_rounds: 6,
        });
        const streamed = await watchWritingTaskEvents(task, selected);
        if (streamed) return;
        for (let attempt = 0; attempt < 240; attempt += 1) {
          const latestTask = await fetchJson<JsonRecord>(`/api/tasks/${encodeURIComponent(String(task.task_id))}?project=${encodeURIComponent(project)}`);
          const status = await applyWritingTaskSnapshot(latestTask, selected, attempt);
          if (status === "done") break;
          await new Promise((resolve) => window.setTimeout(resolve, attempt < 10 ? 900 : 1600));
        }
      }, currentBlocked ? "继续自动修到发布失败。" : "重写本章失败。");
    } finally {
      setRollingBack(false);
      window.dispatchEvent(new CustomEvent("octosage:busy", { detail: { message: "" } }));
    }
  };

  const rollbackCurrentChapter = async () => {
    if (!project || !window.confirm(`确定回退第 ${selected} 章吗？这会删除该章正文、审稿和章卡产物。`)) return;
    setRollingBack(true);
    try {
      await runAction(async () => {
        await postJson("/api/chapter/rollback", { project, chapter_no: selected });
        setContent(null);
        setDraft("");
        setReview(null);
        setCard(null);
        await loadChapters();
        await loadContent(selected);
        await loadReview(selected);
        await loadCard(selected);
        window.dispatchEvent(new CustomEvent("octosage:data-refresh"));
      }, "回退本章失败。");
    } finally {
      setRollingBack(false);
    }
  };

  const runExport = async () => {
    await runAction(async () => {
      const payload = await postJson<{ path?: string }>("/api/export/merged", {
        project,
        from: exportState.from,
        to: exportState.to,
        format: exportState.format,
        destination: exportState.destination,
      });
      setExportResult(payload);
      setExportState((prev) => ({ ...prev, open: false, path: payload.path }));
    }, "导出失败。");
  };

  const chooseExportDestination = async () => {
    const desktop = window.octosageDesktop || window.novelStudioDesktop;
    if (!desktop?.chooseDirectory) return;
    const startPath = exportState.destination || getWorkspaceRoot() || project;
    const result = await desktop.chooseDirectory({ startPath, persistWorkspace: false });
    if (result) setExportState((prev) => ({ ...prev, destination: result }));
  };
  const jumpToGateIssue = (issue: string) => {
    window.dispatchEvent(new CustomEvent("octosage:jump-inline-issue", { detail: { issue } }));
  };
  const selectedHasText = content?.status === "ready";
  const selectedPublishReady = Boolean(gate?.publish_ready);
  const primaryAction = !planningReady
    ? {
        label: planning ? "规划中..." : planningReviewBlocked ? "重试开书规划" : "生成开书规划",
        disabled: planning || !project,
        title: !project ? "请先选择一本书。" : "",
        run: generatePlanning,
      }
    : currentBlocked
      ? {
          label: rollingBack ? "修补中..." : "继续自动修到发布",
          disabled: rollingBack || !selectedHasText,
          title: selectedHasText ? "按当前门禁原因定点修补，直到可发布或给出失败原因。" : "当前章节还没有正文。",
          run: rewriteCurrentChapter,
        }
      : !selectedHasText
        ? {
            label: writing ? "生成中..." : `生成第 ${selected} 章`,
            disabled: !canStartWriting,
            title: writingBlockedReason || "",
            run: () => void runWritingTask(Number(selected || current || 1)),
          }
        : {
            label: writing ? "写作中..." : selectedPublishReady ? "写下一章" : "重新质检",
            disabled: selectedPublishReady ? !canStartWriting : reviewing,
            title: selectedPublishReady ? writingBlockedReason || "" : "重新检查当前章节是否达到发布线。",
            run: selectedPublishReady ? () => void runWritingTask(Number(current || selected + 1 || 1)) : reviewCurrentChapter,
          };

  const pipelineItems = [
    {
      key: "planning",
      label: "开书规划",
      status: planning ? "running" : planningReady ? "done" : "waiting",
      detail: planning ? progressStepLabel(progress?.progress?.step) : planningReady ? "已入项目树" : "待生成",
    },
    {
      key: "card",
      label: "章卡细纲",
      status: liveWritingProgress?.progress?.step === "card" ? "running" : card?.status === "ready" ? "done" : "waiting",
      detail: card?.status === "ready" ? "已锁定" : "写正文前生成",
    },
    {
      key: "writing",
      label: "正文生产",
      status: writing ? "running" : selectedHasText ? "done" : "waiting",
      detail: writing ? progressStepLabel(progress?.progress?.step) : selectedHasText ? `${wordCount(draft || content?.text || "")}字` : "等待开写",
    },
    {
      key: "review",
      label: "自动质检",
      status: reviewing || rollingBack || currentBlocked ? "running" : selectedPublishReady ? "done" : selectedHasText ? "blocked" : "waiting",
      detail: selectedPublishReady ? "门禁通过" : currentBlocked ? "自动返工中" : selectedHasText ? "待复查" : "等待正文",
    },
    {
      key: "publish",
      label: "发布门禁",
      status: selectedPublishReady ? "done" : selectedHasText ? "blocked" : "waiting",
      detail: selectedPublishReady ? "可发布" : selectedHasText ? cleanPublishLabel(gateFrom(content, review, editorReport)) : "未进入",
    },
  ];

  return (
    <PixsoPageShell
      active="/novel/workbench"
      title={title}
      meta={formatChapterMeta(data, "网文工作台")}
      status={<span>{title} · 第{selected}章 · 当前环节：{currentModelLabel} · {costLabel}</span>}
    >
      {!hasModelKeys && project ? (
        <div className="octo-warning-banner">
          <strong>模型 API 未配置</strong>
          <span>写作、审稿等功能需要先配置至少一个模型 API Key。</span>
          <Button type="button" size="sm" variant="primary" data-octo-action="settings">去配置</Button>
        </div>
      ) : null}
      {actionError ? (
        <div className="octo-warning-banner action-error">
          <strong>操作没有完成</strong>
          <span>{actionError}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => setActionError("")}>知道了</Button>
        </div>
      ) : null}
      <div className="octo-workbench octo-production-console">
        <aside className="octo-workbench-left">
          <div className="octo-panel-head">
            <strong>项目树</strong>
            <span title={project}>已完成 {Number(data.completed_chapters || 0)} 章</span>
          </div>
          <WorkbenchCatalogPanel
            tab={leftTab}
            setTab={setLeftTab}
            projectTitle={title}
            chapters={chapters}
            selected={selected}
            setSelected={setSelected}
            view={artifactView}
            setView={setArtifactView}
            card={card}
            memory={memory}
            outline={outline}
            projectTree={projectTree}
            onSaveCard={saveCard}
            onSaveOutline={saveOutline}
            onSelectArtifact={selectProjectArtifact}
            selectedArtifact={selectedArtifact}
          />
        </aside>

        <section className="octo-editor octo-production-stage octo-hologlass">
          <div className="octo-editor-head octo-production-header">
            <div>
              <strong>{content?.title || `第${selected}章`}</strong>
              <span>{wordCount(draft || content?.text || "")} 字 · {cleanPublishLabel(gateFrom(content, review, editorReport))} · {cleanGradeText(content?.grade)}</span>
            </div>
            {content?.status === "ready" ? <span>{gateFrom(content, review, editorReport)?.publish_ready ? "本章已过发布门禁" : "未过门禁会在正文中标红并自动返工"}</span> : null}
          </div>
          <div className="octo-editor-actions compact octo-production-main-action">
            <Button
              type="button"
              variant="primary"
              glow
              className="octo-editor-primary"
              disabled={primaryAction.disabled}
              title={primaryAction.title || undefined}
              onClick={primaryAction.run}
            >
              {primaryAction.label}
            </Button>
            <details className="octo-editor-menu">
              <summary>更多</summary>
              <div>
                <section className="octo-editor-menu-section">
                  <strong>写作操作</strong>
                  <Button type="button" size="sm" variant="ghost" disabled={planning} onClick={generatePlanning}>
                    {planningReady ? "重建开书规划" : "生成开书规划"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={saveDraft} disabled={!project || content?.status !== "ready"}>保存正文</Button>
                </section>
                <section className="octo-editor-menu-section">
                  <strong>质检修稿</strong>
                  <Button type="button" size="sm" variant="ghost" disabled={reviewing || content?.status !== "ready"} onClick={reviewCurrentChapter}>
                    {reviewing ? "复查中..." : "重新质检"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={content?.status !== "ready"} onClick={() => setArtifactView("quality")}>
                    查看门禁
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={rollingBack || content?.status !== "ready"} onClick={rewriteCurrentChapter}>
                    {rollingBack ? "修补中..." : currentBlocked ? "继续自动修到发布" : "重写本章"}
                  </Button>
                </section>
                <section className="octo-editor-menu-section">
                  <strong>发布导出</strong>
                  <Button type="button" size="sm" variant="ghost" disabled={!project} onClick={() => setArtifactView("publish")}>
                    投稿发布
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setExportState({ open: true, from: 1, to: Math.max(1, latest), format: "merged" })}>
                    导出
                  </Button>
                </section>
                <section className="octo-editor-menu-section danger-zone">
                  <strong>危险操作</strong>
                  <Button type="button" size="sm" variant="danger" disabled={rollingBack || content?.status !== "ready"} className="danger" onClick={rollbackCurrentChapter}>
                    回退本章
                  </Button>
                </section>
              </div>
            </details>
            {writingBlockedReason ? <em className="octo-action-reason">{writingBlockedReason}</em> : null}
          </div>
          {progress && progress.type === "project_planning" ? (
            <div className="octo-center-artifact planning-live compact">
              <PlanningProgress detail={progress} />
            </div>
          ) : isViewingLiveWritingChapter && liveWritingProgress ? (
            <WritingLiveWorkspace detail={liveWritingProgress} />
          ) : (
            <>
              {artifactView !== "manuscript" ? (
                <div className="octo-artifact-drawer">
                  <div className="octo-artifact-drawer-head">
                    <strong>{artifactViewLabel(artifactView)}</strong>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setArtifactView("manuscript")}>收起</Button>
                  </div>
                  <div className="octo-artifact-drawer-body">
                    {artifactView === "planning" ? (
                      <ProjectArtifactViewer
                        artifact={projectArtifact || outline}
                        selectedArtifact={selectedArtifact}
                        onSave={saveSelectedArtifact}
                      />
                    ) : artifactView === "card" ? (
                      <EditableArtifact
                        title={`第${selected}章章卡`}
                        value={card?.text}
                        empty={card?.message || "本章章卡会在写正文前自动生成。"}
                        onSave={saveCard}
                        rows={10}
                      />
                    ) : artifactView === "memory" ? (
                      <MemoryMiniView memory={memory} />
                    ) : artifactView === "quality" ? (
                      <QualityCenterView content={content} review={review} editorReport={editorReport} progress={progress} />
                    ) : artifactView === "publish" ? (
                      <PublishWorkbenchView project={project} latest={latest} />
                    ) : null}
                  </div>
                </div>
              ) : null}
              {content?.status === "ready" ? (
                <>
                  {gateStrip ? (
                    <div className={`octo-publish-gate-strip ${gateStrip.tone}`}>
                      <strong>{gateStrip.title}</strong>
                      <span className="octo-gate-strip-summary">{gateStrip.summaryText}</span>
                      {gateStrip.reasonCount ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="octo-gate-details-button octo-gate-failure-chip"
                          onClick={() => jumpToGateIssue(gateStrip.remaining[0])}
                          title={gateStrip.remaining.join(" / ")}
                      >
                        {gateStrip.reasonCount}项待修
                      </Button>
                    ) : null}
                    {gateStrip.stopAction ? <em className="octo-gate-stop-action">{gateStrip.stopAction}</em> : null}
                  </div>
                ) : null}
                  <ManuscriptEditor value={draft} review={editorAnnotationReview} qualityStatus={qualityStatus} onChange={setDraft} />
                </>
              ) : (
                <div className="octo-start-flow">
                  <PlanningReadyPanel
                    tree={projectTree}
                    planning={planning}
                    writing={writing}
                    disabledReason={writingBlockedReason}
                    onGeneratePlanning={generatePlanning}
                    onWriteSingle={() => void runWritingTask(Number(current || selected || 1))}
                  />
                  {planningReady ? (
                    <span className="octo-flow-hint">{safeText(content?.message, "当前章节还没有正文。生成后会在这里显示完整正文和质检标记。")}</span>
                  ) : null}
                </div>
              )}
            </>
          )}
          <OctoProgressFlow
            steps={pipelineItems.map((item) => ({
              id: item.key,
              label: item.label,
              detail: item.detail,
              state: item.status === "done"
                ? "done"
                : item.status === "running"
                  ? "running"
                  : item.status === "blocked"
                    ? "fail"
                    : "pending",
            }))}
          />
          {exportResult?.path ? (
            <div className="octo-export-result">
              <strong>导出成功</strong>
              <span>{exportResult.path}</span>
              <Button type="button" size="sm" variant="secondary" data-octo-open-path={exportResult.path} data-octo-action="openPathFromDataset">打开文件</Button>
            </div>
          ) : null}
        </section>

        <QualityPublishPanel
          content={content}
          review={review}
          editorReport={editorReport}
          progress={progress}
          globalReview={latestGlobalReview}
        />
      </div>

      {exportState.open ? (
        <div className="octo-modal-backdrop" role="dialog" aria-modal="true">
          <div className="octo-modal">
            <div className="octo-modal-head">
              <div>
                <strong>导出</strong>
                <span>选择范围和格式，导出完成后可直接打开文件。</span>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setExportState((prev) => ({ ...prev, open: false }))}>关闭</Button>
            </div>
            <div className="octo-form-grid">
              <label className="octo-field">
                <span>从第几章</span>
                <input type="number" min={1} value={exportState.from} onChange={(event) => setExportState((prev) => ({ ...prev, from: Number(event.target.value || 1) }))} />
              </label>
              <label className="octo-field">
                <span>到第几章</span>
                <input type="number" min={1} value={exportState.to} onChange={(event) => setExportState((prev) => ({ ...prev, to: Number(event.target.value || 1) }))} />
              </label>
              <label className="octo-field">
                <span>格式</span>
                <select value={exportState.format} onChange={(event) => setExportState((prev) => ({ ...prev, format: event.target.value as ExportState["format"] }))}>
                  <option value="merged">TXT 合并</option>
                  <option value="single">单章 TXT</option>
                  <option value="docx" disabled>DOCX（即将接入）</option>
                </select>
              </label>
              <label className="octo-field span-2">
                <span>导出位置</span>
                <input value={exportState.destination || "当前项目 / 导出"} readOnly />
              </label>
              {hasDesktopDirectoryPicker ? (
                <Button type="button" size="sm" variant="secondary" className="octo-secondary-action" onClick={chooseExportDestination}>选择目录</Button>
              ) : (
                <p className="octo-field-note">网页模式使用默认导出目录。</p>
              )}
            </div>
            <div className="octo-modal-actions">
              <Button type="button" variant="ghost" onClick={() => setExportState((prev) => ({ ...prev, open: false }))}>取消</Button>
              <Button type="button" variant="primary" glow className="primary" onClick={runExport}>导出</Button>
            </div>
          </div>
        </div>
      ) : null}
    </PixsoPageShell>
  );
};

