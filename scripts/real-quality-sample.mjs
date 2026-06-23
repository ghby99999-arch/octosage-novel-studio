import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  let payload = {};
  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    const match = text.match(/data:\s*(\{.*\})/s);
    payload = match ? JSON.parse(match[1]) : {};
  } else {
    payload = await response.json().catch(() => ({}));
  }
  if (!response.ok) {
    throw new Error(`${method} ${route} failed: ${payload.error || response.statusText}`);
  }
  return payload;
}

async function waitForTask(baseUrl, projectPath, task, timeoutMs = 12 * 60 * 1000) {
  const taskId = task?.task_id || task?.id;
  if (!taskId) throw new Error("task response did not include task_id");
  const started = Date.now();
  let lastHeartbeat = 0;
  let lastSignature = "";
  while (Date.now() - started < timeoutMs) {
    const route = `/api/tasks/${encodeURIComponent(taskId)}?project=${encodeURIComponent(projectPath)}`;
    const current = await requestJson(baseUrl, route);
    if (["completed", "stopped"].includes(current.status)) return current;
    if (current.status === "failed") throw new Error(`${task.type || taskId} failed: ${current.error}`);
    const progress = current.progress || {};
    const signature = [
      current.status,
      progress.step,
      progress.model_task_type,
      progress.model_stage,
      progress.model_event,
      progress.repair_status_code,
      progress.version,
    ].filter(Boolean).join("|");
    if (Date.now() - lastHeartbeat > 15_000 || signature !== lastSignature) {
      lastHeartbeat = Date.now();
      lastSignature = signature;
      console.log(JSON.stringify({
        event: "task-progress",
        task_id: taskId,
        status: current.status,
        elapsed_s: Math.round((Date.now() - started) / 1000),
        step: progress.step || current.progress?.last_step || null,
        model_stage: progress.model_stage || null,
        worker: progress.model_task_type || null,
        model_event: progress.model_event || null,
        repair: progress.repair_status_code || null,
        publish_status: progress.publish_status || null,
        grade: progress.grade || null,
      }, null, 2));
    }
    await sleep(1500);
  }
  throw new Error(`task timed out after ${Math.round(timeoutMs / 1000)}s: ${taskId}`);
}

const samples = [
  {
    idea: "2016年重生回大学，主角本来是被裁员的程序员，为了养家送外卖，从校园外卖站点开始做本地生活平台",
    genre: "都市",
    platform: "fanqie",
    target_words: 2000000,
    protagonist_name: "陆川",
    supporting_characters: "周启明,林晚,赵衡",
  },
  {
    idea: "穿越到北宋茶商家族旁支，主角靠茶引、账册和商路契约重整家业，卷入汴京权贵和江南茶路之争",
    genre: "历史",
    platform: "qidian",
    target_words: 1500000,
    protagonist_name: "沈砚",
    supporting_characters: "苏明棠,韩照,章怀安",
  },
  {
    idea: "梦幻西游老玩家重回新区开服前一天，不靠凭空开挂，只靠版本记忆、商人盘口和帮派管理抢占第一波资源",
    genre: "游戏",
    platform: "fanqie",
    target_words: 1800000,
    protagonist_name: "陈序",
    supporting_characters: "阿烈,姜禾,老白",
  },
];

function gradeRank(grade = "") {
  return { S: 5, A: 4, B: 3, C: 2, D: 1 }[String(grade).toUpperCase()] || 0;
}

function summarizeChapter(item, planningTask, writingTask, report, chapter, chapterNo) {
  const finalGrade = report.final_grade || null;
  const publishReady = report.publish_ready === true || report.publish_gate?.publish_ready === true;
  const qualityMetrics = report.quality_metrics || {};
  const blockers = [
    ...(Array.isArray(report.publish_gate?.blockers) ? report.publish_gate.blockers : []),
    ...(Array.isArray(report.stop?.blockers) ? report.stop.blockers : []),
  ].filter(Boolean);
  return {
    title: item.title,
    idea: item.idea,
    genre: item.genre,
    platform: item.platform,
    chapter_no: chapterNo,
    planning_status: planningTask?.status || "not-started",
    writing_status: writingTask?.status || "unknown",
    publish_ready: publishReady,
    premium_ready: publishReady && gradeRank(finalGrade) >= 4,
    final_grade: finalGrade,
    rewrite_count: Number(report.rewrite_count || 0),
    word_count: Number(chapter.word_count || 0),
    ai_taste_score: qualityMetrics.ai_taste?.score ?? qualityMetrics.ai_taste_score?.score ?? qualityMetrics.ai_taste_score ?? null,
    retention_score: qualityMetrics.retention_prediction?.score ?? null,
    blockers: [...new Set(blockers)].slice(0, 8),
    stop_reason: report.stop?.reason || null,
    reviewer_status: report.review?.reviewer_status || null,
    style_advisories: report.review?.style_advisories || [],
    blocking_quality_flags: report.review?.blocking_quality_flags || [],
  };
}

function redactProviderError(message = "") {
  return String(message || "")
    .replace(/ak-[a-z0-9_-]+/gi, "ak-***")
    .replace(/sk-[a-z0-9_-]+/gi, "sk-***")
    .replace(/org-[a-z0-9_-]+/gi, "org-***")
    .slice(0, 180);
}

async function readModelCallSummary(projectPath) {
  const filePath = path.join(projectPath, "任务", "model_calls.jsonl");
  const raw = await readFile(filePath, "utf8").catch(() => "");
  const calls = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const byStatus = {};
  const byTask = {};
  const errors = [];
  let fallbackCount = 0;
  let estimatedCostCny = 0;
  for (const call of calls) {
    byStatus[call.status] = (byStatus[call.status] || 0) + 1;
    byTask[call.task_type] = (byTask[call.task_type] || 0) + 1;
    if (call.fallback_from || call.fallback_next) fallbackCount += 1;
    estimatedCostCny += Number(call.estimated_cost_cny || 0);
    if (call.status === "error") {
      errors.push({
        task_type: call.task_type,
        provider: call.provider,
        model: call.model,
        error: redactProviderError(call.error),
      });
    }
  }
  return {
    total_calls: calls.length,
    by_status: byStatus,
    by_task: byTask,
    fallback_count: fallbackCount,
    estimated_cost_cny: Number(estimatedCostCny.toFixed(4)),
    errors: errors.slice(0, 8),
  };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function main() {
  const root = path.resolve(process.argv.find((arg) => arg.startsWith("--root="))?.slice("--root=".length) || "E:/小说/_octosage_real_quality_sample");
  const sampleCount = Number(process.argv.find((arg) => arg.startsWith("--count="))?.slice("--count=".length) || samples.length);
  const chapters = Number(process.argv.find((arg) => arg.startsWith("--chapters="))?.slice("--chapters=".length) || 1);
  const maxRewrites = Number(process.argv.find((arg) => arg.startsWith("--max-rewrites="))?.slice("--max-rewrites=".length) || 2);
  await mkdir(root, { recursive: true });

  const app = await serveLocal({ host: "127.0.0.1", port: 0 });
  const baseUrl = app.url;
  const results = [];
  const projects = [];
  try {
    const health = await requestJson(baseUrl, "/api/health");
    const apiKeys = await requestJson(baseUrl, "/api/settings/api-keys");
    const configuredKeys = (apiKeys.keys || []).filter((key) => key.configured).map((key) => key.name);
    console.log(JSON.stringify({ event: "sample-start", baseUrl, health: health.status, configured_keys: configuredKeys }, null, 2));

    for (const original of samples.slice(0, sampleCount)) {
      const titleSuggestion = await requestJson(baseUrl, "/api/title-suggest", {
        method: "POST",
        body: { idea: original.idea, genre: original.genre, platform: original.platform },
      }).catch(() => ({ titles: [] }));
      const title = titleSuggestion.titles?.[0] || `${original.genre}真实采样${results.length + 1}`;
      const item = { ...original, title };
      const created = await requestJson(baseUrl, "/api/project", {
        method: "POST",
        body: {
          root,
          title,
          idea: item.idea,
          platform: item.platform,
          genre: item.genre,
          target_words: item.target_words,
          protagonist_name: item.protagonist_name,
          supporting_characters: item.supporting_characters,
          auto_planning: true,
        },
      });
      const project = created.project_path;
      projects.push({ title, project });
      console.log(JSON.stringify({ event: "project-created", title, genre: item.genre }, null, 2));

      let planningTask = null;
      if (created.planning_task_id) {
        planningTask = await waitForTask(baseUrl, project, { task_id: created.planning_task_id, type: "project_planning" });
        console.log(JSON.stringify({ event: "planning-done", title, status: planningTask.status }, null, 2));
      }

      for (let chapterNo = 1; chapterNo <= chapters; chapterNo += 1) {
        const runTask = await requestJson(baseUrl, "/api/run", {
          method: "POST",
          body: { project, chapter_no: chapterNo, max_rewrites: maxRewrites },
        });
        const writingTask = await waitForTask(baseUrl, project, runTask);
        console.log(JSON.stringify({ event: "chapter-done", title, chapter_no: chapterNo, status: writingTask.status }, null, 2));

        const report = await requestJson(baseUrl, `/api/chapter/editor-report?project=${encodeURIComponent(project)}&chapter_no=${chapterNo}`);
        const chapter = await requestJson(baseUrl, `/api/chapter?project=${encodeURIComponent(project)}&chapter_no=${chapterNo}`);
        results.push(summarizeChapter(item, planningTask, writingTask, report, chapter, chapterNo));
      }
    }

    for (const project of projects) {
      project.model_calls = await readModelCallSummary(project.project);
    }
  } finally {
    await closeServer(app.server).catch(() => undefined);
  }

  const totals = {
    chapters: results.length,
    books: new Set(results.map((item) => item.title)).size,
    publish_ready_count: results.filter((item) => item.publish_ready).length,
    premium_ready_count: results.filter((item) => item.premium_ready).length,
    stopped_count: results.filter((item) => item.writing_status === "stopped").length,
  };
  const summary = {
    generated_at: new Date().toISOString(),
    root,
    totals: {
      ...totals,
      publish_ready_rate: totals.chapters ? Number((totals.publish_ready_count / totals.chapters).toFixed(3)) : 0,
      premium_ready_rate: totals.chapters ? Number((totals.premium_ready_count / totals.chapters).toFixed(3)) : 0,
    },
    projects,
    results,
  };

  const reportPath = path.join(root, `real-quality-sample-${Date.now()}.json`);
  await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ event: "sample-finished", report_path: reportPath, totals: summary.totals }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
