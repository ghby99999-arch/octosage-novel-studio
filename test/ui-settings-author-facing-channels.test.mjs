import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("settings shows author-facing channels instead of raw model names", async () => {
  const source = await readFile("pixso-react-ui/src/views/SystemPages.tsx", "utf8");

  assert.match(source, /title: "正文写作通道"/);
  assert.match(source, /title: "严格审查通道"/);
  assert.match(source, /title: "结构规划通道"/);
  assert.match(source, /title: "对白润色通道"/);
  assert.doesNotMatch(source, /<span>\{provider\.model\}<\/span>/);
  assert.match(source, /<span>连接验证<\/span>/);
});
