import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createProject, loadProjectConfig, saveProjectConfig } from "../src/core/workflow.mjs";
import { projectConfigFile } from "../src/core/paths.mjs";
import { readJson } from "../src/core/fsx.mjs";

async function createTempProject(prefix = "novel-studio-config-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.13 config",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("createProject writes a local config file with model defaults", async () => {
  const { root, project } = await createTempProject();
  try {
    const config = await readJson(projectConfigFile(project));

    assert.equal(config.model.provider, "mock");
    assert.equal(config.model.quality_mode, "balanced");
    assert.equal(config.model.default_writer, "mock");
    assert.equal(config.budget.monthly_limit_cny, 0);
    assert.equal(config.privacy.store_api_keys, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("saveProjectConfig merges user config without losing defaults", async () => {
  const { root, project } = await createTempProject("novel-studio-config-merge-");
  try {
    const config = await saveProjectConfig(project, {
      model: {
        provider: "openai",
        default_writer: "gpt-5.1",
      },
      budget: {
        monthly_limit_cny: 500,
      },
    });

    assert.equal(config.model.provider, "openai");
    assert.equal(config.model.default_writer, "gpt-5.1");
    assert.equal(config.model.quality_mode, "balanced");
    assert.equal(config.budget.monthly_limit_cny, 500);
    assert.equal(config.privacy.store_api_keys, false);

    const loaded = await loadProjectConfig(project);
    assert.deepEqual(loaded, config);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
