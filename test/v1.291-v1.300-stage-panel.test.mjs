import test from "node:test";
import assert from "node:assert/strict";

import { createLocalServer } from "../src/server.mjs";

async function readHomeHtml() {
  const app = createLocalServer();
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const { port } = app.server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 200);
    return await response.text();
  } finally {
    await new Promise((resolve, reject) => app.server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("v1.291 right stage uses human-readable states instead of a raw output-only panel", async () => {
  const html = await readHomeHtml();

  assert.match(html, /id="stageEmptyView"/);
  assert.match(html, /id="stageBusyView"/);
  assert.match(html, /id="stageSummaryView"/);
  assert.match(html, /id="stageReviewView"/);
  assert.match(html, /id="stageManuscriptView"/);
  assert.match(html, /id="stageRawView"/);
  assert.match(html, /id="output"/);
  assert.match(html, /&#21407;&#22987;&#35760;&#24405;/);
  assert.doesNotMatch(html, />ready</);
});

test("v1.292 stage renderer keeps raw records but promotes review reports to a commercial report view", async () => {
  const html = await readHomeHtml();

  assert.match(html, /function setStageView/);
  assert.match(html, /function setRawOutput/);
  assert.match(html, /function renderSummary/);
  assert.match(html, /function renderReviewReport/);
  assert.match(html, /quality_metrics \|\| value\.review \|\| value\.review_quality_flags \|\| value\.final_grade/);
  assert.match(html, /投稿前预审核/);
  assert.match(html, /追读/);
  assert.match(html, /章尾钩子/);
  assert.match(html, /弃读段/);
});

test("v1.293 busy and error states are readable user states with next actions", async () => {
  const html = await readHomeHtml();

  assert.match(html, /function setBusy/);
  assert.match(html, /OctoSage 正在执行当前步骤/);
  assert.match(html, /这一步没有完成/);
  assert.match(html, /重试上一步/);
  assert.match(html, /项目目录/);
});

test("v1.294 stage board covers batch video publish and settings preview states", async () => {
  const html = await readHomeHtml();

  assert.match(html, /function renderStageBoard/);
  assert.match(html, /批量方案预览/);
  assert.match(html, /视频素材包预览/);
  assert.match(html, /发布包预览/);
  assert.match(html, /API 提供商状态/);
  assert.match(html, /角色定妆/);
  assert.match(html, /平台提示词/);
  assert.match(html, /最终提交仍由你确认/);
});

test("v1.295 settings page is a direct API settings page without duplicated workbench navigation", async () => {
  const html = await readHomeHtml();
  const start = html.indexOf('id="settingsModePanel"');
  const end = html.indexOf("</aside>", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const settingsPanel = html.slice(start, end);

  assert.match(settingsPanel, /id="apiKeyPanel"/);
  assert.match(settingsPanel, /saveApiKeyAction/);
  assert.match(settingsPanel, /apiKeyStatusAction/);
  assert.doesNotMatch(settingsPanel, /setMode\('novel'\)|setMode\('publish'\)|premiumWorkbench|knowledgeSimplePanel/);
});
