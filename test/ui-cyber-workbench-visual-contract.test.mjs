import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("novel and comic workbenches share a cinematic cyber console background", async () => {
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(css, /--octo-neon:\s*#38d5c7/);
  assert.match(css, /--octo-grid-line:\s*rgba\(56,\s*213,\s*199,\s*0\.10\)/);
  assert.match(css, /\.scroll-container \{[\s\S]*radial-gradient\(circle at 82% 10%, rgba\(56, 213, 199, 0\.14\)/);
  assert.match(css, /\.octo-workbench \{[\s\S]*background:[\s\S]*linear-gradient\(90deg, var\(--octo-grid-line\) 1px, transparent 1px\)/);
  assert.match(css, /\.octo-workbench::before \{/);
});

test("workbench controls use glass panels and neon-gold action affordances", async () => {
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(css, /\.octo-workbench-left, \.octo-workbench-right \{[\s\S]*backdrop-filter: blur\(18px\)/);
  assert.match(css, /\.octo-editor \{[\s\S]*background:[\s\S]*rgba\(20,\s*18,\s*14,\s*0\.76\)/);
  assert.match(css, /\.octo-editor-primary \{[\s\S]*box-shadow: 0 0 0 1px rgba\(255,255,255,0\.16\), 0 10px 28px rgba\(201, 150, 62, 0\.24\)/);
  assert.match(css, /\.octo-chapter-node\.active \{[\s\S]*box-shadow:[\s\S]*rgba\(56, 213, 199, 0\.18\)/);
});
