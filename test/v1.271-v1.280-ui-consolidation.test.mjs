import test from "node:test";
import assert from "node:assert/strict";

import { createLocalServer } from "../src/server.mjs";

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

function sectionBetween(html, startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing start marker ${startMarker}`);
  assert.notEqual(end, -1, `missing end marker ${endMarker}`);
  return html.slice(start, end);
}

const engineeringLabels = [
  "Domain knowledge plan",
  "Domain knowledge base",
  "Import domain knowledge",
  "Collect confirmed sources",
  "Domain build plan",
  "Build confirmed domain KB",
  "Reference Auto-Dissection",
  "Reference read plan",
  "Import visible reference structure",
  "Dynamic Templates: Refresh",
  "Dynamic Templates: Recommend",
  "Public Reference Library: Grow",
  "Public Reference Library: Recommend",
  "Public Reference Library: Read Plan",
  "Public Reference Library: Read Run",
  "Portfolio metrics JSON",
  "Ingest portfolio data",
  "Plan premium incubation",
  "Run premium incubation",
  "premium-repair-sweep",
  "premium-gate",
  "publish-adapters",
  "selector profiles",
  "calibrate selectors",
];

test("v1.271 main workbench consolidates technical tools into ordinary actions", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());
    const simplePanel = sectionBetween(html, 'id="knowledgeSimplePanel"', 'id="knowledgeAdvancedTools"');

    assert.match(simplePanel, /autoKnowledgeAction/);
    assert.match(simplePanel, /learnReferenceRhythmAction/);
    assert.match(simplePanel, /recommendTemplatesAction/);
    assert.match(simplePanel, /importPlatformDataAction/);
    for (const label of engineeringLabels) {
      assert.doesNotMatch(simplePanel, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  } finally {
    await app.close();
  }
});

test("v1.272 technical knowledge and market tools remain available in advanced details", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());
    const advanced = sectionBetween(html, 'id="knowledgeAdvancedTools"', 'id="premiumResult"');

    assert.match(advanced, /<summary>/);
    assert.match(advanced, /domainKnowledgePlanAction/);
    assert.match(advanced, /domainBuildAction/);
    assert.match(advanced, /referenceReadPlanAction/);
    assert.match(advanced, /referenceReadRunAction/);
    assert.match(advanced, /templatesRefreshAction/);
    assert.match(advanced, /templatesRecommendAction/);
    assert.match(advanced, /publicReferencesReadRunAction/);
    assert.match(advanced, /portfolioIngestAction/);
  } finally {
    await app.close();
  }
});

test("v1.273 project-dependent actions show a friendly local guard before posting", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());

    assert.match(html, /function requireProjectPath/);
    assert.match(html, /requireProjectPath\("single-chapter"\)/);
    assert.match(html, /requireProjectPath\("cost-check"\)/);
    assert.match(html, /requireProjectPath\("batch-write"\)/);
  } finally {
    await app.close();
  }
});

test("v1.274 novel workbench keeps the first screen to four ordinary writing actions", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());
    const simplePanel = sectionBetween(html, 'id="novelSimplePanel"', 'id="novelAdvancedTools"');

    assert.match(simplePanel, /createProjectAction/);
    assert.match(simplePanel, /startFirstChapterAction/);
    assert.match(simplePanel, /runProjectAction/);
    assert.match(simplePanel, /showQualityReport/);
    assert.doesNotMatch(simplePanel, /memorySearchAction|readerSimAction|sendFeishuAction|dryRun/);

    const advanced = sectionBetween(html, 'id="novelAdvancedTools"', 'id="legacyNovelStatusGrid"');
    assert.match(advanced, /memorySearchAction/);
    assert.match(advanced, /readerSimAction/);
    assert.match(advanced, /dryRun/);
    assert.match(advanced, /exportMergedAction/);
  } finally {
    await app.close();
  }
});

test("v1.275 novel workbench drives actions from the current writing phase", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());
    const simplePanel = sectionBetween(html, 'id="novelSimplePanel"', 'id="novelAdvancedTools"');

    assert.match(simplePanel, /id="novelPhaseRail"/);
    assert.match(simplePanel, /id="writingModeChoices"/);
    assert.match(simplePanel, /id="batchWritingFlow"/);
    assert.match(simplePanel, /id="nextStepCard"/);
    assert.match(simplePanel, /id="nextCreateButton"/);
    assert.match(simplePanel, /id="nextWriteButton"/);
    assert.match(simplePanel, /id="nextQualityButton"/);
    assert.match(simplePanel, /id="nextExportButton"/);
    assert.match(simplePanel, /&#39044;&#23457;/);
    assert.match(simplePanel, /&#25237;&#31295;&#21069;&#39044;&#23457;&#26680;/);
    assert.match(html, /function updateProgressActions/);
    assert.match(html, /function smartWriteAction/);
    assert.match(html, /function selectWritingMode/);
    assert.match(html, /function openBatchWriting/);
  } finally {
    await app.close();
  }
});

test("v1.276 settings panel avoids duplicating operations workspace buttons", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());
    const settingsPanel = sectionBetween(html, 'id="settingsModePanel"', "</aside>");

    assert.match(settingsPanel, /id="apiKeyPanel"/);
    assert.match(settingsPanel, /saveApiKeyAction/);
    assert.match(settingsPanel, /apiKeyStatusAction/);
    assert.doesNotMatch(settingsPanel, /setMode\('novel'\)|setMode\('incubation'\)|setMode\('publish'\)|knowledgeSimplePanel|premiumWorkbench/);
  } finally {
    await app.close();
  }
});
