import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("v1.301 top-level app is reduced to desk write and settings", async () => {
  const shell = await read("pixso-react-ui/src/views/PixsoAppShell.tsx");
  const routes = await read("pixso-react-ui/src/router/routes.ts");

  assert.match(shell, /首页/);
  assert.match(shell, /创作/);
  assert.match(shell, /设 · 系统配置/);
  assert.doesNotMatch(shell, /视频工厂/);
  assert.doesNotMatch(shell, /投稿发布/);
  assert.doesNotMatch(shell, /孵化数据/);

  assert.match(routes, /path: "\/video",\s*component: Frame2191/s);
  assert.match(routes, /path: "\/publish",\s*component: Frame2191/s);
  assert.match(routes, /path: "\/dashboard",\s*component: Frame2191/s);
});

test("v1.302 desk and writing center expose one clear start and real workbench content", async () => {
  const desk = await read("pixso-react-ui/src/views/Frame21.tsx");
  const writing = await read("pixso-react-ui/src/views/Frame2191.tsx");

  assert.match(desk, /写一句话，开始你的新书/);
  assert.match(desk, /开始写/);
  assert.doesNotMatch(desk, /onboarding|Flow|MetricStrip|HeroPanel/i);

  assert.match(writing, /目录/);
  assert.match(writing, /正文/);
  assert.match(writing, /状态/);
  assert.match(writing, /视频/);
  assert.match(writing, /发布/);
  assert.match(writing, /写下一章/);
  assert.match(writing, /连续写 5 章/);
  assert.match(writing, /审本章/);
  assert.match(writing, /生成投稿包/);
  assert.match(writing, /导出素材包/);
  assert.match(writing, /octo-studio-progress/);
  assert.match(writing, /octosage:task-progress/);
});

test("v1.303 writing actions surface live task progress inside the app", async () => {
  const bridge = await read("pixso-react-ui/src/pixso-bridge.ts");
  const server = await read("src/server.mjs");
  const workflow = await read("src/core/workflow.mjs");

  assert.match(bridge, /octosage:task-progress/);
  assert.match(bridge, /notifyTaskProgress/);
  assert.match(bridge, /setBusyState\(`正在写第/);
  assert.match(server, /onProgress: setProgress/);
  assert.match(workflow, /onProgress/);
  assert.match(workflow, /onCheckpointWrite/);
});
