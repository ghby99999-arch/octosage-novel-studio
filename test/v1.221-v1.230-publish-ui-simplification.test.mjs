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

test("v1.221 publish workbench keeps ordinary users on two clear actions", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(`${app.baseUrl}/`).then((response) => response.text());
    const simplePanel = sectionBetween(html, 'id="publishSimplePanel"', 'id="knowledgeSimplePanel"');

    assert.match(simplePanel, /setMode\('publish'\)/);
    assert.match(simplePanel, /&#36827;&#20837;&#25237;&#31295;&#21521;&#23548;/);
    assert.doesNotMatch(simplePanel, /selector profiles|publish-adapters|calibrate selectors|manual-browser|local-dry-run/);
  } finally {
    await app.close();
  }
});

test("v1.222 publish advanced tools are folded away for troubleshooting", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(`${app.baseUrl}/`).then((response) => response.text());
    const advanced = sectionBetween(html, 'id="publishAdvancedTools"', 'id="settingsModePanel"');

    assert.match(advanced, /publishPackageAction/);
    assert.match(advanced, /publishPlanAction/);
    assert.match(advanced, /publishCalibrateSelectorsAction/);
    assert.match(advanced, /publishBrowserAction/);
    assert.match(advanced, /publishAdaptersAction/);
    assert.match(advanced, /publishProfilesAction/);
  } finally {
    await app.close();
  }
});

test("v1.223 publish has a commercial guided flow instead of adapter-first controls", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(`${app.baseUrl}/`).then((response) => response.text());
    const publishPanel = sectionBetween(html, 'id="publishModePanel"', 'id="settingsModePanel"');

    assert.match(publishPanel, /id="publishPlatformChoices"/);
    assert.match(publishPanel, /id="publishPhaseRail"/);
    assert.match(publishPanel, /id="publishNextStepCard"/);
    assert.match(publishPanel, /publishStepAction\('review'\)/);
    assert.match(publishPanel, /publishStepAction\('package'\)/);
    assert.match(publishPanel, /publishStepAction\('fill'\)/);
    assert.match(publishPanel, /&#25237;&#31295;&#21069;&#39044;&#23457;&#26680;/);
    assert.match(publishPanel, /&#29983;&#25104;&#25237;&#31295;&#21253;/);
    assert.match(publishPanel, /&#25171;&#24320;&#24179;&#21488;&#22635;&#34920;/);
    assert.match(html, /function setPublishStep/);
    assert.match(html, /function selectPublishPlatform/);
  } finally {
    await app.close();
  }
});

