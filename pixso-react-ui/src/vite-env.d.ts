/// <reference types="vite/client" />

interface Window {
  novelStudioDesktop?: {
    openPath(filePath: string): Promise<unknown>;
    chooseDirectory?(input?: string | { startPath?: string; persistWorkspace?: boolean }): Promise<string>;
    chooseFile?(options?: Record<string, unknown>): Promise<string>;
    getSettings?(): Promise<Record<string, unknown>>;
    setWorkspaceRoot?(root: string): Promise<unknown>;
    setCurrentProject?(projectPath: string): Promise<unknown>;
  };
  octosageDesktop?: {
    openPath(filePath: string): Promise<unknown>;
    chooseDirectory?(input?: string | { startPath?: string; persistWorkspace?: boolean }): Promise<string>;
    chooseFile?(options?: Record<string, unknown>): Promise<string>;
    getSettings?(): Promise<Record<string, unknown>>;
    setWorkspaceRoot?(root: string): Promise<unknown>;
    setCurrentProject?(projectPath: string): Promise<unknown>;
  };
}
