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

test("v1.231 premium workbench exposes ordinary-language main actions", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());
    const simplePanel = sectionBetween(html, 'id="premiumSimplePanel"', 'id="premiumAdvancedTools"');

    assert.match(simplePanel, /premiumIdeaAction/);
    assert.match(simplePanel, /premiumWriteFrontAction/);
    assert.match(simplePanel, /premiumAutoFixAction/);
    assert.match(simplePanel, /&#29983;&#25104;&#26032;&#20070;&#26041;&#26696;/);
    assert.match(simplePanel, /&#25209;&#37327;&#20889;&#21069;30&#31456;/);
    assert.match(simplePanel, /&#33258;&#21160;&#20462;&#21040;&#21487;&#21457;&#24067;/);
    assert.doesNotMatch(simplePanel, /premium-run|premium-gate|repair-sweep|Plan premium incubation|Run premium incubation/);
    assert.match(html, /openBatchWriting/);
    assert.match(html, /batchIdeaAction/);
  } finally {
    await app.close();
  }
});

test("v1.232 premium advanced actions are folded away for operators", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());
    const advanced = sectionBetween(html, 'id="premiumAdvancedTools"', 'id="publishSimplePanel"');

    assert.match(advanced, /<summary>/);
    assert.match(advanced, /premiumPlanAction/);
    assert.match(advanced, /premiumRunAction/);
    assert.match(advanced, /premiumRepairQueueAction/);
    assert.match(advanced, /premiumRepairSweepAction/);
    assert.match(advanced, /premiumGateAction/);
  } finally {
    await app.close();
  }
});



