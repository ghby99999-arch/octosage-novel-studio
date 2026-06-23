import {
  getCurrentProject,
  JsonRecord,
  PixsoPageShell,
  safeText,
  setActiveProject,
  usePixsoDashboard,
} from "@/views/PixsoAppShell";
import { OctoButton, OctoPanel, OctoProgressFlow, type OctoProgressStep } from "@/components/octo-ui";
import { useEffect, useMemo, useState } from "react";

type ReferenceResult = JsonRecord & {
  reference_name?: string;
  chapter_count?: number;
  structure_fingerprint?: JsonRecord;
  path?: string;
  match_score?: number;
  created_at?: string;
};

type ReferenceResultsPayload = {
  status?: string;
  active_rhythm_transfer_plan?: string | null;
  references?: ReferenceResult[];
  structures?: ReferenceResult[];
  audits?: JsonRecord[];
  rhythm_plans?: JsonRecord[];
  plugin?: {
    installed_path?: string;
    function_name?: string;
    usage?: string;
  };
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error || response.statusText));
  return payload as T;
};

const postJson = async <T,>(url: string, body: JsonRecord): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error || response.statusText));
  return payload as T;
};

const numberText = (value: unknown, fallback = "-") => {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number * 100) / 100) : fallback;
};

const showActionError = (label: string, error: unknown) => {
  window.dispatchEvent(new CustomEvent("octosage:action-error", {
    detail: {
      label,
      message: error instanceof Error ? error.message : String(error || "操作失败，请稍后重试。"),
    },
  }));
};

const fingerprintRows = (fingerprint?: JsonRecord) => {
  const fp = fingerprint || {};
  return [
    ["平均对话占比", numberText(fp.avg_dialogue_ratio)],
    ["平均段落字数", numberText(fp.avg_paragraph_chars)],
    ["微钩子密度", numberText(fp.avg_micro_hook_density)],
    ["弃读段均值", numberText(fp.avg_drop_risk_segments)],
  ];
};

export const ReferenceCenterPage = () => {
  const dashboard = usePixsoDashboard();
  const project = safeText(new URLSearchParams(window.location.search).get("project") || getCurrentProject() || dashboard.project_path, "");
  const title = safeText(dashboard.project_title, "当前作品");
  const [payload, setPayload] = useState<ReferenceResultsPayload>({});
  const [referenceName, setReferenceName] = useState("benchmark-book");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [message, setMessage] = useState("");
  const [processSteps, setProcessSteps] = useState<Array<{ label: string; status: "done" | "running" | "wait" | "error"; detail?: string }>>([]);
  const [busy, setBusy] = useState(false);
  const latestReference = useMemo(
    () => (payload.structures?.[0] || payload.references?.[0] || null) as ReferenceResult | null,
    [payload],
  );
  const visibleProcessSteps = processSteps.length ? processSteps : [
    { label: "创建拆书计划", status: "wait" as const },
    { label: "读取授权内容", status: "wait" as const },
    { label: "提取结构指纹", status: "wait" as const },
    { label: "生成拆书结果", status: "wait" as const },
    { label: "可一键仿写", status: "wait" as const },
  ];
  const flowSteps: OctoProgressStep[] = visibleProcessSteps.map((step) => ({
    id: step.label,
    label: step.label,
    detail: step.detail,
    state: step.status === "wait" ? "pending" : step.status === "error" ? "fail" : step.status,
  }));

  const load = async () => {
    if (!project) return;
    const data = await fetchJson<ReferenceResultsPayload>(`/api/reference/results?project=${encodeURIComponent(project)}`);
    setPayload(data);
  };

  const setWorkingSteps = (active: string, done: string[] = [], detail = "") => {
    const all = ["创建拆书计划", "读取授权内容", "提取结构指纹", "生成拆书结果", "可一键仿写"];
    setProcessSteps(all.map((label) => ({
      label,
      status: done.includes(label) ? "done" : label === active ? "running" : "wait",
      detail: label === active ? detail : "",
    })));
  };

  useEffect(() => {
    void load();
  }, [project]);

  const runManualRead = async () => {
    if (!project) return;
    if (!sourceText.trim()) {
      setMessage("先粘贴一章授权可见的对标正文。");
      return;
    }
    setBusy(true);
    setMessage("正在拆解结构指纹...");
    setWorkingSteps("提取结构指纹", ["创建拆书计划", "读取授权内容"], "正在分析段落、对话占比、微钩子和弃读风险。");
    try {
      const result = await postJson<ReferenceResult>("/api/reference-read/run", {
        project,
        name: referenceName || "benchmark-book",
        confirm: true,
        chapter_limit: 1,
        chapters: [{
          chapter_no: 1,
          title: sourceTitle || document.title || "对标章节",
          url: sourceUrl,
          text: sourceText,
          saved_source_text: false,
        }],
      });
      setMessage(`拆书完成：${safeText(result.reference_name, referenceName)}`);
      setWorkingSteps("可一键仿写", ["创建拆书计划", "读取授权内容", "提取结构指纹", "生成拆书结果"], "拆书结果已进入展示台。");
      setSourceText("");
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMessage(message);
      showActionError("手动拆书失败", error);
    } finally {
      setBusy(false);
    }
  };

  const runUrlPlan = async () => {
    if (!project) return;
    if (!sourceUrl.trim()) {
      setMessage("先输入对标书章节网址。");
      return;
    }
    setBusy(true);
    setMessage("正在创建浏览器插件拆书计划...");
    setWorkingSteps("创建拆书计划", [], "应用会创建计划；浏览器插件负责读取你账号可见的页面正文。");
    try {
      await postJson("/api/reference-read/plan", {
        project,
        name: referenceName || "url-reference",
        start_url: sourceUrl.trim(),
        chapter_limit: 30,
        platform: "browser",
      });
      setWorkingSteps("读取授权内容", ["创建拆书计划"], "请在浏览器打开该网址，用 OctoSage 插件同步当前可见章节。");
      setMessage("拆书计划已创建。为了不绕过平台登录/付费/验证码，请在浏览器打开该网址后用插件同步授权可见正文；结果会自动出现在右侧展示台。");
      await load();
    } catch (error) {
      setWorkingSteps("创建拆书计划", [], error instanceof Error ? error.message : String(error));
      const message = error instanceof Error ? error.message : String(error);
      setMessage(message);
      showActionError("一键拆书失败", error);
    } finally {
      setBusy(false);
    }
  };

  const importEbook = async () => {
    if (!project) return;
    const desktop = window.octosageDesktop || window.novelStudioDesktop;
    setBusy(true);
    setMessage("正在打开电子书文件选择器...");
    setWorkingSteps("读取授权内容", ["创建拆书计划"], "请选择 TXT 或 Markdown 文档。");
    try {
      const filePath = desktop?.chooseFile
        ? await desktop.chooseFile({
            title: "选择用于拆书的 TXT / Markdown",
            filters: [
              { name: "Text or Markdown", extensions: ["txt", "md"] },
              { name: "All Files", extensions: ["*"] },
            ],
          })
        : window.prompt("请输入 TXT/Markdown 文件路径", "");
      if (!filePath) {
        setMessage("没有选择文件。");
        setBusy(false);
        return;
      }
      setMessage("正在导入电子书并拆解结构...");
      setWorkingSteps("提取结构指纹", ["创建拆书计划", "读取授权内容"], "只保存结构指纹，不保存原文到仿写提示。");
      const result = await postJson<ReferenceResult>("/api/reference-read/import-file", {
        project,
        file_path: filePath,
        name: referenceName || "imported-book",
        chapter_limit: 30,
      });
      setMessage(`电子书拆解完成：${safeText(result.reference_name, referenceName)}`);
      setWorkingSteps("可一键仿写", ["创建拆书计划", "读取授权内容", "提取结构指纹", "生成拆书结果"], "拆书结果已进入展示台。");
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMessage(message);
      showActionError("导入电子书失败", error);
    } finally {
      setBusy(false);
    }
  };

  const activateMimic = async (reference: ReferenceResult | null) => {
    if (!project || !reference?.reference_name) return;
    setBusy(true);
    setMessage("正在启用节奏迁移，后续章卡会自动带入对标结构约束...");
    try {
      await postJson("/api/reference/rhythm/activate", {
        project,
        reference_name: reference.reference_name,
        from: Math.max(1, Number(dashboard.current_chapter || 1)),
        to: Math.max(10, Number(dashboard.current_chapter || 1) + 9),
        plan_name: `reference-${reference.reference_name}`,
        target_idea: dashboard.project_idea || "",
      });
      setMessage(`已启用《${reference.reference_name}》的结构仿写。现在点“写下一章”，章卡会自动学习节奏，不复制原文。`);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMessage(message);
      showActionError("启用仿写失败", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PixsoPageShell
      active="/reference"
      title="拆书中心"
      meta={`${title} · 浏览器插件拆书 / 素材导入拆书 / 一键结构仿写`}
      status={<span>{payload.active_rhythm_transfer_plan ? `已启用：${payload.active_rhythm_transfer_plan}` : "未启用仿写计划"}</span>}
    >
      {!project ? (
        <OctoPanel
          className="octo-reference-empty"
          eyebrow="REFERENCE LAB"
          title="先选择一本书"
          description="拆书结果会绑定到当前项目，然后反哺这本书的章卡、正文节奏和审稿约束。"
          actions={<OctoButton type="button" variant="primary" data-octo-action="goNovels">去书架</OctoButton>}
        />
      ) : (
        <div className="octo-reference-page octo-spatial-scene">
          <section className="octo-reference-grid">
            <OctoPanel
              className="octo-reference-panel"
              eyebrow="REFERENCE INPUT"
              title="拆书入口"
              description="网址 / 电子书 / 粘贴正文"
            >
              <label>
                <span>对标书名称</span>
                <input value={referenceName} onChange={(event) => setReferenceName(event.target.value)} />
              </label>
              <label>
                <span>对标书网址</span>
                <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." />
              </label>
              <div className="octo-reference-run-actions">
                <OctoButton type="button" variant="primary" glow onClick={runUrlPlan} disabled={busy}>一键拆书</OctoButton>
                <OctoButton type="button" variant="secondary" onClick={importEbook} disabled={busy}>导入电子书</OctoButton>
              </div>
              <OctoProgressFlow steps={flowSteps} />
              <label>
                <span>章节标题</span>
                <input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="可选" />
              </label>
              <label>
                <span>授权可见正文</span>
                <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="粘贴对标章节正文。系统只提取结构、节奏、钩子和段落特征，不把原文写入仿写提示。" />
              </label>
              <OctoButton type="button" variant="primary" glow onClick={runManualRead} disabled={busy}>
                {busy ? "处理中..." : "开始拆书"}
              </OctoButton>
            </OctoPanel>

            <OctoPanel
              className="octo-reference-panel"
              eyebrow="REFERENCE RESULT"
              title="拆书结果"
              description={`${payload.references?.length || 0} 本对标书`}
            >
              <div className="octo-reference-list">
                {(payload.references || []).map((reference) => (
                  <article className="octo-reference-card" key={reference.reference_name}>
                    <div>
                      <strong>{safeText(reference.reference_name, "对标书")}</strong>
                      <span>{Number(reference.chapter_count || 0)} 章 · 结构指纹</span>
                    </div>
                    <div className="octo-reference-metrics">
                      {fingerprintRows(reference.structure_fingerprint).map(([label, value]) => (
                        <p key={label}><b>{label}</b><em>{value}</em></p>
                      ))}
                    </div>
                    <OctoButton type="button" size="sm" onClick={() => activateMimic(reference)} disabled={busy}>用它仿写</OctoButton>
                  </article>
                ))}
                {!(payload.references || []).length ? (
                  <p className="octo-reference-muted">还没有拆书结果。先用浏览器插件同步，或在左侧粘贴一章素材。</p>
                ) : null}
              </div>
              <div className="octo-reference-result-actions">
                <OctoButton type="button" variant="ghost" onClick={load}>刷新结果</OctoButton>
                <OctoButton type="button" variant="primary" onClick={() => activateMimic(latestReference)} disabled={!latestReference || busy}>
                  一键仿写最新结果
                </OctoButton>
                <OctoButton type="button" variant="secondary" onClick={() => setActiveProject(project, "/novel/workbench")}>回工作台</OctoButton>
              </div>
            </OctoPanel>

            <OctoPanel
              className="octo-reference-panel wide"
              eyebrow="RHYTHM PLAN"
              title="仿写计划"
              description={payload.active_rhythm_transfer_plan ? "已启用" : "未启用"}
            >
              <div className="octo-reference-plan-list">
                {(payload.rhythm_plans || []).map((plan) => (
                  <article key={String(plan.name || plan.path)}>
                    <strong>{safeText(plan.name, "节奏迁移")}</strong>
                    <span>对标：{safeText(plan.reference_name, "-")} · 范围：{safeText((plan.range as JsonRecord)?.from, "?")}-{safeText((plan.range as JsonRecord)?.to, "?")}</span>
                    <em>{payload.active_rhythm_transfer_plan === plan.name ? "当前启用" : "可启用"}</em>
                  </article>
                ))}
                {!(payload.rhythm_plans || []).length ? <p className="octo-reference-muted">点击“用它仿写”后，会生成节奏迁移计划。后续写作会自动学习结构，不复制原文。</p> : null}
              </div>
            </OctoPanel>
          </section>
          {message ? <div className="octo-reference-message">{message}</div> : null}
        </div>
      )}
    </PixsoPageShell>
  );
};
