import { contextBridge, ipcRenderer } from "electron";

const desktopApi = {
  openPath(filePath) {
    return ipcRenderer.invoke("octosage:open-path", filePath);
  },
  chooseDirectory(startPath) {
    return ipcRenderer.invoke("octosage:choose-directory", startPath);
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
};

contextBridge.exposeInMainWorld("octosageDesktop", desktopApi);
contextBridge.exposeInMainWorld("novelStudioDesktop", desktopApi);
