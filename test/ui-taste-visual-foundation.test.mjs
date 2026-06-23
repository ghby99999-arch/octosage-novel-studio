import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("workspace has a Taste Skill inspired visual foundation", async () => {
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(css, /--octo-motion-premium:\s*cubic-bezier/);
  assert.match(css, /--octo-glass-panel:/);
  assert.match(css, /--octo-ambient-shadow:/);
  assert.match(css, /\.scroll-container\[class\*="octo-surface-"\]::before/);
  assert.match(css, /\.octo-taste-surface,/);
});

test("core controls avoid hard boxed UI", async () => {
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(css, /\.octo-btn \{[\s\S]*border:\s*0;/);
  assert.match(css, /\.octo-btn \{[\s\S]*transition:[^;]*var\(--octo-motion-premium\)/);
  assert.match(css, /\.octo-segment,\s*\.octo-source-switch \{[\s\S]*border:\s*0;/);
  assert.match(css, /\.octo-settings-block,\s*\.octo-auth-card,\s*\.octo-import-box,\s*\.octo-comic-create,\s*\.octo-reference-panel,\s*\.octo-tool-page \{[\s\S]*border:\s*0;/);
});
