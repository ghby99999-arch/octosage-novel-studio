import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createLocalServer } from "../src/server.mjs";
import {
  createProject,
  evaluateChapterPublishGate,
  runVisibleBrowserPublishAssistant,
} from "../src/core/workflow.mjs";
import {
  chapterCardFile,
  draftFile,
  publishBrowserRunReportFile,
  qualityReportFile,
} from "../src/core/paths.mjs";
import { readJson, writeJson, writeText } from "../src/core/fsx.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createBrowserPublishProject(prefix = "novel-studio-v171-browser-publish-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "browser publish target",
    idea: "2016 rebirth campus delivery story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

async function seedChapter(project, chapterNo, qualityOverrides = {}) {
  await writeJson(chapterCardFile(project, chapterNo), {
    chapter_no: chapterNo,
    display_title: `Chapter ${chapterNo}`,
    opening_hook: "The order dashboard jumps.",
    main_event: "Lu Chuan proves his route with visible campus orders.",
    protagonist_action: "Lu Chuan collects deposits before arranging delivery.",
    conflict: "Classmates misread him as bluffing.",
    cool_point_type: "misread_then_result",
    visible_result: "orders jump from 37 to 99",
    tail_hook: "A larger unknown order appears.",
    characters_in_scene: ["Lu Chuan"],
    character_anchors: [],
  });
  await writeText(
    draftFile(project, chapterNo, "v1"),
    `Chapter ${chapterNo}\n\nLu Chuan puts the old phone on the table.\n\nThe order count jumps from 37 to 99.\n`,
  );
  const qualityMetrics = {
    tail_hook_score: { score: 98 },
    micro_hook_density: { density: 1.4 },
    coolpoint_delivered: { effective_count: 2 },
    drop_risk_segments: { risky_segment_count: 0 },
    retention_prediction: { score: 96 },
    opening_hook_score: { score: 96 },
    ai_taste_score: { score: 96 },
    ...qualityOverrides,
  };
  await writeJson(qualityReportFile(project, chapterNo), {
    project_title: project.title,
    chapter_no: chapterNo,
    status: "approved",
    final_grade: "A",
    quality_metrics: qualityMetrics,
    publish_gate: evaluateChapterPublishGate(qualityMetrics, { grade: "A" }, []),
  });
}

async function seedRange(project, from, to, overridesByChapter = {}) {
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    await seedChapter(project, chapterNo, overridesByChapter[chapterNo] || {});
  }
}

function createRecordingBrowserDriver() {
  const actions = [];
  return {
    actions,
    async open(url) {
      actions.push({ type: "open", url });
    },
    async ensureLoggedIn(checks) {
      actions.push({ type: "ensureLoggedIn", checks });
      return { logged_in: true };
    },
    async fillField(name, value) {
      actions.push({ type: "fillField", name, value });
    },
    async uploadChapters(file) {
      actions.push({ type: "uploadChapters", file });
    },
    async stopBeforeSubmit(reason) {
      actions.push({ type: "stopBeforeSubmit", reason });
    },
    async submit() {
      actions.push({ type: "submit" });
    },
  };
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

async function fetchPixsoBundleText(app) {
  const html = await fetch(`${app.baseUrl}/`).then((response) => response.text());
  const match = html.match(/<script[^>]+src="([^"]*\/pixso\/assets\/[^"]+\.js)"/);
  assert.ok(match, "Pixso bundle script should be referenced from root HTML");
  return fetch(`${app.baseUrl}${match[1]}`).then((response) => response.text());
}

test("v1.171 browser publish assistant refuses to drive browser without confirmation", async () => {
  const { root, project } = await createBrowserPublishProject();
  try {
    await seedRange(project, 1, 3);
    const driver = createRecordingBrowserDriver();

    const result = await runVisibleBrowserPublishAssistant(project, {
      from: 1,
      to: 3,
      platform: "fanqie",
      confirmed: false,
      browserDriver: driver,
    });

    assert.equal(result.status, "planned");
    assert.equal(result.browser_attempt.started, false);
    assert.equal(driver.actions.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.172 browser publish assistant fills visible browser and stops before final submit", async () => {
  const { root, project } = await createBrowserPublishProject("novel-studio-v172-browser-fill-");
  try {
    await seedRange(project, 1, 3);
    const driver = createRecordingBrowserDriver();

    const result = await runVisibleBrowserPublishAssistant(project, {
      from: 1,
      to: 3,
      platform: "fanqie",
      confirmed: true,
      browserDriver: driver,
    });

    assert.equal(result.status, "filled_needs_user_submit");
    assert.equal(result.browser_attempt.started, true);
    assert.equal(result.browser_attempt.submitted, false);
    assert.equal(result.browser_attempt.stop_before_final_submit, true);
    assert.equal(result.report_path, publishBrowserRunReportFile(project, "fanqie"));
    assert.equal(existsSync(result.report_path), true);

    assert.equal(driver.actions[0].type, "open");
    assert.match(driver.actions[0].url, /writer\.fanqie\.com/);
    assert.ok(driver.actions.some((action) => action.type === "fillField" && action.name === "title"));
    assert.ok(driver.actions.some((action) => action.type === "fillField" && action.name === "synopsis"));
    assert.ok(driver.actions.some((action) => action.type === "uploadChapters"));
    assert.ok(driver.actions.some((action) => action.type === "stopBeforeSubmit"));
    assert.equal(driver.actions.some((action) => action.type === "submit"), false);

    const saved = await readJson(result.report_path);
    assert.equal(saved.status, "filled_needs_user_submit");
    assert.equal(saved.safety.no_captcha_bypass, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.173 browser publish assistant blocks when premium gate fails", async () => {
  const { root, project } = await createBrowserPublishProject("novel-studio-v173-browser-block-");
  try {
    await seedRange(project, 1, 3, {
      2: { opening_hook_score: { score: 70 } },
    });
    const driver = createRecordingBrowserDriver();

    const result = await runVisibleBrowserPublishAssistant(project, {
      from: 1,
      to: 3,
      platform: "fanqie",
      confirmed: true,
      browserDriver: driver,
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.gate.publish_package_allowed, false);
    assert.equal(driver.actions.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.174 browser publish assistant returns driver-required when no browser driver is attached", async () => {
  const { root, project } = await createBrowserPublishProject("novel-studio-v174-browser-required-");
  try {
    await seedRange(project, 1, 3);

    const result = await runVisibleBrowserPublishAssistant(project, {
      from: 1,
      to: 3,
      platform: "fanqie",
      confirmed: true,
    });

    assert.equal(result.status, "browser_driver_required");
    assert.equal(result.browser_attempt.started, false);
    assert.match(result.next_step, /visible browser driver/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.175 CLI and server expose visible browser publish assistant", async () => {
  const { root, project } = await createBrowserPublishProject("novel-studio-v175-browser-cli-api-");
  const app = await startTestServer();
  try {
    await seedRange(project, 1, 3);

    const help = spawnSync("node", ["src/cli.mjs", "help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /publish-browser --project/);

    const cli = spawnSync("node", [
      "src/cli.mjs",
      "publish-browser",
      "--project",
      project.path,
      "--platform",
      "fanqie",
      "--from",
      "1",
      "--to",
      "3",
      "--confirm",
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /publish-browser: browser_driver_required/);

    const response = await fetch(`${app.baseUrl}/api/publish/browser`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, platform: "fanqie", from: 1, to: 3, confirmed: true }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, "browser_driver_required");
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.176 Web workbench exposes visible browser publish action", async () => {
  const app = await startTestServer();
  try {
    const bundle = await fetchPixsoBundleText(app);

    assert.match(bundle, /\/api\/publish\/browser/);
    assert.match(bundle, /browser_driver_required|filled_needs_user_submit|playwright_not_configured/);
  } finally {
    await app.close();
  }
});
