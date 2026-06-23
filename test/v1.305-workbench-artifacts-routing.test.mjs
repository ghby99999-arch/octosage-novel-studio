import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createLocalServer } from "../src/server.mjs";
import { createProject } from "../src/core/workflow.mjs";
import {
  chapterCardFile,
  draftFile,
  exportFile,
  qualityReportFile,
} from "../src/core/paths.mjs";
import { writeJson, writeText } from "../src/core/fsx.mjs";

async function startTestServer(project) {
  const app = createLocalServer({ defaultProject: project });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const { port } = app.server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => app.server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

async function seedChapter(project, chapterNo) {
  await writeJson(chapterCardFile(project, chapterNo), {
    chapter_no: chapterNo,
    display_title: `第${chapterNo}章 测试标题`,
    opening_hook: "订单后台突然跳动。",
    main_event: "主角用校园订单证明判断。",
    protagonist_action: "先收定金再履约。",
    conflict: "同学误会他在硬撑。",
    cool_point_type: "misread_then_result",
    visible_result: "订单数字从 37 跳到 99。",
    tail_hook: "后台又出现一个陌生大单。",
    characters_in_scene: ["陆川"],
  });
  await writeText(
    draftFile(project, chapterNo, "v1"),
    `第${chapterNo}章 测试标题\n\n陆川把旧手机放在桌上。\n\n订单数字从 37 跳到 99，周围突然安静下来。\n`,
  );
  await writeText(
    exportFile(project, chapterNo),
    `第${chapterNo}章 测试标题\n\n陆川把旧手机放在桌上。\n\n订单数字从 37 跳到 99，周围突然安静下来。\n`,
  );
  await writeJson(qualityReportFile(project, chapterNo), {
    project_title: project.title,
    chapter_no: chapterNo,
    status: "approved",
    final_grade: "A",
    final_version: "v1",
    quality_metrics: {
      tail_hook_score: { score: 98 },
      micro_hook_density: { density: 1.4 },
      coolpoint_delivered: { effective_count: 2 },
      drop_risk_segments: { risky_segment_count: 0 },
      retention_prediction: { score: 96 },
      opening_hook_score: { score: 96 },
    },
  });
}

test("v1.305 workbench exposes model routes plus editable video and publish artifacts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "octosage-workbench-artifacts-"));
  const project = await createProject({
    root,
    title: "workbench target",
    idea: "2016 rebirth campus delivery story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  const app = await startTestServer(project);
  try {
    await seedChapter(project, 1);

    const routes = await fetch(`${app.baseUrl}/api/model/routes`).then((response) => response.json());
    assert.ok(routes.routes.some((route) => route.task_type === "write_chapter"));
    assert.ok(routes.routes.some((route) => route.task_type === "review_chapter"));

    const scriptResponse = await fetch(`${app.baseUrl}/api/video/script`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, chapter_no: 1 }),
    });
    assert.equal(scriptResponse.status, 200);

    const saveVideo = await fetch(`${app.baseUrl}/api/video/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, chapter_no: 1, tool: "jimeng", kind: "prompts", content: "shot 1 prompt" }),
    }).then((response) => response.json());
    assert.equal(saveVideo.status, "saved");

    const videoWorkspace = await fetch(`${app.baseUrl}/api/video/workspace?project=${encodeURIComponent(project.path)}&chapter_no=1&tool=jimeng`).then((response) => response.json());
    assert.equal(videoWorkspace.status, "ready");
    assert.match(videoWorkspace.prompts, /shot 1 prompt/);

    const publishPackage = await fetch(`${app.baseUrl}/api/publish/package`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, platform: "fanqie", from: 1, to: 1 }),
    }).then((response) => response.json());
    assert.equal(publishPackage.status, "ready");

    const savePublish = await fetch(`${app.baseUrl}/api/publish/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, platform: "fanqie", from: 1, to: 1, kind: "chapters", content: "第1章 已编辑投稿正文" }),
    }).then((response) => response.json());
    assert.equal(savePublish.status, "saved");

    const publishWorkspace = await fetch(`${app.baseUrl}/api/publish/workspace?project=${encodeURIComponent(project.path)}&platform=fanqie&from=1&to=1`).then((response) => response.json());
    assert.equal(publishWorkspace.status, "ready");
    assert.match(publishWorkspace.chapters, /已编辑投稿正文/);

    const handoff = await fetch(`${app.baseUrl}/api/publish/platform`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, platform: "fanqie", from: 1, to: 1, adapter_name: "manual-browser", confirmed: true }),
    }).then((response) => response.json());
    assert.equal(handoff.status, "browser_ready");
    assert.equal(handoff.publish_attempt.stop_before_final_submit, true);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
