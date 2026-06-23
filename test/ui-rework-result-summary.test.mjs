import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("novel workbench shows a compact rework result summary above manuscript", async () => {
  const source = await readFile("pixso-react-ui/src/views/NovelPages.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(source, /reworkResultSummary/);
  assert.match(source, /publishGateStatusStrip/);
  assert.match(source, /octo-publish-gate-strip/);
  assert.match(source, /已修复/);
  assert.match(source, /还剩/);
  assert.match(css, /\.octo-publish-gate-strip/);
});
