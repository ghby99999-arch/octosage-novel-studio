import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("gate failure chips can jump to manuscript inline annotations", async () => {
  const workbench = await readFile("pixso-react-ui/src/views/NovelPages.tsx", "utf8");
  const editor = await readFile("pixso-react-ui/src/views/novel/ManuscriptEditor.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(workbench, /jumpToGateIssue/);
  assert.match(workbench, /octosage:jump-inline-issue/);
  assert.match(workbench, /octo-gate-failure-chip/);
  assert.match(editor, /octosage:jump-inline-issue/);
  assert.match(editor, /data-inline-issue/);
  assert.match(editor, /scrollIntoView/);
  assert.match(css, /\.octo-gate-failure-chip/);
  assert.match(css, /\.octo-inline-jump/);
});
