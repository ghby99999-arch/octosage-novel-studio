import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  createReferenceReadPlan,
  runReferenceStructureRead,
  searchReferenceLibrary,
} from "../src/core/workflow.mjs";
import {
  referenceReadAuditFile,
  referenceReadPlanFile,
  referenceStructureFile,
} from "../src/core/paths.mjs";
import { readJson } from "../src/core/fsx.mjs";

async function createTempProject(prefix = "novel-studio-v166-reference-read-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.66 reference auto reader",
    idea: "write a Fanqie-style rebirth campus business novel",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

const rawChapterOne = [
  "The queue had reached the old gate before Zhou realized the order count had changed.",
  "\"Who moved my backend?\" he shouted, but Lu Chuan only pointed at the receipt printer.",
  "Everyone thought the reborn student was joking. The number jumped again, and the mockery stopped.",
  "Across the alley, the milk-tea owner copied the QR code without telling anyone.",
].join("\n\n");

const rawChapterTwo = [
  "The next morning began with a complaint form landing on Lu Chuan's desk.",
  "The counselor expected an apology, yet the form showed three stores fighting over one delivery route.",
  "\"Then we sell the route,\" Lu Chuan said.",
  "Zhou said he would never join, while his hand had already circled tomorrow's peak hour.",
].join("\n\n");

test("v1.66 createReferenceReadPlan writes a safe confirmation-gated browser plan", async () => {
  const { root, project } = await createTempProject();
  try {
    const plan = await createReferenceReadPlan(project, {
      name: "fanqie-benchmark",
      startUrl: "https://example.test/book/1",
      chapterLimit: 30,
    });

    assert.equal(plan.status, "awaiting_confirmation");
    assert.equal(plan.reference_name, "fanqie-benchmark");
    assert.equal(plan.start_url, "https://example.test/book/1");
    assert.equal(plan.chapter_limit, 30);
    assert.equal(plan.saved_source_text, false);
    assert.equal(plan.requires_user_confirmation_before_browser_read, true);
    assert.ok(plan.safety_rules.includes("no_paywall_bypass"));
    assert.ok(plan.forbidden_to_copy.includes("source_sentences"));
    assert.equal(plan.path, referenceReadPlanFile(project, "fanqie-benchmark"));

    const saved = await readJson(plan.path);
    assert.equal(saved.status, "awaiting_confirmation");
    assert.equal(JSON.stringify(saved).includes(rawChapterOne), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.67 runReferenceStructureRead refuses to open a browser without confirmation", async () => {
  const { root, project } = await createTempProject("novel-studio-v167-refuse-");
  try {
    let called = false;
    await createReferenceReadPlan(project, {
      name: "needs-confirm",
      startUrl: "https://example.test/book/1",
      chapterLimit: 2,
    });

    await assert.rejects(
      () => runReferenceStructureRead(project, {
        name: "needs-confirm",
        confirmed: false,
        browserAdapter: {
          async readChapters() {
            called = true;
            return [];
          },
        },
      }),
      /requires user confirmation/,
    );
    assert.equal(called, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.68 runReferenceStructureRead stores only structure fingerprints from browser-visible chapters", async () => {
  const { root, project } = await createTempProject("novel-studio-v168-read-");
  try {
    await createReferenceReadPlan(project, {
      name: "visible-book",
      startUrl: "https://example.test/book/1",
      chapterLimit: 10,
    });
    const seenOptions = [];
    const profile = await runReferenceStructureRead(project, {
      name: "visible-book",
      confirmed: true,
      chapterLimit: 2,
      browserAdapter: {
        async readChapters(options) {
          seenOptions.push(options);
          return [
            {
              chapter_no: 1,
              url: "https://example.test/book/1",
              title: "Chapter 1",
              text: rawChapterOne,
            },
            {
              chapter_no: 2,
              url: "https://example.test/book/2",
              title: "Chapter 2",
              text: rawChapterTwo,
            },
            {
              chapter_no: 3,
              url: "https://example.test/book/3",
              title: "Chapter 3",
              text: "should not be requested past limit",
            },
          ];
        },
      },
    });

    assert.equal(seenOptions.length, 1);
    assert.equal(seenOptions[0].startUrl, "https://example.test/book/1");
    assert.equal(seenOptions[0].chapterLimit, 2);
    assert.equal(profile.reference_name, "visible-book");
    assert.equal(profile.saved_source_text, false);
    assert.equal(profile.chapter_count, 2);
    assert.equal(profile.path, referenceStructureFile(project, "visible-book"));
    assert.ok(profile.structure_fingerprint.avg_micro_hook_density >= 0);
    assert.equal(profile.chapters[0].source_url, "https://example.test/book/1");
    assert.equal(profile.chapters[0].source_title, "Chapter 1");
    assert.equal(profile.chapters.every((chapter) => !("text" in chapter)), true);
    assert.equal(profile.chapters.every((chapter) => !("preview" in chapter)), true);

    const serialized = JSON.stringify(profile);
    assert.equal(serialized.includes("Who moved my backend"), false);
    assert.equal(serialized.includes("Then we sell the route"), false);

    const saved = await readFile(profile.path, "utf8");
    assert.equal(saved.includes("Who moved my backend"), false);
    assert.equal(saved.includes("Then we sell the route"), false);

    const audit = await readJson(referenceReadAuditFile(project, "visible-book"));
    assert.equal(audit.status, "completed");
    assert.equal(audit.saved_source_text, false);
    assert.equal(audit.chapters.length, 2);
    assert.equal(audit.chapters[0].status, "profiled");
    assert.equal(audit.chapters[0].word_count > 0, true);
    assert.equal(JSON.stringify(audit).includes("Who moved my backend"), false);

    const results = await searchReferenceLibrary(project, { beat: "misread_then_result" });
    assert.equal(results.length, 1);
    assert.equal(results[0].reference_name, "visible-book");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.69 runReferenceStructureRead records a safe audit when no chapters are available", async () => {
  const { root, project } = await createTempProject("novel-studio-v169-empty-");
  try {
    await createReferenceReadPlan(project, {
      name: "empty-visible-book",
      startUrl: "https://example.test/book/empty",
      chapterLimit: 5,
    });

    await assert.rejects(
      () => runReferenceStructureRead(project, {
        name: "empty-visible-book",
        confirmed: true,
        browserAdapter: {
          async readChapters() {
            return [];
          },
        },
      }),
      /no readable chapters/,
    );

    const audit = await readJson(referenceReadAuditFile(project, "empty-visible-book"));
    assert.equal(audit.status, "no_chapters");
    assert.equal(audit.saved_source_text, false);
    assert.equal(audit.chapters.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
