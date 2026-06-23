import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  draftFileFor,
  generateChapterCard,
  reviewChapter,
  runBatch,
} from "../src/core/workflow.mjs";
import { chapterCardFile } from "../src/core/paths.mjs";

async function createTempProject(prefix = "novel-studio-v03-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.3 guardrails",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("runBatch returns structured stop details when an E review blocks the batch", async () => {
  const { root, project } = await createTempProject("novel-studio-e-structured-");
  try {
    const result = await runBatch(project, {
      from: 1,
      to: 3,
      routerOptions: { provider: "mock-e" },
    });

    assert.equal(result.status, "stopped");
    assert.equal(result.stop.chapter_no, 1);
    assert.equal(result.stop.grade, "E");
    assert.equal(result.stop.reason, "rollback_required");
    assert.equal(result.chapters.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runBatch returns structured stop details when max D rewrites are exhausted", async () => {
  const { root, project } = await createTempProject("novel-studio-d-structured-");
  try {
    const result = await runBatch(project, {
      from: 1,
      to: 2,
      maxRewrites: 1,
      routerOptions: { provider: "mock-always-d" },
    });

    assert.equal(result.status, "stopped");
    assert.equal(result.stop.chapter_no, 1);
    assert.equal(result.stop.grade, "D");
    assert.equal(result.stop.reason, "max_rewrites_exhausted");
    assert.equal(result.chapters.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("mock strong drafts follow each chapter card instead of repeating chapter one", async () => {
  const { root, project } = await createTempProject("novel-studio-strong-varies-");
  try {
    const result = await runBatch(project, { from: 1, to: 5 });
    const exportedTexts = await Promise.all(
      result.chapters.map((chapter) => readFile(chapter.export_path, "utf8")),
    );

    assert.equal(new Set(exportedTexts).size, 5);
    for (const chapter of result.chapters) {
      const text = await readFile(chapter.export_path, "utf8");
      assert.match(text, new RegExp(`CHAPTER-MOCK-${chapter.chapter_no}`));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reviewChapter catches generic forbidden keyword violations from the chapter card", async () => {
  const { root, project } = await createTempProject("novel-studio-generic-forbidden-");
  try {
    const card = await generateChapterCard(project, 1);
    card.forbidden_items = ["Do not mention DragonGateAlgorithm"];
    await writeFile(chapterCardFile(project, 1), `${JSON.stringify(card, null, 2)}\n`, "utf8");
    await writeFile(
      draftFileFor(project, 1, "v1"),
      [
        card.display_title,
        "",
        "CHAPTER-MOCK-1",
        "",
        "Lu Chuan pasted the QR code and watched orders arrive.",
        "",
        "The DragonGateAlgorithm plan suddenly appeared in his notes.",
        "",
        "The campus venture account pushed a new notice.",
        "",
        "Orders kept coming.",
      ].join("\n"),
      "utf8",
    );

    const review = await reviewChapter(project, 1, "v1");
    assert.equal(review.grade, "D");
    assert.ok(
      review.hard_rule_violations.some((item) => item.includes("DragonGateAlgorithm")),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
