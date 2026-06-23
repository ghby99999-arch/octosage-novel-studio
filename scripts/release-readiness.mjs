import { access, readFile } from "node:fs/promises";

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const readme = await readFile("README.md", "utf8");
  const checks = [
    { name: "version", ok: /^1\.\d+\.\d+$/.test(pkg.version) },
    { name: "desktop entry", ok: pkg.main === "src/desktop-main.mjs" && await exists("src/desktop-main.mjs") },
    { name: "desktop preload", ok: await exists("src/desktop-preload.cjs") },
    { name: "electron-builder config", ok: Boolean(pkg.build?.win && pkg.build?.nsis) },
    { name: "desktop readiness script", ok: await exists("scripts/desktop-readiness.mjs") },
    { name: "desktop smoke script", ok: await exists("scripts/desktop-smoke.mjs") },
    { name: "artifact checker", ok: await exists("scripts/check-build-artifacts.mjs") },
    { name: "browser extension manifest", ok: await exists("browser-extension/manifest.json") },
    { name: "browser extension content script", ok: await exists("browser-extension/content.js") },
    { name: "browser extension install helper", ok: pkg.scripts?.["extension:install"] === "node scripts/install-browser-extension.mjs" && await exists("scripts/install-browser-extension.mjs") },
    { name: "browser extension packaged", ok: (pkg.build?.files || []).includes("browser-extension/**/*") },
    { name: "docs packaged", ok: (pkg.build?.files || []).includes("docs/**/*") && (pkg.build?.files || []).includes("CHANGELOG.md") },
    { name: "quick start docs", ok: await exists("docs/QUICKSTART.md") && await exists("docs/USER_GUIDE.md") && await exists("CHANGELOG.md") },
    { name: "commercial shell docs", ok: await exists("docs/COMMERCIAL_SHELL.md") },
    { name: "docs mention build", ok: /build:win/.test(readme) && /dist/.test(readme) },
    { name: "tests available", ok: pkg.scripts?.test === "node --test" },
  ];
  const status = checks.every((check) => check.ok) ? "ready" : "blocked";
  console.log(JSON.stringify({
    name: "release-readiness",
    status,
    checks,
  }, null, 2));
  if (status !== "ready") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
