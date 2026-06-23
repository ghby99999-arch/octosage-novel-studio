import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createModelRouter } from "../src/core/model-router.mjs";
import {
  createProject,
  loadProjectConfig,
  saveProjectConfig,
} from "../src/core/workflow.mjs";

async function createTempProject(prefix = "novel-studio-openai-key-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.18 openai key",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("openai provider requires OPENAI_API_KEY when network calls are enabled", async () => {
  const router = createModelRouter({
    provider: "openai",
    model: "gpt-test",
    allowNetwork: true,
    env: {},
    fetch: async () => {
      throw new Error("fetch should not run without a key");
    },
  });

  await assert.rejects(
    () => router.invoke({ task_type: "write_chapter", chapter_card: { chapter_no: 1 } }),
    /OPENAI_API_KEY/,
  );
});

test("project config never persists API keys", async () => {
  const { root, project } = await createTempProject();
  try {
    const config = await saveProjectConfig(project, {
      api_key: "sk-should-not-save",
      openai_api_key: "sk-should-not-save",
      model: {
        provider: "openai",
        api_key: "sk-should-not-save",
      },
      secrets: {
        OPENAI_API_KEY: "sk-should-not-save",
      },
    });

    assert.equal(config.api_key, undefined);
    assert.equal(config.openai_api_key, undefined);
    assert.equal(config.model.api_key, undefined);
    assert.equal(config.secrets, undefined);

    const loaded = await loadProjectConfig(project);
    assert.equal(loaded.model.provider, "openai");
    assert.equal(JSON.stringify(loaded).includes("sk-should-not-save"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
