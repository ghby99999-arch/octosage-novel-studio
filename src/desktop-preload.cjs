const { contextBridge, ipcRenderer } = require("electron");

const desktopApi = {
  openPath(filePath) {
    return ipcRenderer.invoke("octosage:open-path", filePath);
  },
  chooseDirectory(input) {
    return ipcRenderer.invoke("octosage:choose-directory", input);
  },
  chooseFile(options) {
    return ipcRenderer.invoke("octosage:choose-file", options || {});
  },
  getSettings() {
    return ipcRenderer.invoke("octosage:get-settings");
  },
  setWorkspaceRoot(root) {
    return ipcRenderer.invoke("octosage:set-workspace-root", root);
  },
  setCurrentProject(projectPath) {
    return ipcRenderer.invoke("octosage:set-current-project", projectPath);
  },
};

contextBridge.exposeInMainWorld("octosageDesktop", desktopApi);
contextBridge.exposeInMainWorld("novelStudioDesktop", desktopApi);
