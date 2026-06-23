import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  analyzeCoolpointDelivered,
  buildChapterQualityMetrics,
  detectTemplateOpeningInertia,
  analyzeMicroHookDensity,
  createProject,
  predictRetention,
  runSingleChapterQualityLoop,
} from "../src/core/workflow.mjs";
import { readJson } from "../src/core/fsx.mjs";

function card() {
  return {
    opening_hook: "The first backend order jumps before Zhou can finish cursing.",
    main_event: "Lu Chuan uses visible order data to reverse Zhou's misjudgment.",
    protagonist_action: "He pushes the order sheet across the counter.",
    conflict: "Zhou thinks students only make noise.",
    cool_point_type: "misjudgment_payoff",
    visible_result: "The backend count jumps from 0 to 99.",
    tail_hook: "Zhou 后台订单数字突然跳到 99，创业中心老师电话同时打进来。",
  };
}

async function createTempProject(prefix = "novel-studio-v116-quality-metrics-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.16 quality metrics",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("v1.16 analyzeMicroHookDensity counts mobile-screen hooks without rewarding flat filler", () => {
  const hooked = [
    "Zhou was about to curse, but the backend beeped and the order count jumped from 0 to 7.",
    "\"Who paid?\" he asked. Lu Chuan only pushed the paper closer.",
    "The queue suddenly stopped laughing because the next notification rang before Zhou touched the screen.",
  ].join("\n\n");
  const flat = [
    "Lu Chuan understood the business model. The market had value and the future would prove it.",
    "This meant students were traffic. Merchants needed traffic. The route had strategic meaning.",
    "He knew this was an opportunity and he needed to keep thinking about the platform.",
  ].join("\n\n");

  const strong = analyzeMicroHookDensity(hooked, { blockSize: 120 });
  const weak = analyzeMicroHookDensity(flat, { blockSize: 120 });

  assert.ok(strong.density >= 0.9);
  assert.equal(strong.issues.includes("micro_hook_density_low"), false);
  assert.ok(weak.density < 0.6);
  assert.ok(weak.issues.includes("micro_hook_density_low"));
});

test("v1.16 analyzeCoolpointDelivered requires event payoff and visible result", () => {
  const delivered = analyzeCoolpointDelivered(
    "Zhou thought the students were joking. The backend count jumped from 0 to 99, and the queue outside stopped laughing. Zhou refreshed the screen twice before saying a word.",
    card(),
  );
  const announced = analyzeCoolpointDelivered(
    "Lu Chuan knew this was a misjudgment payoff. He understood the route had business value. This proved his strategy.",
    card(),
  );

  assert.equal(delivered.effective_count, 1);
  assert.equal(delivered.grade, "B");
  assert.equal(delivered.issues.includes("coolpoint_not_delivered"), false);
  assert.equal(announced.effective_count, 0);
  assert.equal(announced.grade, "C");
  assert.ok(announced.issues.includes("coolpoint_not_delivered"));
});

test("v1.16 predictRetention combines hook strength, payoff, and drop risk into calibrated score", () => {
  const prediction = predictRetention({
    tail_hook_score: { score: 90 },
    coolpoint_delivered: { effective_count: 2 },
    drop_risk_segments: { risky_segment_count: 0, total_segments: 6 },
    micro_hook_density: { density: 1.2 },
  });
  const weak = predictRetention({
    tail_hook_score: { score: 35 },
    coolpoint_delivered: { effective_count: 0 },
    drop_risk_segments: { risky_segment_count: 6, total_segments: 6 },
    micro_hook_density: { density: 0 },
  });

  assert.ok(prediction.score >= 80);
  assert.equal(prediction.band, "premium");
  assert.ok(weak.score < 40);
  assert.equal(weak.band, "eliminate");
});

test("v1.16 Chinese quality metrics recognize real webnovel hooks and reject explanation-only prose", async () => {
  const { root, project } = await createTempProject("novel-studio-v116-cn-quality-");
  try {
    const strongText = [
      "老周刚把烤串翻面，手机后台先响了一声。",
      "",
      "屏幕上的订单数从三跳到二十一。",
      "",
      "排队的学生突然安静下来。",
      "",
      "赵鹏低头看着表格，半天才问：\"这是谁付的钱？\"",
      "",
      "陆川把二维码推过去，没解释，只点开下一页。",
      "",
      "隔壁奶茶店老板站在门口，忽然问了一句：\"这个入口，能不能也给我一个？\"",
    ].join("\n");
    const weakText = [
      "陆川知道校园外卖拥有巨大的商业价值。",
      "",
      "这意味着学生是流量，商户需要流量，平台竞争会在未来几年爆发。",
      "",
      "他意识到这是一个机会，也明白自己必须把握时代趋势。",
      "",
      "从商业模式上看，这件事的核心是用户心智和长期价值。",
    ].join("\n");

    const strong = await buildChapterQualityMetrics(project, 1, card(), strongText);
    const weak = await buildChapterQualityMetrics(project, 1, card(), weakText);

    assert.ok(strong.micro_hook_density.density >= 0.6);
    assert.ok(strong.coolpoint_delivered.effective_count >= 1);
    assert.ok(strong.tail_hook_score.score >= 3);
    assert.equal(strong.drop_risk_segments.risky_segment_count, 0);
    assert.ok(weak.ai_taste_score.score < 78);
    assert.ok(weak.drop_risk_segments.risky_segment_count > 0);
    assert.equal(weak.publish_gate?.publish_ready, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.16 Chinese template opening repeat is a hard rewrite trigger", () => {
  const hits = detectTemplateOpeningInertia("张明轩刚要骂人，后台数字先跳了出来。");
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].issue, "template_opening_inertia");
});

test("v1.16 single-chapter quality report stores hook, coolpoint, drop-risk, and retention metrics", async () => {
  const { root, project } = await createTempProject();
  try {
    const result = await runSingleChapterQualityLoop(project, 1, { maxRewrites: 1 });
    const report = await readJson(result.quality_report_path);

    assert.ok(report.quality_metrics);
    assert.ok(Number.isFinite(report.quality_metrics.micro_hook_density.density));
    assert.ok(Number.isInteger(report.quality_metrics.coolpoint_delivered.effective_count));
    assert.ok(Number.isInteger(report.quality_metrics.drop_risk_segments.risky_segment_count));
    assert.ok(Number.isInteger(report.quality_metrics.retention_prediction.score));
    assert.match(report.quality_metrics.retention_prediction.band, /eliminate|risk|pass|premium/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
