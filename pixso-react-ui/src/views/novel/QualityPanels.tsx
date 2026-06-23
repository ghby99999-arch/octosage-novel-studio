import { QualityScoreChart } from "@/components/QualityScoreChart";
import { OctoGateLights, type OctoGateLight } from "@/components/octo-ui";
import { safeText } from "@/views/PixsoAppShell";
import type {
  ChapterContent,
  ChapterReview,
  EditorReport,
  GlobalReviewSummary,
  PublishGate,
  TaskProgressDetail,
} from "@/views/novel/types";
import { gateFrom, metricScore, wordCount } from "@/views/novel/utils";

type Gate = PublishGate | null | undefined;

const gradeValue = (grade?: string | null) => String(grade || "").trim().toUpperCase();
const premiumGradeReady = (grade?: string | null) => ["S", "A"].includes(gradeValue(grade));

export const cleanGradeText = (grade?: string | null) => {
  const value = safeText(grade, "");
  return value ? `${value}级质检` : "待审";
};

export const cleanPublishLabel = (gate?: Gate, fallback = "待审") => {
  if (!gate) return fallback;
  if (gate.failure_type === "reviewer_invalid" || gate.status === "reviewer_invalid") return "审查员无效";
  if (gate.publish_ready) return "可发布";
  return safeText(gate.label, "需自动优化");
};

export const publishBlockerText = (value?: string) => ({
  reviewer_invalid: "审查员无效",
  weak_review_fallback: "审查员输出过薄",
  review_grade_below_publish: "质检等级未到发布线",
  hard_quality_flag_active: "命中硬规则",
  ai_process_leak: "过程说明泄露",
  drop_risk_segments_remaining: "仍有弃读风险段",
  drop_risk_segments: "弃读风险段",
  tail_hook_below_publish: "章尾钩子不够强",
  micro_hook_density_below_publish: "微钩子不足",
  coolpoint_density_below_publish: "爽点兑现不足",
  retention_prediction_below_publish: "追读预测不足",
  reader_behavior_score_below_publish: "读者行为分不足",
  story_room_contract_not_delivered: "章卡承诺未落正文",
  first_300_retention_proxy_below_publish: "前300字留存不足",
  chapter_completion_proxy_below_publish: "读完意愿不足",
  next_chapter_click_proxy_below_publish: "下章点击不足",
  follow_intent_proxy_below_publish: "追更意愿不足",
  ai_taste_below_publish: "AI味偏重",
  fact_consistency_violation: "事实/设定冲突",
  setting_fact_conflict: "事实/设定冲突",
  publish_gate_not_ready: "发布门禁未通过",
  template_opening_inertia: "模板开头复读",
  inline_risk_segments: "正文存在风险句",
  paragraph_rhythm_single_note: "段落节奏单一",
  dialogue_wall: "对白墙",
}[String(value || "")] || safeText(value, "待优化"));

const stopReasonText = (value?: string) => ({
  reviewer_invalid: "审查员无效，已停止正文返工",
  targeted_repair_exhausted: "定点修补已到上限",
  max_rewrites_exhausted: "自动改稿轮数已用完",
  degraded_on_rewrite: "改稿后质量变差，已回退",
  rollback_required: "审稿判定不可用，需要回退重写",
  publish_gate_not_ready: "发布门禁未通过",
}[String(value || "")] || safeText(value, ""));

const issueText = (value?: string) => {
  const text = String(value || "");
  if (!text) return "";
  if (/^[a-z_:-]+$/i.test(text)) return publishBlockerText(text);
  return text;
};

const numberText = (value: unknown, fallback = "-") => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return safeText(value, fallback);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
};

const gateValue = (gate: Gate, key: string) => gate?.values?.[key];

const blockerDetailText = (blocker: string, gate?: Gate) => {
  const values = gate?.values || {};
  const thresholds = gate?.thresholds || {};
  if (blocker === "reviewer_invalid" || blocker === "weak_review_fallback") {
    return gate?.reviewer_message || "审查员没有给出有效证据，不能判断真实质量。";
  }
  if (blocker === "review_grade_below_publish") {
    return `质检等级 ${safeText(values.grade, "-")}，需达到 A/B`;
  }
  if (blocker === "coolpoint_density_below_publish") {
    return `爽点 ${numberText(values.coolpoint_delivered, "0")}/${numberText(thresholds.coolpoint_delivered_min, "2")}`;
  }
  if (blocker === "reader_behavior_score_below_publish") {
    return `读者行为 ${numberText(values.reader_behavior_score)}/${numberText(thresholds.reader_behavior_score_min, "80")}`;
  }
  if (blocker === "story_room_contract_not_delivered") {
    const missing = Array.isArray(values.story_room_contract_missing) ? values.story_room_contract_missing.join("、") : "-";
    return `章卡承诺未落正文：${missing}`;
  }
  if (blocker === "first_300_retention_proxy_below_publish") {
    return `前300字 ${numberText(values.first_300_retention_proxy)}/${numberText(thresholds.first_300_retention_proxy_min, "82")}`;
  }
  if (blocker === "chapter_completion_proxy_below_publish") {
    return `读完 ${numberText(values.chapter_completion_proxy)}/${numberText(thresholds.chapter_completion_proxy_min, "80")}`;
  }
  if (blocker === "next_chapter_click_proxy_below_publish") {
    return `下章点击 ${numberText(values.next_chapter_click_proxy)}/${numberText(thresholds.next_chapter_click_proxy_min, "80")}`;
  }
  if (blocker === "follow_intent_proxy_below_publish") {
    return `追更 ${numberText(values.follow_intent_proxy)}/${numberText(thresholds.follow_intent_proxy_min, "78")}`;
  }
  if (blocker === "retention_prediction_below_publish") {
    return `追读 ${numberText(values.retention_prediction)}/${numberText(thresholds.retention_prediction_min, "80")}`;
  }
  if (blocker === "ai_taste_below_publish") {
    return `AI味 ${numberText(values.ai_taste_score)}/${numberText(thresholds.ai_taste_score_min, "78")}`;
  }
  if (blocker === "tail_hook_below_publish") {
    return `章尾 ${numberText(values.tail_hook_score)}/${numberText(thresholds.tail_hook_score_min, "4")}`;
  }
  if (blocker === "micro_hook_density_below_publish") {
    return `微钩子 ${numberText(values.micro_hook_density)}/${numberText(thresholds.micro_hook_density_min, "0.9")}`;
  }
  if (blocker === "drop_risk_segments_remaining") {
    return `弃读段 ${numberText(values.drop_risk_segments, "0")}/${numberText(thresholds.max_drop_risk_segments, "0")}`;
  }
  return publishBlockerText(blocker);
};

const failureReasons = (
  review: ChapterReview | null,
  editorReport: EditorReport | null,
  gate?: Gate,
) => {
  if (gate?.publish_ready || editorReport?.publish_ready || review?.publish_ready) return [];
  const reportReasons = editorReport?.failure_summary?.reasons || [];
  const issues = review?.issues || [];
  const blockers = gate?.blockers || [];
  const blockerDetails = blockers.map((blocker) => blockerDetailText(blocker, gate));
  return [...reportReasons, ...blockerDetails, ...issues]
    .map(issueText)
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 8);
};

const progressStepLabel = (value = "") => ({
  queued: "排队中",
  started: "启动中",
  card: "生成章卡",
  card_done: "章卡完成",
  chapter_card: "读取章卡",
  batch: "准备章节",
  write: "写正文",
  write_done: "正文完成",
  review: "自动审查",
  review_done: "审查完成",
  rewrite: "自动返工",
  rewrite_done: "返工完成",
  global_review: "全局复审",
  global_repair: "跨章返工",
  global_rereview: "全局复查",
  state: "同步记忆",
  state_done: "记忆完成",
  export: "写入章节",
  export_done: "入库完成",
  batch_completed: "章节完成",
  completed: "已完成",
  stopped: "已停止",
  failed: "失败",
}[value] || value || "进行中");

const reviewRangeText = (review?: GlobalReviewSummary | null) => {
  const from = review?.from || review?.range?.from;
  const to = review?.to || review?.range?.to;
  return from && to ? `第${from}-${to}章` : "全局";
};

const globalRepairLabel = (review?: GlobalReviewSummary | null) => {
  const status = safeText(review?.repair_status, "");
  if (status === "running") return "自动返工中";
  if (status === "rereviewing") return "返工后复查中";
  if (status === "repaired") return "返工复审通过";
  if (status === "needs_attention") return "返工后仍需处理";
  if ((review?.repair_queue || []).length) return "待自动返工";
  return "";
};

const numericValue = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const gateMetricOk = (
  gate: Gate,
  valueKey: string,
  thresholdKey: string,
  fallbackMin: number,
) => {
  if (!gate) return null;
  const value = numericValue(gate.values?.[valueKey]);
  const min = numericValue(gate.thresholds?.[thresholdKey]) ?? fallbackMin;
  if (value === null) return null;
  return value >= min;
};

const lightState = (ok: boolean | null): OctoGateLight["state"] => (
  ok === true ? "pass" : ok === false ? "fail" : "pending"
);

const globalReviewOk = (review?: GlobalReviewSummary | null) => {
  if (!review) return null;
  const activeIssues = (
    review.final_cross_chapter_issues?.length
      ? review.final_cross_chapter_issues
      : review.cross_chapter_issues || []
  ).filter(Boolean);
  const issueCount = Number(review.remaining_issue_count ?? review.issue_count ?? activeIssues.length ?? 0);
  const repair = globalRepairLabel(review);
  if (repair === "自动返工中" || repair === "返工后复查中") return null;
  return issueCount <= 0;
};

const currentRepairText = (progress: TaskProgressDetail | null) => {
  const data = progress?.progress || {};
  const label = safeText(data.repair_label, "");
  const blockers = Array.isArray(data.blockers) ? data.blockers : [];
  const issues = Array.isArray(data.repair_issues) ? data.repair_issues : [];
  const first = safeText(issues[0] || blockers[0], "");
  if (label) return `正在修：${label}`;
  if (first) return `正在修：${publishBlockerText(first)}`;
  return "";
};

const GlobalReviewPanel = ({ review }: { review?: GlobalReviewSummary | null }) => {
  if (!review) return null;
  const activeIssues = (
    review.final_cross_chapter_issues?.length
      ? review.final_cross_chapter_issues
      : review.cross_chapter_issues || []
  ).filter(Boolean);
  const issues = activeIssues.slice(0, 3);
  const issueCount = Number(review.remaining_issue_count ?? review.issue_count ?? activeIssues.length ?? 0);
  const repairedCount = (review.repair_runs || []).filter((item) => safeText(item.status, "") === "repaired").length;
  const repairLabel = globalRepairLabel(review);
  return (
    <div className={issueCount ? "octo-global-review-card warn" : "octo-global-review-card pass"}>
      <div>
        <strong>{reviewRangeText(review)}复审</strong>
        <span>{repairLabel || (issueCount ? `${issueCount} 个跨章问题` : "跨章逻辑通过")}</span>
      </div>
      {review.summary ? <p>{review.summary}</p> : null}
      {repairLabel ? <p>已自动返工 {repairedCount}/{(review.repair_queue || review.repair_runs || []).length || issueCount} 项。</p> : null}
      {issues.map((issue, index) => (
        <em key={`${issue.chapter_no || index}-${issue.type || "issue"}`}>
          第{issue.chapter_no || "?"}章：{safeText(issue.issue, "跨章一致性待修")}
        </em>
      ))}
    </div>
  );
};

export const qualityPanelState = (
  content: ChapterContent | null,
  review: ChapterReview | null,
  editorReport: EditorReport | null,
  progress: TaskProgressDetail | null,
) => {
  const grade = gradeValue(editorReport?.final_grade || review?.grade || content?.grade);
  const gate = gateFrom(content, review, editorReport);
  const running = Boolean(progress && progress.status !== "completed");
  const reviewerInvalid = gate?.failure_type === "reviewer_invalid"
    || gate?.status === "reviewer_invalid"
    || review?.reviewer_status === "too_thin_for_publish_gate";
  if (running) return { status: "running" as const, label: "处理中", text: progressStepLabel(String(progress?.progress?.step || progress?.status || "")) };
  if (reviewerInvalid) return { status: "fail" as const, label: "审查员无效", text: "审查员没有给出足够证据，系统已暂停正文返工。" };
  if (gate?.publish_ready) {
    return premiumGradeReady(grade)
      ? { status: "pass" as const, label: "精品候选", text: "本章已过发布门禁，并达到精品候选线。" }
      : { status: "pass" as const, label: "可发布", text: "本章已通过发布门禁。" };
  }
  if (editorReport?.status === "stopped" || ["D", "E"].includes(grade)) {
    return { status: "fail" as const, label: "阻断", text: "自动优化后仍未达发布线，需要继续定点修补或调整规划。" };
  }
  if (gate && gate.status !== "pending") return { status: "fail" as const, label: "需自动优化", text: "本章未达直接发布线，系统会按门禁问题返工。" };
  if (review?.status === "ready" || editorReport?.status === "completed" || ["A", "B"].includes(grade)) {
    return { status: "pending" as const, label: "待门禁", text: "质检完成，等待发布门禁结果。" };
  }
  return { status: "pending" as const, label: "待审", text: "生成正文后系统会自动审查，并优化到发布线。" };
};

export const QualityCenterView = ({
  content,
  review,
  editorReport,
  progress,
}: {
  content: ChapterContent | null;
  review: ChapterReview | null;
  editorReport: EditorReport | null;
  progress: TaskProgressDetail | null;
}) => {
  const state = qualityPanelState(content, review, editorReport, progress);
  const grade = safeText(editorReport?.final_grade || review?.grade || content?.grade, "待审");
  const issues = review?.issues || [];
  const risks = review?.risky_segments || [];
  const gate = gateFrom(content, review, editorReport);
  const blockers = gate?.publish_ready ? [] : gate?.blockers || [];
  const aiTaste = metricScore(editorReport, "ai_taste_score");
  const reasons = failureReasons(review, editorReport, gate);
  const stopLabel = stopReasonText(editorReport?.stop?.reason);
  const premiumReady = gate?.publish_ready && premiumGradeReady(grade);
  return (
    <div className="octo-center-quality">
      <div className={`octo-quality-light ${state.status}`}>
        <i />
        <div>
          <strong>{state.label}</strong>
          <span>{cleanPublishLabel(gate)} / {cleanGradeText(grade)} / 自动改稿 {Number(editorReport?.rewrite_count || 0)} 次 / {content?.word_count || wordCount(content?.text || "")} 字</span>
        </div>
      </div>
      <p>{state.text}</p>
      {state.status === "fail" || reasons.length ? (
        <section className="octo-failure-summary">
          <strong>{editorReport?.failure_summary?.title || stopLabel || "未通过原因"}</strong>
          {stopLabel ? <span>{stopLabel} / 已自动改稿 {Number(editorReport?.rewrite_count || 0)} 次。</span> : null}
          {(editorReport?.failure_summary?.metrics || []).slice(0, 4).map((item) => <em key={item}>{item}</em>)}
          {reasons.slice(0, 6).map((item) => <p key={item}>{item}</p>)}
          <small>{editorReport?.failure_summary?.next_action || "点击继续自动修到发布，系统会按这些问题定点修补。"}</small>
        </section>
      ) : null}
      {gate ? (
        <section className={gate.publish_ready ? "octo-publish-gate-mini ready" : "octo-publish-gate-mini blocked"}>
          <strong>发布门禁</strong>
          <span>
            {cleanPublishLabel(gate)}
            {" / "}行为 {safeText(gate.values?.reader_behavior_score, "-")}
            {" / "}前300 {safeText(gate.values?.first_300_retention_proxy, "-")}
            {" / "}读完 {safeText(gate.values?.chapter_completion_proxy, "-")}
            {" / "}下章 {safeText(gate.values?.next_chapter_click_proxy, "-")}
            {" / "}追更 {safeText(gate.values?.follow_intent_proxy, "-")}
            {" / "}AI味 {safeText(gate.values?.ai_taste_score ?? aiTaste, "-")}
          </span>
          {blockers.slice(0, 5).map((item) => <em key={item}>{blockerDetailText(item, gate)}</em>)}
          {gate.publish_ready && !premiumReady ? <em>已达发布线，未达精品候选线</em> : null}
        </section>
      ) : null}
      {review?.scores?.length || aiTaste !== null ? (
        <QualityScoreChart scores={review?.scores || []} aiTaste={aiTaste} />
      ) : <p>生成章节后系统会自动审查，未通过会自动改稿。</p>}
      {!gate?.publish_ready && issues.length ? (
        <section>
          <strong>问题</strong>
          {issues.slice(0, 8).map((item) => <span className="octo-risk-chip" key={item}>{issueText(item)}</span>)}
        </section>
      ) : null}
      {risks.length ? (
        <section>
          <strong>风险段</strong>
          {risks.map((item, index) => <p key={`${item.preview}-${index}`}>{safeText(item.preview, "风险段")}</p>)}
        </section>
      ) : null}
    </div>
  );
};

export const QualityPublishPanel = ({
  content,
  review,
  editorReport,
  progress,
  globalReview,
}: {
  content: ChapterContent | null;
  review: ChapterReview | null;
  editorReport: EditorReport | null;
  progress: TaskProgressDetail | null;
  globalReview?: GlobalReviewSummary | null;
}) => {
  const state = qualityPanelState(content, review, editorReport, progress);
  const gate = gateFrom(content, review, editorReport);
  const blockers = gate?.blockers || [];
  const aiTaste = metricScore(editorReport, "ai_taste_score");
  const publishOk = gate ? Boolean(gate.publish_ready) : state.status === "pass" ? true : state.status === "fail" ? false : null;
  const aiTasteOk = gateMetricOk(gate, "ai_taste_score", "ai_taste_score_min", 78)
    ?? (aiTaste === null ? null : aiTaste >= 78);
  const coolpointOk = gateMetricOk(gate, "coolpoint_delivered", "coolpoint_delivered_min", 2);
  const retentionOk = gateMetricOk(gate, "retention_prediction", "retention_prediction_min", 80);
  const readerOk = gateMetricOk(gate, "reader_behavior_score", "reader_behavior_score_min", 80);
  const first300Ok = gateMetricOk(gate, "first_300_retention_proxy", "first_300_retention_proxy_min", 82);
  const completionOk = gateMetricOk(gate, "chapter_completion_proxy", "chapter_completion_proxy_min", 80);
  const nextClickOk = gateMetricOk(gate, "next_chapter_click_proxy", "next_chapter_click_proxy_min", 80);
  const followOk = gateMetricOk(gate, "follow_intent_proxy", "follow_intent_proxy_min", 78);
  const crossOk = globalReviewOk(globalReview);
  const running = state.status === "running";
  const miniStatus = running
    ? state.text
    : gate?.publish_ready
      ? "可发布"
      : blockers.length
        ? publishBlockerText(blockers[0])
        : cleanPublishLabel(gate);
  const railTitle = running ? state.text : blockers.map(publishBlockerText).join(" / ") || cleanPublishLabel(gate);
  const lights: OctoGateLight[] = [
    { id: "publish", label: "发布", state: lightState(running ? null : publishOk), title: cleanPublishLabel(gate) },
    { id: "reader", label: "行为", state: lightState(running ? null : readerOk), title: `读者行为 ${safeText(gateValue(gate, "reader_behavior_score"), "-")}` },
    { id: "first300", label: "前300", state: lightState(running ? null : first300Ok), title: `前300字留存 ${safeText(gateValue(gate, "first_300_retention_proxy"), "-")}` },
    { id: "completion", label: "读完", state: lightState(running ? null : completionOk), title: `章节读完 ${safeText(gateValue(gate, "chapter_completion_proxy"), "-")}` },
    { id: "next", label: "下章", state: lightState(running ? null : nextClickOk), title: `下一章点击 ${safeText(gateValue(gate, "next_chapter_click_proxy"), "-")}` },
    { id: "follow", label: "追更", state: lightState(running ? null : followOk), title: `追更意愿 ${safeText(gateValue(gate, "follow_intent_proxy"), "-")}` },
    { id: "retention", label: "追读", state: lightState(running ? null : retentionOk), title: `追读 ${safeText(gateValue(gate, "retention_prediction"), "-")}` },
    { id: "ai-taste", label: "AI味", state: lightState(running ? null : aiTasteOk), title: `AI味 ${safeText(gateValue(gate, "ai_taste_score") ?? aiTaste, "-")}` },
    { id: "coolpoint", label: "爽点", state: lightState(running ? null : coolpointOk), title: `爽点 ${safeText(gateValue(gate, "coolpoint_delivered"), "-")}` },
    { id: "cross", label: "跨章", state: lightState(running ? null : crossOk), title: globalReview ? reviewRangeText(globalReview) : "等待全局复审" },
  ];
  return (
    <aside className="octo-workbench-right compact-status-rail">
      <span className={["octo-gate-mini-status", state.status].join(" ")} title={railTitle}>
        {miniStatus}
      </span>
      <OctoGateLights lights={lights} title={railTitle} className="compact-status-lights" />
      <GlobalReviewPanel review={globalReview} />
    </aside>
  );
};
