import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("live rewrite shows old text struck out and new text typing inside the manuscript paper", async () => {
  const source = await readFile("pixso-react-ui/src/views/novel/WritingProgress.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");
  const liveSource = source.slice(source.indexOf("export const WritingLiveWorkspace"));

  assert.match(liveSource, /isInlineRewrite/);
  assert.match(liveSource, /octo-live-repair-stream/);
  assert.match(liveSource, /octo-live-repair-old/);
  assert.match(liveSource, /octo-live-repair-new/);
  assert.match(liveSource, /<del className="octo-live-repair-old">\{beforeRewritePreview/);
  assert.doesNotMatch(liveSource, /octo-live-delete-preview/);
  assert.doesNotMatch(liveSource, /octo-live-rewrite-diff/);

  assert.match(css, /\.octo-live-repair-stream/);
  assert.match(css, /\.octo-live-repair-old/);
  assert.match(css, /text-decoration:\s*line-through/);
  assert.match(css, /\.octo-live-repair-new/);
  assert.match(css, /animation:\s*octoRewriteIn/);
});
