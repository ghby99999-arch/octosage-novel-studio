import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("writing progress shows concrete missing story-room fields during repair", async () => {
  const source = await readFile("pixso-react-ui/src/views/novel/WritingProgress.tsx", "utf8");

  assert.match(source, /repair_missing_labels/);
  assert.match(source, /repairMissingLabels/);
  assert.match(source, /正在补：\{item\}/);
  assert.match(source, /\[\.\.\.repairMissingLabels,\s*\.\.\.repairIssues/);
});

test("segment patch prompt receives missing story-room fields", async () => {
  const source = await readFile("src/core/model-router.mjs", "utf8");

  assert.match(source, /story_room_missing_fields/);
  assert.match(source, /story_room_missing_labels/);
});
