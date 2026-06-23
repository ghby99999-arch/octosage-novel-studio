import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildWritingTaskPackage,
  createProject,
  generateChapterCard,
  goldenThreeTemplateForChapter,
} from "../src/core/workflow.mjs";
import { createModelRouter } from "../src/core/model-router.mjs";

async function createTempProject(prefix = "novel-studio-v112-golden-three-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.12 golden three",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("v1.12 goldenThreeTemplateForChapter returns strict templates only for chapters 1-3", () => {
  const chapter1 = goldenThreeTemplateForChapter(1);
  const chapter2 = goldenThreeTemplateForChapter(2);
  const chapter3 = goldenThreeTemplateForChapter(3);

  assert.equal(chapter1.template_id, "golden_three_ch1");
  assert.equal(chapter1.role, "hook_and_power_reveal");
  assert.ok(chapter1.must_have.some((item) => item.includes("300")));
  assert.ok(chapter1.must_have.some((item) => item.includes("1000")));
  assert.ok(chapter1.forbidden.some((item) => item.includes("环境")));

  assert.equal(chapter2.template_id, "golden_three_ch2");
  assert.equal(chapter2.role, "first_payoff_and_misjudgment");
  assert.ok(chapter2.must_have.some((item) => item.includes("误判")));
  assert.ok(chapter2.must_have.some((item) => item.includes("可见数据") || item.includes("结果反转")));

  assert.equal(chapter3.template_id, "golden_three_ch3");
  assert.equal(chapter3.role, "persona_lock_and_long_goal");
  assert.ok(chapter3.must_have.some((item) => item.includes("长线目标")));
  assert.ok(chapter3.must_have.some((item) => item.includes("长线钩子")));

  assert.equal(goldenThreeTemplateForChapter(4), null);
  assert.equal(goldenThreeTemplateForChapter(0), null);
});

test("v1.12 generateChapterCard persists golden template constraints on the first three cards", async () => {
  const { root, project } = await createTempProject();
  try {
    const card = await generateChapterCard(project, 1);

    assert.equal(card.golden_three_template.template_id, "golden_three_ch1");
    assert.equal(card.golden_three_template.role, "hook_and_power_reveal");
    assert.ok(card.golden_three_template.must_have.some((item) => item.includes("金手指")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.12 buildWritingTaskPackage injects the matching golden template into drafting context", async () => {
  const { root, project } = await createTempProject();
  try {
    await generateChapterCard(project, 2);

    const taskPackage = await buildWritingTaskPackage(project, 2, { force: true });

    assert.equal(taskPackage.golden_three_template.template_id, "golden_three_ch2");
    assert.equal(taskPackage.golden_three_template.role, "first_payoff_and_misjudgment");
    assert.ok(taskPackage.golden_three_template.must_have.some((item) => item.includes("第一次兑现")));
    assert.equal(taskPackage.chapter_card.golden_three_template.template_id, "golden_three_ch2");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.12 provider prompt includes golden three constraints for chapter-card generation", async () => {
  let capturedInput = "";
  const router = createModelRouter({
    provider: "openai",
    allowNetwork: true,
    env: { OPENAI_API_KEY: "test-key" },
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      capturedInput = body.input;
      return {
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            chapter_no: 1,
            display_title: "First order catches fire",
            opening_hook: "The first order jumps out and Zhou drops a skewer into the charcoal.",
            main_event: "Lu Chuan proves the core advantage within the first thousand words.",
            protagonist_action: "He pushes the order sheet across the counter.",
            conflict: "Zhou misjudges him as a noisy student.",
            cool_point_type: "golden_three_opening",
            visible_result: "The backend count jumps.",
            tail_hook: "The next data line turns red.",
            characters_in_scene: [{ name: "Lu Chuan", role: "protagonist", anchor: "calm but acts before explaining" }],
            character_anchors: [
              {
                name: "Lu Chuan",
                surface: "calm",
                core: "acts before explaining",
                anchor: "calm but acts before explaining",
                signature_action: "pushes the order sheet before speaking",
                signature_line: "Let the numbers talk first.",
                first_appearance_chapter: 1,
              },
            ],
            facts_required: ["year is 2016"],
            forbidden_items: ["do not open with static environment"],
          }),
        }),
        headers: { get: () => null },
      };
    },
    sleep: async () => {},
  });

  await router.invoke({
    task_type: "generate_chapter_card",
    project: { title: "golden prompt" },
    chapter_no: 1,
    golden_three_template: goldenThreeTemplateForChapter(1),
  });

  assert.match(capturedInput, /golden_three_ch1/);
  assert.match(capturedInput, /300/);
  assert.match(capturedInput, /1000/);
  assert.match(capturedInput, /金手指|核心优势/);
});
