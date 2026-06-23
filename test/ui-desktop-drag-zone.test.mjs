import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("custom desktop shell provides a real draggable window zone", async () => {
  const shell = await readFile("pixso-react-ui/src/views/PixsoAppShell.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(shell, /className="octo-window-drag-zone"/);
  assert.match(css, /\.octo-window-drag-zone\s*\{/);
  assert.match(css, /-webkit-app-region:\s*drag/);
  assert.match(css, /\.octo-sidebar[\s\S]*?-webkit-app-region:\s*no-drag/);
  assert.match(css, /\.octo-nav-item[\s\S]*?-webkit-app-region:\s*no-drag/);
});
