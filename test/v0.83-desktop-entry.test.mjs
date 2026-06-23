import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createLocalServer } from "../src/server.mjs";

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

test("v0.83 server and home page use package version instead of stale constants", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const app = await startTestServer();
  try {
    const health = await fetch(`${app.baseUrl}/api/health`).then((response) => response.json());
    const html = await fetch(app.baseUrl).then((response) => response.text());

    assert.equal(health.version, pkg.version);
    assert.match(html, new RegExp(`core ${pkg.version.replaceAll(".", "\\.")}`));
    assert.match(html, /V1\.100/);
    assert.doesNotMatch(html, /v0\.70/);
  } finally {
    await app.close();
  }
});

test("v0.83 home page can receive a desktop default project root and remember last project", async () => {
  const app = await startTestServer();
  try {
    const defaultRoot = "C:\\Users\\Writer\\Documents\\OctoSage\\Projects";
    const html = await fetch(`${app.baseUrl}/?defaultRoot=${encodeURIComponent(defaultRoot)}`).then((response) =>
      response.text(),
    );

    assert.match(html, /DEFAULT_ROOT/);
    assert.match(html, /octosage:last-project/);
    assert.match(html, /novel-studio:last-project/);
    assert.match(html, /localStorage\.setItem/);
    assert.match(html, /root\.value = DEFAULT_ROOT/);
    assert.match(html, /Projects/);
  } finally {
    await app.close();
  }
});

test("v0.83 desktop shell passes a documents project root into the local web shell", async () => {
  const source = await readFile("src/desktop-main.mjs", "utf8");

  assert.match(source, /app\.getPath\("documents"\)/);
  assert.match(source, /OctoSage/);
  assert.match(source, /Projects/);
  assert.match(source, /defaultRoot/);
  assert.match(source, /setTitle/);
});
