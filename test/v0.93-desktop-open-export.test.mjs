import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createLocalServer } from "../src/server.mjs";

async function startTestServer(options = {}) {
  const app = createLocalServer(options);
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const address = app.server.address();
  return {
    ...app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve) => app.server.close(resolve));
    },
  };
}

test("v0.93 desktop main wires a sandboxed open-path IPC bridge", async () => {
  const source = await readFile("src/desktop-main.mjs", "utf8");

  assert.match(source, /ipcMain/);
  assert.match(source, /preload/);
  assert.match(source, /octosage:open-path/);
  assert.match(source, /novel-studio:open-path/);
  assert.match(source, /shell\.openPath/);
});

test("v0.93 preload exposes only a narrow openPath desktop bridge", async () => {
  const source = await readFile("src/desktop-preload.cjs", "utf8");

  assert.match(source, /contextBridge/);
  assert.match(source, /ipcRenderer/);
  assert.match(source, /novelStudioDesktop/);
  assert.match(source, /openPath/);
  assert.match(source, /octosage:open-path/);
});

test("v0.93 home page serves the React desktop bridge bundle", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());
    const script = html.match(/src="([^"]+\.js)"/)?.[1] || "";
    assert.ok(script);
    const bundle = await fetch(`${app.baseUrl}${script}`).then((response) => response.text());

    assert.match(html, /<div id="root"><\/div>/);
    assert.match(bundle, /novelStudioDesktop/);
    assert.match(bundle, /openPath/);
    assert.match(bundle, /data-octo-open-path/);
  } finally {
    await app.close();
  }
});
