import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

test("new book widgets use octo-ui controls for repeated interactive pieces", async () => {
  const widgets = await readFile("pixso-react-ui/src/views/novel/NewBookWidgets.tsx", "utf8");

  assert.match(widgets, /from "@\/components\/octo-ui"/);
  assert.match(widgets, /OctoButton/);
  assert.match(widgets, /OctoPanel/);
  assert.match(widgets, /OctoCommandInput/);
  assert.doesNotMatch(widgets, /import \{ Button \} from "@\/components\/ui\/Button"/);
  assert.doesNotMatch(widgets, /import \{ Card \} from "@\/components\/ui\/Card"/);
});

test("new book modal uses shared progress flow for creation pipeline", async () => {
  const modal = await readFile("pixso-react-ui/src/views/novel/NewBookModalUnified.tsx", "utf8");

  assert.match(modal, /OctoProgressFlow/);
  assert.match(modal, /from "@\/components\/octo-ui"/);
  assert.doesNotMatch(modal, /StepRail/);
});
