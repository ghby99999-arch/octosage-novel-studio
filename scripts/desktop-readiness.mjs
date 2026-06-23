import { access, readFile } from "node:fs/promises";

const REQUIRED_FILES = [
  "package.json",
  "src/desktop-main.mjs",
  "src/desktop-preload.cjs",
  "src/server.mjs",
  "src/task-store.mjs",
];

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const checks = [];
  for (const file of REQUIRED_FILES) {
    checks.push({ name: file, ok: await exists(file) });
  }

  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  checks.push({ name: "main=src/desktop-main.mjs", ok: pkg.main === "src/desktop-main.mjs" });
  checks.push({ name: "script:desktop", ok: pkg.scripts?.desktop === "electron ." });
  checks.push({ name: "script:build:win", ok: Boolean(pkg.scripts?.["build:win"]) });
  checks.push({ name: "script:desktop:smoke", ok: Boolean(pkg.scripts?.["desktop:smoke"]) });
  checks.push({ name: "script:build:check", ok: Boolean(pkg.scripts?.["build:check"]) });
  checks.push({ name: "script:release:check", ok: Boolean(pkg.scripts?.["release:check"]) });
  checks.push({ name: "electron-builder config", ok: Boolean(pkg.build?.win && pkg.build?.nsis) });
  checks.push({ name: "electron dependency declared", ok: Boolean(pkg.devDependencies?.electron) });
  checks.push({ name: "electron-builder dependency declared", ok: Boolean(pkg.devDependencies?.["electron-builder"]) });

  const ok = checks.every((check) => check.ok);
  console.log(JSON.stringify({
    status: ok ? "ready" : "blocked",
    checks,
    note: "Run npm install before desktop/build commands. This script does not download dependencies.",
  }, null, 2));

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
