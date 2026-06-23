import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createLocalServer } from "../src/server.mjs";
import { createProject } from "../src/core/workflow.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createTempProject(prefix = "novel-studio-v129-domain-product-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.29 domain productization",
    idea: "write a commercial fantasy with a strict alchemy system",
    platform: "fanqie",
    genre: "fantasy commerce",
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

test("v1.29 server exposes domain knowledge plan, manual import, base read, and confirmed collection", async () => {
  const { root, project } = await createTempProject();
  const app = await startTestServer({
    domainKnowledgeFetch: async () => ({
      ok: true,
      text: async () => "\u5927\u5510\u5b98\u5e9c\uff1a\u7269\u7406\u8f93\u51fa\u95e8\u6d3e\u3002\u4ee3\u8868\u6280\u80fd\uff1a\u6a2a\u626b\u5343\u519b\u3002",
    }),
  });
  try {
    const plan = await fetch(
      `${app.baseUrl}/api/domain-knowledge/plan?project=${encodeURIComponent(project.path)}`,
    ).then((response) => response.json());
    assert.equal(plan.project_title, project.title);
    assert.equal(plan.network_status, "not_started");

    const imported = await fetch(`${app.baseUrl}/api/domain-knowledge/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: project.path,
        source: "manual_test",
        entries: [
          {
            type: "system",
            name: "Alchemy",
            aliases: ["alchemy"],
            facts: ["Alchemy requires equivalent exchange."],
            constraints: ["Alchemy cannot create gold from air."],
          },
        ],
      }),
    }).then((response) => response.json());
    assert.equal(imported.status, "imported");
    assert.equal(imported.knowledge.entries.length, 1);
    assert.equal(imported.knowledge.saved_source_text, false);

    const base = await fetch(
      `${app.baseUrl}/api/domain-knowledge?project=${encodeURIComponent(project.path)}`,
    ).then((response) => response.json());
    assert.equal(base.entries.length, 1);
    assert.equal(base.entries[0].name, "Alchemy");

    const unconfirmed = await fetch(`${app.baseUrl}/api/domain-knowledge/collect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: project.path,
        confirmed: false,
        sources: [{ url: "https://example.test/wiki", title: "Example wiki" }],
      }),
    });
    assert.equal(unconfirmed.status, 400);
    assert.match((await unconfirmed.json()).error, /requires user confirmation/);

    const collected = await fetch(`${app.baseUrl}/api/domain-knowledge/collect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: project.path,
        confirmed: true,
        sources: [{ url: "https://example.test/wiki", title: "Example wiki" }],
      }),
    }).then((response) => response.json());
    assert.equal(collected.status, "collected");
    assert.equal(collected.source_count, 1);
    assert.equal(collected.knowledge.saved_source_text, false);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.29 CLI can inspect and import domain knowledge", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v129-cli-domain-"));
  try {
    const init = spawnSync(
      "node",
      [
        "src/cli.mjs",
        "init",
        "--root",
        root,
        "--title",
        "cli-domain-project",
        "--idea",
        "write a commercial fantasy with a strict alchemy system",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(init.status, 0, init.stderr);
    const projectPath = path.join(root, "cli-domain-project");

    const help = spawnSync("node", ["src/cli.mjs", "help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /domain-plan --project/);
    assert.match(help.stdout, /domain-import --entries-json/);
    assert.match(help.stdout, /domain-knowledge --project/);

    const plan = spawnSync("node", ["src/cli.mjs", "domain-plan", "--project", projectPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(plan.status, 0, plan.stderr);
    assert.match(plan.stdout, /domain-type:/);
    assert.match(plan.stdout, /network-status: not_started/);

    const imported = spawnSync(
      "node",
      [
        "src/cli.mjs",
        "domain-import",
        "--project",
        projectPath,
        "--entries-json",
        JSON.stringify([
          {
            type: "system",
            name: "Alchemy",
            facts: ["Alchemy requires equivalent exchange."],
            constraints: ["Alchemy cannot create gold from air."],
          },
        ]),
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(imported.status, 0, imported.stderr);
    assert.match(imported.stdout, /domain-import: imported/);
    assert.match(imported.stdout, /entries: 1/);

    const knowledge = spawnSync("node", ["src/cli.mjs", "domain-knowledge", "--project", projectPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(knowledge.status, 0, knowledge.stderr);
    assert.match(knowledge.stdout, /entries: 1/);
    assert.match(knowledge.stdout, /saved-source-text: false/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.30 home page exposes domain knowledge controls", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());

    assert.match(html, /domainKnowledgePlanAction/);
    assert.match(html, /domainKnowledgeImportAction/);
    assert.match(html, /domainKnowledgeCollectAction/);
    assert.match(html, /domainKnowledgeBaseAction/);
    assert.match(html, /\/api\/domain-knowledge\/plan/);
    assert.match(html, /\/api\/domain-knowledge\/import/);
    assert.match(html, /\/api\/domain-knowledge\/collect/);
    assert.match(html, /Domain knowledge/);
  } finally {
    await app.close();
  }
});
