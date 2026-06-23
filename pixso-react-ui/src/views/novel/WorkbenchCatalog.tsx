import { useEffect, useState } from "react";
import { OctoButton, OctoFileTree, type OctoFileTreeItem } from "@/components/octo-ui";
import { safeText } from "@/views/PixsoAppShell";
import { cleanGradeText } from "@/views/novel/QualityPanels";
import type {
  ChapterListItem,
  ProjectMemory,
  ProjectTreeItem,
  ProjectTreePayload,
  SelectedArtifact,
  TextArtifact,
  WorkbenchArtifactView,
  WorkbenchLeftTab,
} from "@/views/novel/types";
import { factText } from "@/views/novel/utils";

const showActionError = (label: string, error: unknown) => {
  window.dispatchEvent(new CustomEvent("octosage:action-error", {
    detail: {
      label,
      message: error instanceof Error ? error.message : String(error || "操作失败，请稍后重试。"),
    },
  }));
};

const chapterSignal = (chapter: ChapterListItem) => {
  if (chapter.is_mock || chapter.status === "mock") return { tone: "warning", label: "示例" };
  if (chapter.publish_ready) return { tone: "pass", label: "可发布" };
  if (chapter.status === "partial") return { tone: "warning", label: chapter.publish_status || "断档待补" };
  if (chapter.status === "ready") return { tone: "fail", label: chapter.publish_status || "待修" };
  if (chapter.is_next) return { tone: "running", label: "待写" };
  return { tone: "idle", label: "未生成" };
};

const artifactStatusText = (status = "") => {
  if (status === "ready") return "已就绪";
  if (status === "review_failed") return "未通过";
  if (status === "partial") return "部分就绪";
  if (status === "missing") return "缺失";
  if (status === "empty") return "未生成";
  return status || "待处理";
};

export const planningBranchItems = (tree: ProjectTreePayload | null) => {
  const branch = (tree?.branches || []).find((item) => (
    /规划|设定|大纲|圣经|人物|planning/i.test(String(item.label || item.key || ""))
  ));
  const items = branch?.children?.length ? branch.children : (tree?.branches || []);
  return items.slice(0, 8);
};

export const EditableArtifact = ({
  title,
  value,
  empty,
  onSave,
  rows = 18,
}: {
  title: string;
  value?: string;
  empty: string;
  onSave: (value: string) => Promise<void>;
  rows?: number;
}) => {
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  return (
    <div className="octo-artifact-shell">
      <div className="octo-artifact-head">
        <strong>{title}</strong>
        <OctoButton
          type="button"
          size="sm"
          variant="secondary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(draft || empty);
            } catch (error) {
              showActionError(`${title}保存失败`, error);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "保存中..." : "保存"}
        </OctoButton>
      </div>
      {editing ? (
        <textarea
          className="octo-artifact-editor"
          rows={rows}
          value={draft || empty}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => setEditing(false)}
        />
      ) : (
        <OctoButton
          type="button"
          variant="ghost"
          className="octo-artifact-paper"
          onClick={() => setEditing(true)}
          title="点击编辑"
        >
          {draft || empty}
        </OctoButton>
      )}
    </div>
  );
};

export const ProjectArtifactViewer = ({
  artifact,
  selectedArtifact,
  onSave,
}: {
  artifact: TextArtifact | null;
  selectedArtifact: SelectedArtifact | null;
  onSave: (value: string) => Promise<void>;
}) => (
  <EditableArtifact
    title={selectedArtifact?.label || "项目圣经 / 大纲"}
    value={artifact?.text}
    empty={artifact?.message || "点击左侧项目树里的项目圣经、总纲、设定库、人物关系、卷纲或细纲，这里会显示具体内容。"}
    onSave={onSave}
    rows={24}
  />
);

export const MemoryMiniView = ({ memory }: { memory: ProjectMemory | null }) => (
  <div className="octo-tree-mini">
    <strong>项目记忆</strong>
    <p>
      已同步 {memory?.completed_chapters || 0} 章 ·
      角色 {memory?.summary?.characters || 0} ·
      未回收伏笔 {memory?.summary?.foreshadowing_open || 0}
    </p>
    {(memory?.characters || []).slice(-4).reverse().map((item, index) => (
      <span key={`tree-memory-character-${index}`}>{safeText(item.name, "角色")}：{factText(item)}</span>
    ))}
    {!(memory?.characters || []).length ? <span>生成章节后会自动同步角色、伏笔和时间线。</span> : null}
  </div>
);

const nodeStatus = (chapter: ChapterListItem) => {
  if (chapter.is_next) return "待写";
  if (chapter.publish_ready) return "可发布";
  if (chapter.status === "partial") return chapter.publish_status || "断档待补";
  if (chapter.status === "ready") return chapter.publish_status || cleanGradeText(chapter.grade) || "待优化";
  return "未生成";
};

const fileTreeStatus = (status = ""): OctoFileTreeItem["status"] => {
  if (["ready", "pass", "completed"].includes(status)) return "pass";
  if (["review_failed", "fail", "blocked"].includes(status)) return "fail";
  if (["partial", "running"].includes(status)) return "running";
  return "pending";
};

const chapterTreeStatus = (chapter: ChapterListItem): OctoFileTreeItem["status"] => {
  if (chapter.publish_ready) return "pass";
  if (chapter.status === "partial" || chapter.is_next) return "running";
  if (chapter.status === "ready") return "fail";
  return "pending";
};

export const WorkbenchCatalogPanel = ({
  setTab,
  projectTitle,
  chapters,
  selected,
  setSelected,
  view,
  setView,
  card,
  memory,
  projectTree,
  onSelectArtifact,
  selectedArtifact,
}: {
  tab: WorkbenchLeftTab;
  setTab: (tab: WorkbenchLeftTab) => void;
  projectTitle?: string;
  chapters: ChapterListItem[];
  selected: number;
  setSelected: (chapterNo: number) => void;
  view: WorkbenchArtifactView;
  setView: (view: WorkbenchArtifactView) => void;
  card: TextArtifact | null;
  memory: ProjectMemory | null;
  outline: TextArtifact | null;
  projectTree: ProjectTreePayload | null;
  onSaveCard: (value: string) => Promise<void>;
  onSaveOutline: (value: string) => Promise<void>;
  onSelectArtifact: (item: ProjectTreeItem) => void;
  selectedArtifact: SelectedArtifact | null;
}) => {
  const planningItems = planningBranchItems(projectTree);
  const chapterCount = chapters.length || 0;
  const readyPlanningCount = planningItems.filter((item) => item.status === "ready").length;

  const selectChapter = (chapterNo: number) => {
    setSelected(chapterNo);
    setView("manuscript");
    setTab("chapters");
  };

  const selectProjectView = (nextView: WorkbenchArtifactView) => {
    setView(nextView);
    if (nextView === "planning") setTab("tree");
    if (nextView === "card") setTab("card");
    if (nextView === "memory") setTab("memory");
  };

  const treeItems: OctoFileTreeItem[] = [
    {
      id: "book-root",
      label: safeText(projectTitle, "当前作品"),
      meta: `${readyPlanningCount}/${planningItems.length || 6} 规划 · ${chapterCount} 章`,
      active: view === "planning" && !selectedArtifact?.path,
      status: readyPlanningCount ? "running" : "pending",
      onSelect: () => selectProjectView("planning"),
      children: [
        {
          id: "planning-branch",
          label: "开书资料",
          meta: readyPlanningCount ? "已生成" : "待生成",
          status: readyPlanningCount ? "pass" : "pending",
          children: planningItems.length ? planningItems.map((item) => ({
            id: `planning-${item.key || item.path || item.label}`,
            label: safeText(item.label, "规划文件"),
            meta: artifactStatusText(item.status),
            active: Boolean(selectedArtifact?.path && selectedArtifact.path === item.path),
            status: fileTreeStatus(item.status),
            onSelect: () => {
              onSelectArtifact(item);
              selectProjectView("planning");
            },
          })) : [{
            id: "planning-empty",
            label: "项目圣经 / 大纲 / 人物关系",
            meta: "待生成",
            status: "pending",
            onSelect: () => selectProjectView("planning"),
          }],
        },
        {
          id: "production-branch",
          label: "生产资料",
          meta: "章卡 / 记忆 / 门禁",
          status: "running",
          children: [
            {
              id: "chapter-card",
              label: `第${selected}章章卡`,
              meta: card?.status === "ready" ? "已生成" : "待生成",
              active: view === "card",
              status: card?.status === "ready" ? "pass" : "pending",
              onSelect: () => selectProjectView("card"),
            },
            {
              id: "project-memory",
              label: "项目记忆",
              meta: memory?.completed_chapters ? `${memory.completed_chapters} 章` : "待同步",
              active: view === "memory",
              status: memory?.completed_chapters ? "pass" : "pending",
              onSelect: () => selectProjectView("memory"),
            },
            {
              id: "quality-gate",
              label: "发布门禁",
              meta: "质量",
              active: view === "quality",
              status: "running",
              onSelect: () => selectProjectView("quality"),
            },
            {
              id: "publish-runner",
              label: "投稿执行",
              meta: "浏览器",
              active: view === "publish",
              status: "pending",
              onSelect: () => selectProjectView("publish"),
            },
          ],
        },
        {
          id: "chapters-branch",
          label: "章节",
          meta: chapterCount ? `${chapterCount} 章` : "先规划",
          status: chapterCount ? "running" : "pending",
          children: chapters.length ? chapters.map((chapter) => ({
            id: `chapter-${chapter.chapter_no}`,
            label: `第${String(chapter.chapter_no).padStart(3, "0")}章`,
            meta: nodeStatus(chapter),
            active: selected === chapter.chapter_no && view === "manuscript",
            status: chapterTreeStatus(chapter),
            onSelect: () => selectChapter(chapter.chapter_no),
          })) : [{
            id: "chapters-empty",
            label: "还没有章节",
            meta: "先规划",
            status: "pending",
            onSelect: () => selectProjectView("planning"),
          }],
        },
      ],
    },
  ];

  return (
    <OctoFileTree items={treeItems} />
  );
};
