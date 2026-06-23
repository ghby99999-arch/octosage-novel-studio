import test from "node:test";
import assert from "node:assert/strict";

import {
  repairPresetForIssue,
  repairQueueSummaryFromPremiumReport,
  webnovelRepairPresets,
} from "../src/core/workflow.mjs";

test("v1.261 repair presets expose six ordinary-language polish actions", () => {
  const presets = webnovelRepairPresets();

  assert.deepEqual(
    presets.map((preset) => preset.label),
    ["去AI味", "加强爽点", "收紧节奏", "丰富感官", "打磨对话", "章尾钩子强化"],
  );
  assert.ok(presets.every((preset) => Array.isArray(preset.rewrite_layers)));
  assert.ok(presets.every((preset) => preset.user_facing === true));
});

test("v1.262 repair preset matcher maps technical issues to user-friendly actions", () => {
  assert.equal(repairPresetForIssue({ metric: "drop_risk_segments", issue: "drop_risk_segments" }).label, "收紧节奏");
  assert.equal(repairPresetForIssue({ metric: "tail_hook_score", issue: "tail_hook_weak" }).label, "章尾钩子强化");
  assert.equal(repairPresetForIssue({ metric: "coolpoint_delivered", issue: "coolpoint_missing" }).label, "加强爽点");
  assert.equal(repairPresetForIssue({ metric: "character_voice_consistency", issue: "dialogue_generic" }).label, "打磨对话");
});

test("v1.263 repair queue summary carries preset guidance without exposing technical buttons", () => {
  const summary = repairQueueSummaryFromPremiumReport({
    project_reports: [
      {
        title: "book-a",
        project_path: "A",
        premium_readiness: {
          repair_queue: [
            { chapter_no: 7, metric: "tail_hook_score", issue: "tail_hook_weak", value: 42 },
            { chapter_no: 8, metric: "character_voice_consistency", issue: "dialogue_generic", value: 45 },
          ],
        },
      },
    ],
  });

  assert.equal(summary.priority_order[0].repair_action.preset.label, "章尾钩子强化");
  assert.equal(summary.priority_order[1].repair_action.preset.label, "打磨对话");
  assert.equal(summary.by_preset["章尾钩子强化"].count, 1);
  assert.equal(summary.by_preset["打磨对话"].chapters[0], 8);
});
