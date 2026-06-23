import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

test("app shell uses shared octo buttons for chrome actions and empty states", async () => {
  const source = await readFile("pixso-react-ui/src/views/PixsoAppShell.tsx", "utf8");

  assert.match(source, /from "@\/components\/octo-ui"/);
  assert.match(source, /OctoButton/);
  assert.doesNotMatch(source, /<button[\s\S]*data-octo-action="chooseWorkspace"/);
  assert.doesNotMatch(source, /<button[\s\S]*data-octo-action=\{action\}/);
});
