import "@/styles/OctoWorkspace.css";

import octosageBrand from "@/assets/images/octosage-icon.png";
import { OctoButton } from "@/components/octo-ui";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

export type JsonRecord = Record<string, unknown>;

export type PixsoApiKeyState = {
  name?: string;
  label?: string;
  configured?: boolean;
  masked?: string;
};

export type PixsoDirectoryMap = {
  project?: string;
  chapters?: string;
  chapter_cards?: string;
  reviews?: string;
  state?: string;
  exports?: string;
  tasks?: string;
};

export type PixsoModelRoute = {
  task_type?: string;
  label?: string;
  recommended?: {
    provider?: string;
    model?: string;
    env?: string | null;
  } | null;
  active?: {
    provider?: string;
    model?: string;
    env?: string | null;
  } | null;
  active_health?: {
    status?: string;
    reason?: string;
    last_latency_ms?: number;
    last_error?: string;
    checked_at?: string;
    unavailable_until?: string;
  } | null;
  configured?: boolean;
  degraded?: boolean;
  skipped_unavailable?: Array<{
    provider?: string;
    model?: string;
    health?: {
      status?: string;
      reason?: string;
      last_error?: string;
      unavailable_until?: string;
    };
  }>;
  reason?: string;
  fallback_candidates?: Array<{
    provider?: string;
    model?: string;
    env?: string | null;
    health?: {
      status?: string;
      reason?: string;
      last_latency_ms?: number;
      last_error?: string;
      checked_at?: string;
      unavailable_until?: string;
    };
  }>;
};

export type PixsoDashboardData = JsonRecord & {
  project_title?: string;
  project_path?: string;
  directories?: PixsoDirectoryMap;
  current_chapter?: number;
  next_chapter?: number;
  completed_chapters?: number;
  latest_completed_chapter?: number;
  latest_grade?: string;
  estimated_cost_cny?: number;
  model_routes?: PixsoModelRoute[];
  api_keys?: PixsoApiKeyState[];
  ready?: {
    has_any_model_key?: boolean;
    selected_model_route?: JsonRecord | null;
    [key: string]: unknown;
  };
};

export type LocalAccount = {
  name?: string;
  meta?: string;
  signed_in_at?: string;
};

export const safeText = (value: unknown, fallback = "未读取") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

export const formatMoney = (value: unknown) => {
  const amount = Number(value || 0);
  return `¥${Number.isFinite(amount) ? amount.toFixed(3) : "0.000"}`;
};

export const formatChapterMeta = (data: PixsoDashboardData, suffix = "就绪") => {
  const chapter = Number(data.current_chapter || data.next_chapter || 1);
  const grade = safeText(data.latest_grade, "待审");
  return `第 ${chapter} 章 · ${grade} · ${suffix}`;
};

export const getWorkspaceRoot = () =>
  localStorage.getItem("octosage:workspace-root")
  || window.__OCTOSAGE_WORKSPACE_ROOT__
  || new URLSearchParams(window.location.search).get("defaultRoot")
  || "";

const pathBelongsToWorkspace = (projectPath: string, workspaceRoot: string) => {
  if (!projectPath || !workspaceRoot) return true;
  const normalizedProject = projectPath.replace(/\//g, "\\").toLowerCase();
  const normalizedRoot = workspaceRoot.replace(/\//g, "\\").replace(/\\+$/g, "").toLowerCase();
  return normalizedProject === normalizedRoot || normalizedProject.startsWith(`${normalizedRoot}\\`);
};

export const getCurrentProject = () => {
  const fromUrl = new URLSearchParams(window.location.search).get("project") || "";
  if (fromUrl) {
    localStorage.setItem("octosage:last-project", fromUrl);
    return fromUrl;
  }
  const stored = localStorage.getItem("octosage:last-project") || "";
  const workspaceRoot = getWorkspaceRoot();
  if (stored && workspaceRoot && !pathBelongsToWorkspace(stored, workspaceRoot)) {
    localStorage.removeItem("octosage:last-project");
    localStorage.removeItem("octosage:selected-chapter");
    return "";
  }
  return stored;
};

export const projectQuery = (projectPath?: string) => {
  const project = projectPath || getCurrentProject();
  return project ? `?project=${encodeURIComponent(project)}` : "";
};

export const setActiveProject = (projectPath: string, targetPath = "/novel/workbench") => {
  if (!projectPath) return;
  const workspaceRoot = getWorkspaceRoot();
  if (workspaceRoot && !pathBelongsToWorkspace(projectPath, workspaceRoot)) {
    localStorage.removeItem("octosage:last-project");
    localStorage.removeItem("octosage:selected-chapter");
    return;
  }
  localStorage.setItem("octosage:last-project", projectPath);
  localStorage.removeItem("octosage:selected-chapter");
  const desktop = window.octosageDesktop || window.novelStudioDesktop;
  void desktop?.setCurrentProject?.(projectPath).catch(() => undefined);
  window.dispatchEvent(new CustomEvent("octosage:active-project", { detail: { project: projectPath } }));
  window.history.pushState({}, "", `${targetPath}${projectQuery(projectPath)}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

export const navigateTo = (path: string) => {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

const pageSurfaceFor = (active: string) => {
  if (active === "/") return "home";
  if (active === "/comics" || active.startsWith("/comic")) return "comic";
  if (active === "/novels" || active.startsWith("/novel") || active === "/write") return "novel";
  if (active === "/reference") return "reference";
  if (active === "/settings" || active === "/login" || active === "/register") return "settings";
  return "system";
};

const readLocalAccount = (): LocalAccount | null => {
  try {
    const raw = localStorage.getItem("octosage:account");
    return raw ? JSON.parse(raw) as LocalAccount : null;
  } catch {
    return null;
  }
};

export const useLocalAccount = () => {
  const [account, setAccount] = useState<LocalAccount | null>(readLocalAccount());

  useEffect(() => {
    const syncAccount = () => setAccount(readLocalAccount());
    window.addEventListener("octosage:account", syncAccount);
    window.addEventListener("storage", syncAccount);
    return () => {
      window.removeEventListener("octosage:account", syncAccount);
      window.removeEventListener("storage", syncAccount);
    };
  }, []);

  return account;
};

export const useBusyMessage = () => {
  const [message, setMessage] = useState("");

  useEffect(() => {
    const syncBusy = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setMessage(detail?.message || "");
    };
    window.addEventListener("octosage:busy", syncBusy as EventListener);
    return () => window.removeEventListener("octosage:busy", syncBusy as EventListener);
  }, []);

  return message;
};

export const useGlobalActionError = () => {
  const [error, setError] = useState<{ label: string; message: string } | null>(null);

  useEffect(() => {
    const syncError = (event: Event) => {
      const detail = (event as CustomEvent<{ label?: string; message?: string }>).detail;
      const message = safeText(detail?.message, "");
      if (!message) return;
      setError({
        label: safeText(detail?.label, "操作没有完成"),
        message,
      });
    };
    window.addEventListener("octosage:action-error", syncError as EventListener);
    return () => window.removeEventListener("octosage:action-error", syncError as EventListener);
  }, []);

  return { error, clearError: () => setError(null) };
};

export const usePixsoDashboard = () => {
  const [data, setData] = useState<PixsoDashboardData>(window.__OCTOSAGE_DASHBOARD__ || {});
  const fixedProject = useMemo(() => new URLSearchParams(window.location.search).get("project") || "", []);

  useEffect(() => {
    let alive = true;
    const load = () => {
      const project = fixedProject || getCurrentProject();
      const query = project ? `?project=${encodeURIComponent(project)}` : "";
      fetch(`/api/dashboard${query}`)
        .then((response) => response.json())
        .then((payload) => {
          if (!alive) return;
          window.__OCTOSAGE_DASHBOARD__ = payload;
          if (fixedProject && payload?.project_path) localStorage.setItem("octosage:last-project", String(payload.project_path));
          setData(payload);
        })
        .catch(() => undefined);
    };

    load();
    window.addEventListener("octosage:data-refresh", load);
    window.addEventListener("storage", load);
    return () => {
      alive = false;
      window.removeEventListener("octosage:data-refresh", load);
      window.removeEventListener("storage", load);
    };
  }, [fixedProject]);

  return data;
};

const primaryNavItems = [
  { path: "/", action: "goHome", icon: "home", label: "首页" },
  { path: "/reference", action: "goReference", icon: "library", label: "拆书" },
  { path: "/settings", action: "settings", icon: "settings", label: "设置" },
] as const;

type CreationNavItem = {
  path: string;
  action: string;
  icon: string;
  label: string;
  project?: boolean;
};

const creationNavItems: CreationNavItem[] = [
  { path: "/novels", action: "goNovels", icon: "book", label: "网文创作" },
  { path: "/novel/workbench", action: "goNovelWorkbench", icon: "pen", label: "章节工作台", project: true },
  { path: "/comics", action: "goComics", icon: "video", label: "漫剧素材" },
];

const ShellIcon = ({ name }: { name: string }) => (
  <span className={`octo-nav-icon octo-icon-${name}`} aria-hidden="true" />
);

const NavButton = ({
  path,
  action,
  icon,
  label,
  active,
  compact,
}: {
  path: string;
  action: string;
  icon: string;
  label: string;
  active: boolean;
  compact?: boolean;
}) => (
  <a
    href={path}
    className={["octo-nav-item", compact ? "compact" : "", active ? "active" : ""].filter(Boolean).join(" ")}
    data-octo-action={action}
    aria-current={active ? "page" : undefined}
  >
    <ShellIcon name={icon} />
    <span>{label}</span>
  </a>
);

export const PixsoSidebar = ({ active }: { active: string }) => {
  const account = useLocalAccount();
  const project = getCurrentProject();
  const creationActive = active === "/novels" || active.startsWith("/novel") || active.startsWith("/comic") || active === "/write" || active === "/video";
  const [creationOpen, setCreationOpen] = useState(creationActive);
  const accountActive = active === "/login" || active === "/register";
  const accountName = safeText(account?.name, "未登录");
  const first = accountName.slice(0, 1);
  const resolvePath = (path: string, needsProject?: boolean) => (
    needsProject ? `${path}${projectQuery(project)}` : path
  );
  const isNavActive = (path: string) => (
    active === path
    || (path === "/novels" && active === "/write")
    || (path === "/novel/workbench" && active === "/write")
    || (path === "/comics" && (active.startsWith("/comic") || active === "/video"))
  );
  const visibleCreationNavItems = creationNavItems.filter((item) => item.path !== "/novel/workbench" || project);

  useEffect(() => {
    if (creationActive) setCreationOpen(true);
  }, [creationActive]);

  return (
    <aside className="octo-sidebar">
      <div className="octo-brand">
        <img className="octo-brand-mark" src={octosageBrand} alt="" />
        <div>
          <strong>章鱼大神</strong>
          <span>OctoSage V1.100</span>
        </div>
      </div>

      <nav className="octo-nav" aria-label="主导航">
        <NavButton {...primaryNavItems[0]} active={active === "/"} />
        <OctoButton
          type="button"
          variant="ghost"
          className={creationActive ? "octo-nav-item active" : "octo-nav-item"}
          aria-expanded={creationOpen}
          onClick={() => setCreationOpen((open) => !open)}
        >
          <ShellIcon name="pen" />
          <span>创作</span>
          <i className="octo-nav-caret" />
        </OctoButton>
        <div className={creationOpen ? "octo-subnav open" : "octo-subnav"}>
          {visibleCreationNavItems.map((item) => (
            <NavButton
              key={item.path}
              path={resolvePath(item.path, item.project)}
              action={item.action}
              icon={item.icon}
              label={item.label}
              compact
              active={isNavActive(item.path)}
            />
          ))}
        </div>
        <NavButton {...primaryNavItems[1]} active={active === "/reference"} />
        <NavButton {...primaryNavItems[2]} active={active === "/settings"} />
      </nav>

      <OctoButton
        type="button"
        variant="ghost"
        className={accountActive ? "octo-account active" : "octo-account"}
        data-octo-action="goLogin"
      >
        <span className="octo-account-avatar">{first}</span>
        <span className="octo-account-copy">
          <span className="octo-shell-account-label">账号</span>
          <strong>{accountName}</strong>
          <em>{account?.name ? "本地账号 · 点击管理" : "设置创作昵称"}</em>
        </span>
      </OctoButton>
    </aside>
  );
};

export const PixsoPageShell = ({
  active,
  title,
  meta,
  children,
  status,
}: {
  active: string;
  title: string;
  meta?: string;
  children: ReactNode;
  status?: ReactNode;
}) => {
  const busyMessage = useBusyMessage();
  const { error, clearError } = useGlobalActionError();
  const statusText = useMemo(() => busyMessage || meta || "就绪", [busyMessage, meta]);
  const surface = pageSurfaceFor(active);

  return (
    <div className={`scroll-container octo-surface-${surface}`}>
      <div className="octo-window-drag-zone" aria-hidden="true" />
      <div className="octo-app">
        <PixsoSidebar active={active} />
        <main className={`octo-main octo-spatial-scene octo-surface-${surface}-stage`}>
          <header className="octo-topbar">
            <div>
              <h1>{title}</h1>
              <p>{statusText}</p>
            </div>
            <div className="octo-topbar-actions">
              <OctoButton type="button" size="sm" variant="ghost" data-octo-action="chooseWorkspace">选择工作区</OctoButton>
              <OctoButton type="button" size="sm" variant="ghost" data-octo-action="refreshDashboard">刷新</OctoButton>
            </div>
          </header>
          {error ? (
            <div className="octo-warning-banner action-error global">
              <strong>{error.label}</strong>
              <span>{error.message}</span>
              <OctoButton type="button" size="sm" variant="ghost" onClick={clearError}>知道了</OctoButton>
            </div>
          ) : null}
          <div className="octo-content">{children}</div>
          <footer className="octo-statusbar">
            {status || <span>{statusText}</span>}
          </footer>
        </main>
      </div>
    </div>
  );
};

export const EmptyState = ({
  title,
  copy,
  action,
  actionLabel,
}: {
  title: string;
  copy: string;
  action?: string;
  actionLabel?: string;
}) => (
  <div className="octo-empty">
    <strong>{title}</strong>
    <p>{copy}</p>
    {action && actionLabel ? (
      <OctoButton type="button" size="sm" variant="primary" data-octo-action={action}>{actionLabel}</OctoButton>
    ) : null}
  </div>
);

export const ScoreBar = ({ label, value }: { label: string; value?: number | null }) => {
  const numeric = Number(value);
  const score = Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : null;
  return (
    <div className="octo-scorebar">
      <span>{label}</span>
      <i><b style={{ width: `${score ?? 0}%` }} /></i>
      <strong>{score === null ? "-" : score}</strong>
    </div>
  );
};

declare global {
  interface Window {
    __OCTOSAGE_DASHBOARD__?: PixsoDashboardData;
    __OCTOSAGE_API_KEYS__?: PixsoApiKeyState[];
    __OCTOSAGE_WORKSPACE_ROOT__?: string;
    OctoSageBridge?: Record<string, (...args: unknown[]) => unknown>;
    novelStudioDesktop?: {
      openPath?: (filePath: string) => Promise<unknown>;
      chooseDirectory?: (options?: string | JsonRecord) => Promise<string>;
      getSettings?: () => Promise<JsonRecord>;
      setWorkspaceRoot?: (root: string) => Promise<unknown>;
      setCurrentProject?: (projectPath: string) => Promise<unknown>;
    };
    octosageDesktop?: {
      openPath?: (filePath: string) => Promise<unknown>;
      chooseDirectory?: (options?: string | JsonRecord) => Promise<string>;
      getSettings?: () => Promise<JsonRecord>;
      setWorkspaceRoot?: (root: string) => Promise<unknown>;
      setCurrentProject?: (projectPath: string) => Promise<unknown>;
    };
  }
}
