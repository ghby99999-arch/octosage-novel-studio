import { useMemo, useState } from "react";
import { OctoBookCard, OctoButton } from "@/components/octo-ui";
import { StatusPill } from "@/components/ui/StatusPill";
import { useGsapReveal } from "@/components/ui/useGsapMotion";
import { safeText } from "@/views/PixsoAppShell";
import type { ProjectCard } from "@/views/novel/types";

type BookCardProps = {
  project: ProjectCard;
  busy?: boolean;
  onOpen: (project: ProjectCard) => void;
  onTrash: (project: ProjectCard) => void;
};

const coverPalettes = [
  ["#151310", "#c9963e", "#fff4cf"],
  ["#1f1b17", "#2f7d7d", "#d8fffb"],
  ["#261706", "#b45309", "#fef3c7"],
  ["#3a161d", "#d24b63", "#ffe1e7"],
  ["#122622", "#4a8f72", "#dff8e9"],
  ["#201a14", "#8a6a3a", "#f5ead8"],
  ["#111827", "#64748b", "#f1f5f9"],
];

const hashText = (value = "") => {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
};

const completedCount = (project: ProjectCard) =>
  Number(project.completed_chapters || project.latest_completed_chapter || 0);

const targetCount = (project: ProjectCard, completed: number) => {
  const current = Number(project.current_chapter || completed + 1);
  return Math.max(200, current || 200);
};

const qualityState = (project: ProjectCard) => {
  const completed = completedCount(project);
  const grade = String(project.latest_grade || "").trim().toUpperCase();
  if (!completed) return { label: "规划中", tone: "neutral" as const };
  if (grade === "S" || grade === "A") return { label: "精品候选", tone: "success" as const };
  if (grade === "B") return { label: "可发布", tone: "success" as const };
  if (grade) return { label: "待优化", tone: "warning" as const };
  return { label: "待质检", tone: "neutral" as const };
};

const gradeLabel = (project: ProjectCard) => {
  const completed = completedCount(project);
  const grade = String(project.latest_grade || "").trim().toUpperCase();
  if (!completed) return "";
  return grade ? `${grade}级` : "待审";
};

const stageLabel = (project: ProjectCard) => {
  const completed = completedCount(project);
  if (!completed) return "待开写";
  return `第 ${completed} 章`;
};

const shortDate = (value = "") => {
  if (!value) return "";
  const clean = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean.slice(5) : clean;
};

const copyPath = (path = "") => {
  if (!path) return;
  void navigator.clipboard?.writeText(path);
};

export const BookCard = ({ project, busy = false, onOpen, onTrash }: BookCardProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const cardRef = useGsapReveal<HTMLElement>(0.03);
  const title = safeText(project.title, "未命名新书");
  const coverUrl = safeText(project.cover_url, "");
  const completed = completedCount(project);
  const target = targetCount(project, completed);
  const progress = Math.max(0, Math.min(100, Math.round((completed / target) * 100)));
  const palette = useMemo(() => coverPalettes[hashText(title) % coverPalettes.length], [title]);
  const quality = qualityState(project);
  const updatedAt = safeText(project.updated_at, "");
  const metaLabel = updatedAt ? `更新 ${shortDate(updatedAt)}` : stageLabel(project);
  const grade = gradeLabel(project);

  return (
    <OctoBookCard ref={cardRef} className="octo-book-card octo-book-card-component polished premium glass">
      <OctoButton
        type="button"
        variant="ghost"
        className={coverUrl ? "octo-book-cover has-image" : "octo-book-cover"}
        style={coverUrl ? undefined : { background: `linear-gradient(145deg, ${palette[0]}, ${palette[1]} 66%, ${palette[2]})` }}
        onClick={() => onOpen(project)}
        aria-label={`打开《${title}》`}
      >
        {coverUrl ? <img src={coverUrl} alt="" /> : <span>{title.slice(0, 2)}</span>}
      </OctoButton>

      <div className="octo-book-card-body">
        <div className="octo-book-topline">
          <strong className="octo-book-title" title={title}>{title}</strong>
          <div className="octo-book-more">
            <OctoButton
              className="octo-book-more-btn"
              variant="ghost"
              size="sm"
              title="更多"
              aria-label="更多操作"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <i aria-hidden="true" />
            </OctoButton>
            {menuOpen ? (
              <div className="octo-book-menu">
                <OctoButton type="button" size="sm" variant="ghost" onClick={() => onOpen(project)}>进入工作台</OctoButton>
                {project.path ? <OctoButton type="button" size="sm" variant="ghost" onClick={() => copyPath(project.path)}>复制路径</OctoButton> : null}
                <OctoButton
                  type="button"
                  size="sm"
                  variant="danger"
                  className="danger"
                  disabled={busy}
                  onClick={() => {
                    setMenuOpen(false);
                    onTrash(project);
                  }}
                >
                  {busy ? "处理中..." : "移到回收站"}
                </OctoButton>
              </div>
            ) : null}
          </div>
        </div>

        <div className="octo-book-state-row">
          <StatusPill tone={quality.tone} dot>{quality.label}</StatusPill>
          {grade ? <em>{grade}</em> : null}
        </div>

        <div className="octo-book-progress-group">
          <div className="octo-book-progress-meta">
            <span>{stageLabel(project)}</span>
            <small>{progress}%</small>
          </div>
          <div className="octo-book-progress" aria-label={`进度 ${progress}%`}>
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="octo-book-footer">
          <span>{metaLabel}</span>
          <OctoButton className="octo-book-primary" variant="primary" size="sm" onClick={() => onOpen(project)}>继续</OctoButton>
        </div>
      </div>
    </OctoBookCard>
  );
};

export const CreateBookCard = ({ onCreate }: { onCreate: () => void }) => (
  <CreateBookCardInner onCreate={onCreate} />
);

const CreateBookCardInner = ({ onCreate }: { onCreate: () => void }) => {
  const cardRef = useGsapReveal<HTMLButtonElement>(0.06);
  return (
    <OctoBookCard as="button" ref={cardRef} create className="octo-book-card octo-book-card-component create premium glass" onClick={onCreate}>
      <span className="octo-create-cover">
        <b>+</b>
        <small>NEW</small>
      </span>
      <span className="octo-create-copy">
        <strong>开新书</strong>
        <em>规划 / 细纲 / 发布门禁</em>
      </span>
    </OctoBookCard>
  );
};
