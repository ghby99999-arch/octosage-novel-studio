import test from "node:test";
import assert from "node:assert/strict";

import { summarizeQualitySignals } from "../scripts/run-rebirth-35-check.mjs";

test("publish-ready chapters keep review issues as suggestions, not blockers", () => {
  const summary = summarizeQualitySignals({
    gate: { publish_ready: true, blockers: [] },
    editor: { publish_ready: true, failure_summary: { reasons: [] } },
    review: {
      issues: ["dialogue rhythm can be sharper", "merchant detail can be stronger"],
      risky_segments: [{ reason: "paragraph_rhythm_single_note" }],
    },
    chapter: { publish_ready: true },
  });

  assert.equal(summary.publish_ready, true);
  assert.deepEqual(summary.blockers, []);
  assert.deepEqual(summary.quality_suggestions, [
    "dialogue rhythm can be sharper",
    "merchant detail can be stronger",
    "paragraph_rhythm_single_note",
  ]);
});

test("blocked chapters still surface review issues as blockers", () => {
  const summary = summarizeQualitySignals({
    gate: { publish_ready: false, blockers: ["opening_not_action_first"] },
    review: { issues: ["ai_taste_below_publish"] },
  });

  assert.equal(summary.publish_ready, false);
  assert.deepEqual(summary.blockers, ["opening_not_action_first", "ai_taste_below_publish"]);
  assert.deepEqual(summary.quality_suggestions, []);
});
