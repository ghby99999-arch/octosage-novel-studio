import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("novel workbench shows rewrite before-after delta evidence", async () => {
  const source = await readFile("pixso-react-ui/src/views/NovelPages.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(source, /rewriteDeltaSummary/);
  assert.match(source, /publishGateStatusStrip/);
  assert.match(source, /octo-publish-gate-strip/);
  assert.match(source, /rewrite_delta/);
  assert.match(source, /blockers_removed/);
  assert.match(source, /word_count_collapsed/);
  assert.match(source, /本轮变化/);
  assert.match(source, /字数/);
  assert.match(source, /门禁/);
  assert.match(source, /失败原因/);
  assert.match(css, /\.octo-publish-gate-strip/);
});
