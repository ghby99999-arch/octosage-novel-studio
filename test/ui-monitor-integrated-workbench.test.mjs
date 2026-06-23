import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("novel workbench feels like a monitor embedded in the scene instead of hard boxes", async () => {
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(css, /\.octo-editor \{[\s\S]*position: relative[\s\S]*border-radius: 18px[\s\S]*overflow: hidden/);
  assert.match(css, /\.octo-editor::before \{/);
  assert.match(css, /\.octo-editor > \* \{[\s\S]*z-index: 1/);
  assert.match(css, /\.octo-manuscript-split \{[\s\S]*border-radius: 14px[\s\S]*box-shadow:/);
  assert.match(css, /\.octo-manuscript-inline \{[\s\S]*border-radius: 14px/);
  assert.match(css, /\.scroll-container\[class\*="octo-surface-"\] \.octo-sidebar \{[\s\S]*border-right: 0/);
  assert.match(css, /\.octo-workbench-left \{[\s\S]*box-shadow: 18px 0 46px/);
});
