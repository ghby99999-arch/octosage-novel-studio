import { useEffect, useMemo, useState } from "react";
import { OctoButton as Button, OctoPanel as Card } from "@/components/octo-ui";
import octosageBrand from "@/assets/images/octosage-icon.png";
import { BookCard, CreateBookCard } from "@/views/novel/BookCard";
import { NewBookModalUnified } from "@/views/novel/NewBookModalUnified";
import {
  EmptyState,
  getWorkspaceRoot,
  navigateTo,
  PixsoPageShell,
  safeText,
  setActiveProject,
} from "@/views/PixsoAppShell";
import type { ProjectCard, ProjectsPayload } from "@/views/novel/types";
import { fetchJson, postJson } from "@/views/novel/utils";

const projectsCache = new Map<string, { payload: ProjectsPayload; time: number }>();
const PROJECTS_CACHE_TTL = 30_000;

const projectNameFromPath = (projectPath = "") => {
  const parts = projectPath.replace(/\//g, "\\").split("\\").filter(Boolean);
  return parts[parts.length - 1] || "";
};

const completedCount = (project?: ProjectCard) =>
  Number(project?.completed_chapters || project?.latest_completed_chapter || 0);

const recentLine = (project?: ProjectCard, fallbackPath = "") => {
  if (!project) {
    return fallbackPath ? "可直接回到上次工作台" : "先开一本新书，章鱼会自动生成规划。";
  }
  const completed = completedCount(project);
  const grade = completed && project.latest_grade ? `${String(project.latest_grade).toUpperCase()} 级` : "待规划";
  return `${completed} 章 · ${grade}`;
};

const useProjects = (enabled = true) => {
  const root = getWorkspaceRoot();
  const cached = projectsCache.get(root);
  const [payload, setPayload] = useState<ProjectsPayload>(cached?.payload || {});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;

    const load = async (event?: Event) => {
      if (!enabled) {
        setLoading(false);
        return;
      }

      const force = event?.type === "octosage:data-refresh";
      const activeRoot = getWorkspaceRoot();
      const existing = projectsCache.get(activeRoot);
      if (!force && existing && Date.now() - existing.time < PROJECTS_CACHE_TTL) {
        setPayload(existing.payload);
        setLoading(false);
        return;
      }

      setLoading(!existing);
      try {
        const data = await fetchJson<ProjectsPayload>(`/api/projects?root=${encodeURIComponent(activeRoot)}`);
        projectsCache.set(activeRoot, { payload: data, time: Date.now() });
        if (alive) setPayload(data);
      } catch {
        if (alive && !existing) setPayload({ projects: [] });
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    window.addEventListener("octosage:data-refresh", load);
    return () => {
      alive = false;
      window.removeEventListener("octosage:data-refresh", load);
    };
  }, [enabled]);

  return { payload, loading };
};

const HomeLanding = ({
  recentProject,
  recentProjectName,
  recentProjectPath,
  idea,
  onIdeaChange,
  onCreate,
  onContinue,
}: {
  recentProject?: ProjectCard;
  recentProjectName: string;
  recentProjectPath: string;
  idea: string;
  onIdeaChange: (value: string) => void;
  onCreate: () => void;
  onContinue: () => void;
}) => (
  <section className="octo-home-stage cinematic octo-spatial-scene">
    <div className="octo-home-hero-card cinematic">
      <div className="octo-home-mark-shell cinematic">
        <img src={octosageBrand} alt="" />
      </div>

      <div className="octo-home-copy cinematic">
        <span>AI Webnovel Production Studio</span>
        <h2>今天想创造什么世界？</h2>
        <p>输入一句创意，章鱼先生成开书规划，再进入正文生产和发布门禁。</p>
      </div>

      <form
        className="octo-home-command-form octo-hologlass"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
      >
        <input
          className="octo-home-command-input"
          value={idea}
          onChange={(event) => onIdeaChange(event.target.value)}
          placeholder="输入你的想法，比如：重生回大学，从第一单外卖开始翻盘"
          aria-label="新书创意"
        />
        <Button type="submit" variant="primary" glow className="octo-control-orb" aria-label="开始开书">✦</Button>
      </form>

      <div className="octo-home-primary-actions">
        <Button variant="primary" size="lg" onClick={onCreate}>开始构建世界</Button>
        <Button size="lg" onClick={() => navigateTo("/comics")}>动漫素材</Button>
      </div>
    </div>

    <Card className="octo-home-resume-card cinematic octo-hologlass">
      <div className="octo-home-resume-main">
        <span>继续上次工作</span>
        <strong>{recentProjectName || "暂无最近作品"}</strong>
        <em>{recentLine(recentProject, recentProjectPath)}</em>
      </div>
      <div className="octo-home-resume-actions">
        <Button variant="primary" disabled={!recentProjectName && !recentProjectPath} onClick={onContinue}>继续</Button>
        <Button onClick={() => navigateTo("/novels")}>书架</Button>
      </div>
    </Card>
  </section>
);

export const NovelBookshelf = () => {
  const isHomeRoute = window.location.pathname === "/" || window.location.pathname === "/dashboard";
  const { payload, loading } = useProjects(!isHomeRoute);
  const [modalOpen, setModalOpen] = useState(false);
  const [homeIdea, setHomeIdea] = useState("");
  const [modalInitialIdea, setModalInitialIdea] = useState("");
  const [busyProject, setBusyProject] = useState("");
  const [message, setMessage] = useState("");
  const projects = payload.projects || [];

  useEffect(() => {
    const open = () => setModalOpen(true);
    window.addEventListener("octosage:open-new-book", open);
    return () => window.removeEventListener("octosage:open-new-book", open);
  }, []);

  const recentProjectPath = localStorage.getItem("octosage:last-project") || "";
  const recentProject = useMemo(
    () => projects.find((project) => project.path === recentProjectPath),
    [projects, recentProjectPath],
  );
  const recentProjectName = recentProject?.title || projectNameFromPath(recentProjectPath);

  const openRecent = () => {
    const target = recentProject?.path || recentProjectPath;
    if (target) setActiveProject(target, "/novel/workbench");
    else navigateTo("/novels");
  };

  const openCreate = (seedIdea = "") => {
    setModalInitialIdea(seedIdea.trim());
    setModalOpen(true);
  };

  const trashBook = async (project: ProjectCard) => {
    if (!project.path) return;
    const title = safeText(project.title, "未命名新书");
    const ok = window.confirm(`确定把《${title}》移到回收站吗？\n\n不会永久删除，会移动到当前工作区的 .octosage-trash 文件夹。`);
    if (!ok) return;
    setBusyProject(project.path);
    setMessage("");
    try {
      const result = await postJson<{ message?: string }>("/api/project/trash", {
        root: getWorkspaceRoot(),
        project: project.path,
      });
      if (localStorage.getItem("octosage:last-project") === project.path) {
        localStorage.removeItem("octosage:last-project");
      }
      projectsCache.delete(getWorkspaceRoot());
      window.dispatchEvent(new CustomEvent("octosage:data-refresh"));
      setMessage(result.message || `《${title}》已移到回收站。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyProject("");
    }
  };

  const status = isHomeRoute
    ? "首页 · 开书、续写、进入素材生产"
    : loading
      ? "书架 · 正在读取作品"
      : `书架 · ${projects.length} 本作品`;

  return (
    <PixsoPageShell
      active={isHomeRoute ? "/" : "/novels"}
      title={isHomeRoute ? "首页" : "网文创作"}
      meta={status}
    >
      {isHomeRoute ? (
        <HomeLanding
          recentProject={recentProject}
          recentProjectName={recentProjectName}
          recentProjectPath={recentProjectPath}
          idea={homeIdea}
          onIdeaChange={setHomeIdea}
          onCreate={() => openCreate(homeIdea)}
          onContinue={openRecent}
        />
      ) : (
        <section className="octo-library-page octo-spatial-scene">
          <header className="octo-library-head compact octo-hologlass">
            <div>
              <span>Novel Library</span>
              <h2>网文创作</h2>
              <p>书架只展示关键进度和发布状态，低频操作收进更多菜单。</p>
            </div>
            <div>
              <Button onClick={() => navigateTo("/")}>首页</Button>
              <Button variant="primary" onClick={() => openCreate()}>开新书</Button>
            </div>
          </header>

          {message ? <div className="octo-shelf-message">{message}</div> : null}

          {loading && !projects.length ? (
            <EmptyState title="正在读取书架" copy="正在扫描当前工作区里的作品。" />
          ) : null}

          {!loading && !projects.length ? (
            <EmptyState
              title="还没有作品"
              copy="先用一句创意开一本新书。章鱼会先生成规划，再进入正文生产。"
              action="openNewBook"
              actionLabel="开新书"
            />
          ) : null}

          <div className="octo-bookshelf refined">
            {projects.map((project) => (
              <BookCard
                key={project.path || project.title}
                project={project}
                busy={busyProject === project.path}
                onOpen={(item) => item.path && setActiveProject(item.path, "/novel/workbench")}
                onTrash={trashBook}
              />
            ))}
            <CreateBookCard onCreate={() => openCreate()} />
          </div>
        </section>
      )}

      <NewBookModalUnified
        open={modalOpen}
        initialIdea={modalInitialIdea}
        onClose={() => setModalOpen(false)}
      />
    </PixsoPageShell>
  );
};
