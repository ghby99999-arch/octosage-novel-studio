import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  calibratePublishPlatformSelectors,
  createCalibratedVisiblePublishBrowserDriver,
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

async function createSelectorPublishProject(prefix = "novel-studio-v211-calibrated-publish-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "calibrated publish target",
    idea: "2016 rebirth campus delivery story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function createScanner(controls) {
  return {
    async open() {},
    async scanControls() {
      return controls;
    },
  };
}

function fakePlaywrightFactory(events) {
  return {
    chromium: {
      async launch(options) {
        events.push({ type: "launch", options });
        return {
          async newContext() {
            return {
              async newPage() {
                return {
                  async goto(url) {
                    events.push({ type: "goto", url });
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
                  async waitForTimeout() {},
                };
              },
            };
          },
        };
      },
    },
  };
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

test("v1.211 calibrated selectors override profile candidates when creating visible publish driver", async () => {
  const { root, project } = await createSelectorPublishProject();
  try {
    await calibratePublishPlatformSelectors(project, {
      platform: "fanqie",
      confirmed: true,
      pageScanner: createScanner([
        { tag: "input", type: "text", name: "bookName", selector: "#real-book-title", visible: true },
        { tag: "textarea", name: "intro", selector: "#real-book-intro", visible: true },
        { tag: "input", type: "text", name: "category", selector: "#real-book-category", visible: true },
        { tag: "input", type: "text", name: "tags", selector: "#real-book-tags", visible: true },
        { tag: "input", type: "file", name: "chapterFile", selector: "#real-chapter-file", visible: true },
      ]),
    });

    const events = [];
    const created = await createCalibratedVisiblePublishBrowserDriver(project, {
      allowBrowserLaunch: true,
      driverType: "playwright",
      platform: "fanqie",
      playwrightFactory: fakePlaywrightFactory(events),
    });

    assert.equal(created.status, "ready");
    assert.equal(created.selector_config.source, "calibrated");
    assert.equal(created.selector_config.selectors.title[0], "#real-book-title");

    await created.driver.fillField("title", "Calibrated Title");
    await created.driver.fillField("synopsis", "Calibrated synopsis");
    await created.driver.uploadChapters("E:\\tmp\\chapters.txt");

    assert.ok(events.some((event) => event.type === "fill" && event.selector === "#real-book-title"));
    assert.ok(events.some((event) => event.type === "fill" && event.selector === "#real-book-intro"));
    assert.ok(events.some((event) => event.type === "setInputFiles" && event.selector === "#real-chapter-file"));
    assert.equal(events.some((event) => event.type === "fill" && /\[name="title"\]/i.test(event.selector)), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.212 publish driver falls back to profile selectors when no calibration exists", async () => {
  const { root, project } = await createSelectorPublishProject("novel-studio-v212-profile-selector-fallback-");
  try {
    const events = [];
    const created = await createCalibratedVisiblePublishBrowserDriver(project, {
      allowBrowserLaunch: true,
      driverType: "playwright",
      platform: "fanqie",
      playwrightFactory: fakePlaywrightFactory(events),
    });

    assert.equal(created.status, "ready");
    assert.equal(created.selector_config.source, "profile");

    await created.driver.fillField("title", "Profile Title");

    assert.ok(events.some((event) => event.type === "fill" && /\[name="title"\]/i.test(event.selector)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.213 browser publish report records calibrated selector source", async () => {
  const { root, project } = await createSelectorPublishProject("novel-studio-v213-selector-report-");
  try {
    await seedRange(project, 1, 3);
    await calibratePublishPlatformSelectors(project, {
      platform: "fanqie",
      confirmed: true,
      pageScanner: createScanner([
        { tag: "input", type: "text", name: "bookName", selector: "#real-book-title", visible: true },
        { tag: "textarea", name: "intro", selector: "#real-book-intro", visible: true },
        { tag: "input", type: "text", name: "category", selector: "#real-book-category", visible: true },
        { tag: "input", type: "text", name: "tags", selector: "#real-book-tags", visible: true },
        { tag: "input", type: "file", name: "chapterFile", selector: "#real-chapter-file", visible: true },
      ]),
    });

    const events = [];
    const created = await createCalibratedVisiblePublishBrowserDriver(project, {
      allowBrowserLaunch: true,
      driverType: "playwright",
      platform: "fanqie",
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
    assert.equal(result.selector_config.source, "calibrated");
    assert.equal(result.selector_config.selectors.title[0], "#real-book-title");
    assert.ok(events.some((event) => event.type === "fill" && event.selector === "#real-book-title"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
