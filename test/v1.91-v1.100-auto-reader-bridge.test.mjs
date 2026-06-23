import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  createProject,
  createReferenceReadPlan,
  createVisibleBrowserAutoReaderAdapter,
  createSafeAutoReaderAdapter,
  growPublicReferenceLibraryFromReadSources,
  runReferenceStructureRead,
} from "../src/core/workflow.mjs";
import {
  publicReferenceLibraryFile,
  referenceReadAuditFile,
} from "../src/core/paths.mjs";
import { readJson } from "../src/core/fsx.mjs";
import { serveLocal } from "../src/server.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createTempProject(prefix = "novel-studio-v191-auto-reader-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "auto reader target",
    idea: "2016 campus business rebirth with market rhythm",
    platform: "fanqie",
    genre: "urban business",
  });
  return { root, project };
}

function visibleChapter(no, text) {
  return {
    chapter_no: no,
    url: `https://reader.example.test/book/1/${no}`,
    title: `Chapter ${no}`,
    text,
  };
}

const visibleChapters = [
  visibleChapter(1, [
    "The order board rang before anyone could laugh.",
    "\"Who paid already?\" Zhou asked, but the student only turned the screen around.",
    "Everyone thought it was a joke. The number jumped from 0 to 32.",
    "At the alley entrance, someone copied the QR code without telling him.",
  ].join("\n\n")),
  visibleChapter(2, [
    "The copied QR code appeared on the canteen wall before breakfast.",
    "Lu Chuan did not argue. He asked the first merchant to read the refund line aloud.",
    "\"Then who owns the orders?\"",
    "The rival still did not know the backend had recorded every scan.",
  ].join("\n\n")),
];

function postJson(port, route, body) {
  return fetch(`http://127.0.0.1:${port}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || response.statusText);
    return data;
  });
}

test("v1.91 createSafeAutoReaderAdapter reads visible chapters and stops at blocked content", async () => {
  const readerEvents = [];
  const adapter = createSafeAutoReaderAdapter({
    reader: async ({ cursor, chapterLimit }) => {
      readerEvents.push({ cursor, chapterLimit });
      return {
        chapters: [
          visibleChapters[0],
          { chapter_no: 2, status: "paywall", url: "https://reader.example.test/paywall", text: "secret paid prose" },
          visibleChapters[1],
        ],
        stopped: {
          reason: "paywall_or_unreadable",
          url: "https://reader.example.test/paywall",
        },
      };
    },
    minDelayMs: 0,
    maxDelayMs: 0,
  });

  const result = await adapter.readChapters({
    startUrl: "https://reader.example.test/book/1/1",
    chapterLimit: 10,
    safetyRules: ["no_paywall_bypass"],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].chapter_no, 1);
  assert.equal(result.stopped.reason, "paywall_or_unreadable");
  assert.equal(JSON.stringify(result).includes("secret paid prose"), false);
  assert.deepEqual(readerEvents, [{ cursor: "https://reader.example.test/book/1/1", chapterLimit: 10 }]);
});

test("v1.92 runReferenceStructureRead records auto-reader stop reason without saving prose", async () => {
  const { root, project } = await createTempProject();
  try {
    await createReferenceReadPlan(project, {
      name: "visible-auto",
      startUrl: "https://reader.example.test/book/1/1",
      chapterLimit: 10,
      platform: "visible-browser",
    });
    const adapter = createSafeAutoReaderAdapter({
      reader: async () => ({
        chapters: visibleChapters,
        stopped: { reason: "chapter_limit_reached", url: visibleChapters[1].url },
      }),
      minDelayMs: 0,
      maxDelayMs: 0,
    });

    const profile = await runReferenceStructureRead(project, {
      name: "visible-auto",
      confirmed: true,
      browserAdapter: adapter,
    });

    assert.equal(profile.chapter_count, 2);
    assert.equal(profile.auto_reader_stop.reason, "chapter_limit_reached");
    assert.equal(JSON.stringify(profile).includes("Who paid already"), false);

    const audit = await readJson(referenceReadAuditFile(project, "visible-auto"));
    assert.equal(audit.auto_reader_stop.reason, "chapter_limit_reached");
    assert.equal(JSON.stringify(audit).includes("backend had recorded"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.93 growPublicReferenceLibraryFromReadSources bridges visible auto-read into public reference growth", async () => {
  const { root } = await createTempProject("novel-studio-v193-public-read-");
  try {
    const library = await growPublicReferenceLibraryFromReadSources({
      root,
      confirmed: true,
      readSources: [
        {
          name: "weekly-campus-commerce",
          start_url: "https://reader.example.test/book/2/1",
          tags: ["campus", "commerce", "rebirth"],
        },
      ],
      browserAdapterFactory: ({ source }) => createSafeAutoReaderAdapter({
        reader: async () => ({
          chapters: visibleChapters.map((chapter) => ({
            ...chapter,
            url: `${source.start_url}#${chapter.chapter_no}`,
          })),
          stopped: { reason: "chapter_limit_reached" },
        }),
        minDelayMs: 0,
        maxDelayMs: 0,
      }),
      chapterLimit: 2,
      sourceBatch: "weekly-visible-top",
    });

    assert.equal(library.references.length, 1);
    assert.equal(library.references[0].reference_name, "weekly-campus-commerce");
    assert.equal(library.references[0].source_batch, "weekly-visible-top");
    assert.equal(library.references[0].tags.includes("commerce"), true);
    assert.equal(library.references[0].auto_reader_stop.reason, "chapter_limit_reached");
    assert.equal(JSON.stringify(library).includes("Who paid already"), false);

    const saved = await readJson(publicReferenceLibraryFile(root));
    assert.equal(saved.references[0].saved_source_text, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.94 public reference auto-read refuses to run without confirmation", async () => {
  const { root } = await createTempProject("novel-studio-v194-public-read-confirm-");
  try {
    await assert.rejects(
      () => growPublicReferenceLibraryFromReadSources({
        root,
        confirmed: false,
        readSources: [{ name: "blocked", start_url: "https://reader.example.test/book/3/1" }],
        browserAdapterFactory: () => createSafeAutoReaderAdapter({
          reader: async () => ({ chapters: visibleChapters }),
          minDelayMs: 0,
          maxDelayMs: 0,
        }),
      }),
      /requires user confirmation/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.95 CLI exposes public reference read plan and run commands", async () => {
  const { root } = await createTempProject("novel-studio-v195-cli-public-read-");
  try {
    const plan = spawnSync("node", [
      "src/cli.mjs",
      "public-refs-read-plan",
      "--root",
      root,
      "--sources-json",
      JSON.stringify([{ name: "cli-visible", start_url: "https://reader.example.test/book/4/1", tags: ["commerce"] }]),
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(plan.status, 0, plan.stderr);
    assert.match(plan.stdout, /public-refs-read-plan: awaiting_confirmation/);
    assert.match(plan.stdout, /confirmation-required: true/);

    const run = spawnSync("node", [
      "src/cli.mjs",
      "public-refs-read-run",
      "--confirm",
      "--root",
      root,
      "--sources-json",
      JSON.stringify([{ name: "cli-visible", start_url: "https://reader.example.test/book/4/1", tags: ["commerce"], chapters: visibleChapters }]),
      "--chapter-limit",
      "2",
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /public-refs-read-run: 1/);
    assert.match(run.stdout, /saved-source-text: false/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.96 server exposes public reference read plan and run endpoints", async () => {
  const { root } = await createTempProject("novel-studio-v196-api-public-read-");
  const app = await serveLocal({ port: 0 });
  try {
    const port = app.server.address().port;
    const plan = await postJson(port, "/api/public-references/read-plan", {
      root,
      sources: [{ name: "api-visible", start_url: "https://reader.example.test/book/5/1" }],
    });
    assert.equal(plan.status, "awaiting_confirmation");
    assert.equal(plan.requires_user_confirmation_before_browser_read, true);

    const library = await postJson(port, "/api/public-references/read-run", {
      root,
      confirmed: true,
      sources: [{ name: "api-visible", start_url: "https://reader.example.test/book/5/1", chapters: visibleChapters }],
      chapter_limit: 2,
    });
    assert.equal(library.references.length, 1);
    assert.equal(library.references[0].reference_name, "api-visible");

    const source = await readFile(path.join(repoRoot, "src", "server.mjs"), "utf8");
    assert.match(source, /publicReferencesReadPlanAction/);
    assert.match(source, /publicReferencesReadRunAction/);
  } finally {
    await new Promise((resolve, reject) => app.server.close((error) => (error ? reject(error) : resolve())));
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.97 createVisibleBrowserAutoReaderAdapter turns pages through an injected logged-in browser driver", async () => {
  const calls = [];
  const pages = [
    {
      url: "https://reader.example.test/book/6/1",
      title: "Chapter 1",
      text: visibleChapters[0].text,
      nextUrl: "https://reader.example.test/book/6/2",
    },
    {
      url: "https://reader.example.test/book/6/2",
      title: "Chapter 2",
      text: visibleChapters[1].text,
      nextUrl: null,
    },
  ];
  let index = 0;
  const adapter = createVisibleBrowserAutoReaderAdapter({
    browserDriver: {
      async goto(url) {
        calls.push(`goto:${url}`);
      },
      async extractVisibleChapter() {
        calls.push("extract");
        return pages[index];
      },
      async goNext(nextUrl) {
        calls.push(`next:${nextUrl}`);
        index += 1;
      },
    },
    minDelayMs: 0,
    maxDelayMs: 0,
  });

  const chapters = await adapter.readChapters({
    startUrl: "https://reader.example.test/book/6/1",
    chapterLimit: 5,
  });

  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, "Chapter 1");
  assert.equal(chapters.stopped.reason, "no_next_chapter");
  assert.deepEqual(calls, [
    "goto:https://reader.example.test/book/6/1",
    "extract",
    "next:https://reader.example.test/book/6/2",
    "extract",
  ]);
});

test("v1.98 visible browser auto-reader stops before saving blocked or paywalled prose", async () => {
  const adapter = createVisibleBrowserAutoReaderAdapter({
    browserDriver: {
      async goto() {},
      async extractVisibleChapter() {
        return {
          status: "paywall",
          url: "https://reader.example.test/book/7/paywall",
          title: "Locked",
          text: "this blocked prose must not appear",
        };
      },
      async goNext() {},
    },
    minDelayMs: 0,
    maxDelayMs: 0,
  });

  const chapters = await adapter.readChapters({
    startUrl: "https://reader.example.test/book/7/1",
    chapterLimit: 3,
  });

  assert.equal(chapters.length, 0);
  assert.equal(chapters.stopped.reason, "paywall_or_unreadable");
  assert.equal(JSON.stringify(chapters).includes("blocked prose"), false);
});

test("v1.99 public read bridge can use the visible browser adapter factory end to end", async () => {
  const { root } = await createTempProject("novel-studio-v199-visible-browser-bridge-");
  try {
    const library = await growPublicReferenceLibraryFromReadSources({
      root,
      confirmed: true,
      readSources: [{
        name: "visible-browser-campus",
        start_url: "https://reader.example.test/book/8/1",
        tags: ["campus", "commerce"],
      }],
      browserAdapterFactory: ({ source }) => {
        let index = 0;
        return createVisibleBrowserAutoReaderAdapter({
          browserDriver: {
            async goto() {},
            async extractVisibleChapter() {
              const chapter = visibleChapters[index];
              return chapter ? {
                url: `${source.start_url}#${chapter.chapter_no}`,
                title: chapter.title,
                text: chapter.text,
                nextUrl: index + 1 < visibleChapters.length ? `${source.start_url}#${index + 2}` : null,
              } : null;
            },
            async goNext() {
              index += 1;
            },
          },
          minDelayMs: 0,
          maxDelayMs: 0,
        });
      },
      chapterLimit: 5,
    });

    assert.equal(library.references[0].reference_name, "visible-browser-campus");
    assert.equal(library.references[0].chapter_count, 2);
    assert.equal(library.references[0].auto_reader_stop.reason, "no_next_chapter");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.100 README documents the auto-reader safety boundary and dynamic bridge", async () => {
  const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");
  assert.match(readme, /public-refs-read-plan/);
  assert.match(readme, /public-refs-read-run/);
  assert.match(readme, /no password or captcha bypass/i);
});
