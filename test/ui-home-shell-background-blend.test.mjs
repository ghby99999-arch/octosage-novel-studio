import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("home shell background extends behind sidebar and status bar", async () => {
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(css, /\.scroll-container\.octo-surface-home \{[\s\S]*octosage-home-cinematic\.png[\s\S]*background-size: cover/);
  assert.match(css, /\.scroll-container\[class\*="octo-surface-"\] \.octo-sidebar \{[\s\S]*background: rgba\([^)]*0\.[0-6][0-9]\)/);
  assert.match(css, /\.scroll-container\[class\*="octo-surface-"\] \.octo-statusbar \{[\s\S]*backdrop-filter: blur/);
});
