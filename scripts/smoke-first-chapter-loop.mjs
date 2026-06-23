import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { serveLocal } from "../src/server.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestJson(baseUrl, route, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();
  let payload = {};
  if (contentType.includes("text/event-stream")) {
    const first = raw.match(/data:\s*(\{[\s\S]*?\})(?:\n\n|$)/);
    payload = first ? JSON.parse(first[1]) : {};
  } else {
    payload = raw ? JSON.parse(raw) : {};
  }
  if (!response.ok) {
    throw new Error(`${method} ${route} failed: ${payload.error || response.statusText}`);
  }
  return payload;
}

async function waitForTask(baseUrl, projectPath, taskId, timeoutMs = 900_000) {
  const started = Date.now();
  let latest = null;
  while (Date.now() - started < timeoutMs) {
    latest = await requestJson(
      baseUrl,
      `/api/tasks/${encodeURIComponent(taskId)}?project=${encodeURIComponent(projectPath)}`,
    );
    if (["completed", "stopped", "failed"].includes(String(latest.status || ""))) return latest;
    await sleep(1500);
  }
  throw new Error(`task timed out after ${Math.round(timeoutMs / 1000)}s: ${taskId}`);
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function readModelCallSummary(projectPath) {
  const raw = await readFile(path.join(projectPath, "任务", "model_calls.jsonl"), "utf8").catch(() => "");
  const calls = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
  return calls.map((call) => ({
    task_type: call.task_type,
    provider: call.provider,
    model: call.model,
    status: call.status,
    cost_cny: call.estimated_cost_cny || 0,
    elapsed_ms: call.elapsed_ms || null,
    error: call.error ? String(call.error).slice(0, 160) : "",
  }));
}

async function main() {
  const project = process.argv.find((arg) => arg.startsWith("--project="))?.slice("--project=".length);
  if (!project) throw new Error("Usage: node scripts/smoke-first-chapter-loop.mjs --project=<project-path>");
  const chapterNo = Number(process.argv.find((arg) => arg.startsWith("--chapter="))?.slice("--chapter=".length) || 1);
  const maxRewrites = Number(process.argv.find((arg) => arg.startsWith("--max-rewrites="))?.slice("--max-rewrites=".length) || 2);

  const app = await serveLocal({ host: "127.0.0.1", port: 0 });
  const baseUrl = app.url;
  const result = { project, chapter_no: chapterNo, checks: [] };
  const check = (name, ok, details = {}) => result.checks.push({ name, ok: Boolean(ok), ...details });

  try {
    const health = await requestJson(baseUrl, "/api/health");
    check("api-health", health.status === "ok", { url: baseUrl });

    const runStarted = await requestJson(baseUrl, "/api/run", {
      method: "POST",
      body: { project, chapter_no: chapterNo, max_rewrites: maxRewrites },
    });
    const taskId = runStarted.task_id || runStarted.id;
    check("run-task-started", Boolean(taskId), { task_id: taskId });

    const task = await waitForTask(baseUrl, project, taskId);
    check("run-task-finished", ["completed", "stopped"].includes(String(task.status || "")), {
      status: task.status,
      result_status: task.result?.status || null,
      stop_reason: task.result?.stop?.reason || task.progress?.reason || null,
    });
    check("run-not-failed", task.status !== "failed", { error: task.error || null });

    const chapter = await requestJson(baseUrl, `/api/chapter?project=${encodeURIComponent(project)}&chapter_no=${chapterNo}`);
    const review = await requestJson(baseUrl, `/api/chapter/review?project=${encodeURIComponent(project)}&chapter_no=${chapterNo}`);
    const editorReport = await requestJson(baseUrl, `/api/chapter/editor-report?project=${encodeURIComponent(project)}&chapter_no=${chapterNo}`);
    const gate = editorReport.publish_gate || review.publish_gate || chapter.publish_gate || {};
    const blockers = [
      ...(Array.isArray(gate.blockers) ? gate.blockers : []),
      ...(Array.isArray(editorReport.stop?.blockers) ? editorReport.stop.blockers : []),
      ...(Array.isArray(editorReport.failure_summary?.reasons) ? editorReport.failure_summary.reasons : []),
    ].filter(Boolean);

    check("chapter-has-text", String(chapter.text || "").length > 1000, {
      word_count: chapter.word_count,
      title: chapter.title,
      preview: String(chapter.text || "").slice(0, 180),
    });
    check("review-exists", review.status === "ready" || Boolean(editorReport.final_grade), {
      grade: review.grade || editorReport.final_grade || null,
      score_count: Array.isArray(review.scores) ? review.scores.length : 0,
    });
    check("publish-gate-visible", Boolean(gate.status || gate.label || gate.blockers), {
      publish_ready: Boolean(gate.publish_ready),
      label: gate.label || "",
      blockers: blockers.slice(0, 10),
    });
    check("failure-reasons-visible-if-blocked", gate.publish_ready === true || blockers.length > 0, {
      blockers: blockers.slice(0, 10),
      failure_summary: editorReport.failure_summary || null,
    });

    result.task = {
      status: task.status,
      result_status: task.result?.status || null,
      progress: task.progress || null,
    };
    result.chapter = {
      word_count: chapter.word_count,
      publish_ready: chapter.publish_ready,
      publish_status: chapter.publish_status,
      grade: chapter.grade || null,
    };
    result.editor_report = {
      final_grade: editorReport.final_grade || null,
      publish_ready: Boolean(gate.publish_ready),
      rewrite_count: editorReport.rewrite_count || 0,
      repair_rounds_this_run: editorReport.repair_rounds_this_run || 0,
      max_repair_rounds: editorReport.max_repair_rounds || maxRewrites,
      blockers: blockers.slice(0, 20),
      stop: editorReport.stop || null,
      failure_summary: editorReport.failure_summary || null,
    };
    result.model_calls = await readModelCallSummary(project);
    result.status = result.checks.every((item) => item.ok) ? "ready" : "blocked";
    const reportPath = path.join(project, "reports", `first-chapter-loop-smoke-${Date.now()}.json`);
    result.report_path = reportPath;
    await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "ready") process.exitCode = 1;
  } finally {
    await closeServer(app.server).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
