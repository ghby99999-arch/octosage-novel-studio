import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createLocalServer } from "../src/server.mjs";
import {
  createPlatformPublishPlan,
  createProject,
  evaluateChapterPublishGate,
  listPlatformPublishAdapters,
  publishToPlatform,
} from "../src/core/workflow.mjs";
import {
  chapterCardFile,
  draftFile,
  publishBrowserHandoffFile,
  publishSubmissionFile,
  qualityReportFile,
} from "../src/core/paths.mjs";
import { readJson, writeJson, writeText } from "../src/core/fsx.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createAdapterProject(prefix = "novel-studio-v161-adapters-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "adapter target",
    idea: "2016 rebirth campus delivery story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

async function seedChapter(project, chapterNo) {
  await writeJson(chapterCardFile(project, chapterNo), {
    chapter_no: chapterNo,
    display_title: `Chapter ${chapterNo}`,
    opening_hook: "The order dashboard jumps.",
    main_event: "Lu Chuan proves his route with visible campus orders.",
    protagonist_action: "Lu Chuan collects deposits before arranging delivery.",
    conflict: "Classmates misread him as bluffing.",
    cool_point_type: "misread_then_result",
    visible_result: "orders jump from 37 to 99",
    tail_hook: "A larger unknown order appears.",
    characters_in_scene: ["Lu Chuan"],
    character_anchors: [],
  });
  await writeText(
    draftFile(project, chapterNo, "v1"),
    `Chapter ${chapterNo}\n\nLu Chuan puts the old phone on the table.\n\nThe order count jumps from 37 to 99.\n`,
  );
  const qualityMetrics = {
    tail_hook_score: { score: 98 },
    micro_hook_density: { density: 1.4 },
    coolpoint_delivered: { effective_count: 2 },
    drop_risk_segments: { risky_segment_count: 0 },
    retention_prediction: { score: 96 },
    opening_hook_score: { score: 96 },
    ai_taste_score: { score: 96 },
  };
  await writeJson(qualityReportFile(project, chapterNo), {
    project_title: project.title,
    chapter_no: chapterNo,
    status: "approved",
    final_grade: "A",
    quality_metrics: qualityMetrics,
    publish_gate: evaluateChapterPublishGate(qualityMetrics, { grade: "A" }, []),
  });
}

async function seedRange(project, from, to) {
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    await seedChapter(project, chapterNo);
  }
}

async function startTestServer(options = {}) {
  const app = createLocalServer(options);
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const { port } = app.server.address();
  return {
    ...app,
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => {
        app.server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function fetchPixsoBundleText(app) {
  const html = await fetch(`${app.baseUrl}/`).then((response) => response.text());
  const match = html.match(/<script[^>]+src="([^"]*\/pixso\/assets\/[^"]+\.js)"/);
  assert.ok(match, "Pixso bundle script should be referenced from root HTML");
  return fetch(`${app.baseUrl}${match[1]}`).then((response) => response.text());
}

test("v1.161 platform publish adapter registry lists safe supported adapters", () => {
  const adapters = listPlatformPublishAdapters();
  const ids = adapters.map((adapter) => adapter.id);

  assert.deepEqual(ids, ["local-dry-run", "manual-browser", "fanqie", "qidian", "17k"]);
  for (const adapter of adapters) {
    assert.equal(adapter.requires_user_authorization, true);
    assert.equal(adapter.safety.no_password_bypass, true);
    assert.equal(adapter.safety.no_captcha_bypass, true);
    assert.equal(adapter.safety.stop_before_unconfirmed_submit, true);
  }
});

test("v1.162 publish plan includes platform-specific field mapping and console target", async () => {
  const { root, project } = await createAdapterProject();
  try {
    await seedRange(project, 1, 3);

    const plan = await createPlatformPublishPlan(project, { from: 1, to: 3, platform: "fanqie" });

    assert.equal(plan.status, "ready");
    assert.equal(plan.adapter.id, "fanqie");
    assert.equal(plan.adapter.mode, "browser-assisted");
    assert.match(plan.adapter.author_console_url, /fanqie|writer|author/i);
    assert.equal(plan.field_mapping.title, "metadata.title");
    assert.equal(plan.field_mapping.synopsis, "metadata.synopsis");
    assert.equal(plan.field_mapping.chapters, "chapters_file");
    assert.ok(plan.required_user_checks.includes("platform_account_logged_in"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.163 manual-browser adapter creates a browser handoff payload and never submits", async () => {
  const { root, project } = await createAdapterProject("novel-studio-v163-manual-browser-");
  try {
    await seedRange(project, 1, 3);

    const result = await publishToPlatform(project, {
      from: 1,
      to: 3,
      platform: "manual-browser",
      adapterName: "manual-browser",
      confirmed: true,
    });

    assert.equal(result.status, "browser_ready");
    assert.equal(result.publish_attempt.submitted, false);
    assert.equal(result.publish_attempt.adapter_name, "manual-browser");
    assert.equal(result.publish_attempt.stop_before_final_submit, true);
    assert.equal(result.browser_handoff_path, publishBrowserHandoffFile(project, "manual-browser"));
    assert.equal(existsSync(result.browser_handoff_path), true);

    const handoff = await readJson(result.browser_handoff_path);
    assert.equal(handoff.safety.stop_before_final_submit, true);
    assert.equal(handoff.payload.submission_file, publishSubmissionFile(project, "manual-browser"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.164 platform adapter without implementation stops at user-authorized plan", async () => {
  const { root, project } = await createAdapterProject("novel-studio-v164-fanqie-plan-");
  try {
    await seedRange(project, 1, 3);

    const result = await publishToPlatform(project, {
      from: 1,
      to: 3,
      platform: "fanqie",
      adapterName: "fanqie",
      confirmed: true,
    });

    assert.equal(result.status, "adapter_pending");
    assert.equal(result.publish_attempt.submitted, false);
    assert.equal(result.publish_attempt.adapter_name, "fanqie");
    assert.equal(result.publish_attempt.requires_browser_or_api_adapter, true);
    assert.match(result.next_step, /manual-browser|official API|visible browser/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.165 publish adapter registry is exposed through CLI and server", async () => {
  const app = await startTestServer();
  try {
    const cli = spawnSync("node", ["src/cli.mjs", "publish-adapters"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /local-dry-run/);
    assert.match(cli.stdout, /manual-browser/);
    assert.match(cli.stdout, /fanqie/);

    const response = await fetch(`${app.baseUrl}/api/publish/adapters`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.ok(body.adapters.some((adapter) => adapter.id === "qidian"));
  } finally {
    await app.close();
  }
});

test("v1.166 Web workbench exposes adapter-aware publish controls", async () => {
  const app = await startTestServer();
  try {
    const bundle = await fetchPixsoBundleText(app);

    assert.match(bundle, /publishAdapters/);
    assert.match(bundle, /\/api\/publish\/adapters/);
  } finally {
    await app.close();
  }
});
