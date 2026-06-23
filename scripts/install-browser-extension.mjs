import { writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const extensionPath = path.join(repoRoot, "browser-extension");
const port = Number(args.port || 8787);
const config = {
  project_path: args["project-path"] || "",
  root_path: args.root || "",
  local_ingest_url: `http://127.0.0.1:${port}/api/portfolio/data/ingest`,
  local_project_ingest_url: `http://127.0.0.1:${port}/api/data/ingest`,
  saved_source_text: false,
  safety: [
    "No silent install",
    "No login automation",
    "No captcha bypass",
    "No paywall bypass",
    "No publishing or commenting automation",
    "Only visible author-owned metrics are synced",
  ],
  updated_at: new Date().toISOString(),
};
const configPath = path.join(extensionPath, "browser-extension-config.json");
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

const installHelpPath = path.join(extensionPath, "INSTALL.html");
const installHelp = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Install OctoSage Data Sync</title></head>
<body>
<h1>OctoSage Data Sync</h1>
<p>Open <strong>chrome://extensions</strong>, enable Developer mode, click <strong>Load unpacked</strong>, then select:</p>
<pre>${extensionPath}</pre>
<p>Safety: No silent install, no login automation, no captcha bypass, no paywall bypass, no publishing/commenting automation.</p>
</body>
</html>
`;
await writeFile(installHelpPath, installHelp, "utf8");

if (!args["prepare-only"]) {
  try {
    spawn("cmd", ["/c", "start", "chrome://extensions"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  } catch {
    // Opening the browser is best-effort; the printed path is still enough.
  }
}

console.log(JSON.stringify({
  name: "install-browser-extension",
  status: "prepared",
  extension_path: extensionPath,
  config_path: configPath,
  install_help_path: installHelpPath,
  browser_page: "chrome://extensions",
  steps: [
    "Open chrome://extensions",
    "Enable Developer mode",
    "Click Load unpacked",
    `Select ${extensionPath}`,
    "Open the extension popup and save portfolio root/project path",
  ],
  safety: config.safety,
}, null, 2));
