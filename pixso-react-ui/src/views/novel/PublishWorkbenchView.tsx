import { JsonRecord, safeText } from "@/views/PixsoAppShell";
import { OctoButton } from "@/components/octo-ui";
import { useEffect, useState } from "react";
import type { BookPlatform } from "@/views/novel/types";
import { fetchJson, platformOptions, postJson } from "@/views/novel/utils";

const jsonText = (value: unknown, empty = "") => {
  if (value === undefined || value === null) return empty;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const showActionError = (label: string, error: unknown) => {
  window.dispatchEvent(new CustomEvent("octosage:action-error", {
    detail: {
      label,
      message: error instanceof Error ? error.message : String(error || "操作失败，请稍后重试。"),
    },
  }));
};

export const PublishWorkbenchView = ({
  project,
  latest,
}: {
  project: string;
  latest: number;
}) => {
  const [platform, setPlatform] = useState<BookPlatform>("fanqie");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(Math.max(1, latest));
  const [workspace, setWorkspace] = useState<{ chapters?: string; metadata?: JsonRecord } | null>(null);
  const [result, setResult] = useState<JsonRecord | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setTo(Math.max(1, latest));
  }, [latest]);

  const loadWorkspace = async () => {
    if (!project) return;
    const payload = await fetchJson<{ chapters?: string; metadata?: JsonRecord }>(
      `/api/publish/workspace?project=${encodeURIComponent(project)}&from=${from}&to=${to}&platform=${platform}`
    );
    setWorkspace(payload);
  };

  useEffect(() => {
    void loadWorkspace();
  }, [project, from, to, platform]);

  const runPublishAction = async (label: string, endpoint: string, extra: JsonRecord = {}) => {
    if (!project) return;
    setBusy(label);
    setMessage(`${label}中...`);
    try {
      const payload = await postJson<JsonRecord>(endpoint, { project, from, to, platform, ...extra });
      setResult(payload);
      await loadWorkspace();
      setMessage(label === "浏览器自动填表"
        ? safeText(payload.next_step, "已准备浏览器填表数据，最终发布仍由你确认。")
        : `${label}完成。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMessage(message);
      showActionError(`${label}失败`, error);
    } finally {
      setBusy("");
    }
  };

  const blockers = (result?.must_fix_before_publish as JsonRecord[] | undefined) || [];
  const canAutoFill = Boolean(result?.status === "ready" && (result?.gate as JsonRecord | undefined)?.publish_package_allowed === true && !blockers.length);

  return (
    <div className="octo-center-artifact octo-publish-workbench">
      <div className="octo-publish-controls">
        <label className="octo-field">
          <span>平台</span>
          <select value={platform} onChange={(event) => setPlatform(event.target.value as BookPlatform)}>
            {platformOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="octo-field">
          <span>从第几章</span>
          <input type="number" min={1} value={from} onChange={(event) => setFrom(Number(event.target.value || 1))} />
        </label>
        <label className="octo-field">
          <span>到第几章</span>
          <input type="number" min={from} value={to} onChange={(event) => setTo(Number(event.target.value || from))} />
        </label>
        <OctoButton type="button" variant="secondary" disabled={Boolean(busy) || !project} onClick={() => runPublishAction("发布门禁检查", "/api/publish/plan")}>
          {busy === "发布门禁检查" ? "检查中..." : "发布门禁检查"}
        </OctoButton>
        <OctoButton type="button" variant="primary" glow className="octo-primary-action" disabled={Boolean(busy) || !project || !canAutoFill} onClick={() => runPublishAction("浏览器自动填表", "/api/publish/browser", { confirmed: true, launch_browser: true })}>
          {busy === "浏览器自动填表" ? "打开中..." : canAutoFill ? "打开浏览器自动填表" : "先过发布门禁"}
        </OctoButton>
      </div>
      {message ? <p className="octo-tool-message">{message}</p> : null}
      {result ? (
        <div className={`octo-publish-gate ${canAutoFill ? "ready" : "blocked"}`}>
          <strong>{canAutoFill ? "可发布 · 可自动填表" : "需自动优化 · 暂停自动填表"}</strong>
          <span>门禁分：{safeText((result.gate as JsonRecord | undefined)?.overall_score, "-")} / {safeText((result.gate as JsonRecord | undefined)?.target_score, "-")} · {blockers.length ? `${blockers.length} 项需返工` : "全部通过"}</span>
          {blockers.slice(0, 6).map((item, index) => (
            <p key={index}>第{safeText(item.chapter_no, "?")}章 {safeText(item.blocker || item.metric, "")}：{safeText(item.advice || item.reason, "需要修复")}</p>
          ))}
        </div>
      ) : null}
      <div className="octo-publish-content">
        <section>
          <strong>将录入平台的正文</strong>
          <textarea readOnly value={workspace?.chapters || "选择项目和章节范围后，这里会显示浏览器自动填表使用的正文。"} rows={18} />
        </section>
        <section>
          <strong>作品资料</strong>
          <textarea readOnly value={jsonText(workspace?.metadata, "这里会显示标题、简介、分类等将录入平台的作品资料。")} rows={18} />
        </section>
      </div>
    </div>
  );
};
