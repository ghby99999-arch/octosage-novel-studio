import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
  const raw = await response.text();
  let payload = {};
  try {
    if ((response.headers.get("content-type") || "").includes("text/event-stream")) {
      const event = raw.split(/\r?\n\r?\n/).find((block) => block.split(/\r?\n/).some((line) => line.startsWith("data:")));
      const data = event
        ? event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n")
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

async function waitForTask(baseUrl, projectPath, taskId, { timeoutMs = 30 * 60 * 1000, label = "task" } = {}) {
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
  throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s: ${taskId}`);
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function appendRunEvent(file, event) {
  await appendFile(file, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, "utf8").catch(() => undefined);
}

function uniq(items) {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function gradeRank(grade = "") {
  return { S: 5, A: 4, B: 3, C: 2, D: 1, E: 0 }[String(grade).toUpperCase()] ?? 0;
}

export function summarizeQualitySignals({ gate = {}, editor = {}, review = {}, chapter = {} } = {}) {
  const publishReady = Boolean(gate.publish_ready || editor.publish_ready || chapter.publish_ready);
  const strictBlockers = uniq([
    ...(Array.isArray(gate.blockers) ? gate.blockers : []),
    ...(Array.isArray(editor.stop?.blockers) ? editor.stop.blockers : []),
    ...(Array.isArray(editor.failure_summary?.reasons) ? editor.failure_summary.reasons : []),
  ]);
  const reviewIssues = Array.isArray(review.issues) ? review.issues : [];
  const blockers = publishReady ? strictBlockers : uniq([...strictBlockers, ...reviewIssues]);
  const riskySegments = Array.isArray(review.risky_segments)
    ? review.risky_segments
        .map((item) => item?.reason || item?.issue || item?.label || "")
        .filter(Boolean)
    : [];
  const qualitySuggestions = publishReady ? uniq([...reviewIssues, ...riskySegments]) : [];
  return {
    publish_ready: publishReady,
    blockers,
    quality_suggestions: qualitySuggestions,
  };
}

async function readModelCalls(projectPath) {
  const candidates = [
    path.join(projectPath, "任务", "model_calls.jsonl"),
    path.join(projectPath, "浠诲姟", "model_calls.jsonl"),
  ];
  let raw = "";
  for (const file of candidates) {
    raw = await readFile(file, "utf8").catch(() => "");
    if (raw) break;
  }
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
  const summary = {
    total_calls: calls.length,
    by_task: {},
    by_status: {},
    by_route: {},
    estimated_cost_cny: 0,
    errors: [],
  };
  for (const call of calls) {
    const taskType = call.task_type || "unknown";
    const status = call.status || "unknown";
    const route = [call.provider || "unknown", call.model || "unknown"].join("/");
    summary.by_task[taskType] = (summary.by_task[taskType] || 0) + 1;
    summary.by_status[status] = (summary.by_status[status] || 0) + 1;
    summary.by_route[route] = (summary.by_route[route] || 0) + 1;
    summary.estimated_cost_cny += Number(call.estimated_cost_cny || 0);
    if (status === "error") {
      summary.errors.push({
        task_type: taskType,
        route,
        error: String(call.error || "").replace(/sk-[a-z0-9_-]+/gi, "sk-***").slice(0, 220),
      });
    }
  }
  summary.estimated_cost_cny = Number(summary.estimated_cost_cny.toFixed(4));
  summary.errors = summary.errors.slice(0, 20);
  return summary;
}

async function chapterSummary(baseUrl, project, chapterNo, task) {
  const query = `project=${encodeURIComponent(project)}&chapter_no=${chapterNo}`;
  const chapter = await requestJson(baseUrl, `/api/chapter?${query}`).catch((error) => ({ error: error.message }));
  const review = await requestJson(baseUrl, `/api/chapter/review?${query}`).catch((error) => ({ error: error.message }));
  const editor = await requestJson(baseUrl, `/api/chapter/editor-report?${query}`).catch((error) => ({ error: error.message }));
  const gate = editor.publish_gate || review.publish_gate || chapter.publish_gate || {};
  const qualitySignals = summarizeQualitySignals({ gate, editor, review, chapter });
  const grade = editor.final_grade || review.grade || chapter.grade || "";
  return {
    chapter_no: chapterNo,
    task_status: task.status || "",
    result_status: task.result?.status || "",
    publish_ready: qualitySignals.publish_ready,
    premium_ready: qualitySignals.publish_ready && gradeRank(grade) >= 4,
    grade,
    word_count: Number(chapter.word_count || 0),
    title: chapter.title || "",
    rewrite_count: Number(editor.rewrite_count || task.result?.rewrite_count || 0),
    repair_rounds_this_run: Number(editor.repair_rounds_this_run || 0),
    stop_reason: editor.stop?.reason || task.result?.stop?.reason || "",
    blockers: qualitySignals.blockers.slice(0, 20),
    quality_suggestions: qualitySignals.quality_suggestions.slice(0, 20),
    failure_summary: editor.failure_summary || null,
    preview: String(chapter.text || "").slice(0, 220),
  };
}

async function main() {
  const root = path.resolve(argValue("root", "E:/小说/_octosage_rebirth_35"));
  const until = Number(argValue("until", "35"));
  const maxRewrites = Number(argValue("max-rewrites", "4"));
  const idea = argValue(
    "idea",
    "2016年重生回大学，主角前世是被裁员的软件工程师，后来为了养家送外卖到猝死边缘；这一世他从校园外卖的真实痛点切入，用路线、账册、商家契约、同学反馈和平台战争机会，做成本地生活商业帝国。",
  );
  const genre = argValue("genre", "都市");
  const platform = argValue("platform", "fanqie");
  const targetWords = Number(argValue("target-words", "2000000"));
  const goldenFinger = argValue(
    "golden-finger",
    "未来节点记忆 + 账册推演 + 路线优化，所有能力必须通过订单、税单、契约、商户反馈和现场反应展示",
  );
  const protagonistName = argValue("protagonist", "陆川");
  const supportingCharacters = argValue("supporting", "周启明,林晚,赵一航,老周");
  await mkdir(root, { recursive: true });
  const liveLogPath = path.join(root, `rebirth-35-live-${Date.now()}.jsonl`);

  const app = await serveLocal({ host: "127.0.0.1", port: 0 });
  const baseUrl = app.url;
  const startedAt = Date.now();
  const runLog = [];
  let reportPath = "";

  try {
    const health = await requestJson(baseUrl, "/api/health");
    const keys = await requestJson(baseUrl, "/api/settings/api-keys").catch(() => ({ keys: [] }));
    runLog.push({ event: "server-ready", base_url: baseUrl, health: health.status, configured_keys: (keys.keys || []).filter((item) => item.configured).map((item) => item.name) });
    await appendRunEvent(liveLogPath, runLog.at(-1));

    const titleSuggestion = await requestJson(baseUrl, "/api/title-suggest", {
      method: "POST",
      body: { idea, genre, platform },
    }).catch(() => ({ titles: [] }));
    const title = titleSuggestion.titles?.[0] || "重生2016：从校园外卖开始";

    const created = await requestJson(baseUrl, "/api/project", {
      method: "POST",
      body: {
        root,
        title,
        idea,
        genre,
        platform,
        target_words: targetWords,
        golden_finger: goldenFinger,
        protagonist_name: protagonistName,
        supporting_characters: supportingCharacters,
        auto_planning: true,
      },
    });
    const project = created.project_path;
    runLog.push({ event: "project-created", title, project });
    await appendRunEvent(liveLogPath, runLog.at(-1));

    let planningTask = null;
    if (created.planning_task_id) {
      planningTask = await waitForTask(baseUrl, project, created.planning_task_id, {
        timeoutMs: 20 * 60 * 1000,
        label: "project planning",
      });
      runLog.push({ event: "planning-finished", status: planningTask.status, result_status: planningTask.result?.status || "" });
      await appendRunEvent(liveLogPath, runLog.at(-1));
      if (planningTask.status === "failed") throw new Error(`project planning failed: ${planningTask.error || ""}`);
    }

    const chapters = [];
    for (let chapterNo = 1; chapterNo <= until; chapterNo += 1) {
      runLog.push({ event: "chapter-start", chapter_no: chapterNo, at: new Date().toISOString() });
      await appendRunEvent(liveLogPath, { event: "chapter-start", chapter_no: chapterNo });
      const started = await requestJson(baseUrl, "/api/run", {
        method: "POST",
        body: {
          project,
          chapter_no: chapterNo,
          max_rewrites: maxRewrites,
        },
      });
      const taskId = started.task_id || started.id;
      const task = await waitForTask(baseUrl, project, taskId, {
        timeoutMs: 35 * 60 * 1000,
        label: `chapter ${chapterNo}`,
      });
      const summary = await chapterSummary(baseUrl, project, chapterNo, task);
      chapters.push(summary);
      runLog.push({
        event: "chapter-finished",
        chapter_no: chapterNo,
        status: summary.task_status,
        publish_ready: summary.publish_ready,
        grade: summary.grade,
        word_count: summary.word_count,
        blockers: summary.blockers.slice(0, 4),
        quality_suggestions: summary.quality_suggestions.slice(0, 4),
      });
      await appendRunEvent(liveLogPath, runLog.at(-1));
      if (!summary.publish_ready) {
        runLog.push({
          event: "run-stopped",
          chapter_no: chapterNo,
          reason: "publish_gate_not_ready",
          blockers: summary.blockers.slice(0, 8),
        });
        await appendRunEvent(liveLogPath, runLog.at(-1));
        break;
      }
    }

    const model_calls = await readModelCalls(project);
    const totals = {
      chapters: chapters.length,
      publish_ready_count: chapters.filter((item) => item.publish_ready).length,
      premium_ready_count: chapters.filter((item) => item.premium_ready).length,
      failed_or_stopped_count: chapters.filter((item) => !["completed", "stopped"].includes(item.task_status)).length,
      blocked_count: chapters.filter((item) => !item.publish_ready).length,
    };
    totals.publish_ready_rate = totals.chapters ? Number((totals.publish_ready_count / totals.chapters).toFixed(3)) : 0;
    totals.premium_ready_rate = totals.chapters ? Number((totals.premium_ready_count / totals.chapters).toFixed(3)) : 0;
    const report = {
      generated_at: new Date().toISOString(),
      elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
      root,
      project,
      title,
      idea,
      genre,
      platform,
      target_words: targetWords,
      golden_finger: goldenFinger,
      max_rewrites: maxRewrites,
      live_log_path: liveLogPath,
      planning: {
        task_status: planningTask?.status || "",
        result_status: planningTask?.result?.status || "",
        review: planningTask?.result?.planning_review || null,
      },
      totals,
      chapters,
      top_blockers: Object.entries(chapters.filter((item) => !item.publish_ready).flatMap((item) => item.blockers).reduce((acc, item) => {
        acc[item] = (acc[item] || 0) + 1;
        return acc;
      }, {})).sort((a, b) => b[1] - a[1]).slice(0, 20),
      top_suggestions: Object.entries(chapters.flatMap((item) => item.quality_suggestions || []).reduce((acc, item) => {
        acc[item] = (acc[item] || 0) + 1;
        return acc;
      }, {})).sort((a, b) => b[1] - a[1]).slice(0, 20),
      model_calls,
      run_log: runLog,
    };
    reportPath = path.join(root, `rebirth-35-report-${Date.now()}.json`);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({
      event: "rebirth-35-finished",
      report_path: reportPath,
      project,
      title,
      totals,
      model_calls,
    }, null, 2));
  } finally {
    await closeServer(app.server).catch(() => undefined);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
