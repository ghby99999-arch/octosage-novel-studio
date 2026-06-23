import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const novelPages = readFileSync("pixso-react-ui/src/views/NovelPages.tsx", "utf8");
const css = readFileSync("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

test("novel workbench uses reference-style production console zones", () => {
  assert.match(novelPages, /octo-workbench[^"]*octo-production-console/);
  assert.match(novelPages, /octo-production-header/);
  assert.match(novelPages, /octo-production-main-action/);
  assert.match(novelPages, /octo-production-pipeline/);
  assert.match(novelPages, /octo-pipeline-step/);
});

test("production console is blended glass, not hard boxed panels", () => {
  assert.match(css, /\.octo-production-console/);
  assert.match(css, /\.octo-production-header/);
  assert.match(css, /\.octo-production-pipeline/);
  assert.match(css, /backdrop-filter:\s*blur/);
  assert.match(css, /border:\s*0/);
  assert.match(css, /--octo-glass-panel-strong/);
});

test("manuscript sits inside a monitor shell with soft edge", () => {
  assert.match(css, /\.octo-manuscript-split/);
  assert.match(css, /radial-gradient\(circle at 50% 0%/);
  assert.match(css, /border-radius:\s*26px/);
  assert.match(css, /box-shadow:\s*[\s\S]*inset 0 0 0 1px rgba\(255,255,255,/);
});
