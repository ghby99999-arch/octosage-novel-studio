import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { StatusPill } from "@/components/ui/StatusPill";
import { Tabs } from "@/components/ui/Tabs";
import {
  OctoButton as Button,
  OctoPanel as Card,
  OctoProgressFlow,
  type OctoProgressStep,
} from "@/components/octo-ui";
import { getWorkspaceRoot, JsonRecord, setActiveProject } from "@/views/PixsoAppShell";
import { useEffect, useState } from "react";
import { BookCoverDesigner, type CoverResult } from "@/views/novel/BookCoverDesigner";
import {
  CandidateButtonList,
  CharacterFields,
  GenrePlatformFields,
  GoldenFingerField,
  IdeaActionRow,
  MultiBookCard,
  OpeningSummaryStrip,
  WordTargetControl,
  WorkspacePathPicker,
} from "@/views/novel/NewBookWidgets";
import type { BookPlatform, NewBookRow } from "@/views/novel/types";
import {
  effectiveWorkspaceRoot,
  genreOptions,
  openingGenreSuggestionFor,
  openingRuleProfileFor,
  platformOptions,
  postJson,
  tagsForGenre,
  titleCandidatesFallback,
} from "@/views/novel/utils";

type TitleSuggestPayload = {
  status?: string;
  source?: string;
  titles?: string[];
};

type IdeaSuggestPayload = {
  status?: string;
  source?: string;
  ideas?: string[];
};

type CreateProjectPayload = {
  status?: string;
  project_path?: string;
  project_title?: string;
  planning_task_id?: string | null;
};

const emptyRows = (): NewBookRow[] => [
  { title: "", idea: "", platform: "fanqie", genre: "都市", subgenre: "重生", targetWords: 2000000, goldenFinger: "", protagonistName: "", supportingCharacters: "" },
  { title: "", idea: "", platform: "fanqie", genre: "都市", subgenre: "商战", targetWords: 2000000, goldenFinger: "", protagonistName: "", supportingCharacters: "" },
  { title: "", idea: "", platform: "qidian", genre: "游戏", subgenre: "系统", targetWords: 1500000, goldenFinger: "", protagonistName: "", supportingCharacters: "" },
];

const platformLabel = (value: BookPlatform) => platformOptions.find((item) => item.value === value)?.label || value;

const normalizeTitles = (titles: unknown, fallback: string[]) => {
  const normalized = Array.isArray(titles) ? titles.map(String).filter(Boolean).slice(0, 3) : [];
  return normalized.length ? normalized : fallback;
};

const goldenFingerSuggestionsFor = (genre = "", subgenre = "", idea = "") => {
  const text = `${genre} ${subgenre} ${idea}`;
  if (/历史|宋朝|北宋|南宋|大宋|临安|茶引|茶商|茶铺|账册|契约|盐商|供应链|穿越|种田/.test(text)) {
    return [
      "现代商业知识 + 账册推演，必须通过契约、茶引、税单和民生反馈展示",
      "史料节点记忆 + 现场验证，只能提供方向，结果必须靠谈判、账目和执行换来",
      "物资调度直觉 + 成本敏感度，优势要落到账册、货源、官府规则和人心变化上",
    ];
  }
  if (/游戏|系统|电竞|梦幻西游|副本|玩家|网游/.test(text)) {
    return [
      "版本记忆 + 数据复盘，必须通过对局、资源配置和团队反馈兑现",
      "隐藏机制识别 + 操作复盘，只提供判断，不替主角完成执行",
      "副本规律推演 + 团队指挥，必须用战术、配合和代价展示结果",
    ];
  }
  if (/玄幻|修仙|仙侠|高武|御兽|宗门|灵气/.test(text)) {
    return [
      "熟练度面板 + 词条进化，每次提升都需要行动代价和可见限制",
      "残卷推演 + 体质适配，必须通过修炼、战斗、资源消耗和反噬展示",
      "因果提示 + 风险预警，只给方向，不跳过选择、冲突和代价",
    ];
  }
  return [
    "未来节点记忆 + 账册推演，必须通过订单、契约、成本和现场反馈展示优势",
    "十年行业复盘 + 成本敏感度，能从账本、路线、客流和合同里发现机会",
    "趋势记忆 + 现金流雷达，所有判断都要落到报价、履约、数据和对手反应",
  ];
};

export const NewBookModalUnified = ({
  open,
  initialIdea = "",
  onClose,
}: {
  open: boolean;
  initialIdea?: string;
  onClose: () => void;
}) => {
  const [mode, setMode] = useState<"single" | "multi">("single");
  const [idea, setIdea] = useState("");
  const [platform, setPlatform] = useState<BookPlatform>("fanqie");
  const [genre, setGenre] = useState("都市");
  const [subgenre, setSubgenre] = useState("重生");
  const [genreTouched, setGenreTouched] = useState(false);
  const [targetWords, setTargetWords] = useState(2000000);
  const [goldenFinger, setGoldenFinger] = useState("");
  const [authorName, setAuthorName] = useState("章鱼作者");
  const [coverUrl, setCoverUrl] = useState("");
  const [coverPath, setCoverPath] = useState("");
  const [coverPrompt, setCoverPrompt] = useState("");
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [protagonistName, setProtagonistName] = useState("");
  const [supportingCharacters, setSupportingCharacters] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [suggestSource, setSuggestSource] = useState("输入创意后生成");
  const [suggesting, setSuggesting] = useState(false);
  const [ideaCandidates, setIdeaCandidates] = useState<string[]>([]);
  const [ideaSuggestSource, setIdeaSuggestSource] = useState("");
  const [suggestingIdeas, setSuggestingIdeas] = useState(false);
  const [multiRows, setMultiRows] = useState<NewBookRow[]>(emptyRows);
  const [workspaceRoot, setWorkspaceRoot] = useState(effectiveWorkspaceRoot());
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const ruleProfile = openingRuleProfileFor(genre, subgenre, idea);
  const goldenSuggestions = goldenFingerSuggestionsFor(genre, subgenre, idea);

  useEffect(() => {
    if (!open) return;
    setWorkspaceRoot(effectiveWorkspaceRoot(getWorkspaceRoot()));
    setMessage("");
  }, [open]);

  useEffect(() => {
    if (!open || !initialIdea.trim()) return;
    setIdea(initialIdea.trim());
    setTitleTouched(false);
    setMessage("已带入首页创意，正在生成书名和开书规划。");
  }, [open, initialIdea]);

  useEffect(() => {
    if (!open || mode !== "single" || genreTouched || idea.trim().length < 6) return;
    const suggestion = openingGenreSuggestionFor(genre, subgenre, idea);
    if (suggestion.genre !== genre) {
      setGenre(suggestion.genre);
      setSubgenre(suggestion.subgenre);
      return;
    }
    if (suggestion.subgenre !== subgenre && tagsForGenre(suggestion.genre).includes(suggestion.subgenre)) {
      setSubgenre(suggestion.subgenre);
    }
  }, [open, mode, idea, genre, subgenre, genreTouched]);

  useEffect(() => {
    const tags = tagsForGenre(genre);
    if (!tags.includes(subgenre)) setSubgenre(tags[0] || "重生");
  }, [genre, subgenre]);

  const suggestTitles = async (target: { idea: string; platform: BookPlatform; genre: string; subgenre: string }) => {
    const fallback = titleCandidatesFallback(target.idea, target.platform, `${target.genre}/${target.subgenre}`);
    if (target.idea.trim().length < 6) return { titles: fallback, source: "本地规则" };
    try {
      const payload = await postJson<TitleSuggestPayload>("/api/title-suggest", {
        idea: target.idea,
        platform: target.platform,
        genre: `${target.genre}/${target.subgenre}`,
      });
      const titles = normalizeTitles(payload.titles, fallback);
      return {
        titles,
        source: payload.source || (payload.status === "ready" ? "模型建议" : "本地规则"),
      };
    } catch (error) {
      return {
        titles: fallback,
        source: `本地规则，模型暂不可用：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  };

  const suggestIdeas = async () => {
    setSuggestingIdeas(true);
    setMessage("正在生成高质量开书创意...");
    try {
      const payload = await postJson<IdeaSuggestPayload>("/api/idea-suggest", {
        platform,
        genre,
        subgenre,
        target_words: targetWords,
      });
      const ideas = Array.isArray(payload.ideas) ? payload.ideas.map(String).filter(Boolean).slice(0, 3) : [];
      setIdeaCandidates(ideas);
      setIdeaSuggestSource(payload.source || (payload.status === "ready" ? "模型建议" : "本地规则"));
      if (ideas[0] && !idea.trim()) {
        setIdea(ideas[0]);
        setTitleTouched(false);
      }
      setMessage(ideas.length ? "已生成创意候选，可以直接选一个开书。" : "没有生成有效创意，请稍后重试。");
    } catch (error) {
      setMessage(`创意生成失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSuggestingIdeas(false);
    }
  };

  useEffect(() => {
    let alive = true;
    if (!open || mode !== "single") return;
    if (idea.trim().length < 6) {
      setCandidates([]);
      setSuggestSource("输入至少 6 个字后生成");
      if (!titleTouched) setTitle("");
      return;
    }
    const fallback = titleCandidatesFallback(idea, platform, `${genre}/${subgenre}`);
    setCandidates(fallback);
    setSuggestSource("正在调用模型...");
    if (!titleTouched) setTitle("");
    if (targetWords === 2000000 && ruleProfile.targetWords !== 2000000) setTargetWords(ruleProfile.targetWords);
    setSuggesting(true);
    const timer = window.setTimeout(async () => {
      const result = await suggestTitles({ idea, platform, genre, subgenre });
      if (!alive) return;
      setCandidates(result.titles);
      setSuggestSource(result.source);
      if (!titleTouched) setTitle(result.titles[0] || "");
      setSuggesting(false);
    }, 500);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [open, mode, idea, platform, genre, subgenre, titleTouched]);

  const updateMultiRow = (index: number, patch: Partial<NewBookRow>) => {
    setMultiRows((rows) => rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, ...patch };
      if (patch.genre && !tagsForGenre(patch.genre).includes(next.subgenre)) {
        next.subgenre = tagsForGenre(patch.genre)[0] || "";
      }
      return next;
    }));
  };

  const regenerateSingleTitle = async () => {
    if (!idea.trim()) {
      setMessage("请先输入一句话创意。");
      return;
    }
    setSuggesting(true);
    setMessage("正在按创意、类型和平台生成书名...");
    try {
      const result = await suggestTitles({ idea, platform, genre, subgenre });
      setCandidates(result.titles);
      setSuggestSource(result.source);
      setTitle(result.titles[0] || title);
      setTitleTouched(false);
      setMessage(`书名已更新：${result.source}`);
    } finally {
      setSuggesting(false);
    }
  };

  const generateCover = async () => {
    if (!title.trim()) {
      setMessage("请先生成或填写书名，再制作封面。");
      return;
    }
    setCoverGenerating(true);
    setMessage("正在根据创意、书名和作者名制作封面...");
    try {
      const result = await postJson<CoverResult>("/api/book-cover/generate", {
        root: effectiveWorkspaceRoot(workspaceRoot),
        title,
        author_name: authorName,
        idea,
        genre: `${genre}/${subgenre}`,
        platform,
      });
      setCoverUrl(result.cover_url || "");
      setCoverPath(result.cover_path || "");
      setCoverPrompt(result.prompt || "");
      setMessage(result.cover_url ? "封面已生成，创建作品时会一起保存。" : "封面生成完成，但没有返回预览地址。");
    } catch (error) {
      setMessage(`封面生成失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCoverGenerating(false);
    }
  };

  const regenerateMultiTitle = async (index: number) => {
    const row = multiRows[index];
    if (!row?.idea.trim()) {
      updateMultiRow(index, { source: "请先输入创意" });
      return;
    }
    updateMultiRow(index, { suggesting: true, source: "生成中..." });
    const result = await suggestTitles(row);
    updateMultiRow(index, {
      title: result.titles[0] || row.title,
      candidates: result.titles,
      source: result.source,
      suggesting: false,
    });
  };

  const applyWorkspaceRoot = async (root: string) => {
    const selected = root.trim();
    if (!selected) return;
    const desktop = window.octosageDesktop || window.novelStudioDesktop;
    localStorage.setItem("octosage:workspace-root", selected);
    localStorage.removeItem("octosage:last-project");
    window.__OCTOSAGE_WORKSPACE_ROOT__ = selected;
    await desktop?.setWorkspaceRoot?.(selected);
    setWorkspaceRoot(selected);
    setMessage(`保存位置已选择：${selected}`);
    window.dispatchEvent(new CustomEvent("octosage:workspace-root", { detail: { workspaceRoot: selected } }));
    window.dispatchEvent(new CustomEvent("octosage:data-refresh"));
  };

  const chooseFolder = async () => {
    const desktop = window.octosageDesktop || window.novelStudioDesktop;
    const startPath = effectiveWorkspaceRoot(workspaceRoot);
    setMessage("正在打开文件夹选择器...");
    if (desktop?.chooseDirectory) {
      try {
        const selected = await desktop.chooseDirectory({ startPath, persistWorkspace: true });
        if (selected) await applyWorkspaceRoot(selected);
        else setMessage("没有选择文件夹。也可以直接在输入框里粘贴保存路径。");
      } catch (error) {
        setMessage(`${error instanceof Error ? error.message : String(error)}。也可以直接在输入框里粘贴保存路径。`);
      }
      return;
    }
    const selected = window.prompt("请输入保存文件夹路径", startPath);
    if (selected?.trim()) await applyWorkspaceRoot(selected);
    else setMessage("当前环境没有桌面文件夹选择器，请直接粘贴保存路径。");
  };

  const createProject = async (row: {
    title: string;
    idea: string;
    platform: BookPlatform;
    genre: string;
    subgenre: string;
    targetWords?: number;
    goldenFinger?: string;
    protagonistName?: string;
    supportingCharacters?: string;
    authorName?: string;
    coverPath?: string;
    coverUrl?: string;
    coverPrompt?: string;
  }, root: string) => postJson<CreateProjectPayload>("/api/project", {
    root,
    title: row.title.trim(),
    idea: row.idea.trim(),
    platform: row.platform,
    genre: `${row.genre}/${row.subgenre}`,
    target_words: row.targetWords || 2000000,
    author_name: row.authorName || authorName || "章鱼作者",
    golden_finger: row.goldenFinger || "",
    protagonist_name: row.protagonistName || "",
    supporting_characters: row.supportingCharacters || "",
    cover_path: row.coverPath || "",
    cover_url: row.coverUrl || "",
    cover_prompt: row.coverPrompt || "",
    generate_cover: !(row.coverPath || row.coverUrl),
    mode,
    initialize_planning: false,
    auto_planning: true,
  });

  const create = async () => {
    setSaving(true);
    setMessage("");
    try {
      const root = effectiveWorkspaceRoot(workspaceRoot);
      if (!root) throw new Error("请先选择保存文件夹。");
      await applyWorkspaceRoot(root);

      if (mode === "multi") {
        const rows = multiRows
          .map((row) => ({
            title: row.title.trim(),
            idea: row.idea.trim(),
            platform: row.platform,
            genre: row.genre,
            subgenre: row.subgenre,
            targetWords: row.targetWords || 2000000,
            goldenFinger: row.goldenFinger || "",
            protagonistName: row.protagonistName || "",
            supportingCharacters: row.supportingCharacters || "",
            authorName: row.authorName || "章鱼作者",
            coverPath: row.coverPath || "",
            coverUrl: row.coverUrl || "",
            coverPrompt: row.coverPrompt || "",
          }))
          .filter((row) => row.title || row.idea);
        if (rows.length < 2) throw new Error("多开至少需要填写 2 本书。");
        if (rows.some((row) => !row.title || !row.idea)) throw new Error("多开的每一行都需要同时填写书名和创意。");
        const created: CreateProjectPayload[] = [];
        for (const row of rows) {
          setMessage(`正在创建《${row.title}》并启动开书规划...`);
          const result = await createProject(row, root);
          created.push(result);
        }
        window.dispatchEvent(new CustomEvent("octosage:data-refresh"));
        setMessage(`已创建 ${created.length} 本书，规划任务已启动。`);
        window.setTimeout(() => {
          onClose();
          if (created[0]?.project_path) setActiveProject(created[0].project_path, "/novels");
        }, 450);
        return;
      }

      if (!title.trim() || !idea.trim()) throw new Error("请填写创意并选择书名。");
      setMessage(`正在创建《${title.trim()}》并启动开书规划...`);
      const result = await createProject({
        title,
        idea,
        platform,
        genre,
        subgenre,
        targetWords,
        goldenFinger,
        protagonistName,
        supportingCharacters,
        authorName,
        coverPath,
        coverUrl,
        coverPrompt,
      }, root);
      if (result.project_path) localStorage.setItem("octosage:auto-planning-project", result.project_path);
      if (result.planning_task_id) localStorage.setItem("octosage:auto-planning-task", result.planning_task_id);
      window.dispatchEvent(new CustomEvent("octosage:data-refresh"));
      if (result.project_path) setActiveProject(result.project_path, "/novel/workbench");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const canCreate = mode === "single"
    ? Boolean(title.trim() && idea.trim() && workspaceRoot.trim())
    : multiRows.filter((row) => row.title.trim() && row.idea.trim()).length >= 2 && Boolean(workspaceRoot.trim());

  const pipelineItems = ["创意", "题材规则", "书名", "人物", "规划", "审核"];
  const targetWordPresets = [
    { label: "短篇试水", value: 300000 },
    { label: "百万长篇", value: 1000000 },
    { label: "二百万精品", value: 2000000 },
    { label: "超长连载", value: 3000000 },
  ];
  const singlePipelineDone = (index: number) => (
    index < 2
    || (index === 2 && Boolean(title))
    || (index === 3 && Boolean(protagonistName || supportingCharacters))
    || (index >= 4 && saving)
  );
  const pipelineSteps: OctoProgressStep[] = pipelineItems.map((label, index) => ({
    id: label,
    label,
    state: mode === "single" && singlePipelineDone(index) ? "done" : saving && index >= 4 ? "running" : "pending",
  }));
  const creationAssets = ["项目圣经", "人物关系", "全书卷纲", "前30章细纲", "规划审核", "发布门禁规则"];

  return (
    <Dialog
      open={open}
      title="开新书"
      description="先锁定作品目标，再生成可审核的项目树。不同题材会套用不同开书规则。"
      className={mode === "multi" ? "octo-new-book world-builder multi" : "octo-new-book world-builder single"}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={saving || !canCreate} onClick={create}>
            {saving ? "创建中..." : mode === "single" ? "创建并进入规划" : "批量创建并启动规划"}
          </Button>
        </>
      )}
    >
      <div className="octo-form-grid octo-new-book-console">
        <div className="octo-new-book-top span-3">
          <Field className="octo-mode-field" label="模式">
            <Tabs
              value={mode}
              items={[
                { value: "single", label: "单开" },
                { value: "multi", label: "多开" },
              ]}
              onChange={setMode}
            />
          </Field>
          <OctoProgressFlow steps={pipelineSteps} />
        </div>

        {mode === "single" ? (
          <div className="octo-new-book-layout span-3">
            <section className="octo-book-main-panel">
              <div className="octo-section-title">
                <strong>核心输入</strong>
                <span>从创意开始，系统按题材和平台生成书名与规划。</span>
              </div>
              <Field label="一句话描述新书" hint="越具体越好。系统会据此生成书名、项目圣经、人物关系、全书卷纲和前30章细纲。">
                <textarea
                  value={idea}
                  onChange={(event) => {
                    setTitleTouched(false);
                    setIdea(event.target.value);
                  }}
                  placeholder="例如：2016年程序员被裁后重生回大学，为了还债从校园外卖做起，最后做成同城生活平台。"
                />
              </Field>
              <IdeaActionRow loading={suggestingIdeas} onSuggest={suggestIdeas} />
              {ideaCandidates.length ? (
                <Card className="octo-inline-widget" title="创意候选" description={ideaSuggestSource}>
                  <CandidateButtonList
                    items={ideaCandidates}
                    selected={idea}
                    empty="点击 AI 生成高质量创意。"
                    source=""
                    onSelect={(item) => {
                      setIdea(item);
                      setTitleTouched(false);
                    }}
                  />
                </Card>
              ) : null}
              <GenrePlatformFields
                platform={platform}
                genre={genre}
                subgenre={subgenre}
                platformOptions={platformOptions}
                genreOptions={genreOptions}
                tagOptions={tagsForGenre(genre)}
                onPlatformChange={setPlatform}
                onGenreChange={(value) => {
                  setGenreTouched(true);
                  setGenre(value);
                }}
                onSubgenreChange={(value) => {
                  setGenreTouched(true);
                  setSubgenre(value);
                }}
              />
              <GoldenFingerField value={goldenFinger} onChange={setGoldenFinger} suggestions={goldenSuggestions} />
              <Field label="书名">
                <input
                  value={title}
                  onChange={(event) => {
                    setTitleTouched(true);
                    setTitle(event.target.value);
                  }}
                  placeholder="输入创意后自动生成，可手动修改"
                />
              </Field>
              <Card className="octo-inline-widget" title="书名候选" description={suggesting ? "正在调用模型..." : suggestSource}>
                <CandidateButtonList
                  items={candidates}
                  selected={title}
                  empty="输入创意后自动生成。"
                  source=""
                  loading={suggesting}
                  actionLabel="重新生成"
                  actionDisabled={suggesting || !idea.trim()}
                  onAction={regenerateSingleTitle}
                  onSelect={(item) => {
                    setTitleTouched(false);
                    setTitle(item);
                  }}
                />
              </Card>
              <WordTargetControl value={targetWords} presets={targetWordPresets} onChange={setTargetWords} />
              <BookCoverDesigner
                title={title}
                authorName={authorName}
                coverUrl={coverUrl}
                coverPrompt={coverPrompt}
                generating={coverGenerating}
                disabled={!title.trim()}
                onAuthorChange={setAuthorName}
                onGenerate={generateCover}
              />
              <details className="octo-advanced-book-settings">
                <summary>
                  <span>高级设定</span>
                  <em>人物姓名可不填，系统会自动生成</em>
                </summary>
                <CharacterFields
                  protagonistName={protagonistName}
                  supportingCharacters={supportingCharacters}
                  onProtagonistChange={setProtagonistName}
                  onSupportingChange={setSupportingCharacters}
                />
              </details>
              <WorkspacePathPicker
                value={effectiveWorkspaceRoot(workspaceRoot)}
                hint={`每本书会单独建文件夹，例如：${effectiveWorkspaceRoot(workspaceRoot)}\\${title || "书名"}`}
                onChange={setWorkspaceRoot}
                onBlur={() => void applyWorkspaceRoot(effectiveWorkspaceRoot(workspaceRoot))}
                onChoose={chooseFolder}
              />
            </section>
            <aside className="octo-book-side-panel">
              <OpeningSummaryStrip
                platform={platformLabel(platform)}
                genre={genre}
                subgenre={subgenre}
                targetWords={targetWords}
                ruleLabel={ruleProfile.label}
                rules={ruleProfile.rules}
                assets={creationAssets}
              />
            </aside>
          </div>
        ) : (
          <div className="octo-multi-board span-3">
            <div className="octo-multi-brief">
              <strong>多开孵化</strong>
              <span>每本书独立创意、类型、平台和规划审核。</span>
              <StatusPill tone="running">至少 2 本</StatusPill>
            </div>
            {multiRows.map((row, index) => (
              <MultiBookCard
                key={index}
                index={index}
                row={row}
                platformLabel={platformLabel(row.platform)}
                platformOptions={platformOptions}
                genreOptions={genreOptions}
                tagOptions={tagsForGenre(row.genre)}
                ruleLabel={openingRuleProfileFor(row.genre, row.subgenre, row.idea).label}
                ruleSummary={openingRuleProfileFor(row.genre, row.subgenre, row.idea).rules.slice(0, 2).join(" · ")}
                goldenSuggestions={goldenFingerSuggestionsFor(row.genre, row.subgenre, row.idea)}
                onChange={(patch) => updateMultiRow(index, patch)}
                onGenerateTitle={() => regenerateMultiTitle(index)}
              />
            ))}
            <em>多开时每本书都独立设置创意、类型和平台。至少填写 2 本，创建后回到书架统一管理。</em>
          </div>
        )}

        {mode === "multi" ? (
          <div className="span-3">
            <WorkspacePathPicker
              value={effectiveWorkspaceRoot(workspaceRoot)}
              hint={`新书会保存到这个文件夹下，例如：${effectiveWorkspaceRoot(workspaceRoot)}\\书名`}
              onChange={setWorkspaceRoot}
              onBlur={() => void applyWorkspaceRoot(effectiveWorkspaceRoot(workspaceRoot))}
              onChoose={chooseFolder}
            />
          </div>
        ) : null}
        {message ? <div className="octo-form-message span-3">{message}</div> : null}
        {mode === "single" && idea.trim() ? (
          <div className="octo-form-message span-3">
            当前将按“{platformLabel(platform)} · {genre}/{subgenre}”生成规划。创建后先展示规划文本，再开放“生成第一章”。
          </div>
        ) : null}
      </div>
    </Dialog>
  );
};
