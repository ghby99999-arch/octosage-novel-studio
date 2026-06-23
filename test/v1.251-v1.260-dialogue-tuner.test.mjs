import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildDialogueTuningGuide,
  dialogueTuningGuideForRewrite,
} from "../src/core/dialogue-tuner.mjs";
import {
  buildDialogueTuningRewriteLayer,
  createProject,
  rewriteChapter,
} from "../src/core/workflow.mjs";
import { batchStateFile, chapterCardFile, draftFile } from "../src/core/paths.mjs";
import { writeJson } from "../src/core/fsx.mjs";

test("v1.251 dialogue tuner turns anchors and voice samples into concrete dialogue rules", () => {
  const guide = buildDialogueTuningGuide({
    characterAnchors: [
      {
        name: "Zhou",
        surface: "hard-mouthed stall owner",
        core: "watches backend orders faster than anyone",
        anchor: "hard-mouthed but watches backend orders faster than anyone",
        signature_action: "wipes his hands on the apron while staring at the backend",
        signature_line: "Don't rush me. I saw it already.",
      },
    ],
    voiceSamples: [
      {
        name: "Zhou",
        line: "Don't rush me. I saw it already.",
        voice_note: "short, impatient, business-first",
      },
    ],
  });

  assert.equal(guide.preset_id, "dialogue-polish");
  assert.ok(guide.global_rules.some((rule) => /20/.test(rule)));
  assert.ok(guide.global_rules.some((rule) => /动作/.test(rule)));
  assert.ok(guide.forbidden.some((rule) => /解释/.test(rule)));
  assert.equal(guide.characters[0].name, "Zhou");
  assert.match(guide.characters[0].reuse_samples[0], /rush me/);
  assert.match(guide.prompt_brief, /Zhou/);
});

test("v1.252 dialogue tuner can enrich character voice rewrite layers", () => {
  const layer = dialogueTuningGuideForRewrite({
    layer: {
      type: "character_voice",
      source_issue: "dialogue sounds generic",
      instruction: "only fix character dialogue",
    },
    taskPackage: {
      context: {
        character_anchors: [
          {
            name: "Zhou",
            anchor: "hard-mouthed but watches backend orders faster than anyone",
            signature_action: "wipes his hands on the apron",
            signature_line: "Don't rush me. I saw it already.",
          },
        ],
        character_voice_samples: [
          {
            name: "Zhou",
            line: "Don't rush me. I saw it already.",
            voice_note: "short, impatient, business-first",
          },
        ],
      },
    },
  });

  assert.equal(layer.type, "character_voice");
  assert.equal(layer.dialogue_tuning.preset_id, "dialogue-polish");
  assert.match(layer.instruction, /对话打磨/);
  assert.match(layer.dialogue_tuning.prompt_brief, /short, impatient/);
});

test("v1.253 workflow exports a one-click dialogue polish rewrite layer", () => {
  const layer = buildDialogueTuningRewriteLayer({
    context: {
      character_anchors: [
        {
          name: "Zhou",
          anchor: "hard-mouthed but watches backend orders faster than anyone",
          signature_action: "wipes his hands on the apron",
          signature_line: "Don't rush me. I saw it already.",
        },
      ],
      character_voice_samples: [
        {
          name: "Zhou",
          line: "Don't rush me. I saw it already.",
          voice_note: "short, impatient",
        },
      ],
    },
  });

  assert.equal(layer.type, "character_voice");
  assert.equal(layer.source_issue, "one_click_dialogue_polish");
  assert.equal(layer.dialogue_tuning.characters[0].name, "Zhou");
});

test("v1.254 rewriteChapter passes dialogue tuning guide to character voice rewrites", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v254-dialogue-rewrite-"));
  const seenTasks = [];
  try {
    const project = await createProject({
      root,
      title: "dialogue rewrite target",
      idea: "2016 rebirth campus delivery",
      platform: "fanqie",
      genre: "urban business rebirth",
    });
    await writeJson(chapterCardFile(project, 2), {
      chapter_no: 2,
      display_title: "Chapter 2",
      opening_hook: "Zhou sees the backend jump again.",
      main_event: "Lu Chuan makes Zhou accept the new order flow.",
      protagonist_action: "Lu Chuan lets the numbers speak.",
      conflict: "Zhou refuses to admit he trusts the plan.",
      cool_point_type: "misread_then_result",
      visible_result: "orders jump again",
      tail_hook: "A bigger merchant calls.",
      characters_in_scene: [{ name: "Zhou", role: "stall owner", anchor: "hard-mouthed but fast-eyed" }],
      character_anchors: [
        {
          name: "Zhou",
          surface: "hard-mouthed",
          core: "watches backend orders faster than anyone",
          anchor: "hard-mouthed but watches backend orders faster than anyone",
          signature_action: "wipes his hands on the apron while staring at the backend",
          signature_line: "Don't rush me. I saw it already.",
        },
      ],
      facts_required: [],
      forbidden_items: [],
    });
    await writeFile(
      draftFile(project, 2, "v1"),
      "Zhou said the plan was good and explained his feelings.",
      "utf8",
    );
    await writeJson(batchStateFile(project, 1, 1), {
      meta: { from: 1, to: 1, source_files: [] },
      characters: [],
      relationships: [],
      business_state: [],
      money_orders: [],
      foreshadowing_added: [],
      foreshadowing_resolved: [],
      timeline: [],
      risks: [],
      character_voice_samples: [
        {
          name: "Zhou",
          line: "Don't rush me. I saw it already.",
          voice_note: "short, impatient, business-first",
          confidence: 0.9,
        },
      ],
      low_confidence_candidates: [],
    });

    await rewriteChapter(project, 2, {
      router: {
        async invoke(task) {
          seenTasks.push(task);
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: "Zhou: Don't rush me.\n\nHe wiped his hands and stared at the backend.",
          };
        },
      },
      rewriteFocus: {
        type: "character_voice",
        source_issue: "dialogue sounds generic",
        instruction: "only fix character dialogue",
      },
    });

    assert.equal(seenTasks[0].rewrite_focus.type, "character_voice");
    assert.equal(seenTasks[0].rewrite_focus.dialogue_tuning.preset_id, "dialogue-polish");
    assert.match(seenTasks[0].rewrite_focus.dialogue_tuning.prompt_brief, /Don't rush me/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
