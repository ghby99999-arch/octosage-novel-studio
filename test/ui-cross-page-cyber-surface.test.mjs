import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("comic and settings pages share the premium cyber surface language", async () => {
  const comicSource = await readFile("pixso-react-ui/src/views/ComicPages.tsx", "utf8");
  const settingsSource = await readFile("pixso-react-ui/src/views/SystemPages.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(comicSource, /className="octo-source-switch"/);
  assert.match(comicSource, /className="octo-comic-create"/);
  assert.match(comicSource, /className="octo-import-box"/);
  assert.match(settingsSource, /className="octo-settings-grid compact"/);
  assert.match(settingsSource, /className="octo-provider-grid"/);

  assert.match(css, /\.octo-source-switch,/);
  assert.match(css, /\.octo-comic-create,/);
  assert.match(css, /\.octo-import-box,/);
  assert.match(css, /\.octo-settings-block,/);
  assert.match(css, /\.octo-provider-card \{/);
  assert.match(css, /linear-gradient\(145deg, rgba\(18, 23, 39, 0\.76\), rgba\(8, 12, 25, 0\.62\)\)/);
  assert.match(css, /border: 1px solid rgba\(178, 155, 255, 0\.16\)/);
});
