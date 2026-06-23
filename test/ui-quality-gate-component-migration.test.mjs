import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

test("right quality rail uses shared octo gate lights component", async () => {
  const source = await readFile("pixso-react-ui/src/views/novel/QualityPanels.tsx", "utf8");
  const panelSource = source.slice(source.indexOf("export const QualityPublishPanel"));

  assert.match(source, /OctoGateLights/);
  assert.match(source, /type OctoGateLight/);
  assert.match(panelSource, /<OctoGateLights/);
  assert.doesNotMatch(source, /const LightDot =/);
  assert.doesNotMatch(panelSource, /<LightDot/);
  assert.doesNotMatch(panelSource, /className="octo-gate-lights"/);
});

test("octo gate lights support compact rail metadata", async () => {
  const source = await readFile("pixso-react-ui/src/components/octo-ui/OctoGateLights.tsx", "utf8");

  assert.match(source, /title\?: string/);
  assert.match(source, /className\?: string/);
  assert.match(source, /aria-label/);
});
