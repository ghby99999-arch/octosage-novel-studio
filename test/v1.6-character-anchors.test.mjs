import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildChapterContext,
  createProject,
  generateChapterCard,
  normalizeCharacterAnchor,
} from "../src/core/workflow.mjs";
import { writeJson } from "../src/core/fsx.mjs";
import { batchStateFile } from "../src/core/paths.mjs";
import { validateChapterCard } from "../src/core/schemas.mjs";

async function createTempProject(prefix = "novel-studio-v16-character-anchors-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.6 character anchors",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function validCard() {
  return {
    chapter_no: 1,
    display_title: "Queue turns into orders",
    opening_hook: "Lu Chuan sees the lunch queue as an order pool.",
    main_event: "He turns a messy queue into visible merchant orders.",
    protagonist_action: "He writes orders and pushes the merchant to test fulfillment.",
    conflict: "The merchant thinks students are only making noise.",
    cool_point_type: "misjudgment_payoff",
    visible_result: "The order counter jumps.",
    tail_hook: "The merchant stares at the backend number.",
    characters_in_scene: ["Lu Chuan", "Zhou"],
    character_anchors: [
      {
        name: "Zhou",
        surface: "hard-mouthed",
        core: "watches backend orders faster than anyone",
        anchor: "hard-mouthed but watches backend orders faster than anyone",
        signature_action: "keeps scolding while refreshing the order backend",
        signature_line: "Do not rush me. The orders rush me enough.",
        first_appearance_chapter: 1,
      },
    ],
    facts_required: ["year is 2016"],
    forbidden_items: ["do not mention mini program"],
  };
}

test("v1.6 chapter card schema requires usable character anchors for named supporting characters", () => {
  const missing = validateChapterCard({ ...validCard(), character_anchors: [] });
  const flat = validateChapterCard({
    ...validCard(),
    character_anchors: [
      {
        name: "Zhou",
        anchor: "barbecue merchant",
        surface: "merchant",
        core: "merchant",
      },
    ],
  });
  const good = validateChapterCard(validCard());

  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((error) => error.includes("character_anchors")));
  assert.equal(flat.ok, false);
  assert.ok(flat.errors.some((error) => error.includes("surface/core contradiction")));
  assert.equal(good.ok, true);
});

test("v1.6 normalizeCharacterAnchor preserves the contradiction and signature behavior", () => {
  const anchor = normalizeCharacterAnchor({
    name: "Zhou",
    anchor: "hard-mouthed but watches backend orders faster than anyone",
    signature_action: "refreshes backend while pretending not to care",
    signature_line: "Students only make noise.",
    source_chapter: 3,
  });

  assert.equal(anchor.name, "Zhou");
  assert.equal(anchor.surface, "hard-mouthed");
  assert.equal(anchor.core, "watches backend orders faster than anyone");
  assert.equal(anchor.contradiction, "hard-mouthed but watches backend orders faster than anyone");
  assert.equal(anchor.signature_action, "refreshes backend while pretending not to care");
  assert.equal(anchor.source_chapter, 3);
});

test("v1.6 mock chapter cards provide character anchors that downstream prompts can trust", async () => {
  const { root, project } = await createTempProject();
  try {
    const card = await generateChapterCard(project, 1);
    assert.ok(Array.isArray(card.character_anchors));
    assert.ok(card.character_anchors.some((anchor) => anchor.name === "老周"));
    assert.equal(validateChapterCard(card).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.6 buildChapterContext carries recent character anchors into future chapter tasks", async () => {
  const { root, project } = await createTempProject("novel-studio-v16-context-");
  try {
    await writeJson(batchStateFile(project, 1, 5), {
      meta: {
        from: 1,
        to: 5,
        source_files: [],
        confidence_threshold: 0.7,
        created_at: "2026-05-23T00:00:00.000Z",
      },
      characters: [
        {
          name: "Zhou",
          anchor: "hard-mouthed but watches backend orders faster than anyone",
          signature_action: "refreshes backend while pretending not to care",
          signature_line: "Students only make noise.",
          source_chapter: 3,
          confidence: 0.9,
        },
      ],
      relationships: [],
      business_state: [],
      money_orders: [],
      foreshadowing_added: [],
      foreshadowing_resolved: [],
      timeline: [],
      risks: [],
      low_confidence_candidates: [],
    });

    const context = await buildChapterContext(project, 6);

    assert.ok(Array.isArray(context.character_anchors));
    assert.equal(context.character_anchors[0].name, "Zhou");
    assert.equal(context.character_anchors[0].contradiction, "hard-mouthed but watches backend orders faster than anyone");
    assert.equal(context.character_anchors[0].reuse_as_voice_constraint, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
