import {
  EmptyState,
  getWorkspaceRoot,
  JsonRecord,
  PixsoPageShell,
  safeText,
  setActiveProject,
  usePixsoDashboard,
} from "@/views/PixsoAppShell";
import {
  OctoBookCard,
  OctoButton,
  OctoFileTree,
  OctoPanel,
  type OctoFileTreeItem,
} from "@/components/octo-ui";
import { useEffect, useState } from "react";

type ProjectCard = {
  title?: string;
  path?: string;
  completed_chapters?: number;
  latest_completed_chapter?: number | null;
  platform?: string;
  channel?: string;
};

type VideoWorkspace = {
  status?: string;
  project_title?: string;
  chapter_no?: number;
  tool?: string;
  fountain?: string;
  prompts?: string;
  character_refs?: JsonRecord;
  scene_refs?: JsonRecord;
  screenplay?: JsonRecord;
  storyboard?: {
    shots?: Array<JsonRecord>;
    total_duration?: number;
  };
  paths?: Record<string, string>;
  message?: string;
};

type VideoPackManifest = {
  status?: string;
  pack_path?: string;
  manifest_path?: string;
  tool?: string;
  range?: {
    from?: number;
    to?: number;
  };
  chapter_count?: number;
  character_count?: number;
  scene_count?: number;
  total_shots?: number;
  estimated_video_duration?: number;
  outputs?: Record<string, unknown>;
  next_step?: string;
};

type VideoAsset = {
  id?: string;
  name?: string;
  stored_name?: string;
  category?: "role" | "scene" | "audio" | "subtitle" | "other";
  type?: string;
  size?: number;
  path?: string;
  added_at?: string;
};

type VideoAssetsPayload = {
  status?: string;
  assets?: VideoAsset[];
  paths?: {
    dir?: string;
    manifest?: string;
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

const projectPath = (allowStored = true) => new URLSearchParams(window.location.search).get("project") || (allowStored ? localStorage.getItem("octosage:last-project") || "" : "");

const assetCategoryLabels: Record<NonNullable<VideoAsset["category"]>, string> = {
  role: "角色参考",
  scene: "场景参考",
  audio: "音频",
  subtitle: "字幕",
  other: "其他",
};

const formatBytes = (value = 0) => {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
};

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
  reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
  reader.readAsDataURL(file);
});

const loadVideoAssets = async (project: string) => {
  if (!project) return { assets: [] } as VideoAssetsPayload;
  return fetchJson<VideoAssetsPayload>(`/api/video/assets?project=${encodeURIComponent(project)}`);
};

const showActionError = (label: string, error: unknown) => {
  window.dispatchEvent(new CustomEvent("octosage:action-error", {
    detail: {
      label,
      message: error instanceof Error ? error.message : String(error || "操作失败，请稍后重试。"),
    },
  }));
};

const uploadVideoAsset = async (project: string, file: File, category: NonNullable<VideoAsset["category"]>) => {
  const contentBase64 = await fileToBase64(file);
  return postJson<VideoAssetsPayload>("/api/video/assets", {
    project,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    category,
    content_base64: contentBase64,
  });
};

const firstExistingProject = (projects: ProjectCard[]) => projects.find((project) => project.path)?.path || "";

const shotSummary = (shot: JsonRecord, index: number) => {
  const description = safeText(shot.description || shot.scene || shot.shot_type || shot.camera_movement, `镜头 ${index + 1}`);
  const duration = Number(shot.duration || 0);
  return `镜头 ${shot.shot || index + 1} · ${description}${duration ? ` · ${duration}s` : ""}`;
};

const promptPreview = (value = "") => String(value || "")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .slice(0, 8);

const storyboardShots = (workspace: VideoWorkspace | null) => (
  Array.isArray(workspace?.storyboard?.shots) ? workspace.storyboard.shots : []
);

const storyboardCell = (shot: JsonRecord, key: string, fallback = "") => safeText(shot[key], fallback);

const StoryboardTable = ({
  shots,
  onChange,
  onAdd,
}: {
  shots: JsonRecord[];
  onChange: (index: number, field: "shot_type" | "description" | "camera_movement" | "duration", value: string) => void;
  onAdd: () => void;
}) => (
  <div className="octo-storyboard-editor">
    <div className="octo-storyboard-toolbar">
      <strong>分镜表</strong>
      <OctoButton type="button" size="sm" onClick={onAdd}>添加镜头</OctoButton>
    </div>
    <div className="octo-storyboard-table">
      <div className="octo-storyboard-row head">
        <span>#</span>
        <span>景别</span>
        <span>画面描述</span>
        <span>运镜</span>
        <span>时长</span>
      </div>
      {shots.map((shot, index) => (
        <div className="octo-storyboard-row" key={String(shot.id || shot.shot || index)}>
          <b>{safeText(shot.shot, String(index + 1))}</b>
          <input
            value={storyboardCell(shot, "shot_type", storyboardCell(shot, "scale", "中景"))}
            onChange={(event) => onChange(index, "shot_type", event.target.value)}
            placeholder="中景"
          />
          <textarea
            value={storyboardCell(shot, "description", storyboardCell(shot, "scene", ""))}
            onChange={(event) => onChange(index, "description", event.target.value)}
            placeholder="这一镜的画面内容"
          />
          <input
            value={storyboardCell(shot, "camera_movement", storyboardCell(shot, "camera_move", "固定"))}
            onChange={(event) => onChange(index, "camera_movement", event.target.value)}
            placeholder="固定 / 推近 / 横移"
          />
          <input
            value={String(shot.duration || "")}
            onChange={(event) => onChange(index, "duration", event.target.value)}
            placeholder="3"
          />
        </div>
      ))}
    </div>
  </div>
);

const AssetList = ({ assets }: { assets: VideoAsset[] }) => (
  <div className="octo-asset-list">
    {assets.map((asset, index) => (
      <div className="octo-asset-row" key={asset.id || asset.path || `${asset.name}-${index}`}>
        <span>{assetCategoryLabels[asset.category || "other"] || "素材"}</span>
        <strong title={asset.path || asset.name}>{safeText(asset.name || asset.stored_name, "未命名素材")}</strong>
        <em>{formatBytes(Number(asset.size || 0))}</em>
      </div>
    ))}
  </div>
);

const AssetImporter = ({
  project,
  assets,
  onChange,
  compact = false,
}: {
  project: string;
  assets: VideoAsset[];
  onChange: (assets: VideoAsset[]) => void;
  compact?: boolean;
}) => {
  const [category, setCategory] = useState<NonNullable<VideoAsset["category"]>>("role");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    if (!project) {
      setMessage("请先选择一个作品，用于保存素材。");
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      for (const file of selectedFiles) {
        await uploadVideoAsset(project, file, category);
      }
      const refreshed = await loadVideoAssets(project);
      onChange(refreshed.assets || []);
      setMessage(`已导入 ${selectedFiles.length} 个素材。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMessage(message);
      showActionError("素材导入失败", error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={compact ? "octo-asset-importer compact" : "octo-asset-importer"}>
      <div className="octo-import-controls">
        <label className="octo-field">
          <span>素材类型</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
            <option value="role">角色参考图</option>
            <option value="scene">场景参考图</option>
            <option value="audio">音频</option>
            <option value="subtitle">字幕</option>
            <option value="other">其他素材</option>
          </select>
        </label>
        <label className={project ? "octo-file-picker" : "octo-file-picker disabled"} title={project ? "选择本地素材文件" : "请先选择作品"}>
          <input
            type="file"
            multiple
            accept="image/*,audio/*,.srt,.ass,.vtt,.txt"
            disabled={uploading || !project}
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <span>{!project ? "先选作品" : uploading ? "导入中..." : "选择文件"}</span>
        </label>
      </div>
      {message ? <p className="octo-import-message">{message}</p> : null}
      {assets.length ? <AssetList assets={assets} /> : <p className="octo-import-empty">还没有素材。选择角色图、场景图、音频或字幕后，会保存到当前作品的视频素材包。</p>}
    </div>
  );
};

export const ComicHome = () => {
  const [source, setSource] = useState<"novel" | "new" | "import">("novel");
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [selectedProject, setSelectedProject] = useState(projectPath());
  const [assets, setAssets] = useState<VideoAsset[]>([]);
  const [scriptTitle, setScriptTitle] = useState("");
  const [scriptIdea, setScriptIdea] = useState("");
  const [scriptEpisodes, setScriptEpisodes] = useState(12);
  const [creatingScript, setCreatingScript] = useState(false);
  const [createMessage, setCreateMessage] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const root = getWorkspaceRoot();
      const payload = await fetchJson<{ projects?: ProjectCard[] }>(`/api/projects?root=${encodeURIComponent(root)}`).catch(() => ({ projects: [] }));
      if (!alive) return;
      const list = (payload.projects || []).filter((project) => project.platform !== "comic" && project.channel !== "comic");
      setProjects(list);
      if (!selectedProject && firstExistingProject(list)) setSelectedProject(firstExistingProject(list));
    };
    load();
    window.addEventListener("octosage:data-refresh", load);
    return () => {
      alive = false;
      window.removeEventListener("octosage:data-refresh", load);
    };
  }, [selectedProject]);

  useEffect(() => {
    let alive = true;
    if (!selectedProject) {
      setAssets([]);
      return () => {
        alive = false;
      };
    }
    loadVideoAssets(selectedProject).then((payload) => {
      if (alive) setAssets(payload.assets || []);
    }).catch(() => {
      if (alive) setAssets([]);
    });
    return () => {
      alive = false;
    };
  }, [selectedProject]);

  return (
    <PixsoPageShell active="/comics" title="漫剧创作" meta="从网文直接转剧本、分镜和提示词">
      <section className="octo-page-head octo-hologlass">
        <div>
          <h2>漫剧创作</h2>
          <p>网文模块写出的章节会直接出现在这里，不需要手动导出再导入。</p>
        </div>
      </section>

      <div className="octo-source-switch octo-hologlass">
        <OctoButton type="button" size="sm" variant="ghost" className={source === "novel" ? "active" : ""} onClick={() => setSource("novel")}>从网文导入</OctoButton>
        <OctoButton type="button" size="sm" variant="ghost" className={source === "new" ? "active" : ""} onClick={() => setSource("new")}>新建剧本</OctoButton>
        <OctoButton type="button" size="sm" variant="ghost" className={source === "import" ? "active" : ""} onClick={() => setSource("import")}>导入外部素材</OctoButton>
      </div>

      {source === "novel" ? (
        <section className="octo-bookshelf compact octo-spatial-scene">
          {projects.length ? projects.map((project) => (
            <OctoBookCard
              as="button"
              key={project.path || project.title}
              onClick={() => {
                if (project.path) setActiveProject(project.path, "/comic/workbench");
              }}
            >
              <span className="octo-book-cover">{safeText(project.title, "书").slice(0, 2)}</span>
              <strong>{safeText(project.title, "未命名作品")}</strong>
              <em>{Number(project.completed_chapters || project.latest_completed_chapter || 0)}章可用</em>
              <small>点击进入漫剧工作台</small>
            </OctoBookCard>
          )) : (
            <EmptyState title="暂无可导入网文" copy="先在网文创作里创建或生成章节，再回到这里转漫剧。" action="goNovels" actionLabel="去网文创作" />
          )}
        </section>
      ) : null}

      {source === "new" ? (
        <OctoPanel
          className="octo-comic-create"
          eyebrow="COMIC SCRIPT"
          title="新建剧本"
          description="先建立剧本工作台，再生成剧本、分镜和提示词。"
        >
          <div className="octo-form-grid">
            <label className="octo-field">
              <span>剧本名</span>
              <input value={scriptTitle} onChange={(event) => setScriptTitle(event.target.value)} placeholder="例如：码头账房短剧版" />
            </label>
            <label className="octo-field">
              <span>集数</span>
              <input type="number" min={1} max={200} value={scriptEpisodes} onChange={(event) => setScriptEpisodes(Math.max(1, Number(event.target.value || 1)))} />
            </label>
            <label className="octo-field span-2">
              <span>一句话故事</span>
              <textarea value={scriptIdea} onChange={(event) => setScriptIdea(event.target.value)} placeholder="宋朝小账房靠现代商业思维逆袭，做成一部节奏很快的竖屏短剧。" />
            </label>
          </div>
          <div className="octo-modal-actions">
            <OctoButton type="button" variant="ghost" onClick={() => setSource("novel")}>取消</OctoButton>
            <OctoButton
              type="button"
              variant="primary"
              glow
              onClick={async () => {
                const title = scriptTitle.trim() || "新短剧";
                setCreatingScript(true);
                setCreateMessage("正在创建剧本工作台...");
                try {
                  const result = await postJson<{ project_path?: string; project_title?: string }>("/api/comic/project", {
                    root: getWorkspaceRoot(),
                    title,
                    idea: scriptIdea.trim() || "一个主角在压力中抓住机会完成逆袭的短剧故事。",
                    episodes: scriptEpisodes,
                  });
                  setCreateMessage("创建完成，正在进入工作台。");
                  if (result.project_path) setActiveProject(result.project_path, "/comic/workbench");
                } catch (error) {
                  const message = error instanceof Error ? error.message : String(error);
                  setCreateMessage(message);
                  showActionError("创建剧本失败", error);
                } finally {
                  setCreatingScript(false);
                }
              }}
              disabled={creatingScript || !scriptTitle.trim()}
              title={!scriptTitle.trim() ? "先填写剧本名" : undefined}
            >
              {creatingScript ? "创建中..." : "创建并进入"}
            </OctoButton>
          </div>
          {createMessage ? <p className="octo-form-message">{createMessage}</p> : null}
        </OctoPanel>
      ) : null}

      {source === "import" ? (
        <OctoPanel
          className="octo-import-box"
          eyebrow="ASSET DOCK"
          title="导入外部素材"
          description="选择角色参考图、场景参考图、音频或字幕，素材会保存到所选作品的视频素材包。"
        >
          <div className="octo-import-head">
            <label className="octo-field">
              <span>保存到作品</span>
              <select value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}>
                <option value="">选择作品</option>
                {projects.map((project) => (
                  <option key={project.path || project.title} value={project.path || ""}>{safeText(project.title, "未命名作品")}</option>
                ))}
              </select>
            </label>
          </div>
          <AssetImporter project={selectedProject} assets={assets} onChange={setAssets} />
        </OctoPanel>
      ) : null}
    </PixsoPageShell>
  );
};

export const ComicWorkbench = () => {
  const data = usePixsoDashboard();
  const [routeProject] = useState(() => projectPath(false));
  const project = routeProject || projectPath();
  const latest = Math.max(1, Number(data.latest_completed_chapter || data.completed_chapters || 1));
  const [episode, setEpisode] = useState(1);
  const [tool, setTool] = useState(localStorage.getItem("octosage:video-tool") || "jimeng");
  const [tab, setTab] = useState<"roles" | "scenes" | "storyboard" | "prompts" | "assets">("storyboard");
  const [editorKind, setEditorKind] = useState<"fountain" | "storyboard" | "prompts">("fountain");
  const [workspace, setWorkspace] = useState<VideoWorkspace | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [assets, setAssets] = useState<VideoAsset[]>([]);
  const [runningAction, setRunningAction] = useState("");
  const [packManifest, setPackManifest] = useState<VideoPackManifest | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  const textForKind = (payload: VideoWorkspace | null, kind = editorKind) => {
    if (!payload) return "";
    if (kind === "prompts") return payload.prompts || "";
    if (kind === "storyboard") return JSON.stringify(payload.storyboard || {}, null, 2);
    return payload.fountain || JSON.stringify(payload.screenplay || {}, null, 2);
  };

  const load = async (kind = editorKind) => {
    if (!project) return null;
    const payload = await fetchJson<VideoWorkspace>(`/api/video/workspace?project=${encodeURIComponent(project)}&chapter_no=${episode}&tool=${encodeURIComponent(tool)}`);
    setWorkspace(payload);
    setDraft(textForKind(payload, kind));
    const assetPayload = await loadVideoAssets(project).catch(() => ({ assets: [] }));
    setAssets(assetPayload.assets || []);
    return payload;
  };

  useEffect(() => {
    void load();
  }, [project, episode, tool, editorKind]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("octosage:data-refresh", refresh);
    return () => window.removeEventListener("octosage:data-refresh", refresh);
  }, [project, episode, tool]);

  const saveDraft = async () => {
    if (!project) return;
    setSaving(true);
    try {
      await postJson("/api/video/workspace", {
        project,
        chapter_no: episode,
        tool,
        kind: editorKind,
        content: draft,
      });
      await load();
      window.dispatchEvent(new CustomEvent("octosage:data-refresh"));
    } finally {
      setSaving(false);
    }
  };

  const updateStoryboardShot = (
    index: number,
    field: "shot_type" | "description" | "camera_movement" | "duration",
    value: string,
  ) => {
    if (!workspace) return;
    const shots = storyboardShots(workspace);
    const nextShots = shots.map((shot, shotIndex) => {
      if (shotIndex !== index) return shot;
      if (field === "duration") {
        return { ...shot, duration: Number(value) || value };
      }
      return { ...shot, [field]: value };
    });
    const nextStoryboard = { ...(workspace.storyboard || {}), shots: nextShots };
    const nextWorkspace = { ...workspace, storyboard: nextStoryboard };
    setWorkspace(nextWorkspace);
    setDraft(JSON.stringify(nextStoryboard, null, 2));
  };

  const addStoryboardShot = () => {
    if (!workspace) return;
    const shots = storyboardShots(workspace);
    const nextShot = {
      shot: shots.length + 1,
      shot_type: "中景",
      description: "",
      camera_movement: "固定",
      duration: 3,
    };
    const nextStoryboard = { ...(workspace.storyboard || {}), shots: [...shots, nextShot] };
    const nextWorkspace = { ...workspace, storyboard: nextStoryboard };
    setWorkspace(nextWorkspace);
    setDraft(JSON.stringify(nextStoryboard, null, 2));
  };

  const runVideoAction = async (
    label: string,
    editor: typeof editorKind,
    tabAfter: typeof tab,
    action: () => Promise<unknown>,
  ) => {
    if (!project) return;
    setRunningAction(label);
    setActionMessage(`${label}中...`);
    try {
      const result = await action();
      if (label === "导出素材包") setPackManifest(result as VideoPackManifest);
      setEditorKind(editor);
      setTab(tabAfter);
      const fresh = await load(editor);
      setDraft(textForKind(fresh, editor));
      setActionMessage(`${label}完成，结果已显示在当前工作台。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActionMessage(`${label}失败：${message}`);
      showActionError(`${label}失败`, error);
    } finally {
      setRunningAction("");
    }
  };

  const currentRange = () => ({ from: 1, to: Math.max(1, latest) });
  const episodeItems: OctoFileTreeItem[] = [{
    id: "episodes",
    label: "剧集",
    meta: `${Math.max(1, latest)} 集`,
    children: Array.from({ length: Math.max(1, latest) }, (_, index) => {
      const no = index + 1;
      return {
        id: `episode-${no}`,
        label: `第 ${String(no).padStart(2, "0")} 集`,
        meta: no <= latest ? "可转" : "待写",
        active: episode === no,
        status: workspace?.status === "ready" && episode === no ? "pass" : no <= latest ? "pending" : "running",
        onSelect: () => setEpisode(no),
      };
    }),
  }];

  return (
    <PixsoPageShell
      active="/comic/workbench"
      title="漫剧工作台"
      meta={`${safeText(data.project_title, "当前作品")} · 第 ${episode} 集 · ${tool}`}
    >
      <div className="octo-workbench">
        <aside className="octo-workbench-left">
          <div className="octo-panel-head">
            <strong>集数目录</strong>
            <span>来自网文章节</span>
          </div>
          <div className="octo-project-context">
            <strong>{safeText(data.project_title, "当前作品")}</strong>
            <span title={project}>{project || "未选择项目"}</span>
            <OctoButton type="button" size="sm" variant="ghost" data-octo-action="goComics">切换来源</OctoButton>
          </div>
          <OctoFileTree items={episodeItems} />
          <div className="octo-left-actions">
            <OctoButton type="button" disabled={Boolean(runningAction) || !project} title={!project ? "请先选择作品" : undefined} onClick={() => void runVideoAction("生成剧本", "fountain", "storyboard", () => postJson("/api/video/script", { project, chapter_no: episode }))}>
              {runningAction === "生成剧本" ? "生成中..." : "生成剧本"}
            </OctoButton>
            <OctoButton type="button" disabled={Boolean(runningAction) || !project} title={!project ? "请先选择作品" : undefined} onClick={() => void runVideoAction("生成分镜", "storyboard", "storyboard", () => postJson("/api/video/storyboard", { project, chapter_no: episode, tool }))}>
              {runningAction === "生成分镜" ? "生成中..." : "生成分镜"}
            </OctoButton>
            <OctoButton type="button" disabled={Boolean(runningAction) || !project} title={!project ? "请先选择作品" : undefined} onClick={() => void runVideoAction("生成提示词", "prompts", "prompts", () => postJson("/api/video/prompts", { project, chapter_no: episode, tool }))}>
              {runningAction === "生成提示词" ? "生成中..." : "生成提示词"}
            </OctoButton>
            <OctoButton type="button" disabled={Boolean(runningAction) || !project} title={!project ? "请先选择作品" : undefined} onClick={() => void runVideoAction("导出素材包", "prompts", "assets", () => postJson("/api/video/full-pack", { project, ...currentRange(), tool }))}>
              {runningAction === "导出素材包" ? "导出中..." : "导出素材包"}
            </OctoButton>
          </div>
        </aside>

        <section className="octo-editor">
          <div className="octo-editor-head">
            <div>
              <strong>第 {episode} 集 剧本 / 分镜</strong>
              <span>{actionMessage || (workspace?.status === "ready" ? "素材已读取，可直接查看修改" : safeText(workspace?.message, "尚未生成素材"))}</span>
            </div>
            <div className="octo-editor-tools">
              <select value={editorKind} onChange={(event) => {
                const next = event.target.value as typeof editorKind;
                setEditorKind(next);
                setDraft(textForKind(workspace, next));
              }}>
                <option value="fountain">剧本</option>
                <option value="storyboard">分镜表</option>
                <option value="prompts">提示词</option>
              </select>
              <OctoButton
                type="button"
                size="sm"
                disabled={saving || workspace?.status !== "ready"}
                title={workspace?.status !== "ready" ? "先生成或打开一个可编辑素材" : undefined}
                onClick={saveDraft}
              >
                {saving ? "保存中..." : "保存"}
              </OctoButton>
            </div>
          </div>
          {workspace?.status === "ready" && editorKind === "storyboard" ? (
            <StoryboardTable shots={storyboardShots(workspace)} onChange={updateStoryboardShot} onAdd={addStoryboardShot} />
          ) : workspace?.status === "ready" ? (
            <textarea className="octo-manuscript code" value={draft} onChange={(event) => setDraft(event.target.value)} />
          ) : (
            <EmptyState title="这一集还没有剧本或分镜" copy="点击左侧生成剧本、分镜或提示词后，内容会直接显示在这里。" />
          )}
        </section>

        <aside className="octo-workbench-right">
          <div className="octo-tabs">
            {[
              ["roles", "角色"],
              ["scenes", "场景"],
              ["storyboard", "分镜"],
              ["prompts", "提示词"],
              ["assets", "素材库"],
            ].map(([key, label]) => (
              <OctoButton type="button" size="sm" variant="ghost" className={tab === key ? "active" : ""} key={key} onClick={() => setTab(key as typeof tab)}>
                {label}
              </OctoButton>
            ))}
          </div>

          <div className="octo-side-section">
            <strong>{tab === "roles" ? "角色参考" : tab === "scenes" ? "场景参考" : tab === "storyboard" ? "分镜表" : tab === "prompts" ? "视频提示词" : "素材库"}</strong>
            {tab === "storyboard" && workspace?.storyboard?.shots?.length ? workspace.storyboard.shots.slice(0, 8).map((shot, index) => (
              <p key={index}>· {shotSummary(shot, index)}</p>
            )) : null}
            {tab === "prompts" ? (
              <div className="octo-prompt-preview">
                {promptPreview(workspace?.prompts).length ? promptPreview(workspace?.prompts).map((line, index) => (
                  <p key={index}>{line}</p>
                )) : <p>还没有生成目标工具提示词。</p>}
                <textarea readOnly value={workspace?.prompts || "还没有生成目标工具提示词。"} />
              </div>
            ) : null}
            {tab === "roles" ? (
              <div className="octo-ref-list">
                {Array.isArray(workspace?.character_refs?.characters) ? workspace.character_refs.characters.slice(0, 6).map((item, index) => {
                  const record = item as JsonRecord;
                  return (
                    <p key={index}>· {safeText(record.name, `角色 ${index + 1}`)}：{safeText((record.identity_card as JsonRecord | undefined)?.core || record.three_view_prompt, "已生成角色参考")}</p>
                  );
                }) : <p>生成素材包后，这里会显示角色三视图提示词和一致性约束。</p>}
              </div>
            ) : null}
            {tab === "scenes" ? (
              <div className="octo-ref-list">
                {Array.isArray(workspace?.scene_refs?.scenes) ? workspace.scene_refs.scenes.slice(0, 6).map((item, index) => {
                  const record = item as JsonRecord;
                  return (
                    <p key={index}>· {safeText(record.location, `场景 ${index + 1}`)}：{safeText(record.establishing_shot_prompt, "已生成场景参考")}</p>
                  );
                }) : <p>生成素材包后，这里会显示场景概念图提示词。</p>}
              </div>
            ) : null}
            {tab === "assets" ? (
              <>
                {packManifest ? (
                  <div className="octo-video-pack-summary">
                    <p><b>素材包已生成</b></p>
                    <p>范围：第 {packManifest.range?.from || 1} - {packManifest.range?.to || latest} 集</p>
                    <p>镜头：{packManifest.total_shots || 0} 个 · 预计 {packManifest.estimated_video_duration || 0} 秒</p>
                    <p>角色：{packManifest.character_count || 0} · 场景：{packManifest.scene_count || 0}</p>
                    <p title={packManifest.pack_path}>位置：{safeText(packManifest.pack_path, "已保存到视频素材包")}</p>
                  </div>
                ) : null}
                <AssetImporter project={project} assets={assets} onChange={setAssets} compact />
              </>
            ) : null}
            <label className="octo-field">
              <span>目标工具</span>
              <select value={tool} onChange={(event) => {
                setTool(event.target.value);
                localStorage.setItem("octosage:video-tool", event.target.value);
              }}>
                <option value="jimeng">即梦 Seedance</option>
                <option value="runway">Runway</option>
                <option value="kling">可灵</option>
              </select>
            </label>
          </div>
        </aside>
      </div>
    </PixsoPageShell>
  );
};
