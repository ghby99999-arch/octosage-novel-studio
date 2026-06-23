import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

test("settings page uses octo components for panels and actions", async () => {
  const source = await readFile("pixso-react-ui/src/views/SystemPages.tsx", "utf8");

  assert.match(source, /from "@\/components\/octo-ui"/);
  assert.match(source, /OctoButton/);
  assert.match(source, /OctoPanel/);
  assert.doesNotMatch(source, /<button/);
  assert.doesNotMatch(source, /className="octo-settings-block octo-settings-primary octo-hologlass"/);
});
