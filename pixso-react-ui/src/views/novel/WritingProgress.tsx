import { useEffect, useMemo, useRef, useState } from "react";
import { OctoButton } from "@/components/octo-ui";
import { safeText } from "@/views/PixsoAppShell";
import type { JsonRecord } from "@/views/PixsoAppShell";
import type { TaskProgressDetail } from "@/views/novel/types";

const stepLabels: Record<string, string> = {
  queued: "排队中",
  started: "启动中",
  card: "生成章卡",
  card_done: "章卡完成",
  chapter_card: "读取章卡",
  model_call: "创作角色工作中",
  model_fallback: "备用角色接手",
  model_failed: "创作角色调用失败",
  batch: "准备任务",
  write: "写正文",
  write_done: "正文完成",
  review: "自动质检",
  review_done: "质检完成",
  rewrite: "自动返工",
  rewrite_done: "返工完成",
  global_review: "全局复审",
  global_repair: "跨章返工",
  global_rereview: "全局复查",
  state: "同步记忆",
  state_done: "记忆完成",
  export: "写入章节",
  export_done: "入库完成",
  batch_completed: "任务完成",
  completed: "已完成",
  stopped: "已停止",
  failed: "失败",
};

const blockerLabels: Record<string, string> = {
  reviewer_invalid: "审查员无效",
  weak_review_fallback: "审查员输出过薄",
  review_grade_below_publish: "质检等级未到发布线",
  hard_quality_flag_active: "命中硬规则",
  ai_process_leak: "过程痕迹泄露",
  drop_risk_segments_remaining: "仍有弃读风险段",
  tail_hook_below_publish: "章尾钩子不够强",
  weak_tail_hook: "章尾钩子不够强",
  micro_hook_density_below_publish: "微钩子密度不足",
  coolpoint_density_below_publish: "爽点兑现不足",
  retention_prediction_below_publish: "追读预测不足",
  story_room_contract_not_delivered: "章卡承诺未落正文",
  ai_taste_below_publish: "AI味偏重",
  fact_consistency_violation: "设定事实冲突",
  publish_gate_not_ready: "发布门禁未通过",
  template_opening_inertia: "模板开头复读",
  sentence_pattern_inertia: "句式惯性",
  paragraph_rhythm_single_note: "段落节奏单一",
  inline_risk_segments: "正文存在风险句",
};

const repairReasonLabels: Record<string, string> = {
  reviewer_invalid: "审查员无效，已暂停正文返工",
  targeted_repair_exhausted: "定点修补轮次已用完",
  max_rewrites_exhausted: "达到最大改稿轮次",
  rollback_required: "低于底线，已停止入库",
  degraded_on_rewrite: "改稿后降级，已回退稳定版本",
  collapsed_on_rewrite: "改稿后篇幅塌缩，已回退稳定版本",
};

const workerRoles: Record<string, string> = {
  generate_book_plan: "规划师",
  generate_title: "标题师",
  generate_chapter_card: "章卡师",
  write_chapter: "写作师",
  review_chapter: "审查员",
  rewrite_chapter: "修稿师",
  extract_state_candidates: "记忆官",
  global_review: "总编辑",
  dialogue_tune: "对白师",
  video_prompt: "分镜师",
};

const workerStages: Record<string, string> = {
  generate_book_plan: "规划设定",
  generate_title: "生成书名",
  generate_chapter_card: "生成章卡",
  write_chapter: "写正文",
  review_chapter: "自动质检",
  rewrite_chapter: "定点修补",
  extract_state_candidates: "同步记忆",
  global_review: "全局复审",
  dialogue_tune: "对白润色",
  video_prompt: "视频提示词",
};

const asRecord = (value: unknown): JsonRecord => (
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}
);

const asString = (value: unknown, fallback = "") => safeText(value, fallback);

const asNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const asList = (value: unknown) => (Array.isArray(value) ? value.filter(Boolean) : []);

const repairTaxonomyFrom = (progress: JsonRecord) => asRecord(progress.repair_taxonomy);

const repairToneClass = (color = "") => {
  const safeColor = /^(amber|rose|violet|sky|emerald|orange|slate)$/.test(color) ? color : "slate";
  return `tone-${safeColor}`;
};

const stepLabel = (value?: unknown) => stepLabels[String(value || "")] || asString(value, "处理中");
const blockerText = (value?: unknown) => blockerLabels[String(value || "")] || asString(value, "待优化");
const repairStatusText = (value?: unknown) => repairReasonLabels[String(value || "")] || asString(value);

const jumpToInlineIssue = (issue = "") => {
  if (!issue || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("octosage:jump-inline-issue", { detail: { issue } }));
};

const probablyMojibake = (value = "") => /锟|�|鐣|寗|灏|璧|偣|閽|瑙|棰||||/.test(value);

const workerRoleLabel = (taskType?: unknown) => workerRoles[String(taskType || "")] || "创作角色";
const workerStageLabel = (taskType?: unknown) => workerStages[String(taskType || "")] || "处理任务";

const sanitizeMessage = (value?: unknown) => {
  const text = asString(value);
  if (!text || probablyMojibake(text)) return "";
  if (!/(model|qwen|deepseek|wenxin|kimi|doubao|ernie|dashscope|moonshot|openai|模型)/i.test(text)) {
    return text;
  }
  if (/failed|error|失败|超时/i.test(text)) return "创作角色响应异常，正在记录原因并尝试备用方案。";
  if (/fallback|备用|切换/i.test(text)) return "当前角色响应异常，正在切换备用角色。";
  if (/review|qwen|审查/i.test(text)) return "审查员正在检查本章质量，请稍等。";
  if (/write|wenxin|kimi|写作/i.test(text)) return "写作师正在按章卡生成正文，请稍等。";
  if (/card|章卡|deepseek/i.test(text)) return "章卡师正在整理本章细纲，请稍等。";
  return "创作角色正在工作，请稍等。";
};

const workerRuntimeInfo = (progress: JsonRecord) => {
  const currentStep = asString(progress.step);
  if (!["model_call", "model_fallback", "model_failed"].includes(currentStep)) return null;
  const role = workerRoleLabel(progress.model_task_type);
  const stage = asString(progress.model_stage) || workerStageLabel(progress.model_task_type);
  const seconds = asNumber(progress.model_timeout_ms) ? Math.round(asNumber(progress.model_timeout_ms) / 1000) : 0;
  const error = sanitizeMessage(progress.model_error);
  const status = currentStep === "model_failed" ? "failed" : currentStep === "model_fallback" ? "fallback" : "running";
  const label = status === "failed" ? `${role}调用失败` : status === "fallback" ? "备用角色接手" : `${role}工作中`;
  const detail = status === "failed"
    ? `${stage}失败：${error || "未知错误"}`
    : status === "fallback"
      ? `${stage}遇到问题，正在切换备用角色`
      : `${stage}中${seconds ? `，最长等待 ${seconds} 秒` : ""}`;
  return { status, label, detail, stage, role };
};

const gradeText = (grade?: unknown) => {
  const value = asString(grade);
  return value ? `${value}级质检` : "待审";
};

const publishGateFrom = (progress: JsonRecord, result: JsonRecord): JsonRecord => {
  const directGate = asRecord(progress.publish_gate || result.publish_gate);
  if (Object.keys(directGate).length) return directGate;
  return asRecord(asRecord(result.review).publish_gate);
};

const isPublishReady = (progress: JsonRecord, result: JsonRecord) => {
  const gate = publishGateFrom(progress, result);
  return gate.publish_ready === true || asString(progress.publish_status || result.publish_status) === "可发布";
};

const liveProgressText = (detail: TaskProgressDetail | null) => {
  const progress = asRecord(detail?.progress);
  const result = asRecord(detail?.task?.result);
  return asString(
    progress.text_preview
      || progress.draft_preview
      || progress.text_delta
      || result.text_preview
      || result.preview,
  );
};

const liveFallbackText = (detail: TaskProgressDetail | null) => {
  const progress = asRecord(detail?.progress);
  const currentStep = asString(progress.step || detail?.status);
  const chapterNo = asNumber(progress.chapter_no || progress.from, 1);
  const cardTitle = asString(progress.card_title, `第${chapterNo}章`);
  const cardGoal = asString(progress.card_goal);
  const message = sanitizeMessage(progress.message);
  const modelInfo = workerRuntimeInfo(progress);
  const repairLabel = asString(progress.repair_label);
  const repairMissingLabels = asList(progress.repair_missing_labels).slice(0, 4).map(String);
  const repairIssues = asList(progress.repair_issues).slice(0, 4).map(blockerText);
  const blockers = asList(progress.blockers).slice(0, 4).map(blockerText);
  const issues = asList(progress.issues).slice(0, 3).map(String);
  const lines = [
    ["card", "chapter_card"].includes(currentStep)
      ? "章鱼正在生成本章章卡：先锁定冲突、爽点、人物动作和章尾钩子。"
      : "",
    currentStep === "card_done"
      ? `章卡已完成：${cardTitle}${cardGoal ? `\n本章目标：${cardGoal}` : ""}`
      : "",
    modelInfo ? `${modelInfo.label}：${modelInfo.detail}` : "",
    currentStep === "write"
      ? `正在按细纲写第 ${chapterNo} 章正文。\n${cardGoal ? `本章目标：${cardGoal}\n` : ""}正文返回后会在这里以打字机方式展开。`
      : "",
    ["review", "review_done"].includes(currentStep)
      ? `正在自动质检第 ${chapterNo} 章：检查前300字、钩子、爽点、弃读风险、AI味和逻辑自洽。`
      : "",
    ["rewrite", "rewrite_done"].includes(currentStep)
      ? `${repairLabel || "触发自动返工"}\n${[...repairMissingLabels, ...repairIssues, ...blockers, ...issues].filter(Boolean).join("\n") || "正在把风险句改成更具体的行动、对白和现场反馈。"}`
      : "",
    ["state", "state_done"].includes(currentStep)
      ? "正在同步项目记忆：人物状态、伏笔、时间线和设定变更会写回项目树。"
      : "",
    ["export", "export_done"].includes(currentStep)
      ? "正在写入正式章节文件，左侧章节目录和项目树会同步刷新。"
      : "",
    ["global_review", "global_repair", "global_rereview"].includes(currentStep)
      ? "正在做每10章全局复审：检查跨章矛盾、人物动机断裂、伏笔遗忘，并自动加入返工队列。"
      : "",
    message,
  ].filter(Boolean);
  return lines.join("\n\n") || "正在准备本章项目菜单、章卡和正文任务...";
};

const eventRecord = (event: unknown) => asRecord(event);
const eventLabel = (event: unknown, fallback = "处理") => asString(eventRecord(event).label, fallback);
const eventDetail = (event: unknown) => asString(eventRecord(event).detail);
const eventKey = (event: unknown) => asString(eventRecord(event).key);
const eventStatus = (event: unknown) => asString(eventRecord(event).status, "pending");

const qualityEventCopy = (event: unknown) => {
  const label = eventLabel(event);
  const detail = eventDetail(event);
  return detail ? `${label}：${detail}` : label;
};

const repairRoundText = (progress: JsonRecord, result: JsonRecord, totalRewriteCount = 0) => {
  const current = asNumber(progress.repair_rounds_this_run ?? result.repair_rounds_this_run);
  const max = asNumber(progress.max_repair_rounds ?? result.max_repair_rounds);
  if (current && max) return `本次 ${current}/${max} 轮${totalRewriteCount ? ` / 总计 ${totalRewriteCount} 次` : ""}`;
  if (current) return `本次第 ${current} 轮${totalRewriteCount ? ` / 总计 ${totalRewriteCount} 次` : ""}`;
  return totalRewriteCount ? `总计 ${totalRewriteCount} 次` : "";
};

const pipelineState = ({
  stepKey,
  sourceText,
  grade,
  repairLabel,
  repairStageLabel,
  qualityEvents,
  publishStatus,
  completed,
  modelTaskType,
}: {
  stepKey: string;
  sourceText: string;
  grade: string;
  repairLabel: string;
  repairStageLabel: string;
  qualityEvents: unknown[];
  publishStatus: string;
  completed: boolean;
  modelTaskType: string;
}) => {
  const hasEvent = (key: string, status?: string) => qualityEvents.some((event) => {
    if (eventKey(event) !== key) return false;
    return status ? eventStatus(event) === status : true;
  });
  const hasRunningEvent = qualityEvents.some((event) => eventStatus(event) === "running");
  return [
    {
      key: "chapter_card",
      label: "章卡",
      done: Boolean(sourceText || ["write", "review", "rewrite", "completed"].includes(stepKey)),
      running: ["card", "chapter_card"].includes(stepKey) || (stepKey === "model_call" && modelTaskType === "generate_chapter_card"),
    },
    {
      key: "write",
      label: "写稿",
      done: Boolean(sourceText || ["review", "rewrite", "completed"].includes(stepKey)),
      running: stepKey === "write" || (stepKey === "model_call" && modelTaskType === "write_chapter"),
    },
    {
      key: "review",
      label: "质检",
      done: Boolean(grade || ["rewrite", "global_review", "completed"].includes(stepKey)),
      running: ["review", "review_done"].includes(stepKey) || (stepKey === "model_call" && modelTaskType === "review_chapter"),
    },
    {
      key: "repair",
      label: repairStageLabel || repairLabel || "修补",
      done: hasEvent("rereview", "done") || hasEvent("auto_rewrite", "done") || stepKey === "completed",
      running: stepKey === "rewrite" || Boolean(repairLabel) || hasRunningEvent || (stepKey === "model_call" && modelTaskType === "rewrite_chapter"),
    },
    {
      key: "publish_gate",
      label: publishStatus || "发布门禁",
      done: completed,
      running: hasEvent("rereview") && !completed,
    },
  ];
};

export const WritingProgress = ({ detail }: { detail: TaskProgressDetail | null }) => {
  if (!detail) return null;

  const progress = asRecord(detail.progress);
  const result = asRecord(detail.task?.result);
  const publishReady = detail.status === "completed" && isPublishReady(progress, result);
  const total = Math.max(1, asNumber(progress.total_chapters, 1));
  const done = Math.max(0, Math.min(total, asNumber(progress.completed_chapters)));
  const percent = detail.status === "completed" ? 100 : Math.round((done / total) * 100);
  const isBatch = detail.type === "run_project";
  const currentStep = asString(progress.step || detail.status);
  const modelInfo = workerRuntimeInfo(progress);
  const chapterNo = asNumber(progress.chapter_no || progress.from, 1);
  const liveText = liveProgressText(detail);
  const message = sanitizeMessage(progress.message || detail.task?.error) || stepLabel(currentStep);
  const cardTitle = asString(progress.card_title);
  const cardGoal = asString(progress.card_goal);
  const grade = asString(progress.grade || result.final_grade);
  const version = asString(progress.version || result.final_version);
  const wordTotal = asNumber(progress.word_count || result.word_count);
  const rewriteCount = asNumber(progress.rewrite_count || result.rewrite_count);
  const repairRound = repairRoundText(progress, result, rewriteCount);
  const memoryCount = asNumber(progress.memory_count);
  const exportPath = asString(progress.export_path || result.export_path);
  const issues = publishReady ? [] : asList(progress.issues).slice(0, 3);
  const repairTaxonomy = repairTaxonomyFrom(progress);
  const repairLabel = publishReady ? "" : asString(repairTaxonomy.label, asString(progress.repair_label));
  const repairStageLabel = publishReady ? "" : asString(repairTaxonomy.stage_label, repairLabel);
  const repairColor = publishReady ? "slate" : asString(repairTaxonomy.ui_color, "slate");
  const repairMissingLabels = publishReady ? [] : asList(progress.repair_missing_labels).slice(0, 4).map(String);
  const repairIssues = publishReady ? [] : asList(progress.repair_issues).slice(0, 6);
  const blockers = publishReady ? [] : asList(progress.blockers).slice(0, 6);
  const repairReason = publishReady ? "" : repairStatusText(progress.reason);
  const repairQueue = publishReady ? [] : asList(progress.repair_queue).map(asRecord).slice(0, 5);
  const qualityEvents = asList(progress.quality_events);
  const latestQualityEvent = qualityEvents[qualityEvents.length - 1];
  const qualityTimeline = qualityEvents.map(qualityEventCopy).filter(Boolean).join(" -> ");
  const chapterResults = asList(progress.chapter_results).map(asRecord);
  const latestChapter = asRecord(progress.latest_chapter || chapterResults[chapterResults.length - 1]);
  const hasRepair = Boolean(!publishReady && (qualityEvents.length || repairLabel || repairQueue.length || repairMissingLabels.length || repairIssues.length || blockers.length || repairReason));
  const facts = [
    modelInfo ? { label: "角色", value: modelInfo.role } : null,
    cardTitle ? { label: "章卡", value: cardTitle } : null,
    wordTotal ? { label: "正文", value: `${wordTotal}字${version ? ` / ${version}` : ""}` } : null,
    grade ? { label: "质检", value: gradeText(grade) } : null,
    rewriteCount ? { label: "返工", value: `${rewriteCount}轮` } : null,
    memoryCount ? { label: "记忆", value: `${memoryCount}条` } : null,
    exportPath ? { label: "入库", value: "已写入" } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <div className={`octo-progress-panel ${hasRepair ? "has-rework" : ""}`}>
      <div className="octo-progress-head">
        <strong>
          {hasRepair
            ? `第${chapterNo}章 / 自动返工闭环`
            : isBatch
              ? `连续写作 / 第${Math.min(total, done + 1)}/${total}章`
              : `第${chapterNo}章 / ${modelInfo?.stage || stepLabel(currentStep)}`}
        </strong>
        <span>{modelInfo?.label || repairStageLabel || repairLabel || (latestQualityEvent ? eventLabel(latestQualityEvent, "自动返工") : detail.status === "completed" ? "完成" : stepLabel(currentStep))}</span>
      </div>
      <p className="octo-progress-message">{message}</p>
      {modelInfo ? (
        <div className={`octo-model-status ${modelInfo.status}`}>
          <strong>{modelInfo.label}</strong>
          <span>{modelInfo.detail}</span>
        </div>
      ) : null}
      <div className="octo-progress-bar"><i style={{ width: `${Math.max(6, percent)}%` }} /></div>

      {facts.length ? (
        <div className="octo-progress-facts">
          {facts.map((fact) => (
            <span className="octo-progress-fact" key={fact.label}>
              <b>{fact.label}</b>
              <em>{fact.value}</em>
            </span>
          ))}
        </div>
      ) : null}

      <div className="octo-progress-list">
        {Array.from({ length: isBatch ? total : 1 }, (_, index) => {
          const no = asNumber(progress.from || chapterNo, chapterNo) + index;
          const state = index < done ? "done" : index === done && detail.status !== "completed" ? "running" : "wait";
          return (
            <div className={`octo-progress-row ${state}`} key={no}>
              <b>{state === "done" ? "OK" : state === "running" ? "..." : "-"}</b>
              <span>第{String(no).padStart(2, "0")}章</span>
              <strong>{state === "done" ? "已生成" : state === "running" ? stepLabel(currentStep) : "等待"}</strong>
            </div>
          );
        })}
      </div>

      {isBatch && chapterResults.length ? (
        <div className="octo-progress-chapter-results">
          {chapterResults.map((item) => {
            const no = asNumber(item.chapter_no);
            return (
              <span key={no}>
                <b>第{String(no).padStart(2, "0")}章</b>
                <em>
                  {[
                    item.grade ? gradeText(item.grade) : "",
                    item.word_count ? `${item.word_count}字` : "",
                    item.rewrite_count ? `返工${item.rewrite_count}轮` : "",
                    item.export_path ? "已入库" : "",
                  ].filter(Boolean).join(" / ")}
                </em>
              </span>
            );
          })}
        </div>
      ) : null}

      {isBatch && Object.keys(latestChapter).length ? (
        <div className="octo-progress-note">
          <strong>最新完成</strong>
          <p>
            第{String(asNumber(latestChapter.chapter_no, chapterNo)).padStart(2, "0")}章
            {latestChapter.grade ? ` / ${gradeText(latestChapter.grade)}` : ""}
            {latestChapter.word_count ? ` / ${latestChapter.word_count}字` : ""}
            {latestChapter.rewrite_count ? ` / 自动返工${latestChapter.rewrite_count}轮` : ""}
          </p>
        </div>
      ) : null}

      {cardGoal ? (
        <div className="octo-progress-note">
          <strong>本章目标</strong>
          <p>{cardGoal}</p>
        </div>
      ) : null}

      {issues.length ? (
        <div className="octo-progress-issues">
          <strong>未达标原因</strong>
          {issues.map((issue, index) => <span key={`${String(issue)}-${index}`}>{String(issue)}</span>)}
        </div>
      ) : null}

      {repairLabel || repairMissingLabels.length || repairIssues.length || blockers.length || repairReason ? (
        <div className={`octo-progress-repair ${repairToneClass(repairColor)}`}>
          {repairRound ? <p className="octo-progress-rounds">{repairRound}</p> : null}
          <strong>{repairLabel || repairReason || "自动返工中"}</strong>
          <p>{repairReason ? `${repairReason} / ` : ""}{rewriteCount ? `第${rewriteCount}轮改稿` : "正在定位硬规则问题"} / 按红灯原因逐项修到发布线</p>
          {repairQueue.length ? (
            <div className="octo-repair-queue-mini">
              {repairQueue.map((item, index) => {
                const status = asString(item.status, index === 0 ? "current" : "queued");
                const label = asString(item.stage_label || item.label || item.issue, "待修补");
                return (
                  <span className={`octo-repair-queue-step ${status}`} key={asString(item.id, `${label}-${index}`)}>
                    {index + 1}. {label}
                  </span>
                );
              })}
            </div>
          ) : null}
          <div>
            {repairMissingLabels.map((item, index) => (
              <span className="octo-repair-chip" key={`missing-${item}-${index}`}>
                正在补：{item}
              </span>
            ))}
            {[...repairIssues, ...blockers].slice(0, 8).map((item, index) => (
              <OctoButton
                type="button"
                size="sm"
                variant="ghost"
                className="octo-repair-chip"
                data-inline-issue-target={blockerText(item)}
                key={`${String(item)}-${index}`}
                onClick={() => jumpToInlineIssue(blockerText(item))}
              >
                {blockerText(item)}
              </OctoButton>
            ))}
          </div>
        </div>
      ) : null}

      {qualityEvents.length ? (
        <div className="octo-progress-events">
          <strong>自动返工</strong>
          {qualityTimeline ? <p className="octo-progress-rework-line">{qualityTimeline}</p> : null}
          <div>
            {qualityEvents.map((event, index) => (
              <span className={`octo-progress-event ${eventStatus(event)}`} key={eventKey(event) || `${eventLabel(event)}-${index}`}>
                <b>{eventLabel(event)}</b>
                <em>{eventDetail(event)}</em>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {liveText ? (
        <div className="octo-progress-live">
          <strong>最新正文片段</strong>
          <p>{liveText}</p>
        </div>
      ) : null}
    </div>
  );
};

export const WritingLiveWorkspace = ({ detail }: { detail: TaskProgressDetail }) => {
  const progress = asRecord(detail.progress);
  const result = asRecord(detail.task?.result);
  const publishReady = detail.status === "completed" && isPublishReady(progress, result);
  const [typedText, setTypedText] = useState("");
  const [rewriteGhostText, setRewriteGhostText] = useState("");
  const paperRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLElement | null>(null);
  const sourceText = liveProgressText(detail) || liveFallbackText(detail);
  const isRealManuscript = Boolean(liveProgressText(detail));
  const currentStep = asString(progress.step || detail.status);
  const currentLabel = stepLabel(currentStep);
  const chapterNo = asNumber(progress.chapter_no || progress.from, 1);
  const grade = asString(progress.grade || result.final_grade);
  const publishStatus = asString(progress.publish_status || result.publish_status);
  const modelInfo = workerRuntimeInfo(progress);
  const qualityEvents = useMemo(() => asList(progress.quality_events), [progress.quality_events]);
  const issues = publishReady ? [] : asList(progress.issues).slice(0, 3);
  const repairTaxonomy = repairTaxonomyFrom(progress);
  const repairLabel = publishReady ? "" : asString(repairTaxonomy.label, asString(progress.repair_label));
  const repairStageLabel = publishReady ? "" : asString(repairTaxonomy.stage_label, repairLabel);
  const repairColor = publishReady ? "slate" : asString(repairTaxonomy.ui_color, "slate");
  const repairMissingLabels = publishReady ? [] : asList(progress.repair_missing_labels).slice(0, 4).map(String);
  const repairIssues = publishReady ? [] : asList(progress.repair_issues).slice(0, 6);
  const blockers = publishReady ? [] : asList(progress.blockers).slice(0, 6);
  const repairReason = publishReady ? "" : repairStatusText(progress.reason);
  const repairQueue = publishReady ? [] : asList(progress.repair_queue).map(asRecord).slice(0, 5);
  const beforeRewritePreview = publishReady ? "" : asString(progress.before_rewrite_preview);
  const afterRewritePreview = publishReady ? "" : asString(progress.after_rewrite_preview);
  const isInlineRewrite = currentStep === "rewrite" && Boolean(beforeRewritePreview || rewriteGhostText || afterRewritePreview);
  const message = sanitizeMessage(progress.message || detail.task?.error) || currentLabel;
  const pipeline = pipelineState({
    stepKey: currentStep,
    sourceText,
    grade,
    repairLabel,
    repairStageLabel,
    qualityEvents,
    publishStatus,
    completed: detail.status === "completed",
    modelTaskType: asString(progress.model_task_type),
  });

  useEffect(() => {
    if (!sourceText) {
      setTypedText("");
      return;
    }
    if (sourceText.length < typedText.length || !sourceText.startsWith(typedText.slice(0, Math.min(typedText.length, 40)))) {
      setTypedText("");
      return;
    }
    if (typedText.length >= sourceText.length) return;
    const chunk = isRealManuscript ? 8 : 4;
    const delay = isRealManuscript ? 58 : 46;
    const timer = window.setTimeout(() => {
      setTypedText(sourceText.slice(0, Math.min(sourceText.length, typedText.length + chunk)));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [sourceText, typedText, isRealManuscript]);

  useEffect(() => {
    if (currentStep === "rewrite" && isRealManuscript && typedText) {
      setRewriteGhostText(typedText);
    }
    if (["completed", "stopped", "export_done"].includes(currentStep)) {
      const timer = window.setTimeout(() => setRewriteGhostText(""), 1200);
      return () => window.clearTimeout(timer);
    }
  }, [currentStep, isRealManuscript, typedText]);

  const lockLiveCursorToCenter = () => {
    const paper = paperRef.current;
    const cursor = cursorRef.current;
    if (!paper || !cursor) return;
    const paperRect = paper.getBoundingClientRect();
    const cursorRect = cursor.getBoundingClientRect();
    const cursorTop = cursorRect.top - paperRect.top + paper.scrollTop;
    const targetTop = Math.max(0, cursorTop - paper.clientHeight * 0.48);
    paper.scrollTo({ top: targetTop, behavior: "smooth" });
  };

  useEffect(() => {
    if (!typedText || !cursorRef.current || !paperRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      lockLiveCursorToCenter();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [typedText]);

  return (
    <div className="octo-live-workspace">
      <div className="octo-live-head">
        <div>
          <strong>第{String(chapterNo).padStart(2, "0")}章 / {modelInfo?.stage || currentLabel}</strong>
          <span>{message}</span>
        </div>
        <em>{modelInfo?.label || publishStatus || (grade ? gradeText(grade) : "生成中")}</em>
      </div>

      <div className="octo-live-pipeline">
        {pipeline.map((item) => (
          <span className={item.done ? "done" : item.running ? "running" : "wait"} key={item.key}>
            <i />
            {item.label}
          </span>
        ))}
      </div>

      {modelInfo ? (
        <div className={`octo-live-model ${modelInfo.status}`}>
          <b>{modelInfo.label}</b>
          <span>{modelInfo.detail}</span>
        </div>
      ) : null}

      {issues.length ? (
        <div className="octo-live-issues">
          {issues.map((issue, index) => <span key={`${String(issue)}-${index}`}>{String(issue)}</span>)}
        </div>
      ) : null}

      {repairLabel || repairQueue.length || repairMissingLabels.length || repairIssues.length || blockers.length || repairReason ? (
        <div className={`octo-live-repair ${repairToneClass(repairColor)}`}>
          <strong>{repairLabel || repairReason || "自动返工中"}</strong>
          {repairQueue.length ? (
            <div className="octo-repair-queue-mini">
              {repairQueue.map((item, index) => {
                const status = asString(item.status, index === 0 ? "current" : "queued");
                const label = asString(item.stage_label || item.label || item.issue, "待修补");
                return (
                  <span className={`octo-repair-queue-step ${status}`} key={asString(item.id, `${label}-${index}`)}>
                    {index + 1}. {label}
                  </span>
                );
              })}
            </div>
          ) : null}
          {[...repairMissingLabels, ...repairIssues, ...blockers].length ? (
            <div className="octo-live-repair-chips">
              {repairMissingLabels.map((item, index) => (
                <span className="octo-repair-chip" key={`live-missing-${item}-${index}`}>
                  正在补：{item}
                </span>
              ))}
              {[...repairIssues, ...blockers].slice(0, 6).map((item, index) => (
                <OctoButton
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="octo-repair-chip"
                  data-inline-issue-target={blockerText(item)}
                  key={`${String(item)}-${index}`}
                  onClick={() => jumpToInlineIssue(blockerText(item))}
                >
                  {blockerText(item)}
                </OctoButton>
              ))}
              <em>通过后才入库</em>
            </div>
          ) : (
            <span>正在按发布门禁定点修补 / 通过后才入库</span>
          )}
        </div>
      ) : null}

      {qualityEvents.length ? (
        <div className="octo-live-rework">
          {qualityEvents.map((event, index) => (
            <span className={eventStatus(event)} key={eventKey(event) || `${eventLabel(event)}-${index}`}>
              <b>{eventLabel(event)}</b>
              <em>{eventDetail(event)}</em>
            </span>
          ))}
        </div>
      ) : null}

      <div className={`octo-live-paper ${isRealManuscript ? "manuscript" : "process"}`} ref={paperRef}>
        {isInlineRewrite ? (
          <div className="octo-live-repair-stream">
            <strong>正在替换未达标版本</strong>
            <del className="octo-live-repair-old">{beforeRewritePreview || rewriteGhostText.slice(-180)}</del>
            <p className="octo-live-repair-new">
              {typedText || afterRewritePreview || liveFallbackText(detail)}
              <b className="octo-type-cursor" ref={cursorRef} />
            </p>
          </div>
        ) : (
          <p>
            {typedText || liveFallbackText(detail)}
            <b className="octo-type-cursor" ref={cursorRef} />
          </p>
        )}
      </div>
    </div>
  );
};
