import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("right rail only shows compact gate lights and a tiny status pill", async () => {
  const source = await readFile("pixso-react-ui/src/views/novel/QualityPanels.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");
  const panelSource = source.slice(source.indexOf("export const QualityPublishPanel"));

  assert.match(panelSource, /className="octo-workbench-right compact-status-rail"/);
  assert.match(panelSource, /octo-gate-mini-status/);
  assert.doesNotMatch(panelSource, /<PublishGateReasonStrip/);
  assert.doesNotMatch(panelSource, /<GlobalReviewPanel/);

  const workbenchBlock = css.match(/\.octo-workbench\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const railBlock = css.match(/\.octo-workbench-right\.compact-status-rail\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const statusBlock = css.match(/\.octo-gate-mini-status\s*\{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(workbenchBlock, /grid-template-columns:\s*176px minmax\(0,\s*1fr\) 56px/);
  assert.match(railBlock, /align-items:\s*center/);
  assert.match(railBlock, /padding-top:\s*6px/);
  assert.match(statusBlock, /writing-mode:\s*vertical-rl/);
  assert.match(statusBlock, /max-height:\s*96px/);
});
