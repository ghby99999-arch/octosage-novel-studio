import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("manuscript editor renders visible inline annotation reasons", async () => {
  const source = await readFile("pixso-react-ui/src/views/novel/ManuscriptEditor.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(source, /octo-inline-note/);
  assert.match(source, /token\.label/);
  assert.match(source, /token\.detail/);
  assert.match(source, /aria-label="正文问题批注"/);
  assert.match(css, /\.octo-inline-note/);
});
