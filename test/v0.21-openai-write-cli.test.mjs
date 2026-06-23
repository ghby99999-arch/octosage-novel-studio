import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  generateChapterCard,
  writeChapter,
} from "../src/core/workflow.mjs";
import { readJson } from "../src/core/fsx.mjs";
import { modelCallsFile, taskPackageFile } from "../src/core/paths.mjs";

async function createTempProject(prefix = "novel-studio-openai-write-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.21 openai write",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("writeChapter can use OpenAI provider for a real writing task path", async () => {
  const { root, project } = await createTempProject();
  const requests = [];
  try {
    await generateChapterCard(project, 1);
    const draft = await writeChapter(project, 1, {
      routerOptions: {
        provider: "openai",
        model: "gpt-test",
        allowNetwork: true,
        env: { OPENAI_API_KEY: "sk-test" },
        fetch: async (url, options) => {
          requests.push({ url, options });
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                output_text:
                  "重回报到日，陆川没有解释，只把手机按灭，转身去了食堂。",
              };
            },
          };
        },
      },
    });

    assert.equal(draft.version, "v1");
    assert.match(draft.text, /陆川/);
    assert.equal(requests.length, 1);

    const body = JSON.parse(requests[0].options.body);
    assert.equal(body.model, "gpt-test");
    assert.match(body.input, /只输出正文/);
    assert.match(body.input, /章卡/);
    assert.match(body.input, /任务包/);

    const taskPackage = await readJson(taskPackageFile(project, 1));
    assert.equal(taskPackage.chapter_no, 1);

    const calls = await import("node:fs/promises").then(({ readFile }) =>
      readFile(modelCallsFile(project), "utf8"),
    );
    assert.match(calls, /"provider":"openai"/);
    assert.match(calls, /"task_type":"write_chapter"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
