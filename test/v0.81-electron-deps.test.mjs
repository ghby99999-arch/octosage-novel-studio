import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("v0.81 uses real Electron dependency versions", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.ok(pkg.devDependencies?.electron);
  assert.ok(pkg.devDependencies?.["electron-builder"]);
  assert.notEqual(pkg.devDependencies.electron, "install-before-build");
  assert.notEqual(pkg.devDependencies["electron-builder"], "install-before-build");
});
