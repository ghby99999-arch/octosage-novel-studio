import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildWritingTaskPackage,
  createProject,
  generateChapterCard,
  saveProjectConfig,
  writeReferenceStructureProfile,
  writeRhythmTransferPlan,
} from "../src/core/workflow.mjs";

async function createTempProject(prefix = "novel-studio-v120-rhythm-injection-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.20 rhythm injection",
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

async function prepareRhythmPlan(project) {
  const profile = await writeReferenceStructureProfile(project, {
    name: "benchmark-rhythm",
    chapters: [{ chapter_no: 1, text: referenceText }],
  });
  await writeRhythmTransferPlan(project, {
    name: "campus-opening-transfer",
    referenceProfile: profile,
    from: 1,
    to: 3,
    targetIdea: project.idea,
  });
  await saveProjectConfig(project, {
    writing: {
      rhythm_transfer_plan: "campus-opening-transfer",
    },
  });
}

test("v1.20 generateChapterCard injects the active rhythm transfer constraint", async () => {
  const { root, project } = await createTempProject();
  try {
    await prepareRhythmPlan(project);
    const card = await generateChapterCard(project, 1);

    assert.ok(card.rhythm_transfer);
    assert.equal(card.rhythm_transfer.reference_name, "benchmark-rhythm");
    assert.ok(card.rhythm_transfer.opening_pattern);
    assert.ok(card.rhythm_transfer.tail_hook_type);
    assert.ok(card.rhythm_transfer.beat_constraints.includes("misread_then_result"));
    assert.equal(card.rhythm_transfer.copy_policy, "rhythm_and_structure_only");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.20 buildWritingTaskPackage carries rhythm transfer into drafting context", async () => {
  const { root, project } = await createTempProject("novel-studio-v120-task-");
  try {
    await prepareRhythmPlan(project);
    await generateChapterCard(project, 2);
    const taskPackage = await buildWritingTaskPackage(project, 2, { force: true });

    assert.ok(taskPackage.chapter_card.rhythm_transfer);
    assert.ok(taskPackage.rhythm_transfer);
    assert.equal(taskPackage.rhythm_transfer.reference_name, "benchmark-rhythm");
    assert.ok(taskPackage.rhythm_transfer.rules.some((rule) => rule.includes("rhythm_and_structure_only")));
    assert.ok(taskPackage.rhythm_transfer.quality_gates.micro_hook_density_min >= 0.6);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
