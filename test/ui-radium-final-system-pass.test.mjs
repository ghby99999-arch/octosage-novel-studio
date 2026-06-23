import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

test("final visual pass replaces remaining boxed app chrome with cockpit surfaces", () => {
  assert.match(css, /Radium cockpit final pass/);
  assert.match(css, /\.octo-book-card,\s*\.octo-project-tree,\s*\.octo-editor,\s*\.octo-quality-panel/);
  assert.match(css, /background:\s*linear-gradient\(145deg,\s*rgba\(13,\s*20,\s*38,\s*0\.72\)/);
  assert.match(css, /border:\s*0/);
  assert.match(css, /box-shadow:[\s\S]*var\(--octo-glass-edge\)/);
});

test("final visual pass gives all controls a tactile illuminated equipment style", () => {
  assert.match(css, /\.scroll-container\[class\*="octo-surface-"\]\s*:is\(button,\s*summary,\s*\.octo-btn/);
  assert.match(css, /border-radius:\s*999px/);
  assert.match(css, /transition:\s*transform 260ms var\(--octo-motion-premium\),/);
  assert.match(css, /-webkit-app-region:\s*no-drag/);
});

test("manuscript remains readable while sitting inside the futuristic monitor", () => {
  assert.match(css, /\.octo-manuscript-read,\s*\.octo-manuscript,\s*\.octo-plan-preview/);
  assert.match(css, /background:\s*linear-gradient\(180deg,\s*rgba\(255,\s*250,\s*241,\s*0\.98\)/);
  assert.match(css, /font-family:\s*var\(--octo-serif\)/);
});
