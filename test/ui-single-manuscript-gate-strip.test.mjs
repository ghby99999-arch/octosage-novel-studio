import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("blocked manuscript status is merged into the single gate strip instead of a second warning row", async () => {
  const source = await readFile("pixso-react-ui/src/views/NovelPages.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(source, /stopText/);
  assert.match(source, /readableStoppedReason/);
  assert.doesNotMatch(source, /className="octo-quality-stop-note"/);
  assert.doesNotMatch(css, /\.octo-quality-stop-note/);
  assert.match(source, /octo-publish-gate-strip/);
  assert.match(source, /octo-gate-strip-summary/);
});
