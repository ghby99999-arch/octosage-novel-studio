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
  exportPublishPackage,
  publishToPlatform,
} from "../src/core/workflow.mjs";
import {
  chapterCardFile,
  draftFile,
  publishAttemptLogFile,
  publishChaptersFile,
  publishManifestFile,
  publishMetadataFile,
  publishSubmissionFile,
  qualityReportFile,
} from "../src/core/paths.mjs";
import { readJson, writeJson, writeText } from "../src/core/fsx.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createPublishProject(prefix = "novel-studio-v151-publish-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "publish target",
    idea: "2016 rebirth campus delivery story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

async function seedChapter(project, chapterNo, qualityOverrides = {}) {
  await writeJson(chapterCardFile(project, chapterNo), {
    chapter_no: chapterNo,
    display_title: `第${chapterNo}章 测试标题`,
    opening_hook: "订单后台突然跳动。",
    main_event: "陆川用校园订单证明判断。",
    protagonist_action: "陆川先收定金再安排履约。",
    conflict: "同学误以为他在硬撑。",
    cool_point_type: "misread_then_result",
    visible_result: "订单数字从37跳到99",
    tail_hook: "后台又出现一个陌生大单。",
    characters_in_scene: ["陆川"],
    character_anchors: [
      {
        name: "陆川",
        surface: "松弛嘴欠的大学生",
        core: "先行动再解释",
        anchor: "重生后把误解当流量的人",
        signature_action: "把旧手机翻过来给别人看订单",
        signature_line: "先别急，数字会说话。",
      },
    ],
  });
  await writeText(
    draftFile(project, chapterNo, "v1"),
    `第${chapterNo}章 测试标题\n\n陆川把旧手机放在桌上。\n\n订单数字从37跳到99，周围突然安静下来。\n\n他笑了笑：“先别急，数字会说话。”\n`,
  );
  const qualityMetrics = {
    tail_hook_score: { score: 98 },
    micro_hook_density: { density: 1.4 },
    coolpoint_delivered: { effective_count: 2 },
    drop_risk_segments: { risky_segment_count: 0 },
    retention_prediction: { score: 96 },
    opening_hook_score: { score: 96 },
    ai_taste_score: { score: 96 },
    ...qualityOverrides,
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

async function seedRange(project, from, to, overridesByChapter = {}) {
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    await seedChapter(project, chapterNo, overridesByChapter[chapterNo] || {});
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

test("v1.151 exportPublishPackage blocks when premium gate fails", async () => {
  const { root, project } = await createPublishProject();
  try {
    await seedRange(project, 1, 3, {
      2: { opening_hook_score: { score: 70 } },
    });

    const result = await exportPublishPackage(project, { from: 1, to: 3, platform: "fanqie" });

    assert.equal(result.status, "blocked");
    assert.equal(result.gate.publish_package_allowed, false);
    assert.ok(result.must_fix_before_publish.length >= 1);
    assert.equal(existsSync(publishManifestFile(project, "fanqie")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.152 exportPublishPackage creates platform package when premium gate passes", async () => {
  const { root, project } = await createPublishProject("novel-studio-v152-publish-pass-");
  try {
    await seedRange(project, 1, 3);

    const result = await exportPublishPackage(project, { from: 1, to: 3, platform: "fanqie" });

    assert.equal(result.status, "ready");
    assert.equal(result.platform, "fanqie");
    assert.equal(result.gate.publish_package_allowed, true);
    assert.equal(result.package.manifest_path, publishManifestFile(project, "fanqie"));
    assert.equal(result.package.metadata_path, publishMetadataFile(project, "fanqie"));
    assert.equal(result.package.chapters_path, publishChaptersFile(project, "fanqie", 1, 3));
    assert.equal(result.package.submission_path, publishSubmissionFile(project, "fanqie"));

    const manifest = await readJson(result.package.manifest_path);
    const metadata = await readJson(result.package.metadata_path);
    const chapters = await readFile(result.package.chapters_path, "utf8");

    assert.equal(manifest.status, "ready");
    assert.equal(manifest.chapter_count, 3);
    assert.equal(metadata.safety.requires_user_authorization_for_platform_publish, true);
    assert.match(chapters, /第1章 测试标题/);
    assert.match(chapters, /订单数字从37跳到99/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.153 createPlatformPublishPlan returns safe user-authorized platform plan", async () => {
  const { root, project } = await createPublishProject("novel-studio-v153-publish-plan-");
  try {
    await seedRange(project, 1, 3);

    const plan = await createPlatformPublishPlan(project, { from: 1, to: 3, platform: "fanqie" });

    assert.equal(plan.status, "ready");
    assert.equal(plan.platform, "fanqie");
    assert.equal(plan.requires_user_authorization, true);
    assert.equal(plan.safety.no_password_or_captcha_bypass, true);
    assert.equal(plan.safety.no_unconfirmed_submission, true);
    assert.equal(plan.package.status, "ready");
    assert.ok(plan.steps.some((step) => /登录|授权|确认/.test(step)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.154 publishToPlatform refuses platform submission without confirmation", async () => {
  const { root, project } = await createPublishProject("novel-studio-v154-publish-confirm-");
  try {
    await seedRange(project, 1, 3);
    let called = false;

    const result = await publishToPlatform(project, {
      from: 1,
      to: 3,
      platform: "fanqie",
      confirmed: false,
      adapter: {
        name: "test-real-adapter",
        async publish() {
          called = true;
          return { submitted: true };
        },
      },
    });

    assert.equal(result.status, "planned");
    assert.equal(result.publish_attempt.submitted, false);
    assert.equal(result.publish_attempt.requires_confirmation, true);
    assert.equal(called, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.155 publishToPlatform uses injected adapter after confirmation and writes audit log", async () => {
  const { root, project } = await createPublishProject("novel-studio-v155-publish-adapter-");
  try {
    await seedRange(project, 1, 3);
    const seen = [];

    const result = await publishToPlatform(project, {
      from: 1,
      to: 3,
      platform: "fanqie",
      confirmed: true,
      adapter: {
        name: "test-authorized-platform",
        async publish(payload) {
          seen.push(payload);
          return {
            submitted: true,
            external_work_id: "fanqie-draft-123",
            platform_response: { ok: true },
          };
        },
      },
    });

    assert.equal(result.status, "submitted");
    assert.equal(result.publish_attempt.submitted, true);
    assert.equal(result.publish_attempt.external_work_id, "fanqie-draft-123");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].platform, "fanqie");
    assert.equal(seen[0].package.manifest_path, publishManifestFile(project, "fanqie"));

    const log = await readFile(publishAttemptLogFile(project), "utf8");
    assert.match(log, /test-authorized-platform/);
    assert.match(log, /fanqie-draft-123/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.156 CLI exposes publish package, plan, and platform commands", async () => {
  const { root, project } = await createPublishProject("novel-studio-v156-publish-cli-");
  try {
    await seedRange(project, 1, 3);
    const help = spawnSync("node", ["src/cli.mjs", "help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /publish-package --project/);
    assert.match(help.stdout, /publish-plan --project/);
    assert.match(help.stdout, /publish-platform --project/);

    const pkg = spawnSync("node", [
      "src/cli.mjs",
      "publish-package",
      "--project",
      project.path,
      "--platform",
      "fanqie",
      "--from",
      "1",
      "--to",
      "3",
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(pkg.status, 0, pkg.stderr);
    assert.match(pkg.stdout, /publish-package: ready/);

    const plan = spawnSync("node", [
      "src/cli.mjs",
      "publish-plan",
      "--project",
      project.path,
      "--platform",
      "fanqie",
      "--from",
      "1",
      "--to",
      "3",
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(plan.status, 0, plan.stderr);
    assert.match(plan.stdout, /publish-plan: ready/);
    assert.match(plan.stdout, /requires-user-authorization: true/);

    const publish = spawnSync("node", [
      "src/cli.mjs",
      "publish-platform",
      "--project",
      project.path,
      "--platform",
      "fanqie",
      "--from",
      "1",
      "--to",
      "3",
      "--confirm",
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(publish.status, 0, publish.stderr);
    assert.match(publish.stdout, /publish-platform: submitted/);
    assert.match(publish.stdout, /adapter: local-dry-run/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.157 server exposes publish APIs", async () => {
  const { root, project } = await createPublishProject("novel-studio-v157-publish-api-");
  const app = await startTestServer();
  try {
    await seedRange(project, 1, 3);

    const pkgResponse = await fetch(`${app.baseUrl}/api/publish/package`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, platform: "fanqie", from: 1, to: 3 }),
    });
    const pkg = await pkgResponse.json();
    assert.equal(pkgResponse.status, 200);
    assert.equal(pkg.status, "ready");

    const planResponse = await fetch(`${app.baseUrl}/api/publish/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, platform: "fanqie", from: 1, to: 3 }),
    });
    const plan = await planResponse.json();
    assert.equal(planResponse.status, 200);
    assert.equal(plan.status, "ready");
    assert.equal(plan.requires_user_authorization, true);

    const publishResponse = await fetch(`${app.baseUrl}/api/publish/platform`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: project.path, platform: "fanqie", from: 1, to: 3, confirmed: true }),
    });
    const publish = await publishResponse.json();
    assert.equal(publishResponse.status, 200);
    assert.equal(publish.status, "submitted");
    assert.equal(publish.publish_attempt.adapter_name, "local-dry-run");
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.158 Web workbench exposes export and one-click publish actions", async () => {
  const app = await startTestServer();
  try {
    const bundle = await fetchPixsoBundleText(app);

    assert.match(bundle, /publishPackage/);
    assert.match(bundle, /publishPlan/);
    assert.match(bundle, /publishPlatform/);
    assert.match(bundle, /\/api\/publish\/package/);
    assert.match(bundle, /\/api\/publish\/plan/);
    assert.match(bundle, /\/api\/publish\/platform/);
  } finally {
    await app.close();
  }
});
