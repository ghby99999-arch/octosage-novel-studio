import test from "node:test";
import assert from "node:assert/strict";

import { serveLocal } from "../src/server.mjs";

async function readHomeHtml() {
  const app = await serveLocal({ port: 0 });
  try {
    const port = app.server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 200);
    return await response.text();
  } finally {
    await new Promise((resolve, reject) => app.server.close((error) => (error ? reject(error) : resolve())));
  }
}

function sectionBetween(html, startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing start marker ${startMarker}`);
  assert.notEqual(end, -1, `missing end marker ${endMarker}`);
  return html.slice(start, end);
}

test("v1.101 home page exposes polished mode-based product shell", async () => {
  const html = await readHomeHtml();

  assert.match(html, /<title>OctoSage<\/title>/);
  assert.match(html, />OctoSage</);
  assert.match(html, /V1\.100/);
  assert.match(html, /brand-mark/);
  assert.match(html, /<svg viewBox="0 0 64 64"/);
  assert.match(html, /class="app-shell"/);
  assert.match(html, /id="modeSwitch"/);
  assert.match(html, /data-mode="novel"/);
  assert.match(html, /data-mode="video"/);
  assert.match(html, /data-mode="settings"/);
  assert.match(html, /id="novelModePanel"/);
  assert.match(html, /id="videoModePanel"/);
  assert.match(html, /id="settingsModePanel"/);
  assert.doesNotMatch(html, /<span class="brand-mark">.*<\/span>Novel Studio/);
});

test("v1.102 design language uses warm dark writing-first tokens", async () => {
  const html = await readHomeHtml();

  assert.match(html, /--bg-base:\s*#1a1714/);
  assert.match(html, /--bg-output:\s*#171411/);
  assert.match(html, /--text-primary:\s*#e8ddcc/);
  assert.match(html, /--accent:\s*#d4a853/);
  assert.match(html, /\.output-area/);
  assert.match(html, /repeating-linear-gradient/);
});

test("v1.103 video factory UI includes script storyboard assets and full-pack actions", async () => {
  const html = await readHomeHtml();

  assert.match(html, /id="videoFactoryPanel"/);
  assert.match(html, /id="videoModeChoices"/);
  assert.match(html, /id="videoPhaseRail"/);
  assert.match(html, /id="videoNextStepCard"/);
  assert.match(html, /id="videoTool"/);
  assert.match(html, /id="videoStyle"/);
  assert.match(html, /id="videoFromChapter"/);
  assert.match(html, /id="videoToChapter"/);
  assert.match(html, /videoCharacterFactoryAction/);
  assert.match(html, /videoSceneFactoryAction/);
  assert.match(html, /videoScriptExportAction/);
  assert.match(html, /videoStoryboardAction/);
  assert.match(html, /videoPromptAction/);
  assert.match(html, /videoFullPackAction/);
  assert.match(html, /selectVideoMode/);
  assert.match(html, /videoStepAction/);
  assert.match(html, /&#30701;&#21095;&#21095;&#26412;/);
  assert.match(html, /&#28459;&#21095;&#20998;&#38236;/);
  assert.match(html, /&#23567;&#35828;&#25512;&#25991;&#35270;&#39057;/);
  assert.match(html, /AI &#35270;&#39057;&#32032;&#26448;&#21253;/);
});

test("v1.104 UI keeps existing workbench ids while reducing visible chaos through panels", async () => {
  const html = await readHomeHtml();

  for (const id of [
    "batchWritingFlow",
    "referenceAutoDissectionPanel",
    "domainKnowledgePanel",
    "dynamicTemplatesPanel",
    "publicReferencePanel",
    "firstChapterPanel",
    "dashboardSummary",
    "output",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /class="tool-panel"/);
  assert.match(html, /class="stage-panel"/);
});

test("v1.105 interaction polish includes focus mode mode switching progress and status bar", async () => {
  const html = await readHomeHtml();

  assert.match(html, /toggleFocusMode/);
  assert.match(html, /setMode/);
  assert.match(html, /class="statusbar"/);
  assert.match(html, /class="shortcut-hint"/);
  assert.match(html, /status-writing/);
  assert.match(html, /grade-badge/);
  assert.match(html, /dashboard-card/);
  assert.match(html, /prefers-reduced-motion/);
});

test("v1.106 home page absorbs Chinese AI writing task shelf patterns", async () => {
  const html = await readHomeHtml();

  assert.match(html, /&#20170;&#22825;&#24819;&#20570;&#20160;&#20040;&#65311;/);
  assert.match(html, /&#20889;&#26032;&#20070;/);
  assert.match(html, /&#32493;&#20889;&#24403;&#21069;&#20070;/);
  assert.match(html, /&#25237;&#31295;&#21069;&#39044;&#23457;&#26680;/);
  assert.match(html, /&#25913;&#25104;&#30701;&#21095;&#47;&#28459;&#21095;/);
  assert.doesNotMatch(sectionBetween(html, 'id="deskView"', '<section class="mode-layout">'), /&#20934;&#22791;&#25237;&#31295;&#21457;&#24067;|&#25209;&#37327;&#20889;&#20070;/);
  assert.match(html, /class="desk-card featured"/);
});
