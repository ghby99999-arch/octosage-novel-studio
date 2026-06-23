import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { createLocalServer } from "../src/server.mjs";
import { createProject } from "../src/core/workflow.mjs";

const execFileAsync = promisify(execFile);

async function rejectExec(args) {
  try {
    await execFileAsync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8",
    });
  } catch (error) {
    return error;
  }
  throw new Error(`expected command to fail: ${args.join(" ")}`);
}

async function createTempProject(prefix = "novel-studio-v082-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.82 product entry",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
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

test("v0.82 CLI help uses package version, groups commands, and shows first workflow", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const { stdout } = await execFileAsync(process.execPath, ["src/cli.mjs", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.match(stdout, new RegExp(`novel v${pkg.version}`));
  assert.match(stdout, /Quick start/);
  assert.match(stdout, /Project/);
  assert.match(stdout, /Writing/);
  assert.match(stdout, /Quality/);
  assert.match(stdout, /serve --project/);
});

test("v0.82 real paid providers require cost confirmation before network work", async () => {
  const { root, project } = await createTempProject("novel-studio-v082-cost-");
  try {
    const { stderr } = await rejectExec([
      "src/cli.mjs",
      "real-single",
      "1",
      "--provider",
      "deepseek",
      "--project",
      project.path,
    ]);

    assert.match(stderr, /cost confirmation required/);
    assert.match(stderr, /provider: deepseek/);
    assert.match(stderr, /--confirm-cost/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v0.82 CLI formats missing project errors into a user action", async () => {
  const missingProject = path.join(tmpdir(), "novel-studio-v082-missing-project");
  const { stderr } = await rejectExec(["src/cli.mjs", "report", "--project", missingProject]);

  assert.match(stderr, /Project not found/);
  assert.match(stderr, /novel init/);
});

test("v0.82 home page wires first-project flow and user-facing error helpers", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());

    assert.match(html, /createProjectAction/);
    assert.match(html, /showError/);
    assert.match(html, /setBusy/);
    assert.doesNotMatch(html, /JSON\.stringify\(value, null, 2\)/);
  } finally {
    await app.close();
  }
});

test("v0.82 server rejects non-json post bodies with a clear status", async () => {
  const app = await startTestServer();
  try {
    const response = await fetch(`${app.baseUrl}/api/dry-run-cost`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not-json",
    });

    assert.equal(response.status, 415);
    const body = await response.json();
    assert.match(body.error, /content-type must be application\/json/);
  } finally {
    await app.close();
  }
});
