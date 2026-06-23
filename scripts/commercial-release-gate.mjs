import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function readText(file, fallback = "") {
  try {
    return await readFile(file, "utf8");
  } catch {
    return fallback;
  }
}

async function listFiles(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function check(name, ok, details = {}) {
  return { name, ok: Boolean(ok), ...details };
}

function hasAnyApiKey(env = process.env) {
  return [
    "OPENAI_API_KEY",
    "DEEPSEEK_API_KEY",
    "DOUBAO_API_KEY",
    "QIANFAN_API_KEY",
    "DASHSCOPE_API_KEY",
    "MOONSHOT_API_KEY",
  ].some((name) => Boolean(env[name]));
}

async function scanUiActions() {
  const root = "pixso-react-ui/src";
  const files = [];
  async function walk(dir) {
    const entries = await listFiles(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(tsx|ts)$/.test(entry.name)) files.push(full);
    }
  }
  await walk(root);

  const ui = new Set();
  for (const file of files) {
    const text = await readText(file);
    for (const match of text.matchAll(/data-octo-action=\{([^}]+)\}|data-octo-action="([^"]+)"/g)) {
      if (match[2]) ui.add(match[2]);
    }
  }

  const bridge = await readText("pixso-react-ui/src/pixso-bridge.ts");
  const actionBlock = bridge.match(/const actions = \{([\s\S]*?)\n\};\n\nconst idActions/);
  const handlers = new Set();
  if (actionBlock) {
    for (const match of actionBlock[1].matchAll(/\n\s*([A-Za-z0-9_]+):\s/g)) {
      handlers.add(match[1]);
    }
  }

  return {
    ui_actions: ui.size,
    handlers: handlers.size,
    missing: [...ui].filter((item) => !handlers.has(item)).sort(),
  };
}

async function main() {
  const pkg = JSON.parse(await readText("package.json", "{}"));
  const bridge = await readText("pixso-react-ui/src/pixso-bridge.ts");
  const server = await readText("src/server.mjs");
  const shell = await readText("pixso-react-ui/src/views/PixsoAppShell.tsx");
  const frameHome = await readText("pixso-react-ui/src/views/NovelPages.tsx");
  const settings = await readText("pixso-react-ui/src/views/SystemPages.tsx");
  const desktopSmoke = await readText("scripts/desktop-smoke.mjs");
  const shellSpec = await readText("docs/COMMERCIAL_SHELL.md");
  const uiActions = await scanUiActions();
  const distEntries = await listFiles("dist");
  const installers = distEntries
    .filter((entry) => entry.isFile() && /^OctoSage-.*\.exe$/i.test(entry.name))
    .map((entry) => entry.name);

  const checks = [
    check("product-version", /^1\.\d+\.\d+$/.test(pkg.version), { version: pkg.version }),
    check("desktop-entry", pkg.main === "src/desktop-main.mjs" && await exists("src/desktop-main.mjs")),
    check("desktop-preload", await exists("src/desktop-preload.cjs")),
    check("pixso-ui-built", await exists("pixso-react-ui/dist/index.html")),
    check("pixso-ui-packaged", (pkg.build?.files || []).includes("pixso-react-ui/dist/**/*")),
    check("docs-packaged", (pkg.build?.files || []).includes("docs/**/*") && (pkg.build?.files || []).includes("CHANGELOG.md")),
    check("build-win-builds-ui", String(pkg.scripts?.["build:win"] || "").includes("npm --prefix pixso-react-ui run build")),
    check("brand-icon", await exists("assets/icon.png") && await exists("pixso-react-ui/src/assets/images/octosage-icon.png")),
    check("all-visible-actions-have-handlers", uiActions.missing.length === 0, uiActions),
    check("first-run-default-project", /ensureDefaultProject|defaultProject|Documents/.test(await readText("src/desktop-main.mjs"))),
    check("workspace-ready-api", /\/api\/workspace\/ready/.test(server) && /buildUsableWorkspaceSnapshot/.test(server)),
    check("model-smoke-api", /\/api\/settings\/model-smoke/.test(server)),
    check("support-summary-api", /\/api\/support\/summary/.test(server) && /\/api\/support\/diagnostics\/export/.test(server)),
    check("user-friendly-error-copy", /friendlyErrorMessage/.test(bridge)),
    check("safe-publish-line", /confirmed:\s*false/.test(bridge) && /不会静默执行远程安装脚本|最终提交永远由用户确认/.test(server + frameHome + settings)),
    check("ui-login-state", /octosage:account/.test(shell) && /octo-shell-account-label/.test(shell)),
    check("api-key-settings-ui", /data-api-key-name/.test(settings) && /octo-api-key-list/.test(settings)),
    check("onboarding-ui", (
      /NovelBookshelf/.test(frameHome)
      && /开新书/.test(frameHome)
      && /每本书独立管理章节、正文、审稿、大纲和导出/.test(frameHome)
    ) || (
      /octo-desk-input/.test(frameHome) && /写一句话，开始你的新书/.test(frameHome) && /开始写/.test(frameHome)
    )),
    check("support-docs", await exists("docs/QUICKSTART.md") && await exists("docs/USER_GUIDE.md") && await exists("CHANGELOG.md")),
    check("commercial-shell-standard", /Commercial Shell Standard/.test(shellSpec) && /Publishing never clicks the final submit button automatically/.test(shellSpec)),
    check("commercial-shell-packaged", (pkg.build?.files || []).includes("docs/**/*")),
    check("desktop-smoke-covers-core-flow", /\/api\/run/.test(desktopSmoke) && /\/api\/video\/full-pack/.test(desktopSmoke) && /\/api\/publish\/plan/.test(desktopSmoke)),
  ];

  const warnings = [
    check("real-installer-built", installers.length > 0, { installers }),
    check("real-api-key-configured-in-current-shell", hasAnyApiKey()),
    check("fanqie-selector-validation-artifact", await exists("reports/publish-platform-validation-fanqie.json")),
  ].filter((item) => !item.ok);

  const p0Blockers = checks.filter((item) => !item.ok);
  const status = p0Blockers.length ? "blocked" : warnings.length ? "commercial-candidate" : "formal-ready";

  console.log(JSON.stringify({
    name: "commercial-release-gate",
    product: pkg.productName || "OctoSage",
    version: pkg.version,
    status,
    p0_blockers: p0Blockers,
    warnings,
    checks,
    formal_release_note: status === "formal-ready"
      ? "所有正式版门禁已通过。"
      : "P0 必须清零；warnings 是正式对外销售前仍建议补齐的真实环境验证。",
    safety: {
      no_final_publish_submit: true,
      no_remote_install_script_execution: true,
      installer_installation_not_run_by_gate: true,
    },
  }, null, 2));

  if (p0Blockers.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
