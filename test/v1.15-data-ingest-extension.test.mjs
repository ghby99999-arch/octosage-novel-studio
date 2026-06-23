import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { createLocalServer } from "../src/server.mjs";
import { createProject, loadQualityMetricRegistry } from "../src/core/workflow.mjs";

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function createTempProject(prefix = "novel-studio-v115-data-ingest-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.15 data ingest",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
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

test("v1.15 local API ingests author-owned platform metrics and calibrates registry", async () => {
  const { root, project } = await createTempProject();
  const app = await startTestServer();
  try {
    for (const score of [78, 80, 82]) {
      const response = await fetch(`${app.baseUrl}/api/data/ingest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project: project.path,
          platform: "fanqie",
          source: "browser_extension_visible_dom",
          chapter_no: 1,
          metrics: {
            tail_hook_score: score,
          },
          outcome: "premium",
        }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.status, "ingested");
      assert.equal(body.observations.length, 1);
      assert.equal(body.observations[0].metric, "tail_hook_score");
    }

    const registry = await loadQualityMetricRegistry(project);
    assert.equal(registry.metrics.tail_hook_score.calibration.status, "calibrated");
    assert.equal(registry.metrics.tail_hook_score.thresholds.premium, 82);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.15 browser extension package reads visible DOM and posts only to localhost ingest", async () => {
  assert.equal(await exists("browser-extension/manifest.json"), true);
  assert.equal(await exists("browser-extension/content.js"), true);

  const manifest = JSON.parse(await readFile("browser-extension/manifest.json", "utf8"));
  const content = await readFile("browser-extension/content.js", "utf8");

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "OctoSage Data Sync");
  assert.ok(manifest.host_permissions.includes("http://127.0.0.1:8787/*"));
  assert.match(content, /document\.body\.innerText/);
  assert.match(content, /\/api\/data\/ingest/);
  assert.match(content, /127\.0\.0\.1:8787/);
  assert.doesNotMatch(content, /password|captcha|login|publish|comment/i);
});

test("v1.15 install helper prepares extension without silent browser bypass", async () => {
  assert.equal(await exists("scripts/install-browser-extension.mjs"), true);

  const source = await readFile("scripts/install-browser-extension.mjs", "utf8");
  assert.match(source, /chrome:\/\/extensions/);
  assert.match(source, /browser-extension/);
  assert.match(source, /Load unpacked/);
  assert.doesNotMatch(source, /ExtensionInstallForcelist|Registry|reg add|--load-extension/i);
});

test("v1.15 release metadata includes browser extension package and install script", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(pkg.scripts["extension:install"], "node scripts/install-browser-extension.mjs");
  assert.ok(pkg.build.files.includes("browser-extension/**/*"));

  const result = spawnSync("node", ["scripts/release-readiness.mjs"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /browser extension/);
  assert.match(result.stdout, /ready/);
});
