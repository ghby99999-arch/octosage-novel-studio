import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  analyzeReferenceStructure,
  classifyChapterStructure,
  createProject,
  searchReferenceLibrary,
  writeReferenceStructureProfile,
} from "../src/core/workflow.mjs";
import {
  referenceLibraryFile,
  referenceStructureFile,
} from "../src/core/paths.mjs";
import { readJson } from "../src/core/fsx.mjs";

async function createTempProject(prefix = "novel-studio-v118-reference-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.18 reference structure",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

const chapterOneText = [
  "Zhou was about to shout at the students, but the backend beeped before he opened his mouth.",
  "\"Who paid?\" he asked. Lu Chuan pushed the order sheet across the counter.",
  "Everyone thought the students were joking. The count jumped from 0 to 37, and the queue stopped laughing.",
  "Someone behind the milk-tea wall watched the screen, but Lu Chuan did not see him.",
  "By closing time Zhou said he would not help again, while his hand had already sorted tomorrow's orders.",
].join("\n\n");

const chapterTwoText = [
  "The phone rang just as Zhou tried to hide the receipt.",
  "Lu Chuan expected a thank-you, but the teacher asked why half the street was suddenly copying his QR code.",
  "\"Then let them copy,\" Lu Chuan said. \"Copying only proves the line is real.\"",
  "The public queue reached the second alley. Zhou's daughter stood beside the grill and did not ask for dinner money.",
  "At the end of the alley, the rival owner sent a message that only readers could understand: start tonight.",
].join("\n\n");

test("v1.18 classifyChapterStructure returns abstract features without source prose", () => {
  const result = classifyChapterStructure(chapterOneText, { chapterNo: 1 });
  const serialized = JSON.stringify(result);

  assert.equal(result.chapter_no, 1);
  assert.equal(result.saved_source_text, false);
  assert.equal(serialized.includes("Zhou was about to shout"), false);
  assert.equal(serialized.includes("Lu Chuan pushed the order sheet"), false);
  assert.match(result.opening.pattern, /direct_conflict|dialogue_opening|data_result/);
  assert.match(result.tail_hook.type, /data_change|information_gap|pressure|interruption|generic/);
  assert.ok(result.rhythm.dialogue_ratio > 0);
  assert.ok(result.rhythm.avg_paragraph_chars > 0);
  assert.ok(Number.isFinite(result.micro_hook_density.density));
  assert.ok(Number.isInteger(result.drop_risk_segments.risky_segment_count));
  assert.ok(result.transferable_beats.includes("misread_then_result"));
  assert.ok(result.transferable_beats.includes("data_payoff"));
});

test("v1.18 writeReferenceStructureProfile persists a safe searchable structure library", async () => {
  const { root, project } = await createTempProject();
  try {
    const profile = await writeReferenceStructureProfile(project, {
      name: "benchmark-book",
      chapters: [
        { chapter_no: 1, text: chapterOneText },
        { chapter_no: 2, text: chapterTwoText },
      ],
    });

    assert.equal(profile.reference_name, "benchmark-book");
    assert.equal(profile.saved_source_text, false);
    assert.equal(profile.chapter_count, 2);
    assert.ok(profile.structure_fingerprint.avg_dialogue_ratio > 0);
    assert.ok(profile.structure_fingerprint.beat_distribution.data_payoff >= 1);
    assert.ok(profile.chapters.every((chapter) => !("text" in chapter)));
    assert.ok(profile.chapters.every((chapter) => !("preview" in chapter)));
    assert.ok(profile.forbidden_to_copy.includes("plot_bridge_details"));
    assert.equal(profile.path, referenceStructureFile(project, "benchmark-book"));

    const saved = await readFile(profile.path, "utf8");
    assert.equal(saved.includes("Zhou was about to shout"), false);
    assert.equal(saved.includes("rival owner sent a message"), false);

    const library = await readJson(referenceLibraryFile(project));
    assert.equal(library.references.length, 1);
    assert.equal(library.references[0].reference_name, "benchmark-book");

    const results = await searchReferenceLibrary(project, {
      beat: "data_payoff",
      tail_hook_type: "information_gap",
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].reference_name, "benchmark-book");
    assert.ok(results[0].score > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.18 analyzeReferenceStructure remains backward-compatible while adding fingerprint", async () => {
  const { root, project } = await createTempProject("novel-studio-v118-compat-");
  try {
    const result = await analyzeReferenceStructure(project, {
      name: "sample-reference",
      text: chapterOneText,
    });

    assert.equal(result.reference_name, "sample-reference");
    assert.equal(result.saved_source_text, false);
    assert.ok(result.transferable_beats.includes("misread_then_result"));
    assert.ok(result.structure_fingerprint);
    assert.ok(result.chapter_profiles.length >= 1);
    assert.equal(result.path, referenceStructureFile(project, "sample-reference"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
