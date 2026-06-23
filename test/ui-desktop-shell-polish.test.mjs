import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("desktop shell hides the native Electron menu bar", async () => {
  const source = await readFile("src/desktop-main.mjs", "utf8");

  assert.match(source, /import \{ app, BrowserWindow, dialog, ipcMain, Menu, shell \} from "electron"/);
  assert.match(source, /autoHideMenuBar:\s*true/);
  assert.match(source, /titleBarStyle:\s*"hidden"/);
  assert.match(source, /titleBarOverlay:\s*\{/);
  assert.match(source, /color:\s*"#00000000"/);
  assert.match(source, /symbolColor:\s*"#f4eee7"/);
  assert.match(source, /mainWindow\.setMenuBarVisibility\(false\)/);
  assert.match(source, /Menu\.setApplicationMenu\(null\)/);
});
