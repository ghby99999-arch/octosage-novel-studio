import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

test("page shell assigns module background classes", async () => {
  const source = await readFile("pixso-react-ui/src/views/PixsoAppShell.tsx", "utf8");

  assert.match(source, /const pageSurface = /);
  assert.match(source, /octo-page-novel/);
  assert.match(source, /octo-page-comic/);
  assert.match(source, /className=\{\`scroll-container \$\{pageSurface\}`\}/);
});

test("novel and comic modules use distinct generated full-screen backgrounds", async () => {
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  await access("pixso-react-ui/src/assets/images/octosage-novel-studio-bg.png");
  await access("pixso-react-ui/src/assets/images/octosage-comic-studio-bg.png");
  assert.match(css, /octosage-novel-studio-bg\.png/);
  assert.match(css, /octosage-comic-studio-bg\.png/);
  assert.match(css, /\.scroll-container\.octo-page-novel::before \{/);
  assert.match(css, /\.scroll-container\.octo-page-comic::before \{/);
  assert.match(css, /background-size:\s*cover/);
  assert.match(css, /position:\s*fixed/);
});
