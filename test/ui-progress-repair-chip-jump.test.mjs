import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("writing repair chips jump to matching manuscript inline annotations", async () => {
  const source = await readFile("pixso-react-ui/src/views/novel/WritingProgress.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(source, /jumpToInlineIssue/);
  assert.match(source, /octosage:jump-inline-issue/);
  assert.match(source, /className="octo-repair-chip"/);
  assert.match(source, /data-inline-issue-target/);
  assert.match(source, /onClick=\{\(\) => jumpToInlineIssue\(blockerText\(item\)\)\}/);
  assert.doesNotMatch(source, /<span key=\{`\$\{String\(item\)\}-\$\{index\}`\}>\{blockerText\(item\)\}<\/span>/);

  assert.match(css, /\.octo-repair-chip/);
  assert.match(css, /cursor:\s*pointer/);
});
