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
  calibratePublishPlatformSelectors,
  createProject,
  loadPublishSelectorCalibration,
} from "../src/core/workflow.mjs";
import {
  publishSelectorCalibrationFile,
} from "../src/core/paths.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createCalibrationProject(prefix = "novel-studio-v201-selector-calibration-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "selector calibration target",
    idea: "2016 rebirth campus delivery story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function createScanner(controls, events = []) {
  return {
    events,
    async open(url) {
      events.push({ type: "open", url });
    },
    async scanControls(profile) {
      events.push({ type: "scanControls", profile: profile.id });
      return controls;
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

const sampleControls = [
  { tag: "input", type: "text", name: "bookName", placeholder: "作品名称", selector: "#book-name", visible: true },
  { tag: "textarea", name: "intro", placeholder: "作品简介", selector: "#book-intro", visible: true },
  { tag: "input", type: "text", name: "category", placeholder: "作品分类", selector: "#book-category", visible: true },
  { tag: "input", type: "text", name: "tags", placeholder: "标签", selector: "#book-tags", visible: true },
  { tag: "input", type: "file", name: "chapterFile", accept: ".txt,text/plain", selector: "#chapter-upload", visible: true },
  { tag: "input", type: "password", name: "password", selector: "#password", visible: true },
];

test("v1.201 selector calibration refuses to scan without confirmation", async () => {
  const { root, project } = await createCalibrationProject();
  try {
    const scanner = createScanner(sampleControls);

    const result = await calibratePublishPlatformSelectors(project, {
      platform: "fanqie",
      confirmed: false,
      pageScanner: scanner,
    });

    assert.equal(result.status, "confirmation_required");
    assert.equal(scanner.events.length, 0);
    assert.equal(existsSync(publishSelectorCalibrationFile(project, "fanqie")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.202 selector calibration scans visible controls and stores calibrated selectors", async () => {
  const { root, project } = await createCalibrationProject("novel-studio-v202-selector-store-");
  try {
    const scanner = createScanner(sampleControls);

    const result = await calibratePublishPlatformSelectors(project, {
      platform: "fanqie",
      confirmed: true,
      pageScanner: scanner,
    });

    assert.equal(result.status, "calibrated");
    assert.equal(result.platform, "fanqie");
    assert.equal(result.selectors.title[0], "#book-name");
    assert.equal(result.selectors.synopsis[0], "#book-intro");
    assert.equal(result.selectors.genre[0], "#book-category");
    assert.equal(result.selectors.tags[0], "#book-tags");
    assert.equal(result.selectors.chapters[0], "#chapter-upload");
    assert.equal(result.verification.current_dom_verified, true);
    assert.equal(result.safety.no_password_capture, true);
    assert.equal(JSON.stringify(result).includes("#password"), false);
    assert.equal(existsSync(result.path), true);

    const loaded = await loadPublishSelectorCalibration(project, "fanqie");
    assert.equal(loaded.selectors.title[0], "#book-name");
    assert.equal(scanner.events[0].type, "open");
    assert.match(scanner.events[0].url, /writer\.fanqie\.com/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.203 selector calibration reports partial when required fields are missing", async () => {
  const { root, project } = await createCalibrationProject("novel-studio-v203-selector-partial-");
  try {
    const scanner = createScanner([
      { tag: "input", type: "text", name: "bookName", selector: "#book-name", visible: true },
    ]);

    const result = await calibratePublishPlatformSelectors(project, {
      platform: "qidian",
      confirmed: true,
      pageScanner: scanner,
    });

    assert.equal(result.status, "partial");
    assert.equal(result.verification.current_dom_verified, false);
    assert.ok(result.missing_fields.includes("synopsis"));
    assert.ok(result.missing_fields.includes("chapters"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.204 CLI and server expose selector calibration safely without scanner", async () => {
  const { root, project } = await createCalibrationProject("novel-studio-v204-selector-cli-api-");
  const app = await startTestServer();
  try {
    const help = spawnSync("node", ["src/cli.mjs", "help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /publish-calibrate-selectors --project/);

    const cli = spawnSync("node", [
      "src/cli.mjs",
      "publish-calibrate-selectors",
      "--project",
      project.path,
      "--platform",
      "fanqie",
      "--confirm",
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /publish-calibrate-selectors: scanner_required/);

    const response = await fetch(`${app.baseUrl}/api/publish/calibrate-selectors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, platform: "fanqie", confirmed: true }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, "scanner_required");
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.205 Web workbench exposes selector calibration action", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(`${app.baseUrl}/`).then((response) => response.text());

    assert.match(html, /publishCalibrateSelectorsAction/);
    assert.match(html, /\/api\/publish\/calibrate-selectors/);
    assert.match(html, /calibrate selectors|校准/i);
  } finally {
    await app.close();
  }
});

test("v1.206 CLI selector calibration can request visible browser scanner safely", async () => {
  const { root, project } = await createCalibrationProject("novel-studio-v206-selector-cli-launch-");
  try {
    const cli = spawnSync("node", [
      "src/cli.mjs",
      "publish-calibrate-selectors",
      "--project",
      project.path,
      "--platform",
      "fanqie",
      "--confirm",
      "--launch-browser",
    ], { cwd: repoRoot, encoding: "utf8" });

    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /publish-calibrate-selectors: playwright_not_configured|publish-calibrate-selectors: calibrated|publish-calibrate-selectors: partial/);
    assert.match(cli.stdout, /platform: fanqie/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.207 API selector calibration can request visible browser scanner safely", async () => {
  const { root, project } = await createCalibrationProject("novel-studio-v207-selector-api-launch-");
  const app = await startTestServer();
  try {
    const response = await fetch(`${app.baseUrl}/api/publish/calibrate-selectors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: project.path,
        platform: "fanqie",
        confirmed: true,
        launch_browser: true,
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(body.status, /playwright_not_configured|calibrated|partial/);
    assert.equal(body.platform, "fanqie");
    assert.equal(body.safety?.no_captcha_bypass, true);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
