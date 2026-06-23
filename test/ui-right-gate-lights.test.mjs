import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("right publish gate panel is a compact status light rail", async () => {
  const source = await readFile("pixso-react-ui/src/views/novel/QualityPanels.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  const panelSource = source.slice(source.indexOf("export const QualityPublishPanel"));
  assert.match(panelSource, /<OctoGateLights/);
  assert.match(panelSource, /compact-status-lights/);
  assert.doesNotMatch(panelSource, /<QualityScoreChart/);
  assert.doesNotMatch(panelSource, /<LightDot/g);

  const lightsBlock = css.match(/\.octo-ui-gate-lights\.compact-status-lights\s*\{[\s\S]*?\n\s*\}/)?.[0] || "";
  const dotBlock = css.match(/\.compact-status-lights\s+\.octo-ui-gate-light\s*\{[\s\S]*?\n\s*\}/)?.[0] || "";
  const labelBlock = css.match(/\.compact-status-lights\s+\.octo-ui-gate-light b\s*\{[\s\S]*?\n\s*\}/)?.[0] || "";

  assert.match(lightsBlock, /display:\s*flex/);
  assert.match(lightsBlock, /flex-direction:\s*column/);
  assert.match(lightsBlock, /align-items:\s*center/);
  assert.doesNotMatch(lightsBlock, /grid-template-columns:\s*1fr/);
  assert.match(dotBlock, /width:\s*14px/);
  assert.match(dotBlock, /height:\s*14px/);
  assert.match(labelBlock, /display:\s*none/);
});
