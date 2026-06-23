import path from "node:path";
import { readdir } from "node:fs/promises";

import { ensureDir, readJson, writeJson } from "./core/fsx.mjs";
import { serverTaskFile } from "./core/paths.mjs";

function nowIso() {
  return new Date().toISOString();
}

function createTaskId(sequence) {
  return `task-${String(sequence).padStart(4, "0")}`;
}

function sequenceFromTaskId(taskId) {
  const match = /^task-(\d+)$/.exec(taskId || "");
  return match ? Number(match[1]) : 0;
}

function publicTask(task) {
  return {
    task_id: task.task_id,
    type: task.type,
    status: task.status,
    progress: task.progress ?? null,
    result: task.result ?? null,
    error: task.error ?? null,
    path: task.path ?? null,
    created_at: task.created_at,
    started_at: task.started_at ?? null,
    finished_at: task.finished_at ?? null,
    events: task.events ?? [],
  };
}

function compactLongText(value = "", maxChars = 420) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.7);
  const tail = Math.max(0, maxChars - head - 18);
  return `${text.slice(0, head)}\n...\n${text.slice(-tail)}`;
}

function compactProgressForEvent(progress = null) {
  if (!progress || typeof progress !== "object") return progress ?? null;
  const compacted = { ...progress };
  for (const key of ["draft_preview", "before_rewrite_preview", "preview_text", "text_preview"]) {
    if (typeof compacted[key] === "string") {
      compacted[key] = compactLongText(compacted[key], 420);
      compacted[`${key}_truncated`] = true;
    }
  }
  if (typeof compacted.text_delta === "string") {
    compacted.text_delta = compactLongText(compacted.text_delta, 80);
  }
  if (Array.isArray(compacted.quality_events)) {
    compacted.quality_events = compacted.quality_events.slice(-5);
  }
  if (Array.isArray(compacted.repair_issues)) {
    compacted.repair_issues = compacted.repair_issues.slice(0, 8).map((item) => compactLongText(item, 120));
  }
  if (Array.isArray(compacted.issues)) {
    compacted.issues = compacted.issues.slice(0, 6).map((item) => compactLongText(item, 120));
  }
  return compacted;
}

function appendTaskEvent(task, event = "progress") {
  if (!Array.isArray(task.events)) task.events = [];
  const lastSeq = task.events.reduce((max, item) => Math.max(max, Number(item?.seq || 0)), 0);
  const item = {
    seq: lastSeq + 1,
    event,
    status: task.status,
    progress: compactProgressForEvent(task.progress),
    result: task.result ?? null,
    error: task.error ?? null,
    created_at: nowIso(),
  };
  task.events.push(item);
  if (task.events.length > 240) task.events = task.events.slice(-240);
  return item;
}

function resultPublishReady(result = null) {
  if (!result || typeof result !== "object") return false;
  if (result.publish_ready === true) return true;
  if (result.publish_gate?.publish_ready === true) return true;
  if (result.review?.publish_gate?.publish_ready === true) return true;
  return false;
}

function resultBlockedReason(result = null) {
  if (!result || typeof result !== "object") return "";
  return result.stop?.reason
    || result.publish_gate?.failure_type
    || result.review?.publish_gate?.failure_type
    || result.review?.reviewer_status
    || "publish_gate_not_ready";
}

function taskTimeoutMs(type = "", overrides = null) {
  const override = overrides?.[type] ?? overrides?.default;
  if (Number.isFinite(Number(override)) && Number(override) > 0) return Number(override);
  return {
    project_planning: 20 * 60 * 1000,
    run_single_chapter: 25 * 60 * 1000,
    repair_chapter_to_publish: 15 * 60 * 1000,
    run_project: 6 * 60 * 60 * 1000,
  }[type] || 30 * 60 * 1000;
}

function withTimeout(promise, ms, message, onTimeout = null) {
  let timeout = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      if (typeof onTimeout === "function") onTimeout();
      reject(new Error(message));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

export async function createPersistentTaskStore({ project, maxConcurrent = 1, taskTimeouts = null } = {}) {
  if (!project?.path) {
    throw new Error("project is required for task store");
  }
  const tasks = new Map();
  const queue = [];
  const subscribers = new Map();
  let runningCount = 0;
  let sequence = 0;

  async function persist(task) {
    appendTaskEvent(task);
    await writeJson(task.path, publicTask(task));
    const listeners = subscribers.get(task.task_id) || new Set();
    for (const listener of listeners) {
      listener(publicTask(task));
    }
  }

  async function loadExistingTasks() {
    const dir = path.dirname(serverTaskFile(project, "task-0001"));
    await ensureDir(dir);
    const files = await readdir(dir).catch(() => []);
    for (const file of files) {
      if (!/^task-\d+\.json$/.test(file)) continue;
      const task = await readJson(path.join(dir, file)).catch(() => null);
      if (!task?.task_id) continue;
      sequence = Math.max(sequence, sequenceFromTaskId(task.task_id));
      const normalized = {
        ...task,
        status: task.status === "running" ? "queued" : task.status,
        progress: task.status === "running" ? { step: "recovered_after_restart" } : task.progress,
        events: Array.isArray(task.events) ? task.events : [],
        path: task.path || path.join(dir, file),
      };
      tasks.set(normalized.task_id, normalized);
      if (normalized.status === "queued") {
        queue.push(normalized.task_id);
      }
    }
  }

  async function runNext() {
    if (runningCount >= maxConcurrent) return;
    const taskId = queue.shift();
    if (!taskId) return;
    const task = tasks.get(taskId);
    if (!task || typeof task.runner !== "function") {
      return runNext();
    }
    runningCount += 1;
    task.status = "running";
    task.started_at = nowIso();
    task.progress = { step: "started" };
    await persist(task);
    const abortController = new AbortController();
    try {
      const setProgress = async (progress = {}) => {
        if (task.status !== "running") return;
        task.progress = { ...task.progress, ...progress };
        await persist(task);
      };
      task.result = await withTimeout(
        task.runner({ setProgress, abortSignal: abortController.signal }),
        taskTimeoutMs(task.type, taskTimeouts),
        `${task.type} timed out after ${Math.round(taskTimeoutMs(task.type, taskTimeouts) / 1000)}s`,
        () => abortController.abort(new Error(`${task.type} timed out`)),
      );
      const resultStatus = String(task.result?.status || "");
      if (resultStatus === "stopped") {
        task.status = "stopped";
        task.error = task.result?.stop?.reason || "";
        task.progress = { ...(task.progress || {}), step: "stopped" };
      } else if (["blocked", "failed", "error"].includes(resultStatus)) {
        task.status = "failed";
        task.error = task.result?.stop?.reason || task.result?.error || resultStatus;
        task.progress = { ...(task.progress || {}), step: resultStatus };
      } else if (
        ["run_single_chapter", "repair_chapter_to_publish"].includes(task.type)
        && !resultPublishReady(task.result)
      ) {
        task.status = "stopped";
        task.error = resultBlockedReason(task.result);
        task.progress = {
          ...(task.progress || {}),
          step: "publish_gate_blocked",
          publish_ready: false,
          reason: task.error,
        };
      } else {
        task.status = "completed";
        task.progress = { ...(task.progress || {}), done: true, publish_ready: resultPublishReady(task.result) };
      }
    } catch (error) {
      abortController.abort(error);
      task.status = "failed";
      task.error = error.message;
      task.progress = { ...(task.progress || {}), step: "failed" };
    } finally {
      task.finished_at = nowIso();
      delete task.runner;
      await persist(task);
      runningCount -= 1;
      queueMicrotask(runNext);
    }
  }

  async function enqueue(type, runner) {
    sequence += 1;
    const task = {
      task_id: createTaskId(sequence),
      type,
      status: "queued",
      progress: { step: "queued" },
      result: null,
      error: null,
      path: serverTaskFile(project, createTaskId(sequence)),
      created_at: nowIso(),
      runner,
    };
    tasks.set(task.task_id, task);
    queue.push(task.task_id);
    await persist(task);
    queueMicrotask(runNext);
    return publicTask(task);
  }

  function get(taskId) {
    const task = tasks.get(taskId);
    return task ? publicTask(task) : null;
  }

  function events(taskId, { after = 0 } = {}) {
    const task = tasks.get(taskId);
    if (!task) return null;
    const since = Number(after) || 0;
    return (task.events || []).filter((event) => Number(event.seq || 0) > since);
  }

  function subscribe(taskId, listener) {
    if (!subscribers.has(taskId)) {
      subscribers.set(taskId, new Set());
    }
    subscribers.get(taskId).add(listener);
    const current = get(taskId);
    if (current) listener(current);
    return () => {
      subscribers.get(taskId)?.delete(listener);
    };
  }

  await loadExistingTasks();

  return { enqueue, get, events, subscribe };
}
