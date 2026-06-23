import { useEffect, useRef } from "react";
import type { ChapterReview } from "@/views/novel/types";
import { riskTokens } from "@/views/novel/utils";

type InlineHint = {
  key: string;
  label: string;
  reason: string;
  fix: string;
  scope: "opening" | "tail" | "global";
  level?: "risk" | "warn";
};

type MarkedToken = {
  text: string;
  level?: "risk" | "warn";
  kind?: "text" | "hint";
  label?: string;
  reason?: string;
  fix?: string;
  detail?: string;
};

const blockerHint = (blocker = ""): InlineHint | null => {
  const map: Record<string, InlineHint> = {
    ai_process_leak: {
      key: "ai_process_leak",
      label: "过程说明泄露",
      reason: "正文混入任务说明、模型自述或审稿口吻",
      fix: "改成纯小说动作、对白、物件和现场反应",
      scope: "global",
    },
    tail_hook_below_publish: {
      key: "tail_hook_below_publish",
      label: "章尾钩子不足",
      reason: "结尾缺少下一章牵引",
      fix: "补压力、承诺、反转或未兑现结果",
      scope: "tail",
      level: "risk",
    },
    retention_prediction_below_publish: {
      key: "retention_prediction_below_publish",
      label: "追读预测不足",
      reason: "继续阅读动力不够",
      fix: "补前300字压力和章尾牵引",
      scope: "opening",
      level: "risk",
    },
    story_room_contract_not_delivered: {
      key: "story_room_contract_not_delivered",
      label: "章卡承诺未落正文",
      reason: "公开反馈、代价、关系变化或章尾债务没有写成现场结果",
      fix: "补现场反应、可见代价、关系变化和具体章尾压力",
      scope: "global",
      level: "risk",
    },
    reader_behavior_score_below_publish: {
      key: "reader_behavior_score_below_publish",
      label: "读者行为不足",
      reason: "读完、点击或追更动力弱",
      fix: "补行动反馈、阶段兑现和下一步问题",
      scope: "opening",
      level: "risk",
    },
    first_300_retention_proxy_below_publish: {
      key: "first_300_retention_proxy_below_publish",
      label: "前300字留存不足",
      reason: "开篇没有快速抓住读者",
      fix: "补行动、冲突、压力或可见结果，不粘贴章卡摘要",
      scope: "opening",
      level: "risk",
    },
    chapter_completion_proxy_below_publish: {
      key: "chapter_completion_proxy_below_publish",
      label: "读完意愿不足",
      reason: "中段推进不够连续",
      fix: "补反馈、误判反转或阶段兑现",
      scope: "global",
      level: "warn",
    },
    next_chapter_click_proxy_below_publish: {
      key: "next_chapter_click_proxy_below_publish",
      label: "下章点击不足",
      reason: "章尾没有点击理由",
      fix: "留下悬念、承诺、反转或新压力",
      scope: "tail",
      level: "risk",
    },
    follow_intent_proxy_below_publish: {
      key: "follow_intent_proxy_below_publish",
      label: "追更意愿不足",
      reason: "主角魅力或长期目标不强",
      fix: "强化目标、代价和连载承诺",
      scope: "global",
      level: "warn",
    },
    coolpoint_density_below_publish: {
      key: "coolpoint_density_below_publish",
      label: "爽点兑现不足",
      reason: "可见收益或反转不够",
      fix: "补现场收益、对手代价或公开反馈",
      scope: "global",
    },
    micro_hook_density_below_publish: {
      key: "micro_hook_density_below_publish",
      label: "微钩子不足",
      reason: "段落间缺少小悬念",
      fix: "补问题、压力和下一步动作",
      scope: "global",
    },
    ai_taste_below_publish: {
      key: "ai_taste_below_publish",
      label: "AI味偏重",
      reason: "解释总结或模板表达偏多",
      fix: "改成动作、对白、物件和现场反馈",
      scope: "global",
    },
    review_grade_below_publish: {
      key: "review_grade_below_publish",
      label: "质检未过线",
      reason: "还没达到可发布水准",
      fix: "按红黄标继续自动返工",
      scope: "global",
    },
    drop_risk_segments_remaining: {
      key: "drop_risk_segments_remaining",
      label: "弃读风险未清",
      reason: "仍有让读者出戏的句段",
      fix: "改成具体行动和即时反馈",
      scope: "global",
      level: "risk",
    },
    setting_fact_conflict: {
      key: "setting_fact_conflict",
      label: "设定事实冲突",
      reason: "能力来源或履历不成立",
      fix: "用账册、契约、税单或现场反应补逻辑",
      scope: "opening",
      level: "risk",
    },
    fact_consistency_violation: {
      key: "fact_consistency_violation",
      label: "事实冲突",
      reason: "正文与设定或前文不一致",
      fix: "先修逻辑，再润色表达",
      scope: "global",
      level: "risk",
    },
  };
  return map[blocker] || null;
};

const publishGateHints = (review: ChapterReview | null): InlineHint[] => {
  const seen = new Set<string>();
  return (review?.publish_gate?.blockers || [])
    .map(blockerHint)
    .filter(Boolean)
    .filter((hint) => {
      if (!hint || seen.has(hint.key)) return false;
      seen.add(hint.key);
      return true;
    }) as InlineHint[];
};

const firstParagraphEnd = (value = "") => {
  const start = value.search(/\S/);
  if (start < 0) return 0;
  const nextBreak = value.indexOf("\n", start);
  const softLimit = Math.min(value.length, start + 320);
  if (nextBreak > start && nextBreak < softLimit) return nextBreak;
  return softLimit;
};

const tailStart = (value = "") => Math.max(0, value.length - Math.min(420, value.length));

const globalAnchor = (value = "") => {
  const midpoint = Math.floor(value.length / 2);
  const before = value.lastIndexOf("\n", midpoint);
  return before > 0 ? before + 1 : midpoint;
};

const hintDetail = (hint: Pick<InlineHint, "reason" | "fix">) => `${hint.reason}；${hint.fix}`;

const insertHint = (tokens: MarkedToken[], at: number, hint: InlineHint) => {
  let cursor = 0;
  const output: MarkedToken[] = [];
  const marker: MarkedToken = {
    text: `\n【${hint.label}】${hint.reason} -> ${hint.fix}\n`,
    level: hint.level || (hint.scope === "tail" ? "risk" : "warn"),
    kind: "hint",
    label: hint.label,
    reason: hint.reason,
    fix: hint.fix,
    detail: hintDetail(hint),
  };
  let inserted = false;

  for (const token of tokens) {
    const end = cursor + token.text.length;
    if (!inserted && !token.level && at >= cursor && at <= end) {
      const split = Math.max(0, Math.min(token.text.length, at - cursor));
      if (split > 0) output.push({ ...token, text: token.text.slice(0, split) });
      output.push(marker);
      if (split < token.text.length) output.push({ ...token, text: token.text.slice(split) });
      inserted = true;
    } else {
      output.push(token);
    }
    cursor = end;
  }

  if (!inserted) output.push(marker);
  return output;
};

const markRange = (
  tokens: MarkedToken[],
  from: number,
  to: number,
  hint: InlineHint,
): MarkedToken[] => {
  if (to <= from) return tokens;
  let cursor = 0;
  const output: MarkedToken[] = [];
  for (const token of tokens) {
    const end = cursor + token.text.length;
    if (end <= from || cursor >= to || token.level) {
      output.push(token);
      cursor = end;
      continue;
    }

    const startInToken = Math.max(0, from - cursor);
    const endInToken = Math.min(token.text.length, to - cursor);
    if (startInToken > 0) output.push({ ...token, text: token.text.slice(0, startInToken) });
    output.push({
      text: token.text.slice(startInToken, endInToken),
      level: hint.level || "warn",
      kind: "text",
      label: hint.label,
      reason: hint.reason,
      fix: hint.fix,
      detail: hintDetail(hint),
    });
    if (endInToken < token.text.length) output.push({ ...token, text: token.text.slice(endInToken) });
    cursor = end;
  }
  return output;
};

const tokensWithGateHints = (value = "", review: ChapterReview | null): MarkedToken[] => {
  let tokens: MarkedToken[] = riskTokens(value, review?.risky_segments || []).map((token) => (
    token.risk
      ? {
          text: token.text,
          level: "risk",
          label: "弃读风险",
          reason: "这一段容易让读者出戏",
          fix: (token.segment?.reasons || []).join("；") || "改成更具体的行动和反馈",
          detail: (token.segment?.reasons || []).join("；") || "弃读风险段",
        }
      : { text: token.text }
  ));

  if (!tokens.length) tokens = [{ text: value }];
  for (const hint of publishGateHints(review)) {
    const openingEnd = firstParagraphEnd(value);
    const tailAt = tailStart(value);
    const globalAt = globalAnchor(value);
    const at = hint.scope === "opening" ? openingEnd : hint.scope === "tail" ? tailAt : globalAt;
    if (hint.scope === "opening") {
      tokens = markRange(tokens, 0, openingEnd, hint);
    } else if (hint.scope === "tail") {
      tokens = markRange(tokens, tailAt, value.length, hint);
    } else {
      const globalEnd = Math.min(value.length, globalAt + 420);
      tokens = markRange(tokens, globalAt, globalEnd, hint);
    }
    tokens = insertHint(tokens, at, hint);
  }
  return tokens;
};

export const ManuscriptEditor = ({
  value,
  review,
  qualityStatus = "pending",
  onChange,
}: {
  value: string;
  review: ChapterReview | null;
  qualityStatus?: "pass" | "fail" | "pending" | "running";
  onChange: (value: string) => void;
}) => {
  const shouldShowMarks = qualityStatus !== "pass";
  const tokens = shouldShowMarks ? tokensWithGateHints(value, review) : [{ text: value }];
  const hasMarks = Boolean(value && tokens.some((token) => token.level));
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleJump = (event: Event) => {
      const issue = String((event as CustomEvent<{ issue?: string }>).detail?.issue || "").trim();
      const preview = previewRef.current;
      if (!issue || !preview) return;
      const candidates = Array.from(preview.querySelectorAll<HTMLElement>("[data-inline-issue]"));
      const target = candidates.find((item) => {
        const label = item.dataset.inlineIssue || "";
        const detail = item.dataset.inlineDetail || "";
        const fix = item.dataset.inlineFix || "";
        return label.includes(issue) || issue.includes(label) || detail.includes(issue) || issue.includes(detail) || fix.includes(issue);
      }) || candidates[0];
      if (!target) return;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.classList.add("octo-inline-jump");
      window.setTimeout(() => target.classList.remove("octo-inline-jump"), 1200);
    };
    window.addEventListener("octosage:jump-inline-issue", handleJump);
    return () => window.removeEventListener("octosage:jump-inline-issue", handleJump);
  }, []);

  const syncScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    const preview = previewRef.current;
    if (!preview) return;
    const source = event.currentTarget;
    const sourceMax = Math.max(1, source.scrollHeight - source.clientHeight);
    const previewMax = Math.max(0, preview.scrollHeight - preview.clientHeight);
    preview.scrollTop = (source.scrollTop / sourceMax) * previewMax;
    preview.scrollLeft = source.scrollLeft;
  };

  if (!hasMarks) {
    return (
      <textarea
        className={`octo-manuscript quality-${qualityStatus}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <div className={`octo-manuscript-inline quality-${qualityStatus}`}>
      <div className="octo-manuscript risk-preview" ref={previewRef} aria-label="正文问题标记预览">
        {tokens.map((token, index) => token.level ? (
          <mark
            className={`octo-inline-${token.level} ${token.kind === "hint" ? "octo-inline-hint" : "octo-inline-text"}`}
            data-inline-issue={token.label || ""}
            data-inline-detail={token.reason || token.detail || ""}
            data-inline-fix={token.fix || ""}
            key={index}
            title={[token.label, token.reason || token.detail, token.fix].filter(Boolean).join("；")}
          >
            {token.text}
            {token.kind !== "hint" && (token.label || token.reason || token.fix) ? (
              <small className="octo-inline-note" aria-label="正文问题批注">
                <b>{token.label || "待优化"}</b>
                {token.reason || token.detail ? <span>{token.reason || token.detail}</span> : null}
                {token.fix ? <i className="octo-inline-fix">{token.fix}</i> : null}
              </small>
            ) : null}
          </mark>
        ) : (
          <span key={index}>{token.text}</span>
        ))}
      </div>
      <textarea
        className="octo-manuscript editing transparent"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={syncScroll}
        aria-label="正文编辑"
      />
    </div>
  );
};
