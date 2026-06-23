import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  aggregateBatchState,
  buildChapterContext,
  createProject,
  extractStateCandidates,
} from "../src/core/workflow.mjs";
import {
  chapterCardFile,
  draftFile,
  stateCandidatesFile,
} from "../src/core/paths.mjs";
import {
  assertBatchState,
  assertStateCandidates,
  validateBatchState,
  validateStateCandidates,
} from "../src/core/schemas.mjs";
import { writeJson, writeText } from "../src/core/fsx.mjs";

async function createVoiceProject(prefix = "novel-studio-v241-voice-samples-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "voice sample target",
    idea: "2016 rebirth campus local delivery story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

async function seedVoiceChapter(project, chapterNo = 1) {
  await writeJson(chapterCardFile(project, chapterNo), {
    chapter_no: chapterNo,
    display_title: `Chapter ${chapterNo}`,
    opening_hook: "The barbecue stall owner misreads the order dashboard.",
    main_event: "Lu Chuan proves the campus order path.",
    protagonist_action: "Lu Chuan asks Zhou to watch the backend instead of arguing.",
    conflict: "Zhou is hard-mouthed but cannot stop checking the orders.",
    cool_point_type: "misread_then_result",
    visible_result: "orders jump from 37 to 99",
    tail_hook: "A bigger order appears.",
    characters_in_scene: [{ name: "Zhou", role: "barbecue stall owner", anchor: "hard-mouthed but watches orders fast" }],
    character_anchors: [
      {
        name: "Zhou",
        surface: "hard-mouthed",
        core: "watches backend orders faster than anyone",
        anchor: "hard-mouthed but watches backend orders faster than anyone",
        signature_action: "wipes his hands on the apron while staring at the backend",
        signature_line: "Don't rush me. I saw it already.",
        first_appearance_chapter: 1,
      },
    ],
    facts_required: [],
    forbidden_items: [],
  });
  await writeText(
    draftFile(project, chapterNo, "v1"),
    [
      "Zhou wiped both hands on his apron and leaned toward the old monitor.",
      "Zhou: Don't rush me. I saw it already.",
      "Lu Chuan pointed at the order count.",
      "Zhou: Hah. Ninety-nine orders? Then don't block my stall.",
    ].join("\n\n"),
  );
}

test("v1.241 state candidates capture character voice samples from chapter text", async () => {
  const { root, project } = await createVoiceProject();
  try {
    await seedVoiceChapter(project, 1);

    const candidates = await extractStateCandidates(project, 1);

    assert.equal(validateStateCandidates(candidates).ok, true);
    assert.ok(Array.isArray(candidates.character_voice_samples));
    assert.ok(candidates.character_voice_samples.some((sample) => sample.name === "Zhou"));
    assert.ok(candidates.character_voice_samples.some((sample) => /rush|Ninety-nine/i.test(sample.line)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.242 batch state aggregates voice samples and chapter context injects them", async () => {
  const { root, project } = await createVoiceProject("novel-studio-v242-voice-context-");
  try {
    await writeJson(stateCandidatesFile(project, 1), {
      meta: { source_chapter: 1, source_version: "v1", extractor: "test" },
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
          source: "chapter:1",
          chapter_no: 1,
          confidence: 0.9,
        },
      ],
    });

    const batchState = await aggregateBatchState(project, { from: 1, to: 1 });
    assert.equal(validateBatchState(batchState).ok, true);
    assert.equal(batchState.character_voice_samples[0].name, "Zhou");

    const context = await buildChapterContext(project, 2);
    assert.ok(Array.isArray(context.character_voice_samples));
    assert.equal(context.character_voice_samples[0].name, "Zhou");
    assert.match(context.character_voice_samples[0].line, /rush me/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.243 old state files without voice samples are normalized for compatibility", () => {
  const candidates = assertStateCandidates({
    meta: { source_chapter: 1, source_version: "v1", extractor: "old" },
    characters: [],
    relationships: [],
    business_state: [],
    money_orders: [],
    foreshadowing_added: [],
    foreshadowing_resolved: [],
    timeline: [],
    risks: [],
  });

  const batchState = assertBatchState({
    meta: { from: 1, to: 1, source_files: [] },
    characters: [],
    relationships: [],
    business_state: [],
    money_orders: [],
    foreshadowing_added: [],
    foreshadowing_resolved: [],
    timeline: [],
    risks: [],
    low_confidence_candidates: [],
  });

  assert.deepEqual(candidates.character_voice_samples, []);
  assert.deepEqual(batchState.character_voice_samples, []);
});
