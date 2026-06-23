import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createLocalServer } from "../src/server.mjs";
import {
  createDomainKnowledgeBuildPlan,
  createProject,
  runDomainKnowledgeBuild,
} from "../src/core/workflow.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createTempProject(prefix = "novel-studio-v161-domain-build-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "domain auto build",
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

test("v1.61 creates a confirmable domain knowledge build plan from project idea", async () => {
  const { root, project } = await createTempProject();
  try {
    const plan = await createDomainKnowledgeBuildPlan(project);

    assert.equal(plan.status, "awaiting_confirmation");
    assert.equal(plan.project_title, project.title);
    assert.equal(plan.domain, "梦幻西游");
    assert.equal(plan.saved_source_text, false);
    assert.equal(plan.requires_user_confirmation_before_network, true);
    assert.ok(plan.sources.length >= 2);
    assert.ok(plan.sources.every((source) => source.requires_confirmation === true));
    assert.ok(plan.next_actions.includes("domain-build --confirm"));
    assert.ok(plan.path.endsWith("domain_knowledge_build_plan.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.62 confirmed build fetches candidate sources, stores structured entries, and writes audit", async () => {
  const { root, project } = await createTempProject("novel-studio-v162-domain-build-run-");
  try {
    await createDomainKnowledgeBuildPlan(project);
    const result = await runDomainKnowledgeBuild(project, {
      confirmed: true,
      fetch: async (url) => ({
        ok: true,
        status: 200,
        text: async () => url.includes("baike")
          ? "长安城：主城。禁忌：不要写成荒野副本。"
          : "大唐官府：物理输出门派。代表技能：横扫千军。禁忌：不能写成法术主输出门派。",
      }),
    });

    assert.equal(result.status, "built");
    assert.equal(result.knowledge.saved_source_text, false);
    assert.ok(result.knowledge.entries.some((entry) => entry.name === "大唐官府"));
    assert.ok(result.audit.records.every((record) => record.saved_source_text === false));
    assert.ok(result.audit.records.every((record) => ["ingested", "no_entries"].includes(record.status)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.63 domain build refuses network work without explicit confirmation", async () => {
  const { root, project } = await createTempProject("novel-studio-v163-domain-build-confirm-");
  try {
    await createDomainKnowledgeBuildPlan(project);

    await assert.rejects(
      runDomainKnowledgeBuild(project, {
        confirmed: false,
        fetch: async () => {
          throw new Error("should not fetch");
        },
      }),
      /requires user confirmation/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.64 server exposes domain build plan and confirmed run APIs", async () => {
  const { root, project } = await createTempProject("novel-studio-v164-domain-build-server-");
  const app = await startTestServer({
    domainKnowledgeFetch: async () => ({
      ok: true,
      status: 200,
      text: async () => "大唐官府：物理输出门派。代表技能：横扫千军。禁忌：不能写成法术主输出门派。",
    }),
  });
  try {
    const plan = await fetch(`${app.baseUrl}/api/domain-knowledge/build-plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path }),
    }).then((response) => response.json());
    assert.equal(plan.status, "awaiting_confirmation");

    const unconfirmed = await fetch(`${app.baseUrl}/api/domain-knowledge/build`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, confirmed: false }),
    });
    assert.equal(unconfirmed.status, 400);

    const built = await fetch(`${app.baseUrl}/api/domain-knowledge/build`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, confirmed: true }),
    }).then((response) => response.json());
    assert.equal(built.status, "built");
    assert.ok(built.knowledge.entries.length >= 1);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.65 CLI exposes domain-build-plan and domain-build confirmed flow", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v165-domain-build-cli-"));
  try {
    const init = spawnSync(
      "node",
      [
        "src/cli.mjs",
        "init",
        "--root",
        root,
        "--title",
        "cli-domain-build",
        "--idea",
        "我要写一本梦幻西游网文，主角从大唐官府开始",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(init.status, 0, init.stderr);
    const projectPath = path.join(root, "cli-domain-build");

    const help = spawnSync("node", ["src/cli.mjs", "help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /domain-build-plan --project/);
    assert.match(help.stdout, /domain-build --confirm --project/);

    const plan = spawnSync("node", ["src/cli.mjs", "domain-build-plan", "--project", projectPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(plan.status, 0, plan.stderr);
    assert.match(plan.stdout, /domain-build-plan: awaiting_confirmation/);
    assert.match(plan.stdout, /confirmation-required: true/);

    const unconfirmed = spawnSync("node", ["src/cli.mjs", "domain-build", "--project", projectPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.notEqual(unconfirmed.status, 0);
    assert.match(unconfirmed.stderr, /domain-build requires --confirm/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
