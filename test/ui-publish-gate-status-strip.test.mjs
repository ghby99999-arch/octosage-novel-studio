import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("novel workbench merges gate failure and repair delta into one compact manuscript status strip", async () => {
  const source = await readFile("pixso-react-ui/src/views/NovelPages.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(source, /publishGateStatusStrip/);
  assert.match(source, /octo-publish-gate-strip/);
  assert.match(source, /还能继续自动修|继续自动修/);
  assert.match(source, /已修掉/);
  assert.match(source, /还剩/);
  assert.doesNotMatch(source, /className="octo-gate-failure-summary"/);
  assert.doesNotMatch(source, /className="octo-rewrite-delta"/);
  assert.doesNotMatch(source, /className=\{`octo-rework-result/);
  assert.match(css, /\.octo-publish-gate-strip/);
});
