import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("planning progress is compact and does not steal manuscript space", async () => {
  const source = await readFile("pixso-react-ui/src/views/NovelPages.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(source, /className="octo-center-artifact planning-live compact"/);
  assert.match(css, /\.octo-center-artifact\.planning-live\.compact \{/);
  assert.match(css, /max-height:\s*168px/);
  assert.match(css, /\.octo-center-artifact\.planning-live\.compact \.octo-planning-live-paper \{/);
  assert.match(css, /display:\s*none/);
});
