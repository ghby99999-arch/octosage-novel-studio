import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("workspace visual system defaults to premium dark gold instead of purple SaaS", async () => {
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");
  const bridge = await readFile("pixso-react-ui/src/pixso-bridge.ts", "utf8");
  const settings = await readFile("pixso-react-ui/src/views/SystemPages.tsx", "utf8");

  assert.match(css, /--octo-workspace-bg:\s*#151310/);
  assert.match(css, /--octo-workspace-side:\s*#1f1b17/);
  assert.match(css, /--octo-accent:\s*#c9963e/);
  assert.match(css, /--octo-manuscript-bg:\s*#fffaf1/);
  assert.doesNotMatch(css.slice(0, 420), /#7c3aed|124,\s*58,\s*237|6d28d9/i);

  assert.match(bridge, /workspaceTheme:\s*localStorage\.getItem\("octosage:workspace-theme"\)\s*\|\|\s*"dark"/);
  assert.match(bridge, /const theme = workspaceThemes\[themeKey\] \|\| workspaceThemes\.dark/);
  assert.match(settings, /localStorage\.getItem\("octosage:workspace-theme"\) \|\| "dark"/);
});

test("primary actions use gold tokens and book cards avoid purple gradients", async () => {
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(css, /\.octo-primary-action, \.octo-modal-actions \.primary, button\.primary \{\s*background: var\(--octo-accent\)/s);
  assert.match(css, /button\.primary:hover \{ background: #b27f2f; \}/);
  assert.doesNotMatch(css, /linear-gradient\(90deg,\s*#7c3aed/);
  assert.doesNotMatch(css, /html\[data-octo-theme="dark"\] \.octo-book-card \{\s*background: linear-gradient\(155deg,\s*#2f2542/s);
});
