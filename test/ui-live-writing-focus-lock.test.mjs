import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("live writing keeps the typing cursor centered inside the manuscript paper instead of scrolling the whole app", async () => {
  const source = await readFile("pixso-react-ui/src/views/novel/WritingProgress.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");
  const liveSource = source.slice(source.indexOf("export const WritingLiveWorkspace"));

  assert.match(liveSource, /paperRef/);
  assert.match(liveSource, /lockLiveCursorToCenter/);
  assert.match(liveSource, /paper\.scrollTo/);
  assert.match(liveSource, /ref=\{paperRef\}/);
  assert.doesNotMatch(liveSource, /cursorRef\.current\?\.scrollIntoView/);

  const paperBlock = css.match(/\.octo-live-paper\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const cursorBlock = css.match(/\.octo-type-cursor\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(paperBlock, /overscroll-behavior:\s*contain/);
  assert.match(paperBlock, /scroll-behavior:\s*smooth/);
  assert.match(cursorBlock, /scroll-margin-block:\s*45vh/);
});
