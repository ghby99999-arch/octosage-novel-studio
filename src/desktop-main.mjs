import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { access, appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveLocal } from "./server.mjs";
import { loadProject } from "./core/workflow.mjs";

let mainWindow;
let localApp;

export async function openPathFromDesktop(filePath) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("filePath is required");
  }
  return shell.openPath(filePath);
}

const documentsProjectRoot = () => path.join(app.getPath("documents"), "OctoSage", "Projects");
const settingsPath = () => path.join(app.getPath("userData"), "settings.json");
const runtimeLogPath = () => path.join(app.getPath("userData"), "runtime.log");

async function logRuntime(message, data = {}) {
  try {
    const line = JSON.stringify({
      time: new Date().toISOString(),
      message,
      ...data,
    }).replace(/[^\x20-\x7E]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
    await mkdir(path.dirname(runtimeLogPath()), { recursive: true });
    await appendFile(runtimeLogPath(), `${line}\n`, "utf8");
  } catch {
    // Logging must never block app startup.
  }
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function preferredWorkspaceRoot() {
  return documentsProjectRoot();
}

async function readDesktopSettings() {
  try {
    const raw = await readFile(settingsPath(), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeDesktopSettings(settings) {
  const filePath = settingsPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return settings;
}

async function getWorkspaceRoot() {
  const settings = await readDesktopSettings();
  const configured = typeof settings.workspaceRoot === "string" ? settings.workspaceRoot.trim() : "";
  if (configured && await pathExists(configured)) return configured;
  return await preferredWorkspaceRoot();
}
async function setWorkspaceRoot(root) {
  if (!root || typeof root !== "string" || !root.trim()) {
    throw new Error("workspace root is required");
  }
  const workspaceRoot = root.trim();
  await mkdir(workspaceRoot, { recursive: true });
  const settings = await readDesktopSettings();
  return writeDesktopSettings({
    ...settings,
    workspaceRoot,
    currentProject: "",
    workspaceRootUpdatedAt: new Date().toISOString(),
  });
}

async function getCurrentProjectPath() {
  const settings = await readDesktopSettings();
  const currentProject = typeof settings.currentProject === "string" ? settings.currentProject.trim() : "";
  if (!currentProject || !await pathExists(currentProject)) return "";
  const workspaceRoot = await getWorkspaceRoot();
  const relative = path.relative(workspaceRoot, currentProject);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    await writeDesktopSettings({
      ...settings,
      currentProject: "",
      currentProjectClearedAt: new Date().toISOString(),
      currentProjectClearedReason: "outside_workspace",
    });
    return "";
  }
  return currentProject;
}

async function setCurrentProjectPath(projectPath) {
  if (!projectPath || typeof projectPath !== "string" || !projectPath.trim()) {
    throw new Error("project path is required");
  }
  const currentProject = projectPath.trim();
  if (!await pathExists(currentProject)) {
    throw new Error(`project path does not exist: ${currentProject}`);
  }
  const workspaceRoot = await getWorkspaceRoot();
  const relative = path.relative(workspaceRoot, currentProject);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`project path is outside current workspace: ${currentProject}`);
  }
  const settings = await readDesktopSettings();
  return writeDesktopSettings({
    ...settings,
    currentProject,
    currentProjectUpdatedAt: new Date().toISOString(),
  });
}

ipcMain.handle("octosage:open-path", async (_event, filePath) => openPathFromDesktop(filePath));
ipcMain.handle("novel-studio:open-path", async (_event, filePath) => openPathFromDesktop(filePath));
ipcMain.handle("octosage:get-settings", async () => ({
  ...await readDesktopSettings(),
  workspaceRoot: await getWorkspaceRoot(),
  currentProject: await getCurrentProjectPath(),
  settingsPath: settingsPath(),
}));
ipcMain.handle("octosage:set-workspace-root", async (_event, root) => setWorkspaceRoot(root));
ipcMain.handle("octosage:set-current-project", async (_event, projectPath) => setCurrentProjectPath(projectPath));
ipcMain.handle("octosage:choose-directory", async (event, input) => {
  const optionsInput = input && typeof input === "object" ? input : {};
  const startPath = typeof input === "string" ? input : optionsInput.startPath;
  const persistWorkspace = Boolean(optionsInput.persistWorkspace);
  const fallbackPath = typeof startPath === "string" && startPath
    ? startPath
    : await getWorkspaceRoot();
  await logRuntime("choose-directory-start", { fallbackPath, persistWorkspace });
  const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (owner) {
    owner.show();
    owner.focus();
  }
  const options = {
    title: "Choose workspace",
    defaultPath: fallbackPath,
    properties: ["openDirectory", "createDirectory", "dontAddToRecent"],
  };
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths.length) {
    await logRuntime("choose-directory-canceled", { fallbackPath });
    return "";
  }
  const selectedPath = result.filePaths[0];
  if (persistWorkspace) await setWorkspaceRoot(selectedPath);
  await logRuntime("choose-directory-selected", { selectedPath, persistWorkspace });
  return selectedPath;
});
ipcMain.handle("octosage:choose-file", async (_event, options = {}) => {
  const fallbackPath = typeof options?.startPath === "string" && options.startPath
    ? options.startPath
    : await getWorkspaceRoot();
  const result = await dialog.showOpenDialog(mainWindow || BrowserWindow.getAllWindows()[0], {
    title: typeof options?.title === "string" ? options.title : "Choose file",
    defaultPath: fallbackPath,
    properties: ["openFile", "dontAddToRecent"],
    filters: Array.isArray(options?.filters) && options.filters.length
      ? options.filters
      : [
          { name: "Text or Markdown", extensions: ["txt", "md"] },
          { name: "All Files", extensions: ["*"] },
        ],
  });
  if (result.canceled || !result.filePaths.length) {
    return "";
  }
  return result.filePaths[0];
});

async function findExistingProject(root) {
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectPath = path.join(root, entry.name);
    const project = await loadProject(projectPath).catch(() => null);
    if (project) projects.push(project);
  }
  projects.sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
  return projects[0] || null;
}

async function createWindow() {
  const defaultRoot = await getWorkspaceRoot();
  const currentProjectPath = await getCurrentProjectPath();
  const defaultProject = currentProjectPath ? await loadProject(currentProjectPath).catch(() => null) : null;
  localApp = await serveLocal({ host: "127.0.0.1", port: 0, project: defaultProject });
  await logRuntime("local-server-ready", { url: localApp.url, defaultRoot, defaultProject: defaultProject?.path || "" });
  const preload = fileURLToPath(new URL("./desktop-preload.cjs", import.meta.url));
  const icon = fileURLToPath(new URL("../assets/icon.png", import.meta.url));
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 920,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#00000000",
      symbolColor: "#f4eee7",
      height: 34,
    },
    backgroundColor: "#120f0d",
    title: "OctoSage",
    icon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    void logRuntime("renderer-console", { level, message, line, sourceId });
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    void logRuntime("did-fail-load", { errorCode, errorDescription, validatedURL });
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    void logRuntime("render-process-gone", details);
  });
  mainWindow.webContents.on("did-finish-load", () => {
    void logRuntime("did-finish-load", { url: mainWindow?.webContents.getURL() || "" });
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  });
  mainWindow.setTitle("OctoSage");
  const url = new URL(localApp.url);
  url.searchParams.set("defaultRoot", defaultRoot);
  await logRuntime("load-url", { url: url.toString() });
  await mainWindow.loadURL(url.toString());
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  return createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", () => {
  localApp?.server?.close();
});



