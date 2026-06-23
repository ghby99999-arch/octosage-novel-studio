import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  getLatestDraftVersion,
  loadProject,
} from "../src/core/workflow.mjs";

test("latest draft lookup remains compatible with old 3-digit filenames", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-compat-"));
  try {
    const project = await createProject({
      root,
      title: "兼容旧编号",
      idea: "2016年重生校园外卖",
      platform: "fanqie",
      genre: "都市重生商业爽文",
    });
    await mkdir(path.join(project.path, "正文"), { recursive: true });
    await writeFile(path.join(project.path, "正文", "第001章_v7.txt"), "旧格式", "utf8");

    assert.equal(await getLatestDraftVersion(project, 1), "v7");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadProject normalizes old project metadata", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-old-project-"));
  try {
    const projectDir = path.join(root, "旧项目");
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      path.join(projectDir, "project.json"),
      JSON.stringify({ title: "旧项目", currentChapter: 3, path: projectDir }, null, 2),
      "utf8",
    );

    const project = await loadProject(projectDir);
    assert.equal(project.current_chapter, 3);
    assert.equal(project.batch_size, 5);
    assert.equal(project.target_words, 2000000);
    assert.equal(project.platform, "fanqie");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
