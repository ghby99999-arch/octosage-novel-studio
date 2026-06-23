import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createProject, runOpenAiSmoke } from "../src/core/workflow.mjs";
import { openAiSmokeFile } from "../src/core/paths.mjs";
import { readJson } from "../src/core/fsx.mjs";

async function createTempProject(prefix = "novel-studio-openai-smoke-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.20 openai smoke",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("runOpenAiSmoke requires explicit network allowance", async () => {
  const { root, project } = await createTempProject();
  try {
    await assert.rejects(
      () =>
        runOpenAiSmoke(project, {
          model: "gpt-test",
          env: { OPENAI_API_KEY: "sk-test" },
          fetch: async () => ({ ok: true }),
        }),
      /--allow-network/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runOpenAiSmoke writes a smoke result using injected fetch", async () => {
  const { root, project } = await createTempProject("novel-studio-openai-smoke-write-");
  try {
    const result = await runOpenAiSmoke(project, {
      allowNetwork: true,
      model: "gpt-test",
      env: { OPENAI_API_KEY: "sk-test" },
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return { output_text: "第一章烟测正文。" };
        },
      }),
    });

    assert.equal(result.status, "ok");
    assert.equal(result.provider, "openai");
    assert.equal(result.model, "gpt-test");
    assert.equal(result.text, "第一章烟测正文。");
    assert.equal(result.path, openAiSmokeFile(project));

    const saved = await readJson(openAiSmokeFile(project));
    assert.equal(saved.status, "ok");
    assert.equal(saved.text, "第一章烟测正文。");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
