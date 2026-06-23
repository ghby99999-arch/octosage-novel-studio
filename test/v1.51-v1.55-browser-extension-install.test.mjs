import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("v1.51 extension manifest exposes popup UI and localhost endpoints", async () => {
  const manifest = JSON.parse(await readFile(path.join(repoRoot, "browser-extension", "manifest.json"), "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.equal(manifest.icons["128"], "icons/octosage-128.png");
  assert.equal(manifest.action.default_icon["32"], "icons/octosage-32.png");
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(manifest.host_permissions.includes("http://127.0.0.1:8787/*"));
});

test("v1.52 extension content script never stores visible source prose in raw ingest", async () => {
  const content = await readFile(path.join(repoRoot, "browser-extension", "content.js"), "utf8");

  assert.match(content, /\/api\/portfolio\/data\/ingest/);
  assert.match(content, /project_path/);
  assert.match(content, /chapter_no/);
  assert.doesNotMatch(content, /visible_text_preview/);
  assert.match(content, /raw:\s*\{/);
  assert.match(content, /saved_source_text:\s*false/);
});

test("v1.53 install script can prepare a configured extension bundle", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v153-extension-"));
  try {
    const projectPath = path.join(root, "book-a");
    const result = spawnSync(
      "node",
      [
        "scripts/install-browser-extension.mjs",
        "--project-path",
        projectPath,
        "--port",
        "18787",
        "--prepare-only",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, "prepared");
    assert.ok(output.extension_path.endsWith("browser-extension"));
    assert.ok(output.config_path.endsWith("browser-extension-config.json"));

    const config = JSON.parse(await readFile(output.config_path, "utf8"));
    assert.equal(config.project_path, projectPath);
    assert.equal(config.local_ingest_url, "http://127.0.0.1:18787/api/portfolio/data/ingest");
    assert.equal(config.saved_source_text, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.54-v1.55 popup and installer document the one-click safe install path", async () => {
  const popup = await readFile(path.join(repoRoot, "browser-extension", "popup.html"), "utf8");
  const popupJs = await readFile(path.join(repoRoot, "browser-extension", "popup.js"), "utf8");
  const installer = await readFile(path.join(repoRoot, "scripts", "install-browser-extension.mjs"), "utf8");

  assert.match(popup, /OctoSage Data Sync/);
  assert.match(popup, /projectPath/);
  assert.match(popup, /syncNow/);
  assert.match(popupJs, /chrome\.storage\.local/);
  assert.match(popupJs, /novelStudioSyncVisibleMetrics/);
  assert.match(installer, /chrome:\/\/extensions/);
  assert.match(installer, /No silent install/);
});
