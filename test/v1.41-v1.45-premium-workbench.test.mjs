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

test("v1.41 home page exposes batch writing backed by the incubation engine", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());

    assert.match(html, /id="premiumWorkbench"/);
    assert.match(html, /id="batchWritingFlow"/);
    assert.match(html, /&#25209;&#37327;&#20889;&#20070;/);
    assert.match(html, /id="premiumIdeas"/);
    assert.match(html, /id="batchIdeas"/);
    assert.match(html, /id="premiumBudget"/);
    assert.match(html, /id="premiumResult"/);
  } finally {
    await app.close();
  }
});

test("v1.42-v1.43 workbench wires plan and run buttons to premium incubation APIs", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());

    assert.match(html, /premiumPlanAction/);
    assert.match(html, /premiumRunAction/);
    assert.match(html, /\/api\/premium-incubation\/plan/);
    assert.match(html, /\/api\/premium-incubation\/run/);
    assert.match(html, /splitPremiumIdeas/);
  } finally {
    await app.close();
  }
});

test("v1.44-v1.45 workbench renders decisions, budgets, and repair queue counts", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());

    assert.match(html, /renderPremiumResult/);
    assert.match(html, /repair_queue/);
    assert.match(html, /budget_cny/);
    assert.match(html, /readiness_status/);
    assert.match(html, /继续推进/);
    assert.match(html, /重做开头/);
  } finally {
    await app.close();
  }
});
