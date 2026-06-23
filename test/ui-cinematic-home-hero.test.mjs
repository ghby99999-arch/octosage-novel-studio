import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("home page uses generated cinematic image and one central creation command", async () => {
  const source = await readFile("pixso-react-ui/src/views/novel/NovelBookshelf.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(source, /className="octo-home-stage cinematic"/);
  assert.match(source, /className="octo-home-command-form"/);
  assert.match(source, /onSubmit=\{\(event\) => \{/);
  assert.match(css, /octosage-home-cinematic\.png/);
  assert.match(css, /\.octo-home-stage\.cinematic \{[\s\S]*background:[\s\S]*url\("@\/assets\/images\/octosage-home-cinematic\.png"\)/);
  assert.match(css, /\.octo-home-command-form \{/);
});
