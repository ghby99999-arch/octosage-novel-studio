import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { serveLocal } from "../src/server.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const argValue = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const item = process.argv.find((arg) => arg.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
};

async function requestJson(baseUrl, route, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();
  let payload = {};
  try {
    if (contentType.includes("text/event-stream")) {
      const block = raw.split(/\r?\n\r?\n/).find((item) => item.split(/\r?\n/).some((line) => line.startsWith("data:")));
      const data = block
        ? block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n")
        : "";
      payload = data ? JSON.parse(data) : {};
    } else {
      payload = raw ? JSON.parse(raw) : {};
    }
  } catch {
    payload = { raw: raw.slice(0, 2000) };
  }
  if (!response.ok) {
    throw new Error(`${method} ${route} failed: ${payload.error || response.statusText}`);
  }
  return payload;
}

async function waitForTask(baseUrl, projectPath, taskId, { timeoutMs = 30 * 60 * 1000 } = {}) {
  const started = Date.now();
  let latest = null;
  while (Date.now() - started < timeoutMs) {
    latest = await requestJson(
      baseUrl,
      `/api/tasks/${encodeURIComponent(taskId)}?project=${encodeURIComponent(projectPath)}`,
    );
    const status = String(latest.status || "");
    const step = latest.progress?.step || latest.progress?.label || latest.result?.status || "";
    process.stdout.write(`\r${status || "running"} ${step}`.slice(0, 120).padEnd(120, " "));
    if (["completed", "stopped", "failed"].includes(status)) {
      process.stdout.write("\n");
      return latest;
    }
    await sleep(1500);
  }
  throw new Error(`task timed out after ${Math.round(timeoutMs / 1000)}s: ${taskId}`);
}

function collectRiskTexts(...sources) {
  const texts = [];
  for (const source of sources) {
    const segments = [
      ...(Array.isArray(source?.risky_segments) ? source.risky_segments : []),
      ...(Array.isArray(source?.risk_segments) ? source.risk_segments : []),
      ...(Array.isArray(source?.review?.risky_segments) ? source.review.risky_segments : []),
    ];
    for (const segment of segments) {
      const text = typeof segment === "string" ? segment : segment?.text;
      if (text) texts.push(String(text).trim());
    }
  }
  return [...new Set(texts.filter(Boolean))];
}

function normalizeGate(gate = null, review = null) {
  if (typeof gate === "boolean") {
    return {
      publish_ready: gate,
      label: gate ? "可发布" : "需自动优化",
      blockers: [],
    };
  }
  const normalized = gate && typeof gate === "object" ? gate : {};
  const blockers = Array.isArray(normalized.blockers)
    ? normalized.blockers
    : Array.isArray(review?.issues)
      ? review.issues
      : [];
  return {
    ...normalized,
    publish_ready: Boolean(normalized.publish_ready),
    label: normalized.label || (normalized.publish_ready ? "可发布" : "需自动优化"),
    blockers,
  };
}

function compactReport({ task, chapter, review, editor, elapsedMs }) {
  const gate = normalizeGate(editor.publish_gate || review.publish_gate || chapter.publish_gate, review);
  const stop = editor.stop || (gate.publish_ready ? null : task.result?.stop) || null;
  const riskTexts = collectRiskTexts(review, editor, task.result);
  const text = String(chapter.text || "");
  const residualRiskTexts = riskTexts.filter((item) => item && text.includes(item));
  return {
    status: task.status,
    elapsed_ms: elapsedMs,
    chapter_no: chapter.chapter_no,
    title: chapter.title,
    text_length: text.length,
    word_count: chapter.word_count,
    grade: editor.final_grade || review.grade || null,
    publish_ready: Boolean(gate.publish_ready || editor.publish_ready || chapter.publish_ready),
    publish_label: gate.label || "",
    blockers: [
      ...(Array.isArray(gate.blockers) ? gate.blockers : []),
      ...(Array.isArray(stop?.blockers) ? stop.blockers : []),
      ...(Array.isArray(editor.failure_summary?.reasons) ? editor.failure_summary.reasons : []),
    ].filter(Boolean),
    stop_reason: stop?.reason || task.result?.reason || null,
    risky_segment_count: riskTexts.length,
    residual_risky_segment_count: residualRiskTexts.length,
    residual_risky_segments: residualRiskTexts.slice(0, 8),
    top_issues: Array.isArray(review.issues) ? review.issues.slice(0, 8) : [],
    rewrite_direction: review.rewrite_direction || editor.rewrite_direction || "",
    preview: text.slice(0, 260),
  };
}

async function main() {
  const project = argValue("project");
  if (!project) {
    throw new Error("Usage: node scripts/repair-existing-chapter.mjs --project=<project-path> --chapter=2 --max-rounds=3");
  }
  const chapterNo = Number(argValue("chapter", "1"));
  const maxRepairRounds = Number(argValue("max-rounds", argValue("max-repair-rounds", "3")));
  const timeoutMs = Number(argValue("timeout-ms", String(30 * 60 * 1000)));
  const outDir = argValue("out-dir", path.join(project, "reports"));
  await mkdir(outDir, { recursive: true });

  const app = await serveLocal({ host: "127.0.0.1", port: 0 });
  const started = Date.now();
  try {
    const baseUrl = app.url;
    const health = await requestJson(baseUrl, "/api/health");
    console.log(JSON.stringify({ event: "repair-start", health: health.status, base_url: baseUrl, project, chapter_no: chapterNo, max_repair_rounds: maxRepairRounds }, null, 2));
    const created = await requestJson(baseUrl, "/api/chapter/repair-to-publish", {
      method: "POST",
      body: {
        project,
        chapter_no: chapterNo,
        max_repair_rounds: maxRepairRounds,
      },
    });
    const taskId = created.task_id || created.id;
    if (!taskId) throw new Error(`repair task did not return task_id: ${JSON.stringify(created)}`);
    const task = await waitForTask(baseUrl, project, taskId, { timeoutMs });
    const query = `project=${encodeURIComponent(project)}&chapter_no=${encodeURIComponent(chapterNo)}`;
    const chapter = await requestJson(baseUrl, `/api/chapter?${query}`);
    const review = await requestJson(baseUrl, `/api/chapter/review?${query}`);
    const editor = await requestJson(baseUrl, `/api/chapter/editor-report?${query}`);
    const report = compactReport({ task, chapter, review, editor, elapsedMs: Date.now() - started });
    const reportPath = path.join(outDir, `repair_existing_chapter_${String(chapterNo).padStart(4, "0")}_${Date.now()}.json`);
    await writeFile(reportPath, JSON.stringify({ report, task, chapter, review, editor }, null, 2), "utf8");
    console.log(JSON.stringify({ event: "repair-finished", report_path: reportPath, report }, null, 2));
    if (!report.publish_ready) {
      process.exitCode = 2;
    }
  } finally {
    await new Promise((resolve, reject) => app.server.close((error) => (error ? reject(error) : resolve())));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
