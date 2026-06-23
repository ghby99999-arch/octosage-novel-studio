import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { createProject } from "../src/core/workflow.mjs";
import { readJson } from "../src/core/fsx.mjs";
import { referenceReadAuditFile, referenceReadPlanFile } from "../src/core/paths.mjs";
import { serveLocal } from "../src/server.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createTempProject(prefix = "novel-studio-v171-reference-product-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.71 reference product",
    idea: "campus rebirth business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function requestJson(port, route, body) {
  return fetch(`http://127.0.0.1:${port}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || response.statusText);
    return data;
  });
}

test("v1.71 CLI can create a reference read plan", async () => {
  const { root, project } = await createTempProject();
  try {
    const result = spawnSync(
      "node",
      [
        "src/cli.mjs",
        "reference-read-plan",
        "--project",
        project.path,
        "--name",
        "cli-visible-book",
        "--start-url",
        "https://example.test/book/1",
        "--chapter-limit",
        "12",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /reference-read-plan: awaiting_confirmation/);
    assert.match(result.stdout, /chapters: 12/);
    const plan = await readJson(referenceReadPlanFile(project, "cli-visible-book"));
    assert.equal(plan.start_url, "https://example.test/book/1");
    assert.equal(plan.chapter_limit, 12);
    assert.equal(plan.saved_source_text, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.72 API creates plans and imports visible chapter text through a non-browser adapter without saving prose", async () => {
  const { root, project } = await createTempProject("novel-studio-v172-api-");
  const server = await serveLocal({ port: 0, projectPath: project.path });
  try {
    const port = server.server.address().port;
    const plan = await requestJson(port, "/api/reference-read/plan", {
      project: project.path,
      name: "api-visible-book",
      start_url: "https://example.test/book/1",
      chapter_limit: 2,
    });
    assert.equal(plan.status, "awaiting_confirmation");

    const profile = await requestJson(port, "/api/reference-read/run", {
      project: project.path,
      name: "api-visible-book",
      confirm: true,
      chapters: [
        {
          chapter_no: 1,
          url: "https://example.test/book/1",
          title: "Chapter 1",
          text: "The order printer screamed before Zhou could deny it. Everyone thought Lu Chuan was bluffing, then the backend count jumped to 40.",
        },
      ],
    });
    assert.equal(profile.reference_name, "api-visible-book");
    assert.equal(profile.saved_source_text, false);
    assert.equal(profile.chapter_count, 1);
    assert.equal(JSON.stringify(profile).includes("order printer screamed"), false);

    const audit = await readJson(referenceReadAuditFile(project, "api-visible-book"));
    assert.equal(audit.status, "completed");
    assert.equal(JSON.stringify(audit).includes("order printer screamed"), false);
  } finally {
    await new Promise((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.73 browser extension exposes safe reference structure sync without auto login", async () => {
  const content = await readFile(path.join(repoRoot, "browser-extension", "content.js"), "utf8");
  const popup = await readFile(path.join(repoRoot, "browser-extension", "popup.html"), "utf8");
  const popupJs = await readFile(path.join(repoRoot, "browser-extension", "popup.js"), "utf8");

  assert.match(content, /\/api\/reference-read\/run/);
  assert.match(content, /novelStudioSyncVisibleReferenceStructure/);
  assert.match(content, /saved_source_text:\s*false/);
  assert.doesNotMatch(content, /password|captcha|login/i);
  assert.match(popup, /Reference structure/);
  assert.match(popup, /referenceName/);
  assert.match(popupJs, /syncReferenceNow/);
});

test("v1.74 web workbench documents reference auto-dissection controls", async () => {
  const source = await readFile(path.join(repoRoot, "src", "server.mjs"), "utf8");

  assert.match(source, /&#23545;&#26631;&#20070;&#33258;&#21160;&#25286;&#35299;/);
  assert.match(source, /referenceReadPlanAction/);
  assert.match(source, /referenceReadRunAction/);
  assert.match(source, /\/api\/reference-read\/plan/);
  assert.match(source, /\/api\/reference-read\/run/);
});

test("v1.75 README explains safe browser-assisted reference reading", async () => {
  const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");

  assert.match(readme, /reference-read-plan/);
  assert.match(readme, /reference-read-run/);
  assert.match(readme, /No login bypass/);
  assert.match(readme, /No raw reference prose is saved/);
});
