import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  loadProjectConfig,
  resolveRouterOptionsFromConfig,
  saveProjectConfig,
  writeChapter,
} from "../src/core/workflow.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createTempProject(prefix = "novel-studio-real-api-config-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.22 real api config",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("project config can enable OpenAI provider without storing API keys", async () => {
  const { root, project } = await createTempProject();
  try {
    await saveProjectConfig(project, {
      model: {
        provider: "openai",
        default_writer: "gpt-test",
        default_reviewer: "gpt-test",
        default_extractor: "gpt-test",
        allow_network: true,
      },
    });

    const config = await loadProjectConfig(project);
    assert.equal(config.model.provider, "openai");
    assert.equal(config.model.default_writer, "gpt-test");
    assert.equal(config.model.allow_network, true);
    assert.equal(JSON.stringify(config).includes("sk-"), false);

    const routerOptions = resolveRouterOptionsFromConfig(config);
    assert.deepEqual(routerOptions, {
      provider: "openai",
      model: "gpt-test",
      allowNetwork: true,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writeChapter uses configured OpenAI provider by default", async () => {
  const { root, project } = await createTempProject("novel-studio-configured-openai-write-");
  const requests = [];
  try {
    await saveProjectConfig(project, {
      model: {
        provider: "openai",
        default_writer: "gpt-test",
        allow_network: true,
      },
    });

    const draft = await writeChapter(project, 1, {
      routerOptions: {
        ...resolveRouterOptionsFromConfig(await loadProjectConfig(project)),
        env: { OPENAI_API_KEY: "sk-test" },
        fetch: async (url, options) => {
          requests.push({ url, options });
          const body = JSON.parse(options.body);
          if (body.input.includes("章节策划")) {
            return {
              ok: true,
              status: 200,
              async json() {
                return {
                  output_text: JSON.stringify({
                    chapter_no: 1,
                    display_title: "报到日，先退车",
                    opening_hook: "陆川醒在 2016 年报到日。",
                    main_event: "陆川切断虚荣消费，发现食堂履约痛点。",
                    protagonist_action: "陆川退掉跑车安排，去食堂观察。",
                    conflict: "同学以为他只是没钱，商户以为他瞎折腾。",
                    cool_point_type: "信息差暗爽",
                    visible_result: "第一批订单验证出现。",
                    tail_hook: "老周后台订单数突然异常。",
                    characters_in_scene: ["陆川", "老周"],
                    facts_required: ["时间是 2016 年"],
                    forbidden_items: ["不能出现小程序"],
                  }),
                };
              },
            };
          }
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                output_text: "陆川把退车电话挂断，食堂门口的队伍正好拐出第二道弯。",
              };
            },
          };
        },
      },
    });

    assert.match(draft.text, /陆川/);
    assert.equal(requests.length, 2);
    const cardBody = JSON.parse(requests[0].options.body);
    const writeBody = JSON.parse(requests[1].options.body);
    assert.equal(cardBody.model, "gpt-test");
    assert.equal(writeBody.model, "gpt-test");
    assert.match(cardBody.input, /章节策划/);
    assert.match(writeBody.input, /只输出正文/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cli use-openai stores provider settings but not secrets", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-cli-use-openai-"));
  try {
    const init = spawnSync(
      "node",
      [
        "src/cli.mjs",
        "init",
        "--root",
        root,
        "--title",
        "cli-use-openai-project",
        "--idea",
        "2016 rebirth campus local service business story",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(init.status, 0, init.stderr);
    const projectPath = path.join(root, "cli-use-openai-project");

    const result = spawnSync(
      "node",
      [
        "src/cli.mjs",
        "use-openai",
        "--project",
        projectPath,
        "--model",
        "gpt-test",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, OPENAI_API_KEY: "sk-should-not-be-saved" },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /provider: openai/);
    assert.match(result.stdout, /model: gpt-test/);

    const config = await import("node:fs/promises").then(({ readFile }) =>
      readFile(path.join(projectPath, "config.json"), "utf8"),
    );
    assert.match(config, /"provider": "openai"/);
    assert.match(config, /"allow_network": true/);
    assert.equal(config.includes("sk-should-not-be-saved"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
