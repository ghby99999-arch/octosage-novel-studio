import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createModelRouter } from "../src/core/model-router.mjs";
import {
  analyzeAiTaste,
  analyzeReferenceStructure,
  buildChapterContext,
  compareModelsForChapter,
  createProject,
  indexProjectMemory,
  simulateReaders,
  runSingleChapterQualityLoop,
  searchProjectMemory,
} from "../src/core/workflow.mjs";
import {
  aiRewritePlanFile,
  chapterQualityCheckpointFile,
  memoryIndexFile,
  modelCompareFile,
  readerSimulationFile,
  referenceStructureFile,
  webStatusFile,
} from "../src/core/paths.mjs";
import { readJson } from "../src/core/fsx.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function createTempProject(prefix = "novel-studio-v050-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.50 product kernel",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("deepseek and doubao providers use OpenAI-compatible chat endpoints", async () => {
  const requests = [];
  const router = createModelRouter({
    provider: "deepseek",
    model: "deepseek-chat",
    allowNetwork: true,
    env: { DEEPSEEK_API_KEY: "ds-test" },
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body), headers: options.headers });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{ message: { content: "DeepSeek draft text" } }],
          };
        },
      };
    },
  });

  const output = await router.invoke({
    task_type: "write_chapter",
    chapter_card: { chapter_no: 1 },
    task_package: { output: { target_words: 300 } },
  });

  assert.equal(output.text, "DeepSeek draft text");
  assert.match(requests[0].url, /deepseek/);
  assert.equal(requests[0].body.model, "deepseek-chat");
  assert.equal(requests[0].headers.Authorization, "Bearer ds-test");

  const doubao = createModelRouter({
    provider: "doubao",
    model: "doubao-test",
    allowNetwork: true,
    env: { DOUBAO_API_KEY: "db-test" },
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body), headers: options.headers });
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: '{"grade":"B","next_action":"approve"}' } }] };
        },
      };
    },
  });
  const review = await doubao.invoke({ task_type: "review_chapter", text: "陆川行动。", chapter_card: {} });
  assert.equal(review.grade, "B");
  assert.match(requests.at(-1).url, /volces|ark/);
});

test("compareModelsForChapter writes a model comparison report", async () => {
  const { root, project } = await createTempProject();
  try {
    const report = await compareModelsForChapter(project, 1, {
      providers: ["mock", "mock-always-d"],
    });

    assert.equal(report.chapter_no, 1);
    assert.equal(report.results.length, 2);
    assert.equal(report.results[0].provider, "mock");
    assert.equal(report.results[0].status, "approved");
    assert.equal(report.results[1].final_grade, "D");
    assert.equal(report.path, modelCompareFile(project, 1));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("analyzeAiTaste writes a rewrite plan with concrete actions", async () => {
  const { root, project } = await createTempProject("novel-studio-v050-ai-taste-");
  try {
    const plan = await analyzeAiTaste(project, 1, {
      text: "他知道本地生活服务会成为互联网平台竞争的核心战场。以上就是本章内容。",
    });

    assert.equal(plan.chapter_no, 1);
    assert.ok(plan.issues.includes("explanation_heavy"));
    assert.ok(plan.actions.includes("replace_explanation_with_action"));
    assert.equal(plan.path, aiRewritePlanFile(project, 1));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("chapter card context includes batch position and narrative context for real planning", async () => {
  const { root, project } = await createTempProject("novel-studio-v050-card-context-");
  try {
    await runSingleChapterQualityLoop(project, 1, { maxRewrites: 1 });
    const context = await buildChapterContext(project, 2);

    assert.equal(context.batch_position.index_in_batch, 2);
    assert.equal(context.batch_position.batch_size, 5);
    assert.ok(context.narrative_context.last_hook);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runSingleChapterQualityLoop writes chapter-level checkpoints", async () => {
  const { root, project } = await createTempProject("novel-studio-v050-single-checkpoint-");
  try {
    await runSingleChapterQualityLoop(project, 1, { maxRewrites: 1 });

    const checkpoint = await readJson(chapterQualityCheckpointFile(project, 1));
    assert.equal(checkpoint.status, "completed");
    assert.equal(checkpoint.chapter_no, 1);
    assert.equal(checkpoint.last_step, "completed");
    assert.ok(checkpoint.completed_steps.includes("write"));
    assert.ok(checkpoint.completed_steps.includes("review"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project memory can be indexed and searched from state candidates", async () => {
  const { root, project } = await createTempProject("novel-studio-v050-memory-");
  try {
    await runSingleChapterQualityLoop(project, 1, { maxRewrites: 1 });
    const index = await indexProjectMemory(project, { from: 1, to: 1 });

    assert.equal(index.path, memoryIndexFile(project));
    assert.ok(index.items.length > 0);

    const results = await searchProjectMemory(project, "陆川");
    assert.ok(results.length > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reference structure migration stores learnable beats without source text", async () => {
  const { root, project } = await createTempProject("novel-studio-v050-reference-");
  try {
    const result = await analyzeReferenceStructure(project, {
      name: "sample-reference",
      text: "主角被误判。\n主角不解释。\n订单结果出现。\n配角态度反转。",
    });

    assert.equal(result.reference_name, "sample-reference");
    assert.equal(result.saved_source_text, false);
    assert.ok(result.transferable_beats.includes("misread_then_result"));
    assert.equal(result.path, referenceStructureFile(project, "sample-reference"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reader simulator writes reader-specific quit and continue reasons", async () => {
  const { root, project } = await createTempProject("novel-studio-v050-reader-");
  try {
    const result = await simulateReaders(project, 1, {
      text: "陆川没有解释，直接把订单表递给老周。后台数字突然跳了一下。",
    });

    assert.equal(result.chapter_no, 1);
    assert.ok(result.readers.some((reader) => reader.type === "fanqie_fast_reader"));
    assert.ok(result.readers.every((reader) => reader.quit_risk));
    assert.equal(result.path, readerSimulationFile(project, 1));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cli web-status writes a local Web shell status file", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v050-web-cli-"));
  try {
    const init = spawnSync(
      "node",
      [
        "src/cli.mjs",
        "init",
        "--root",
        root,
        "--title",
        "cli-v050-web-project",
        "--idea",
        "2016 rebirth campus local service business story",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(init.status, 0, init.stderr);
    const projectPath = path.join(root, "cli-v050-web-project");

    const status = spawnSync("node", ["src/cli.mjs", "web-status", "--project", projectPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    assert.equal(status.status, 0, status.stderr);
    assert.match(status.stdout, /web-status:/);
    assert.equal(await exists(webStatusFile({ path: projectPath })), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
