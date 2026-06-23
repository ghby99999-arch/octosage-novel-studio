import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createProject } from "../src/core/workflow.mjs";
import { serveLocal } from "../src/server.mjs";

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function requestJson(baseUrl, route, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get("content-type") || "";
  let payload;
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

async function requestJsonFailure(baseUrl, route, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (response.ok) {
    throw new Error(`${method} ${route} unexpectedly succeeded`);
  }
  return { status: response.status, ...payload };
}

async function waitForTaskFinished(baseUrl, task, timeoutMs = 120000) {
  const taskId = task.task_id || task.id;
  if (!taskId) throw new Error("task response did not include task_id");
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const current = await requestJson(baseUrl, `/api/tasks/${encodeURIComponent(taskId)}`);
    if (["completed", "stopped", "failed"].includes(current.status)) return current;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`task timed out: ${taskId}`);
}

function check(name, ok, details = {}) {
  return { name, ok: Boolean(ok), ...details };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function main() {
  const noLaunch = process.argv.includes("--no-launch");
  if (!noLaunch) {
    throw new Error("GUI launch smoke is intentionally explicit. Use npm.cmd run desktop for interactive launch.");
  }

  const checks = [];
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  checks.push(check("desktop-main", await exists("src/desktop-main.mjs")));
  checks.push(check("desktop-preload", await exists("src/desktop-preload.cjs")));
  checks.push(check("built-pixso-ui", await exists("pixso-react-ui/dist/index.html")));
  checks.push(check("packaged-pixso-ui", (pkg.build?.files || []).includes("pixso-react-ui/dist/**/*")));
  checks.push(check("build-win-builds-ui", /build:ui/.test(String(pkg.scripts?.["build:win"] || ""))));

  const root = await mkdtemp(path.join(os.tmpdir(), "octosage-desktop-smoke-"));
  let app = null;
  try {
    const project = await createProject({
      root,
      title: "烟测项目",
      idea: "2016年重生回大学，从校园外卖做起",
      platform: "fanqie",
      genre: "都市",
    });
    app = await serveLocal({ host: "127.0.0.1", port: 0, project });
    const baseUrl = app.url;

    const health = await requestJson(baseUrl, "/api/health");
    checks.push(check("api-health", health.status === "ok", { url: baseUrl }));

    const readyBefore = await requestJson(baseUrl, "/api/workspace/ready");
    checks.push(check("workspace-ready-before-write", readyBefore.ready?.can_write));

    const supportSummary = await requestJson(baseUrl, "/api/support/summary");
    checks.push(check("support-summary", Boolean(supportSummary.docs?.quick_start_url) && Boolean(supportSummary.support?.commercial_status), {
      status: supportSummary.support?.commercial_status,
    }));

    const quickStartDoc = await fetch(`${baseUrl}/docs/QUICKSTART.md`);
    checks.push(check("quick-start-doc-route", quickStartDoc.ok));

    const runTask = await requestJson(baseUrl, "/api/run", {
      method: "POST",
      body: { project: project.path, allow_mock: true },
    });
    const completedRun = await waitForTaskFinished(baseUrl, runTask);
    const mockRejectReason = String(completedRun.result?.stop?.reason || completedRun.error || "");
    const mockRejectedSafely = (
      (completedRun.status === "failed" && /too_short_after_sanitize|可保存正文|saveable/i.test(mockRejectReason))
      || (completedRun.status === "stopped" && /targeted_repair_exhausted|publish_gate_not_ready|max_rewrites_exhausted/i.test(mockRejectReason))
    );
    checks.push(check("mock-write-rejected-before-save", mockRejectedSafely, {
      status: completedRun.status,
      reason: mockRejectReason,
    }));

    const chapters = await requestJson(baseUrl, "/api/chapters");
    checks.push(check("mock-output-not-formal-chapters", chapters.completed_chapters === 0 && chapters.latest_completed_chapter === null, {
      completed_chapters: chapters.completed_chapters,
      latest_completed_chapter: chapters.latest_completed_chapter,
    }));

    const range = { project: project.path, from: 1, to: 1 };
    const mergedBlocked = await requestJsonFailure(baseUrl, "/api/export/merged", { method: "POST", body: range });
    checks.push(check("mock-export-blocked", mergedBlocked.status === 409, {
      status: mergedBlocked.status,
      error: mergedBlocked.error || "",
    }));

    const videoBlocked = await requestJsonFailure(baseUrl, "/api/video/full-pack", {
      method: "POST",
      body: { ...range, tool: "jimeng" },
    });
    checks.push(check("mock-video-blocked", videoBlocked.status === 409, {
      status: videoBlocked.status,
      error: videoBlocked.error || "",
    }));

    const publishBlocked = await requestJsonFailure(baseUrl, "/api/publish/plan", {
      method: "POST",
      body: { ...range, platform: "fanqie" },
    });
    checks.push(check("mock-publish-blocked", publishBlocked.status === 409, {
      status: publishBlocked.status,
      error: publishBlocked.error || "",
    }));

    const adapters = await requestJson(baseUrl, "/api/publish/adapters");
    checks.push(check("publish-adapters", Array.isArray(adapters.adapters) && adapters.adapters.length >= 1, {
      count: adapters.adapters?.length || 0,
    }));

    const domainPlan = await requestJson(baseUrl, "/api/domain/build-plan", {
      method: "POST",
      body: { project: project.path },
    });
    checks.push(check("domain-build-plan", Boolean(domainPlan.path), { path: domainPlan.path }));

    const diagnosticsExport = await requestJson(baseUrl, "/api/support/diagnostics/export", {
      method: "POST",
      body: { project: project.path },
    });
    checks.push(check("support-diagnostics-export", Boolean(diagnosticsExport.path), { path: diagnosticsExport.path }));

    const readyAfter = await requestJson(baseUrl, "/api/workspace/ready");
    checks.push(check("workspace-ready-after-mock-write", readyAfter.ready?.can_write && readyAfter.ready?.can_export === false));
  } finally {
    if (app?.server) await closeServer(app.server).catch(() => undefined);
    if (!process.argv.includes("--keep-temp")) {
      await rm(root, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  const ok = checks.every((item) => item.ok);
  console.log(JSON.stringify({
    name: "desktop-smoke",
    status: ok ? "ready" : "blocked",
    mode: "no-launch",
    checks,
    safety: {
      no_network_required: true,
      no_final_publish_submit: true,
      temporary_project_deleted: !process.argv.includes("--keep-temp"),
    },
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
