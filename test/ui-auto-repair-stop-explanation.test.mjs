import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("manuscript gate strip explains why auto repair stopped and what to do next", async () => {
  const source = await readFile("pixso-react-ui/src/views/NovelPages.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(source, /const stopRecoveryText/);
  assert.match(source, /targeted_repair_exhausted:\s*"下一步：重写本章或继续定点修"/);
  assert.match(source, /degraded_on_rewrite:\s*"下一步：已回退稳定版，建议重写本章"/);
  assert.match(source, /reviewer_invalid:\s*"下一步：检查审查员连接后重新质检"/);
  assert.match(source, /stopAction/);
  assert.match(source, /className="octo-gate-stop-action"/);
  assert.match(source, /\{gateStrip\.stopAction\}/);

  assert.match(css, /\.octo-gate-stop-action/);
  assert.match(css, /grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto auto/);
});
