import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

test("v0.80 has a desktop entry that starts local server and opens a window", async () => {
  assert.equal(await exists("src/desktop-main.mjs"), true);

  const source = await readFile("src/desktop-main.mjs", "utf8");
  assert.match(source, /serveLocal/);
  assert.match(source, /BrowserWindow/);
  assert.match(source, /loadURL/);
});

test("v0.80 has an exe readiness script for installer preparation", async () => {
  assert.equal(await exists("scripts/desktop-readiness.mjs"), true);

  const source = await readFile("scripts/desktop-readiness.mjs", "utf8");
  assert.match(source, /desktop-main\.mjs/);
  assert.match(source, /package\.json/);
  assert.match(source, /electron/);
});

test("v0.80 package scripts expose desktop and build commands", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(pkg.main, "src/desktop-main.mjs");
  assert.equal(pkg.scripts.desktop, "electron .");
  assert.equal(pkg.scripts["desktop:check"], "node scripts/desktop-readiness.mjs");
  assert.equal(pkg.scripts["build:win"], "npm run desktop:check && electron-builder --win");
  assert.ok(pkg.devDependencies?.electron);
  assert.ok(pkg.devDependencies?.["electron-builder"]);
});
