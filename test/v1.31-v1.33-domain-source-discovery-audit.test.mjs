import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createLocalServer } from "../src/server.mjs";
import {
  collectDomainKnowledgeFromSources,
  createProject,
  generateDomainSourceCandidates,
  readDomainKnowledgeSourceAudit,
  rebuildDomainKnowledgeFromAudit,
} from "../src/core/workflow.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createTempProject(prefix = "novel-studio-v131-domain-sources-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.31 domain sources",
    idea: "我要写一本梦幻西游网文，主角从大唐官府开始",
    platform: "fanqie",
    genre: "game ip adventure",
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

test("v1.31 source candidates are generated from the domain plan without fetching", async () => {
  const { root, project } = await createTempProject();
  try {
    let fetched = false;
    const candidates = await generateDomainSourceCandidates(project, {
      search: async () => {
        fetched = true;
        return [];
      },
    });

    assert.equal(fetched, false);
    assert.equal(candidates.project_title, project.title);
    assert.equal(candidates.confirmation_required, true);
    assert.equal(candidates.network_status, "candidate_only");
    assert.ok(candidates.candidates.length >= 2);
    assert.ok(candidates.candidates.every((item) => item.requires_confirmation === true));
    assert.ok(candidates.candidates.some((item) => /wiki|baike/i.test(item.search_query)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.32-v1.33 confirmed collection records source audit without source prose", async () => {
  const { root, project } = await createTempProject("novel-studio-v132-audit-");
  try {
    const result = await collectDomainKnowledgeFromSources(project, {
      confirmed: true,
      sources: [
        { url: "https://example.test/datang", title: "Datang page" },
        { url: "https://example.test/fail", title: "Broken page" },
      ],
      fetch: async (url) => {
        if (url.includes("fail")) return { ok: false, status: 500, text: async () => "should not persist" };
        return {
          ok: true,
          status: 200,
          text: async () => "大唐官府：物理输出门派。代表技能：横扫千军。禁忌：不能写成法术主输出门派。",
        };
      },
    });
    const audit = await readDomainKnowledgeSourceAudit(project);
    const serializedAudit = JSON.stringify(audit);
    const serializedKnowledge = JSON.stringify(result);

    assert.equal(result.saved_source_text, false);
    assert.ok(result.entries.length >= 1);
    assert.equal(audit.records.length, 2);
    assert.equal(audit.records[0].status, "ingested");
    assert.equal(audit.records[0].entry_count, 1);
    assert.equal(audit.records[1].status, "fetch_failed");
    assert.equal(audit.records[1].http_status, 500);
    assert.equal(serializedAudit.includes("物理输出门派。代表技能"), false);
    assert.equal(serializedKnowledge.includes("物理输出门派。代表技能"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.33 knowledge base can be rebuilt from successful audited sources", async () => {
  const { root, project } = await createTempProject("novel-studio-v133-rebuild-");
  try {
    await collectDomainKnowledgeFromSources(project, {
      confirmed: true,
      sources: [{ url: "https://example.test/datang", title: "Datang page" }],
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => "大唐官府：物理输出门派。代表技能：横扫千军。禁忌：不能写成法术主输出门派。",
      }),
    });

    const rebuilt = await rebuildDomainKnowledgeFromAudit(project, {
      confirmed: true,
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => "大唐官府：物理输出门派。代表技能：横扫千军。禁忌：不能写成法术主输出门派。",
      }),
    });

    assert.equal(rebuilt.status, "rebuilt");
    assert.equal(rebuilt.source_count, 1);
    assert.equal(rebuilt.knowledge.saved_source_text, false);
    assert.equal(rebuilt.knowledge.entries.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.31-v1.33 server exposes source candidates, audit, and rebuild APIs", async () => {
  const { root, project } = await createTempProject("novel-studio-v131-server-");
  const app = await startTestServer({
    domainKnowledgeFetch: async () => ({
      ok: true,
      status: 200,
      text: async () => "大唐官府：物理输出门派。代表技能：横扫千军。禁忌：不能写成法术主输出门派。",
    }),
  });
  try {
    const candidates = await fetch(`${app.baseUrl}/api/domain-knowledge/sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path }),
    }).then((response) => response.json());
    assert.equal(candidates.network_status, "candidate_only");
    assert.ok(candidates.candidates.length >= 2);

    await fetch(`${app.baseUrl}/api/domain-knowledge/collect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: project.path,
        confirmed: true,
        sources: [{ url: "https://example.test/datang", title: "Datang page" }],
      }),
    }).then((response) => response.json());

    const audit = await fetch(
      `${app.baseUrl}/api/domain-knowledge/audit?project=${encodeURIComponent(project.path)}`,
    ).then((response) => response.json());
    assert.equal(audit.records.length, 1);
    assert.equal(audit.records[0].status, "ingested");

    const rebuilt = await fetch(`${app.baseUrl}/api/domain-knowledge/rebuild`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, confirmed: true }),
    }).then((response) => response.json());
    assert.equal(rebuilt.status, "rebuilt");
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.31 CLI exposes source candidate and audit commands", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v131-cli-"));
  try {
    const init = spawnSync(
      "node",
      [
        "src/cli.mjs",
        "init",
        "--root",
        root,
        "--title",
        "cli-domain-source-project",
        "--idea",
        "我要写一本梦幻西游网文，主角从大唐官府开始",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(init.status, 0, init.stderr);
    const projectPath = path.join(root, "cli-domain-source-project");

    const help = spawnSync("node", ["src/cli.mjs", "help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /domain-sources --project/);
    assert.match(help.stdout, /domain-audit --project/);

    const sources = spawnSync("node", ["src/cli.mjs", "domain-sources", "--project", projectPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(sources.status, 0, sources.stderr);
    assert.match(sources.stdout, /domain-sources:/);
    assert.match(sources.stdout, /candidate-only: true/);

    const audit = spawnSync("node", ["src/cli.mjs", "domain-audit", "--project", projectPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(audit.status, 0, audit.stderr);
    assert.match(audit.stdout, /records: 0/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
