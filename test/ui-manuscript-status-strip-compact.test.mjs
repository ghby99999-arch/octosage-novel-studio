import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("manuscript gate status strip defaults to one compact line with details behind a count button", async () => {
  const source = await readFile("pixso-react-ui/src/views/NovelPages.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(source, /summaryText/);
  assert.match(source, /reasonCount/);
  assert.match(source, /octo-gate-details-button/);
  assert.doesNotMatch(source, /<span className="octo-gate-strip-reasons">[\s\S]*?gateStrip\.remaining\.map/);

  const stripBlock = css.match(/\.octo-publish-gate-strip\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(stripBlock, /grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto/);
  assert.match(stripBlock, /min-height:\s*28px/);
  assert.match(stripBlock, /max-height:\s*32px/);
  assert.doesNotMatch(stripBlock, /grid-template-columns:\s*auto minmax\(0,\s*1\.2fr\)/);

  assert.match(css, /\.octo-gate-strip-summary/);
  assert.match(css, /\.octo-gate-details-button/);
});
