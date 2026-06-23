import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("chapter-card prompt asks models for story-room execution fields", async () => {
  const source = await readFile(new URL("../src/core/model-router.mjs", import.meta.url), "utf8");
  for (const field of ["public_feedback", "cost_residue", "relationship_shift", "chapter_debt"]) {
    assert.match(source, new RegExp(field), `missing ${field} in chapter-card prompt contract`);
  }
  assert.match(source, /本章结果被谁看见/);
  assert.match(source, /胜利留下的成本/);
  assert.match(source, /人物关系如何变化/);
  assert.match(source, /下一章的人、物、凭证、消息或规则压力/);
});
