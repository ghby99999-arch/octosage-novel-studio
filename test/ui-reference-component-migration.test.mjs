import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

test("reference center uses octo components for panels, actions, and process flow", async () => {
  const source = await readFile("pixso-react-ui/src/views/ReferencePages.tsx", "utf8");

  assert.match(source, /from "@\/components\/octo-ui"/);
  assert.match(source, /OctoButton/);
  assert.match(source, /OctoPanel/);
  assert.match(source, /OctoProgressFlow/);
  assert.doesNotMatch(source, /<button/);
  assert.doesNotMatch(source, /className="octo-reference-panel octo-hologlass"/);
});
