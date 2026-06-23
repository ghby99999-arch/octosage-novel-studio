import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  buildChapterContext,
  createProject,
  exportMerged,
  generateChapterCard,
  runBatch,
  sanitizeModelText,
  writeChapter,
} from "../src/core/workflow.mjs";
import {
  mergedExportFile,
  qualityReportFile,
  taskPackageFile,
} from "../src/core/paths.mjs";
import { readJson } from "../src/core/fsx.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createTempProject(prefix = "novel-studio-v041-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.41 quality output export",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

test("runBatch writes a quality report for every completed chapter", async () => {
  const { root, project } = await createTempProject();
  try {
    const result = await runBatch(project, { from: 1, to: 2, maxRewrites: 1 });

    assert.equal(result.status, "completed");
    assert.equal(result.chapters.length, 2);
    for (const chapter of result.chapters) {
      assert.equal(chapter.quality_report_path, qualityReportFile(project, chapter.chapter_no));
      const report = await readJson(chapter.quality_report_path);
      assert.equal(report.status, "approved");
      assert.equal(report.chapter_no, chapter.chapter_no);
      assert.equal(report.final_grade, "B");
      assert.ok(report.model_calls.total_calls >= 3);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sanitizeModelText removes AI wrappers and markdown fences", () => {
  const raw = [
    "好的，这是您要的章节：",
    "```markdown",
    "# 第一章",
    "**陆川**走进食堂。",
    "以上就是本章内容。",
    "```",
  ].join("\n");

  const cleaned = sanitizeModelText(raw);

  assert.doesNotMatch(cleaned, /好的/);
  assert.doesNotMatch(cleaned, /```/);
  assert.doesNotMatch(cleaned, /以上就是本章内容/);
  assert.doesNotMatch(cleaned, /\*\*/);
  assert.match(cleaned, /陆川走进食堂/);
});

test("writeChapter stores sanitized text and output stats", async () => {
  const { root, project } = await createTempProject("novel-studio-v041-sanitize-write-");
  try {
    await generateChapterCard(project, 1);
    const draft = await writeChapter(project, 1, {
      router: {
        async invoke(task) {
          assert.equal(task.task_type, "write_chapter");
          return {
            chapter_no: 1,
            text: "好的，这是您要的章节：\n\n```markdown\n**陆川**把手机扣在桌上。\n```\n以上就是本章内容。",
          };
        },
      },
    });

    assert.equal(draft.text, "陆川把手机扣在桌上。");
    assert.equal(draft.output_stats.sanitized, true);
    assert.ok(draft.output_stats.char_count > 0);
    const saved = await readFile(draft.path, "utf8");
    assert.equal(saved, draft.text);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("buildChapterContext carries previous hook and last scene into the next chapter", async () => {
  const { root, project } = await createTempProject("novel-studio-v041-narrative-");
  try {
    await runBatch(project, { from: 1, to: 1, maxRewrites: 1 });

    const context = await buildChapterContext(project, 2);

    assert.ok(context.narrative_context);
    assert.equal(context.narrative_context.previous_chapter_no, 1);
    assert.ok(context.narrative_context.last_hook);
    assert.ok(context.narrative_context.last_scene.length > 0);

    const taskPackage = await readJson(taskPackageFile(project, 1));
    assert.equal(taskPackage.chapter_no, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exportMerged combines exported chapters into one TXT file", async () => {
  const { root, project } = await createTempProject("novel-studio-v041-merged-export-");
  try {
    await runBatch(project, { from: 1, to: 2, maxRewrites: 1 });
    const merged = await exportMerged(project, { from: 1, to: 2 });

    assert.equal(merged.path, mergedExportFile(project, 1, 2));
    assert.equal(merged.chapter_count, 2);
    const text = await readFile(merged.path, "utf8");
    assert.match(text, /第0001/);
    assert.match(text, /第0002/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cli export-merged writes a combined TXT file", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-v041-cli-merged-"));
  try {
    const init = spawnSync(
      "node",
      [
        "src/cli.mjs",
        "init",
        "--root",
        root,
        "--title",
        "cli-v041-merged-project",
        "--idea",
        "2016 rebirth campus local service business story",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(init.status, 0, init.stderr);
    const projectPath = path.join(root, "cli-v041-merged-project");

    const batch = spawnSync(
      "node",
      ["src/cli.mjs", "write-batch", "--from", "1", "--to", "2", "--project", projectPath],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(batch.status, 0, batch.stderr);

    const merged = spawnSync(
      "node",
      ["src/cli.mjs", "export-merged", "--from", "1", "--to", "2", "--project", projectPath],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.equal(merged.status, 0, merged.stderr);
    assert.match(merged.stdout, /merged-export:/);
    assert.match(merged.stdout, /chapters: 2/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
