import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createLocalServer } from "../src/server.mjs";
import { buildWritingTaskPackage, createProject, generateChapterCard } from "../src/core/workflow.mjs";

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

function parseTaskEvent(text) {
  const dataLine = String(text || "").split(/\r?\n/).find((line) => line.startsWith("data: "));
  assert.ok(dataLine, "task SSE response should include a data line");
  return JSON.parse(dataLine.slice("data: ".length));
}

async function pollTask(baseUrl, taskId) {
  let task;
  for (let i = 0; i < 80; i += 1) {
    const response = await fetch(`${baseUrl}/api/tasks/${taskId}`);
    task = await response.json();
    if (["completed", "failed", "stopped"].includes(task.status)) return task;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return task;
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

test("writing task progress exposes real stage summaries for the workbench", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octosage-writing-progress-"));
  const project = await createProject({
    root,
    title: "progress visibility",
    idea: "2016 rebirth campus delivery business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  const app = await startTestServer();
  try {
    const createdResponse = await fetch(`${app.baseUrl}/api/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: project.path,
        chapter_no: 1,
        max_rewrites: 1,
        allow_mock: true,
      }),
    });
    assert.equal(createdResponse.status, 200);

    const created = parseTaskEvent(await createdResponse.text());
    const task = await pollTask(app.baseUrl, created.task_id);

    assert.equal(task.status, "completed");
    assert.equal(task.progress.step, "completed");
    assert.equal(task.progress.chapter_no, 1);
    assert.equal(typeof task.progress.message, "string");
    assert.match(task.progress.message, /完成|completed|写作/);
    assert.ok(task.progress.word_count > 0);
    assert.ok(task.progress.draft_preview.length > 20);
    assert.ok(task.progress.grade);
    assert.ok(task.progress.version);
    assert.ok(task.progress.export_path.endsWith(".txt"));
    assert.ok(task.progress.state_candidates_path.endsWith(".json"));
    assert.equal(task.result.status, "approved");
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("project tree api exposes planning and reference writing assets", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octosage-project-tree-api-"));
  const project = await createProject({
    root,
    title: "project tree api",
    idea: "Song dynasty tea merchant rebirth story",
    platform: "fanqie",
    genre: "history business",
  });
  const app = await startTestServer();
  try {
    const response = await fetch(`${app.baseUrl}/api/project/tree?project=${encodeURIComponent(project.path)}`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.status, "ready");
    assert.equal(Array.isArray(payload.branches), true);
    const labels = payload.branches.map((branch) => branch.label);
    assert.ok(labels.includes("开书规划"));
    assert.ok(labels.includes("拆书与节奏迁移"));
    const planning = payload.branches.find((branch) => branch.key === "planning");
    assert.equal(planning.status, "ready");
    assert.ok(planning.children.some((item) => item.label === "项目圣经" && item.status === "ready"));
    assert.ok(planning.children.some((item) => item.label === "人物关系" && item.status === "ready"));
    const actions = payload.actions.map((action) => action.key);
    assert.ok(actions.includes("reference_read"));
    assert.ok(actions.includes("domain_build"));
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("reference center exposes split-book results and activates mimic writing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octosage-reference-center-"));
  const project = await createProject({
    root,
    title: "reference center api",
    idea: "campus delivery business story",
    platform: "fanqie",
    genre: "urban business",
  });
  const app = await startTestServer();
  try {
    const runResponse = await fetch(`${app.baseUrl}/api/reference-read/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: project.path,
        name: "sample-reference",
        confirm: true,
        chapter_limit: 1,
        chapters: [{
          chapter_no: 1,
          title: "sample",
          text: "The queue bent around the dining hall. He watched the numbers jump from 37 to 99. The old owner froze, and the phone kept ringing.",
          saved_source_text: false,
        }],
      }),
    });
    assert.equal(runResponse.status, 200);

    const resultsResponse = await fetch(`${app.baseUrl}/api/reference/results?project=${encodeURIComponent(project.path)}`);
    const results = await resultsResponse.json();
    assert.equal(resultsResponse.status, 200);
    assert.equal(results.status, "ready");
    assert.ok(results.references.some((reference) => reference.reference_name === "sample-reference"));
    assert.ok(results.structures.some((structure) => structure.reference_name === "sample-reference"));
    assert.equal(results.plugin.function_name, "novelStudioSyncVisibleReferenceStructure");

    const activateResponse = await fetch(`${app.baseUrl}/api/reference/rhythm/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: project.path,
        reference_name: "sample-reference",
        from: 1,
        to: 3,
      }),
    });
    const activated = await activateResponse.json();
    assert.equal(activateResponse.status, 200);
    assert.equal(activated.status, "activated");
    assert.equal(activated.active_rhythm_transfer_plan, "reference-sample-reference");

    const nextResultsResponse = await fetch(`${app.baseUrl}/api/reference/results?project=${encodeURIComponent(project.path)}`);
    const nextResults = await nextResultsResponse.json();
    assert.equal(nextResults.active_rhythm_transfer_plan, "reference-sample-reference");
    assert.ok(nextResults.rhythm_plans.some((plan) => plan.name === "reference-sample-reference"));
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("batch writing progress exposes completed chapter summaries", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octosage-batch-progress-"));
  const project = await createProject({
    root,
    title: "batch progress visibility",
    idea: "2016 rebirth campus delivery business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  const app = await startTestServer();
  try {
    const createdResponse = await fetch(`${app.baseUrl}/api/run-project`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: project.path,
        until_chapter: 2,
        max_rewrites: 1,
        allow_mock: true,
      }),
    });
    assert.equal(createdResponse.status, 200);

    const created = parseTaskEvent(await createdResponse.text());
    const task = await pollTask(app.baseUrl, created.task_id);

    assert.equal(task.status, "completed");
    assert.equal(task.progress.step, "completed");
    assert.equal(task.progress.completed_chapters, 2);
    assert.equal(Array.isArray(task.progress.chapter_results), true);
    assert.equal(task.progress.chapter_results.length, 2);
    assert.equal(task.progress.chapter_results[0].chapter_no, 1);
    assert.ok(task.progress.chapter_results[0].grade);
    assert.ok(task.progress.chapter_results[0].word_count > 0);
    assert.ok(task.progress.chapter_results[0].export_path.endsWith(".txt"));
    assert.equal(task.progress.latest_chapter.chapter_no, 2);
    assert.ok(task.progress.message);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("new project creation initializes visible planning tree", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octosage-project-tree-"));
  const app = await startTestServer();
  try {
    const response = await fetch(`${app.baseUrl}/api/project`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        root,
        title: "project tree test",
        idea: "宋朝穿越做茶叶生意",
        platform: "fanqie",
        genre: "历史/经商",
      }),
    });
    const project = await response.json();
    assert.equal(response.status, 200);
    assert.equal(await pathExists(path.join(project.project_path, "项目树.json")), true);
    assert.equal(await pathExists(path.join(project.project_path, "项目圣经.md")), true);
    assert.equal(await pathExists(path.join(project.project_path, "大纲", "总纲.md")), true);
      assert.equal(await pathExists(path.join(project.project_path, "设定", "设定库.md")), true);
      assert.equal(await pathExists(path.join(project.project_path, "设定", "人物关系.md")), true);
      assert.equal(await pathExists(path.join(project.project_path, "卷纲", "第一卷.md")), true);
      assert.equal(await pathExists(path.join(project.project_path, "细纲", "前10章.md")), true);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("new desktop book creation starts real planning instead of prefilled templates", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octosage-project-auto-planning-"));
  const app = await startTestServer();
  try {
    const response = await fetch(`${app.baseUrl}/api/project`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        root,
        title: "auto planning test",
        idea: "宋朝穿越做茶叶生意",
        platform: "fanqie",
        genre: "历史/经商",
        initialize_planning: false,
        auto_planning: true,
        local_only: true,
      }),
    });
    const project = await response.json();
    assert.equal(response.status, 200);
    assert.equal(project.status, "created");
    assert.ok(project.planning_task_id);

    const treeBefore = await fetch(`${app.baseUrl}/api/project/tree?project=${encodeURIComponent(project.project_path)}`)
      .then((payload) => payload.json());
    const planningBefore = treeBefore.branches.find((branch) => branch.key === "planning");
    assert.notEqual(planningBefore.status, "ready");

    const task = await pollTask(app.baseUrl, project.planning_task_id);
    assert.equal(task.status, "completed");
    assert.equal(task.result.status, "planning-ready");
    const planningPreview = String(task.result.preview_text || task.result.text_preview || "");
    const progressPreview = String(task.progress?.preview_text || task.progress?.text_preview || "");
    assert.match(planningPreview, /人物关系|前10章细纲/);
    assert.match(progressPreview, /人物关系|前10章细纲/);
    assert.ok(task.result.assets.some((asset) => asset.label === "人物关系"));
    assert.equal(await pathExists(path.join(project.project_path, "项目圣经.md")), true);
    assert.equal(await pathExists(path.join(project.project_path, "大纲", "总纲.md")), true);
    assert.equal(await pathExists(path.join(project.project_path, "设定", "设定库.md")), true);
    assert.equal(await pathExists(path.join(project.project_path, "设定", "人物关系.md")), true);
    assert.equal(await pathExists(path.join(project.project_path, "卷纲", "第一卷.md")), true);
    assert.equal(await pathExists(path.join(project.project_path, "细纲", "前10章.md")), true);

    const treeAfter = await fetch(`${app.baseUrl}/api/project/tree?project=${encodeURIComponent(project.project_path)}`)
      .then((payload) => payload.json());
    const planningAfter = treeAfter.branches.find((branch) => branch.key === "planning");
    assert.equal(planningAfter.status, "ready");
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("chapter card generation and writing task package carry project planning assets", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octosage-planning-context-"));
  const project = await createProject({
    root,
    title: "song tea planning context",
    idea: "宋朝穿越做茶叶供应链",
    platform: "fanqie",
    genre: "历史经商",
  });
  try {
    await mkdir(path.join(project.path, "细纲"), { recursive: true });
    await mkdir(path.join(project.path, "设定"), { recursive: true });
    await writeFile(path.join(project.path, "项目圣经.md"), "主角必须从茶摊切入，不得出现梦幻西游、长安城副本、装备交易。\n", "utf8");
    await writeFile(path.join(project.path, "设定", "人物关系.md"), "陆青与茶农阿蛮、码头牙人周掌柜形成供应链关系。\n", "utf8");
    await writeFile(path.join(project.path, "细纲", "前10章.md"), "第1章：陆青醒在汴河茶摊，发现茶叶受潮，被迫用焙火和试饮挽回第一批客人。\n", "utf8");

    const seen = [];
    const router = {
      async invoke(task) {
        seen.push(task);
        if (task.task_type === "generate_chapter_card") {
          assert.match(task.planning_context?.fine_outline || "", /汴河茶摊/);
          assert.match(task.planning_context?.character_relationships || "", /茶农阿蛮/);
          return {
            chapter_no: task.chapter_no,
            display_title: "第1章 汴河茶摊的湿茶",
            opening_hook: "陆青刚掀开茶篓，就闻到一股霉潮味。",
            main_event: "他用焙火和试饮救回第一批客人。",
            protagonist_action: "当场改焙茶、试饮、定价。",
            conflict: "茶叶受潮，客人要退钱。",
            cool_point_type: "危机转单",
            visible_result: "围观客人愿意重新排队试饮。",
            tail_hook: "周掌柜盯上了他的焙火手法。",
            characters_in_scene: [{ name: "陆青", role: "主角" }, { name: "阿蛮", role: "茶农" }],
            facts_required: ["茶叶受潮", "焙火试饮"],
            forbidden_items: ["梦幻西游", "长安城", "装备交易"],
          };
        }
        throw new Error(`unexpected task ${task.task_type}`);
      },
    };

    const card = await generateChapterCard(project, 1, { router });
    const taskPackage = await buildWritingTaskPackage(project, 1, { force: true });

    assert.equal(card.display_title, "第1章 汴河茶摊的湿茶");
    assert.match(taskPackage.context.project_planning.fine_outline, /汴河茶摊/);
    assert.match(taskPackage.context.project_planning.character_relationships, /茶农阿蛮/);
    assert.match(taskPackage.context.project_planning.project_bible, /不得出现梦幻西游/);
    assert.match(taskPackage.context.project_planning.anti_cross_project_rules.join("\n"), /不得继承其他项目/);
    assert.doesNotMatch([
      card.display_title,
      card.opening_hook,
      card.main_event,
      card.protagonist_action,
      card.visible_result,
      card.tail_hook,
    ].join("\n"), /梦幻西游|长安城|装备交易|后台数字/);
    assert.ok(seen.some((task) => task.task_type === "generate_chapter_card"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
