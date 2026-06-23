import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const shell = readFileSync("pixso-react-ui/src/views/PixsoAppShell.tsx", "utf8");
const bookshelf = readFileSync("pixso-react-ui/src/views/novel/NovelBookshelf.tsx", "utf8");
const comic = readFileSync("pixso-react-ui/src/views/ComicPages.tsx", "utf8");
const css = readFileSync("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

test("real app shell uses the spatial scene layer instead of leaving it as unused CSS", () => {
  assert.match(shell, /className=\{`octo-main octo-spatial-scene/);
  assert.match(css, /\.octo-main\.octo-spatial-scene/);
  assert.match(css, /\.octo-main\.octo-spatial-scene\s*>\s*\*/);
});

test("home command surface and CTA use hologlass and orb controls", () => {
  assert.match(bookshelf, /octo-home-stage cinematic octo-spatial-scene/);
  assert.match(bookshelf, /octo-home-command-form octo-hologlass/);
  assert.match(bookshelf, /octo-control-orb/);
});

test("library and comic entry pages share the same spatial surface language", () => {
  assert.match(bookshelf, /octo-library-page octo-spatial-scene/);
  assert.match(bookshelf, /octo-library-head compact octo-hologlass/);
  assert.match(comic, /octo-page-head octo-hologlass/);
  assert.match(comic, /octo-source-switch octo-hologlass/);
});
