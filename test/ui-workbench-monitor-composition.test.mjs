import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("workbench manuscript and artifacts sit inside a monitor-like composition", async () => {
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(css, /\.octo-editor \{[\s\S]*background:\s*var\(--octo-glass-panel-strong\)/);
  assert.match(css, /\.octo-artifact-drawer \{[\s\S]*background:\s*rgba\(6,\s*10,\s*19/);
  assert.match(css, /\.octo-artifact-paper \{[\s\S]*background:\s*transparent/);
  assert.match(css, /\.octo-manuscript-split \{[\s\S]*background:[\s\S]*rgba\(5,\s*8,\s*15/);
  assert.match(css, /\.octo-manuscript-inline \{[\s\S]*border-radius:\s*22px/);
  assert.match(css, /\.octo-manuscript \{[\s\S]*border-radius:\s*18px/);
  assert.match(css, /\.octo-manuscript \{[\s\S]*box-shadow:[\s\S]*inset 0 0 0 1px rgba\(36,\s*24,\s*13/);
});
