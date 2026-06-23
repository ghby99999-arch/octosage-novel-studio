import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("page shell assigns cinematic module backgrounds for novel, comic, and system surfaces", async () => {
  const shell = await readFile("pixso-react-ui/src/views/PixsoAppShell.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(shell, /pageSurfaceFor/);
  assert.match(shell, /octo-surface-\$\{surface\}/);
  assert.match(shell, /active === "\/comics" \|\| active\.startsWith\("\/comic"\)/);
  assert.match(shell, /active === "\/novels" \|\| active\.startsWith\("\/novel"\)/);

  assert.match(css, /\.scroll-container\.octo-surface-novel \{[\s\S]*octosage-novel-studio-bg\.png[\s\S]*background-size: cover/);
  assert.match(css, /\.scroll-container\.octo-surface-comic \{[\s\S]*octosage-comic-studio-bg\.png[\s\S]*background-size: cover/);
  assert.match(css, /\.scroll-container\.octo-surface-settings,/);
  assert.match(css, /\.scroll-container\[class\*="octo-surface-"\] \.octo-app \{[\s\S]*background: transparent/);
  assert.match(css, /\.scroll-container\[class\*="octo-surface-"\] \.octo-sidebar \{[\s\S]*backdrop-filter: blur/);
});
