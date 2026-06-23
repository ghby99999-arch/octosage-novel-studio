import test from "node:test";
import assert from "node:assert/strict";

import {
  __test_buildRepairQueue,
} from "../src/core/workflow.mjs";

test("repair queue turns publish blockers into ordered actionable repair stages", () => {
  const review = {
    grade: "A",
    publish_gate: {
      publish_ready: false,
      blockers: [
        "review_grade_below_publish",
        "story_room_contract_not_delivered",
        "ai_taste_below_publish",
        "tail_hook_below_publish",
      ],
      values: {
        story_room_contract_missing: ["chapter_debt"],
        ai_taste_score: 70,
        tail_hook_score: 2,
      },
    },
    issues: [
      "coolpoint_density_below_publish",
      "review_grade_below_publish",
    ],
  };

  const queue = __test_buildRepairQueue(review);

  assert.ok(queue.length >= 4);
  assert.equal(queue[0].status, "current");
  assert.equal(queue[0].issue, "story_room_contract_not_delivered");
  assert.equal(queue[0].repair_type, "story_room_contract_repair");
  assert.deepEqual(queue[0].missing_fields, ["chapter_debt"]);
  assert.deepEqual(queue[0].missing_labels, ["章尾债务"]);

  const issues = queue.map((item) => item.issue);
  assert.ok(issues.indexOf("review_grade_below_publish") > issues.indexOf("tail_hook_below_publish"));
  assert.ok(issues.indexOf("review_grade_below_publish") > issues.indexOf("ai_taste_below_publish"));

  for (const item of queue) {
    assert.equal(typeof item.label, "string");
    assert.equal(typeof item.stage_label, "string");
    assert.equal(typeof item.repair_type, "string");
    assert.equal(typeof item.priority, "number");
  }
});

