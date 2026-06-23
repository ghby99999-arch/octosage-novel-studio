import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

test("Radium-style effects are implemented as spatial layers, not flat decoration", () => {
  assert.match(css, /--octo-spatial-perspective/);
  assert.match(css, /--octo-hologlass/);
  assert.match(css, /--octo-lens-highlight/);
  assert.match(css, /--octo-depth-fog/);
  assert.match(css, /\.octo-spatial-scene/);
  assert.match(css, /\.octo-spatial-scene::before/);
  assert.match(css, /\.octo-spatial-scene::after/);
});

test("spatial surfaces use perspective, refraction, and physical depth cues", () => {
  assert.match(css, /perspective:\s*var\(--octo-spatial-perspective\)/);
  assert.match(css, /transform-style:\s*preserve-3d/);
  assert.match(css, /backdrop-filter:\s*blur/);
  assert.match(css, /mix-blend-mode:\s*screen/);
  assert.match(css, /box-shadow:[\s\S]*inset 0 1px 0 rgba\(255,255,255,/);
});

test("primary controls feel like luminous equipment with nested inner light", () => {
  assert.match(css, /\.octo-control-orb/);
  assert.match(css, /\.octo-control-orb::before/);
  assert.match(css, /\.octo-control-orb::after/);
  assert.match(css, /transform:\s*translateZ/);
  assert.match(css, /transition:[\s\S]*var\(--octo-motion-premium\)/);
});
