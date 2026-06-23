import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("writing progress UI renders targeted repair taxonomy from progress events", async () => {
  const types = await readFile("pixso-react-ui/src/views/novel/types.ts", "utf8");
  const progress = await readFile("pixso-react-ui/src/views/novel/WritingProgress.tsx", "utf8");

  assert.match(types, /repair_taxonomy\??:/);
  assert.match(types, /repair_queue\??:/);
  assert.match(progress, /repairTaxonomy/);
  assert.match(progress, /repairQueue/);
  assert.match(progress, /octo-repair-queue-mini/);
  assert.match(progress, /stage_label/);
  assert.match(progress, /repairToneClass\(repairColor\)/);
});
