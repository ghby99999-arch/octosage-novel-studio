import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createLocalServer } from "../src/server.mjs";
import {
  createPlaywrightPublishDriver,
  createVisiblePublishBrowserDriver,
} from "../src/core/browser/publish-browser-driver.mjs";
import {
  createProject,
  evaluateChapterPublishGate,
  runVisibleBrowserPublishAssistant,
} from "../src/core/workflow.mjs";
import {
  chapterCardFile,
  draftFile,
  qualityReportFile,
} from "../src/core/paths.mjs";
import { writeJson, writeText } from "../src/core/fsx.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createDriverProject(prefix = "novel-studio-v181-browser-driver-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "driver target",
    idea: "2016 rebirth campus delivery story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

async function seedChapter(project, chapterNo) {
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

async function seedRange(project, from, to) {
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    await seedChapter(project, chapterNo);
  }
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

function fakePlaywrightFactory(events, { scannedControls } = {}) {
  return {
    chromium: {
      async launch(options) {
        events.push({ type: "launch", options });
        return {
          async newContext(contextOptions) {
            events.push({ type: "newContext", contextOptions });
            return {
              async newPage() {
                events.push({ type: "newPage" });
                return {
                  async goto(url, options) {
                    events.push({ type: "goto", url, options });
                  },
                  locator(selector) {
                    return {
                      async fill(value) {
                        events.push({ type: "fill", selector, value });
                      },
                      async setInputFiles(file) {
                        events.push({ type: "setInputFiles", selector, file });
                      },
                    };
                  },
                  async waitForTimeout(ms) {
                    events.push({ type: "waitForTimeout", ms });
                  },
                  async evaluate() {
                    events.push({ type: "evaluate" });
                    return scannedControls || [];
                  },
                };
              },
            };
          },
        };
      },
    },
  };
}

test("v1.181 visible publish driver refuses to create without explicit confirmation", async () => {
  const result = await createVisiblePublishBrowserDriver({
    allowBrowserLaunch: false,
    driverType: "playwright",
  });

  assert.equal(result.status, "browser_launch_not_allowed");
  assert.equal(result.driver, null);
  assert.equal(result.safety.requires_explicit_confirmation, true);
});

test("v1.182 playwright publish driver launches headed browser and never submits", async () => {
  const events = [];
  const result = await createVisiblePublishBrowserDriver({
    allowBrowserLaunch: true,
    driverType: "playwright",
    playwrightFactory: fakePlaywrightFactory(events),
  });

  assert.equal(result.status, "ready");
  assert.ok(result.driver);

  await result.driver.open("https://writer.fanqie.com/");
  await result.driver.fillField("title", "Driver Target");
  await result.driver.fillField("synopsis", "A short synopsis");
  await result.driver.uploadChapters("E:\\tmp\\chapters.txt");
  await result.driver.stopBeforeSubmit("manual final submit only");

  assert.equal(events.find((event) => event.type === "launch").options.headless, false);
  assert.ok(events.some((event) => event.type === "goto" && event.url === "https://writer.fanqie.com/"));
  assert.ok(events.some((event) => event.type === "fill" && /title/i.test(event.selector)));
  assert.ok(events.some((event) => event.type === "setInputFiles"));
  assert.equal(events.some((event) => event.type === "click"), false);
});

test("v1.183 playwright publish driver reports missing runtime instead of installing packages", async () => {
  const result = await createPlaywrightPublishDriver({
    allowBrowserLaunch: true,
    importPlaywright: async () => {
      throw new Error("Cannot find package playwright");
    },
  });

  assert.equal(result.status, "playwright_not_configured");
  assert.equal(result.driver, null);
  assert.match(result.next_step, /install|configure|playwright/i);
});

test("v1.184 browser assistant can use configured visible driver factory end to end", async () => {
  const { root, project } = await createDriverProject();
  try {
    await seedRange(project, 1, 3);
    const events = [];
    const created = await createVisiblePublishBrowserDriver({
      allowBrowserLaunch: true,
      driverType: "playwright",
      playwrightFactory: fakePlaywrightFactory(events),
    });

    const result = await runVisibleBrowserPublishAssistant(project, {
      from: 1,
      to: 3,
      platform: "fanqie",
      confirmed: true,
      browserDriver: created.driver,
    });

    assert.equal(result.status, "filled_needs_user_submit");
    assert.equal(result.browser_attempt.submitted, false);
    assert.ok(events.some((event) => event.type === "goto"));
    assert.ok(events.some((event) => event.type === "fill" && /title/i.test(event.selector)));
    assert.equal(events.some((event) => event.type === "click"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.185 CLI publish-browser can request visible launch and reports missing Playwright safely", async () => {
  const { root, project } = await createDriverProject("novel-studio-v185-browser-cli-launch-");
  try {
    await seedRange(project, 1, 3);
    const result = spawnSync("node", [
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
      "--launch-browser",
    ], { cwd: repoRoot, encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /publish-browser: playwright_not_configured|publish-browser: browser_launch_not_allowed|publish-browser: filled_needs_user_submit/);
    assert.match(result.stdout, /submitted: false/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.186 server publish browser launch request returns safe configuration status", async () => {
  const { root, project } = await createDriverProject("novel-studio-v186-browser-api-launch-");
  const app = await startTestServer();
  try {
    await seedRange(project, 1, 3);
    const response = await fetch(`${app.baseUrl}/api/publish/browser`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: project.path,
        platform: "fanqie",
        from: 1,
        to: 3,
        confirmed: true,
        launch_browser: true,
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(body.status, /playwright_not_configured|filled_needs_user_submit/);
    assert.equal(body.browser_attempt.submitted, false);
    assert.match(body.selector_config?.source || "", /profile|calibrated/);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.187 playwright publish driver scans only visible safe page controls", async () => {
  const events = [];
  const result = await createVisiblePublishBrowserDriver({
    allowBrowserLaunch: true,
    driverType: "playwright",
    playwrightFactory: fakePlaywrightFactory(events, {
      scannedControls: [
        { tag: "input", type: "text", name: "bookName", id: "book-name", selector: "#book-name", visible: true },
        { tag: "textarea", name: "intro", selector: "#intro", visible: true },
        { tag: "input", type: "file", name: "chapterFile", selector: "#chapter-file", visible: true },
        { tag: "input", type: "password", name: "password", selector: "#password", visible: true },
        { tag: "input", type: "hidden", name: "csrf", selector: "#csrf", visible: false },
        { tag: "input", type: "text", name: "disabledField", selector: "#disabled", visible: true, disabled: true },
      ],
    }),
  });

  assert.equal(result.status, "ready");
  assert.equal(typeof result.driver.scanControls, "function");

  const controls = await result.driver.scanControls(result.profile);

  assert.deepEqual(controls.map((control) => control.selector), ["#book-name", "#intro", "#chapter-file"]);
  assert.equal(controls.some((control) => control.type === "password"), false);
  assert.equal(controls.some((control) => control.type === "hidden"), false);
  assert.equal(controls.some((control) => control.disabled), false);
  assert.ok(events.some((event) => event.type === "evaluate"));
});
