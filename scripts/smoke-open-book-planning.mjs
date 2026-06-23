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
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${route} failed: ${payload.error || response.statusText}`);
  }
  return payload;
}

async function waitForTask(baseUrl, projectPath, taskId, timeoutMs = 240_000) {
  const started = Date.now();
  let latest = null;
  while (Date.now() - started < timeoutMs) {
    latest = await requestJson(
      baseUrl,
      `/api/tasks/${encodeURIComponent(taskId)}?project=${encodeURIComponent(projectPath)}`,
    );
    if (["completed", "stopped", "failed"].includes(String(latest.status || ""))) return latest;
    await sleep(1200);
  }
  throw new Error(`task timed out after ${Math.round(timeoutMs / 1000)}s: ${taskId}`);
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

const includesAny = (text, words) => words.some((word) => String(text || "").includes(word));

async function main() {
  const root = path.resolve(process.argv.find((arg) => arg.startsWith("--root="))?.slice("--root=".length) || "E:/小说/_octosage_open_book_smoke");
  const idea = process.argv.find((arg) => arg.startsWith("--idea="))?.slice("--idea=".length)
    || "2016年程序员被裁后重生回大学，为了还债从校园外卖做起，最后做成同城生活平台。";
  const platform = process.argv.find((arg) => arg.startsWith("--platform="))?.slice("--platform=".length) || "fanqie";
  const genre = process.argv.find((arg) => arg.startsWith("--genre="))?.slice("--genre=".length) || "都市/外卖";
  const targetWords = Number(process.argv.find((arg) => arg.startsWith("--target-words="))?.slice("--target-words=".length) || 2_000_000);
  await mkdir(root, { recursive: true });

  const app = await serveLocal({ host: "127.0.0.1", port: 0 });
  const baseUrl = app.url;
  const result = {
    root,
    idea,
    platform,
    genre,
    checks: [],
  };
  const check = (name, ok, details = {}) => {
    result.checks.push({ name, ok: Boolean(ok), ...details });
  };

  try {
    const health = await requestJson(baseUrl, "/api/health");
    check("api-health", health.status === "ok", { url: baseUrl });

    const titleSuggestion = await requestJson(baseUrl, "/api/title-suggest", {
      method: "POST",
      body: { idea, platform, genre },
    });
    const titles = Array.isArray(titleSuggestion.titles) ? titleSuggestion.titles : [];
    const title = titles[0] || "开书规划真实测试";
    check("title-suggest-returned", titles.length >= 1, { titles, source: titleSuggestion.source || "" });
    check("title-suggest-relevant", includesAny(titles.join(" "), ["外卖", "校园", "2016", "商业", "同城", "程序", "平台"]), { title });

    const created = await requestJson(baseUrl, "/api/project", {
      method: "POST",
      body: {
        root,
        title,
        idea,
        platform,
        genre,
        target_words: targetWords,
        protagonist_name: "陆川",
        supporting_characters: "周启明,林晚,赵芸",
        initialize_planning: false,
        auto_planning: true,
      },
    });
    check("project-created", Boolean(created.project_path), {
      project_path: created.project_path,
      planning_task_id: created.planning_task_id || null,
    });
    check("book-has-own-folder", path.dirname(created.project_path || "") === root, { project_path: created.project_path });
    check("planning-task-started", Boolean(created.planning_task_id));

    const task = await waitForTask(baseUrl, created.project_path, created.planning_task_id);
    check("planning-task-finished", ["completed", "stopped"].includes(String(task.status || "")), {
      status: task.status,
      task_result_status: task.result?.status || null,
      progress_step: task.progress?.step || null,
      progress_message: task.progress?.message || null,
    });
    check("planning-not-failed", task.status !== "failed", { error: task.error || null });

    const tree = await requestJson(baseUrl, `/api/project/tree?project=${encodeURIComponent(created.project_path)}`);
    const planningBranch = (tree.branches || []).find((branch) => branch.key === "planning");
    const assets = planningBranch?.children || [];
    const readyAssets = assets.filter((asset) => asset.status === "ready");
    check("project-tree-planning-branch", Boolean(planningBranch), { status: planningBranch?.status || null });
    check("planning-assets-ready", readyAssets.length >= 6, {
      ready: readyAssets.map((asset) => asset.label),
      missing: assets.filter((asset) => asset.status !== "ready").map((asset) => asset.label),
    });

    const fineOutline = assets.find((asset) => asset.key === "fine_outline");
    const relationships = assets.find((asset) => asset.key === "relationships");
    if (fineOutline?.path) {
      const artifact = await requestJson(
        baseUrl,
        `/api/project/artifact?project=${encodeURIComponent(created.project_path)}&path=${encodeURIComponent(fineOutline.path)}`,
      );
      check("fine-outline-readable", artifact.status === "ready" && String(artifact.text || "").length > 500, {
        length: String(artifact.text || "").length,
        preview: String(artifact.text || "").slice(0, 160),
      });
      check("fine-outline-has-chapters", /第\s*1\s*章|第1章/.test(String(artifact.text || "")) && /第\s*30\s*章|第30章/.test(String(artifact.text || "")), {
        has_ch1: /第\s*1\s*章|第1章/.test(String(artifact.text || "")),
        has_ch30: /第\s*30\s*章|第30章/.test(String(artifact.text || "")),
      });
    }
    if (relationships?.path) {
      const artifact = await requestJson(
        baseUrl,
        `/api/project/artifact?project=${encodeURIComponent(created.project_path)}&path=${encodeURIComponent(relationships.path)}`,
      );
      check("relationships-readable", artifact.status === "ready" && includesAny(artifact.text, ["陆川", "周启明", "林晚", "赵芸", "人物关系"]), {
        preview: String(artifact.text || "").slice(0, 160),
      });
    }

    const reportPath = path.join(root, `open-book-planning-smoke-${Date.now()}.json`);
    result.status = result.checks.every((item) => item.ok) ? "ready" : "blocked";
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
