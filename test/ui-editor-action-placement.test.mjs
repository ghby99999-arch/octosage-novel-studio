import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("novel editor keeps chapter actions in one toolbar instead of duplicating buttons in manuscript alerts", async () => {
  const source = await readFile("pixso-react-ui/src/views/NovelPages.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(source, /className="octo-editor-primary"/);
  assert.match(source, /className="octo-editor-menu"/);
  assert.match(source, /summary>更多<\/summary>/);
  assert.match(source, /octo-editor-menu-section/);
  assert.match(source, /写作操作/);
  assert.match(source, /质检修稿/);
  assert.match(source, /发布导出/);
  assert.match(source, /危险操作/);
  assert.match(source, /className="danger"/);
  assert.doesNotMatch(source, /octo-quality-stop-banner[\s\S]{0,800}<button/);
  assert.doesNotMatch(source, /octo-quality-stop-note/);
  assert.match(css, /\.octo-editor-menu-section/);
  assert.match(css, /\.octo-editor-menu \.danger/);
  assert.doesNotMatch(css, /\.octo-quality-stop-note/);
});
