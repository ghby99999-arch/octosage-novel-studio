import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("novel workbench passes editor-report gate blockers into manuscript annotations", async () => {
  const source = await readFile("pixso-react-ui/src/views/NovelPages.tsx", "utf8");

  assert.match(source, /editorAnnotationReview/);
  assert.match(source, /failure_summary\?\.reasons/);
  assert.match(source, /publish_gate:\s*gate/);
  assert.match(source, /<ManuscriptEditor value=\{draft\} review=\{editorAnnotationReview\}/);
});
