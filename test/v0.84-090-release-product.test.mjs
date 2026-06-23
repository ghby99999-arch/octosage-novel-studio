import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { createLocalServer } from "../src/server.mjs";
import { createProject } from "../src/core/workflow.mjs";

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
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

test("v0.84 package has Windows installer metadata for electron-builder", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.match(pkg.version, /^(0\.(9\d|[1-9]\d{2,})|1\.\d+)\.\d+$/);
  assert.equal(pkg.productName, "OctoSage");
  assert.equal(pkg.build.appId, "cn.octosage.app");
  assert.equal(pkg.build.win.icon, "assets/icon.png");
  assert.equal(pkg.build.directories.output, "dist");
  assert.ok(pkg.build.win.target.some((target) => target.target === "nsis"));
  assert.equal(pkg.build.nsis.oneClick, false);
});

test("v0.85 release artifact checker exists and is wired to package scripts", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(await exists("scripts/check-build-artifacts.mjs"), true);
  assert.match(pkg.scripts["build:check"], /check-build-artifacts/);
  const source = await readFile("scripts/check-build-artifacts.mjs", "utf8");
  assert.match(source, /\.exe/);
  assert.match(source, /dist/);
});

test("v0.86 desktop smoke script can run without opening GUI in CI mode", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.match(pkg.scripts["desktop:smoke"], /desktop-smoke/);
  assert.equal(await exists("scripts/desktop-smoke.mjs"), true);

  const result = spawnSync("node", ["scripts/desktop-smoke.mjs", "--no-launch"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /desktop-smoke/);
  assert.match(result.stdout, /ready/);
});

test("v0.87 server lists projects under a root directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v087-projects-"));
  const app = await startTestServer();
  try {
    const project = await createProject({
      root,
      title: "listed project",
      idea: "2016 rebirth campus local service business story",
      platform: "fanqie",
      genre: "urban business rebirth",
    });

    const result = await fetch(`${app.baseUrl}/api/projects?root=${encodeURIComponent(root)}`).then((response) =>
      response.json(),
    );

    assert.equal(result.root, root);
    assert.ok(result.projects.some((item) => item.path === project.path));
    assert.ok(result.projects.some((item) => item.title === "listed project"));
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v0.88 home page has a project picker instead of path-only workflow", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());

    assert.match(html, /projectList/);
    assert.match(html, /refreshProjects/);
    assert.match(html, /selectProjectAction/);
    assert.match(html, /api\/projects\?root/);
  } finally {
    await app.close();
  }
});

test("v0.89 release readiness script verifies desktop, build config, docs, and tests metadata", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.match(pkg.scripts["release:check"], /release-readiness/);
  assert.equal(await exists("scripts/release-readiness.mjs"), true);

  const result = spawnSync("node", ["scripts/release-readiness.mjs"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /release-readiness/);
  assert.match(result.stdout, /ready/);
});

test("v0.90 README documents EXE build and first-user flow", async () => {
  const readme = await readFile("README.md", "utf8");

  assert.match(readme, /OctoSage V1\.100/);
  assert.match(readme, /build:win/);
  assert.match(readme, /dist/);
  assert.match(readme, /一句话开书/);
  assert.match(readme, /Projects/);
});
