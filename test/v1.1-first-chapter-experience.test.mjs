import test from "node:test";
import assert from "node:assert/strict";

import { createLocalServer } from "../src/server.mjs";

async function startTestServer(options = {}) {
  const app = createLocalServer(options);
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const address = app.server.address();
  return {
    ...app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve) => app.server.close(resolve));
    },
  };
}

test("v1.1 home page has a progress-driven writing panel instead of a JSON-only handoff", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());

    assert.match(html, /firstChapterPanel/);
    assert.match(html, /id="novelPhaseRail"/);
    assert.match(html, /id="nextStepTitle"/);
    assert.match(html, /smartWriteAction/);
    assert.match(html, /updateFirstChapterPanel/);
    assert.match(html, /estimateFirstChapterCost/);
    assert.match(html, /firstChapterCost/);
  } finally {
    await app.close();
  }
});

test("v1.1 create project flow estimates cost and focuses the first write action", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());

    assert.match(html, /await estimateFirstChapterCost\(\)/);
    assert.match(html, /updateFirstChapterPanel\(created\)/);
    assert.match(html, /firstChapterPanel\.scrollIntoView/);
    assert.doesNotMatch(html, /show\(created\);\s*\n\s*}\s*\n\s*function selectProjectAction/);
  } finally {
    await app.close();
  }
});

test("v1.1 completed tasks refresh dashboard automatically", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());

    assert.match(html, /task\.status === "completed"/);
    assert.match(html, /await showDashboard\(\)/);
  } finally {
    await app.close();
  }
});

test("v1.1 API key errors render help and retry affordances", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(app.baseUrl).then((response) => response.text());

    assert.match(html, /renderApiKeyHelp/);
    assert.match(html, /OPENAI_API_KEY|DEEPSEEK_API_KEY|DOUBAO_API_KEY/);
    assert.match(html, /retryLastAction/);
    assert.match(html, /lastAction/);
  } finally {
    await app.close();
  }
});
