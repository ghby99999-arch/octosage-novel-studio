import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = "pixso-react-ui/src/components/octo-ui";

test("octo-ui exposes reusable production OS components", () => {
  const expected = [
    "OctoButton.tsx",
    "OctoPanel.tsx",
    "OctoBookCard.tsx",
    "OctoFileTree.tsx",
    "OctoGateLights.tsx",
    "OctoProgressFlow.tsx",
    "OctoCommandInput.tsx",
    "OctoMetricCard.tsx",
    "index.ts",
  ];

  for (const file of expected) {
    assert.equal(existsSync(`${root}/${file}`), true, `${file} should exist`);
  }
});

test("book shelf uses octo-ui instead of raw base controls for book cards", () => {
  const source = readFileSync("pixso-react-ui/src/views/novel/BookCard.tsx", "utf8");

  assert.match(source, /@\/components\/octo-ui/);
  assert.match(source, /<OctoBookCard/);
  assert.match(source, /<OctoButton/);
});

test("octo-ui has a single cockpit component stylesheet contract", () => {
  const css = readFileSync("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(css, /Octo UI component system/);
  assert.match(css, /\.octo-ui-panel/);
  assert.match(css, /\.octo-ui-button/);
  assert.match(css, /\.octo-ui-book-card/);
  assert.match(css, /\.octo-ui-command-input/);
  assert.match(css, /\.octo-ui-file-tree/);
  assert.match(css, /\.octo-ui-progress-flow/);
});
