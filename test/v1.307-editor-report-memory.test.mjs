import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createLocalServer } from "../src/server.mjs";
import { createProject } from "../src/core/workflow.mjs";
import {
  chapterCardFile,
  chapterQualityCheckpointFile,
  exportFile,
  qualityReportFile,
  reviewFile,
  stateCandidatesFile,
} from "../src/core/paths.mjs";

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value, "utf8");
}

async function startTestServer(options = {}) {
  const app = createLocalServer(options);
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const { port } = app.server.address();
  return {
    ...app,
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => {
        app.server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

test("editor report and memory APIs surface real chapter artifacts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octosage-editor-report-"));
  const project = await createProject({
    root,
    title: "自动编辑测试书",
    idea: "重生回大学做校园配送",
    platform: "fanqie",
    genre: "urban",
  });

  await writeJson(chapterCardFile(project, 1), {
    chapter_no: 1,
    title: "第一单",
    goal: "主角发现校园配送机会",
  });
  await writeText(
    exportFile(project, 1),
    "第一章 第一单\n\n陆川站在食堂门口，看见长队绕过两道弯。他知道第一笔钱就在抱怨里。",
  );
  await writeJson(reviewFile(project, 1), {
    grade: "B",
    scores: { opening_hook: 82, cool_point: 76, pacing: 80, tail_hook: 84 },
    issues: ["中段对话还可以更利落"],
    keep: ["商业机会清晰"],
  });
  await writeJson(qualityReportFile(project, 1), {
    status: "approved",
    final_grade: "B",
    final_version: "v1",
    rewrite_count: 1,
    export_path: exportFile(project, 1),
    publish_gate: { publish_ready: true, label: "可发布" },
    model_calls: [
      { task_type: "write_chapter", provider: "wenxin", model: "ernie-5.1", duration_ms: 12000 },
      { task_type: "review_chapter", provider: "qwen", model: "qwen3.6-plus", duration_ms: 6000 },
    ],
    quality_metrics: {
      retention_prediction: { score: 84 },
      tail_hook_score: { score: 80 },
    },
  });
  await writeJson(stateCandidatesFile(project, 1), {
    characters: [{ name: "陆川", fact: "重生回大学，决定从校园配送起步" }],
    business_state: [{ name: "校园配送", fact: "第一批需求来自食堂排队学生" }],
    foreshadowing_added: [{ name: "老周", fact: "后续可能成为供货线入口" }],
    timeline: [{ fact: "2016 年秋，主角回到大学报道日" }],
    risks: [{ fact: "重复描写排队会拖慢节奏" }],
    meta: { created_at: "2026-05-25T00:00:00.000Z" },
  });
  await writeJson(chapterQualityCheckpointFile(project, 1), {
    status: "completed",
    last_step: "export",
  });

  const app = await startTestServer();
  try {
    const query = `project=${encodeURIComponent(project.path)}&chapter_no=1`;
    const reportResponse = await fetch(`${app.baseUrl}/api/chapter/editor-report?${query}`);
    const report = await reportResponse.json();

    assert.equal(reportResponse.status, 200);
    assert.equal(report.status, "approved");
    assert.equal(report.final_grade, "B");
    assert.equal(report.rewrite_count, 1);
    assert.equal(report.memory_sync.status, "synced");
    assert.equal(report.memory_sync.characters[0].name, "陆川");
    assert.ok(report.pipeline.some((step) => step.key === "memory" && step.status === "done"));
    assert.ok(report.model_calls.some((call) => call.model === "ernie-5.1"));
    assert.ok(report.auto_rules.every((rule) => rule.ok));

    const memoryResponse = await fetch(`${app.baseUrl}/api/project/memory?project=${encodeURIComponent(project.path)}`);
    const memory = await memoryResponse.json();

    assert.equal(memoryResponse.status, 200);
    assert.equal(memory.status, "ready");
    assert.equal(memory.completed_chapters, 1);
    assert.equal(memory.summary.characters, 1);
    assert.equal(memory.summary.foreshadowing_open, 1);
    assert.match(memory.characters[0].text, /陆川|重生/);
    assert.match(memory.timeline[0].text, /2016/);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("editor report normalizes stale stopped state when publish gate passed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octosage-editor-report-stale-stop-"));
  const project = await createProject({
    root,
    title: "stale stopped report",
    idea: "rebirth campus business",
    platform: "fanqie",
    genre: "urban",
  });

  await writeText(exportFile(project, 1), "Chapter 1\n\nLu Chuan fixes a real merchant delivery problem with account books and signed orders.");
  await writeJson(reviewFile(project, 1), {
    grade: "D",
    issues: ["style advice should not become a red blocker after publish gate passed"],
    publish_gate: { publish_ready: true, label: "ready", blockers: [] },
  });
  await writeJson(qualityReportFile(project, 1), {
    status: "stopped",
    final_grade: "B",
    final_version: "v1",
    rewrite_count: 2,
    stop: {
      reason: "max_rewrites_exhausted",
      blockers: ["stale_blocker"],
    },
    failure_summary: {
      title: "old failure",
      reasons: ["stale reason"],
    },
    export_path: exportFile(project, 1),
    publish_gate: { publish_ready: true, label: "ready", blockers: [] },
  });

  const app = await startTestServer();
  try {
    const query = `project=${encodeURIComponent(project.path)}&chapter_no=1`;
    const reportResponse = await fetch(`${app.baseUrl}/api/chapter/editor-report?${query}`);
    const report = await reportResponse.json();

    assert.equal(reportResponse.status, 200);
    assert.equal(report.status, "approved");
    assert.equal(report.publish_ready, true);
    assert.equal(report.publish_gate.publish_ready, true);
    assert.equal(report.stop, null);
    assert.equal(report.failure_summary, null);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("chapter APIs prefer newer review and draft over stale stopped quality report", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octosage-editor-report-newer-review-"));
  const project = await createProject({
    root,
    title: "newer review wins",
    idea: "rebirth campus delivery business",
    platform: "fanqie",
    genre: "urban",
  });

  await writeText(
    path.join(project.path, "正文", "第0001章_v3.txt"),
    "Chapter 1\n\nOld broken draft. 第一单还没跑。",
  );
  await writeJson(qualityReportFile(project, 1), {
    status: "stopped",
    final_grade: "D",
    final_version: "v3",
    rewrite_count: 6,
    stop: { reason: "targeted_repair_exhausted", blockers: ["stale_blocker"] },
    failure_summary: { title: "old failure", reasons: ["stale reason"] },
    publish_gate: {
      publish_ready: false,
      label: "需自动优化",
      blockers: ["stale_blocker"],
    },
    review: {
      grade: "D",
      issues: ["old contradiction"],
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await writeText(
    path.join(project.path, "正文", "第0001章_v9.txt"),
    "Chapter 1\n\nNew repaired draft with account book, signed order, cash settlement, and merchant reaction.",
  );
  await writeJson(reviewFile(project, 1), {
    grade: "B",
    issues: ["minor name mismatch"],
    publish_gate: false,
  });

  const app = await startTestServer();
  try {
    const query = `project=${encodeURIComponent(project.path)}&chapter_no=1`;
    const chapterResponse = await fetch(`${app.baseUrl}/api/chapter?${query}`);
    const chapter = await chapterResponse.json();
    const reviewResponse = await fetch(`${app.baseUrl}/api/chapter/review?${query}`);
    const review = await reviewResponse.json();
    const reportResponse = await fetch(`${app.baseUrl}/api/chapter/editor-report?${query}`);
    const report = await reportResponse.json();

    assert.equal(chapterResponse.status, 200);
    assert.equal(chapter.grade, "B");
    assert.equal(chapter.status, "ready");
    assert.match(chapter.path, /v9\.txt$/);
    assert.doesNotMatch(chapter.text, /第一单还没跑/);

    assert.equal(reviewResponse.status, 200);
    assert.equal(review.grade, "B");
    assert.equal(review.publish_gate.publish_ready, false);
    assert.equal(review.publish_gate.label, "需自动优化");
    assert.deepEqual(review.publish_gate.blockers, ["minor name mismatch"]);

    assert.equal(reportResponse.status, 200);
    assert.equal(report.final_grade, "B");
    assert.equal(report.final_version, "v9");
    assert.equal(report.status, "approved");
    assert.equal(report.stop, null);
    assert.equal(report.failure_summary, null);
    assert.deepEqual(report.publish_gate.blockers, ["minor name mismatch"]);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("review-now uses latest draft instead of stale quality report version", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octosage-review-now-latest-"));
  const project = await createProject({
    root,
    title: "review now latest draft",
    idea: "rebirth campus delivery business",
    platform: "fanqie",
    genre: "urban",
  });

  await writeText(path.join(project.path, "正文", "第0001章_v3.txt"), "old draft");
  await writeJson(qualityReportFile(project, 1), {
    status: "stopped",
    final_grade: "D",
    final_version: "v3",
    publish_gate: { publish_ready: false, blockers: ["old"] },
  });
  await writeText(path.join(project.path, "正文", "第0001章_v9.txt"), "new draft with visible action proof");

  const app = await startTestServer();
  try {
    const response = await fetch(`${app.baseUrl}/api/chapter/review-now`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, chapter_no: 1, allow_mock: true }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.version, "v9");
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("chapter APIs read legacy three digit chapter files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octosage-legacy-chapter-"));
  const project = await createProject({
    root,
    title: "旧项目兼容测试书",
    idea: "旧版项目已经生成过三位编号章节",
    platform: "fanqie",
    genre: "urban",
  });

  await writeText(path.join(project.path, "导出", "旧项目兼容测试书_第001章.txt"), "旧版第一章\n\n这里是真实旧正文。");
  await writeJson(path.join(project.path, "审稿", "第001章_review.json"), {
    grade: "B",
    scores: { opening_hook: 80 },
  });
  await writeJson(path.join(project.path, "章节卡", "第001章.json"), {
    title: "旧版第一章",
  });

  const app = await startTestServer();
  try {
    const projectQuery = encodeURIComponent(project.path);
    const chaptersResponse = await fetch(`${app.baseUrl}/api/chapters?project=${projectQuery}`);
    const chapters = await chaptersResponse.json();
    assert.equal(chaptersResponse.status, 200);
    assert.equal(chapters.latest_completed_chapter, 1);
    assert.equal(chapters.chapters[0].status, "ready");
    assert.equal(chapters.chapters[0].grade, "B");

    const chapterResponse = await fetch(`${app.baseUrl}/api/chapter?project=${projectQuery}&chapter_no=1`);
    const chapter = await chapterResponse.json();
    assert.equal(chapterResponse.status, 200);
    assert.equal(chapter.status, "ready");
    assert.equal(chapter.grade, "B");
    assert.match(chapter.text, /真实旧正文/);
    assert.match(chapter.path, /第001章/);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
