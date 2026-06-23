import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");
const reference = readFileSync("pixso-react-ui/src/views/ReferencePages.tsx", "utf8");
const settings = readFileSync("pixso-react-ui/src/views/SystemPages.tsx", "utf8");
const novel = readFileSync("pixso-react-ui/src/views/NovelPages.tsx", "utf8");
const comic = readFileSync("pixso-react-ui/src/views/ComicPages.tsx", "utf8");

test("all major pages opt into the same cinematic spatial shell", () => {
  assert.match(reference, /octo-reference-page octo-spatial-scene/);
  assert.match(reference, /octo-reference-panel octo-hologlass/);
  assert.match(settings, /octo-settings-grid compact octo-spatial-scene/);
  assert.match(settings, /octo-settings-block octo-settings-primary octo-hologlass/);
  assert.match(novel, /octo-editor octo-production-stage octo-hologlass/);
  assert.match(comic, /octo-bookshelf compact octo-spatial-scene/);
});

test("spatial system removes hard boxed chrome from common surfaces", () => {
  assert.match(css, /\.octo-reference-panel,\s*\.octo-settings-block,\s*\.octo-comic-create,\s*\.octo-import-box/);
  assert.match(css, /background:\s*var\(--octo-hologlass\)/);
  assert.match(css, /border-radius:\s*var\(--octo-radius-shell\)/);
  assert.match(css, /box-shadow:[\s\S]*var\(--octo-glass-edge\)/);
  assert.match(css, /transition:[\s\S]*var\(--octo-motion-premium\)/);
});

test("manuscript stage is treated as an embedded monitor surface", () => {
  assert.match(css, /\.octo-production-stage\.octo-hologlass/);
  assert.match(css, /transform:\s*translateZ\(20px\)/);
  assert.match(css, /border-radius:\s*28px/);
  assert.match(css, /linear-gradient\(135deg,\s*rgba\(255,255,255,0\.18\)/);
});
