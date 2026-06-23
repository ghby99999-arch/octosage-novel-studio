import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildRhythmTransferConstraints,
  createProject,
  writeReferenceStructureProfile,
  writeRhythmTransferPlan,
} from "../src/core/workflow.mjs";
import { rhythmTransferPlanFile } from "../src/core/paths.mjs";

async function createTempProject(prefix = "novel-studio-v119-rhythm-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.19 rhythm transfer",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

const referenceText = [
  "Zhou was about to shout at the students, but the backend beeped before he opened his mouth.",
  "\"Who paid?\" he asked. Lu Chuan pushed the order sheet across the counter.",
  "Everyone thought the students were joking. The count jumped from 0 to 37, and the queue stopped laughing.",
  "Someone behind the milk-tea wall watched the screen, but Lu Chuan did not see him.",
  "At the end of the alley, the rival owner sent a message that only readers could understand: start tonight.",
].join("\n\n");

test("v1.19 buildRhythmTransferConstraints converts a reference fingerprint into abstract chapter-card constraints", async () => {
  const { root, project } = await createTempProject();
  try {
    const profile = await writeReferenceStructureProfile(project, {
      name: "benchmark-rhythm",
      chapters: [{ chapter_no: 1, text: referenceText }],
    });
    const constraints = buildRhythmTransferConstraints(profile, {
      chapterNo: 1,
      project,
      targetIdea: project.idea,
    });
    const serialized = JSON.stringify(constraints);

    assert.equal(constraints.reference_name, "benchmark-rhythm");
    assert.equal(constraints.chapter_no, 1);
    assert.equal(constraints.copy_policy.saved_source_text, false);
    assert.ok(constraints.copy_policy.forbidden.includes("sentences"));
    assert.ok(constraints.opening_constraint.pattern);
    assert.ok(constraints.tail_hook_constraint.type);
    assert.ok(constraints.rhythm_constraint.dialogue_ratio_target.min >= 0);
    assert.ok(constraints.quality_gates.micro_hook_density_min >= 0);
    assert.ok(constraints.beat_constraints.includes("misread_then_result"));
    assert.equal(serialized.includes("Zhou was about to shout"), false);
    assert.equal(serialized.includes("rival owner sent a message"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.19 writeRhythmTransferPlan persists a safe plan that can feed future chapter generation", async () => {
  const { root, project } = await createTempProject("novel-studio-v119-plan-");
  try {
    const profile = await writeReferenceStructureProfile(project, {
      name: "benchmark-rhythm",
      chapters: [{ chapter_no: 1, text: referenceText }],
    });
    const plan = await writeRhythmTransferPlan(project, {
      name: "campus-opening-transfer",
      referenceProfile: profile,
      from: 1,
      to: 3,
      targetIdea: project.idea,
    });

    assert.equal(plan.name, "campus-opening-transfer");
    assert.equal(plan.reference_name, "benchmark-rhythm");
    assert.equal(plan.constraints.length, 3);
    assert.equal(plan.path, rhythmTransferPlanFile(project, "campus-opening-transfer"));
    assert.ok(plan.constraints.every((item) => item.chapter_card_patch));
    assert.ok(plan.constraints[0].chapter_card_patch.rhythm_transfer);
    assert.ok(plan.copy_policy.forbidden.includes("plot_bridge_details"));

    const saved = await readFile(plan.path, "utf8");
    assert.equal(saved.includes("Zhou was about to shout"), false);
    assert.equal(saved.includes("Lu Chuan pushed the order sheet"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
