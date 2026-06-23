import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

test("final cockpit skin owns app shell instead of legacy hard chrome", () => {
  assert.match(css, /Radium cockpit final skin/);
  assert.match(css, /\.scroll-container\[class\*="octo-surface-"\] \.octo-sidebar[\s\S]*-webkit-app-region:\s*drag/);
  assert.match(css, /\.scroll-container\[class\*="octo-surface-"\] \.octo-nav[\s\S]*-webkit-app-region:\s*no-drag/);
  assert.match(css, /\.scroll-container\[class\*="octo-surface-"\] \.octo-statusbar[\s\S]*opacity:\s*0/);
  assert.match(css, /\.scroll-container\[class\*="octo-surface-"\]:hover \.octo-statusbar[\s\S]*opacity:\s*0/);
  assert.match(css, /\.scroll-container\[class\*="octo-surface-"\] \.octo-nav-item::after[\s\S]*display:\s*none/);
  assert.match(css, /\.scroll-container\[class\*="octo-surface-"\] \.octo-ui-file-node::after[\s\S]*display:\s*none/);
  assert.match(css, /\.scroll-container\[class\*="octo-surface-"\] \.octo-editor-menu button::after[\s\S]*display:\s*none/);
});

test("final cockpit skin gives production workbench a monitor-like stage", () => {
  assert.match(css, /\.octo-workbench\.octo-production-console[\s\S]*grid-template-columns:\s*minmax\(168px,\s*190px\)\s*minmax\(560px,\s*1fr\)\s*34px/);
  assert.match(css, /\.octo-editor\.octo-production-stage[\s\S]*border-radius:\s*34px/);
  assert.match(css, /\.octo-manuscript-split[\s\S]*border-radius:\s*28px/);
  assert.match(css, /\.octo-ui-button::after/);
});
