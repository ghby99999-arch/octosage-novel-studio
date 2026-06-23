import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  createProject,
  exportChapterScreenplay,
  exportFullVideoPack,
  generateProjectCharacterRefs,
  generateProjectSceneRefs,
  generateVideoPromptsForChapter,
} from "../src/core/workflow.mjs";
import {
  chapterCardFile,
  draftFile,
  qualityReportFile,
  videoCharacterRefsFile,
  videoChapterPromptFile,
  videoChapterScreenplayFile,
  videoChapterStoryboardFile,
  videoManifestFile,
  videoSceneRefsFile,
} from "../src/core/paths.mjs";
import { readJson, writeJson, writeText } from "../src/core/fsx.mjs";
import { serveLocal } from "../src/server.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createVideoProject(prefix = "novel-studio-v111-video-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "video factory target",
    idea: "2016 rebirth campus food delivery business",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  await seedChapter(project, 1);
  await seedChapter(project, 2);
  return { root, project };
}

function card(chapterNo = 1) {
  return {
    chapter_no: chapterNo,
    display_title: chapterNo === 1 ? "Back to report day" : "The queue becomes orders",
    opening_hook: "The old phone rang before Lu Chuan could understand the date.",
    main_event: "Lu Chuan turns a canteen queue into visible delivery orders.",
    protagonist_action: "He pushes the receipt toward Zhou and asks him to refresh the backend.",
    conflict: "Zhou thinks the student is bluffing.",
    cool_point_type: "misjudgment_payoff",
    visible_result: "The backend order counter jumps from 0 to 37.",
    tail_hook: "Across the alley, someone copies the QR code.",
    scene_location: chapterNo === 1 ? "大学男生宿舍" : "食堂后门",
    characters_in_scene: ["Lu Chuan", "Zhou"],
    character_anchors: [
      {
        name: "Lu Chuan",
        surface: "relaxed reborn student",
        core: "calculates market timing faster than everyone",
        anchor: "relaxed reborn student but calculates market timing faster than everyone",
        signature_action: "turns the cracked phone toward others before explaining",
        signature_line: "Look at the number first.",
        first_appearance_chapter: 1,
      },
      {
        name: "Zhou",
        surface: "hard-mouthed barbecue boss",
        core: "watches backend orders faster than anyone",
        anchor: "hard-mouthed barbecue boss but watches backend orders faster than anyone",
        signature_action: "keeps scolding while refreshing the order backend",
        signature_line: "Do not rush me. The orders rush me enough.",
        first_appearance_chapter: 1,
      },
    ],
    facts_required: ["2016 campus"],
    forbidden_items: ["do not mention mini program"],
  };
}

function draftText(chapterNo = 1) {
  if (chapterNo === 1) {
    return [
      "陆川睁开眼时，宿舍风扇正在头顶吱呀吱呀地转。",
      "旧手机屏幕亮着，日期停在2016年9月3日。",
      "赵鹏从上铺探头：“你不是今天要开那辆租来的法拉利去报到吗？”",
      "陆川盯着屏幕，笑了一下：“先退了。”",
      "他走到食堂后门，老周正一边翻串一边骂排队的学生。",
      "老周：“别催！催也没用！”",
      "第一条订单跳出来的时候，老周手里的串掉进了炭火里。",
      "后台数字从0跳到37。",
      "巷口，一个穿黑T的人低头拍下了二维码。",
    ].join("\n\n");
  }
  return [
    "第二天中午，食堂后门的队伍拐过了墙角。",
    "老周嘴上还在骂，手却比谁都快地刷新后台。",
    "陆川把退款规则写在纸箱背面。",
    "赵鹏：“这玩意儿还能卖给隔壁商户？”",
    "陆川：“卖的不是饭，是他们排队时浪费掉的时间。”",
    "电脑屏幕上，三家商户同时发来合作消息。",
  ].join("\n\n");
}

async function seedChapter(project, chapterNo) {
  await writeJson(chapterCardFile(project, chapterNo), card(chapterNo));
  await writeText(draftFile(project, chapterNo, "v1"), draftText(chapterNo));
  await writeJson(qualityReportFile(project, chapterNo), {
    project_title: project.title,
    chapter_no: chapterNo,
    metrics: {
      tail_hook_score: { score: 88 },
      coolpoint_delivered: { effective_count: 1 },
      drop_risk_segments: { count: 0 },
    },
  });
}

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

test("v1.111 generates character reference portfolios from character anchors", async () => {
  const { root, project } = await createVideoProject();
  try {
    const refs = await generateProjectCharacterRefs(project, { from: 1, to: 2, style: "realistic-3d" });

    assert.equal(refs.characters.length, 2);
    assert.equal(refs.saved_source_text, false);
    assert.ok(refs.characters[0].three_view_prompt.includes("front view"));
    assert.ok(refs.characters[0].expression_sheet_prompt.includes("8-grid"));
    assert.ok(refs.characters[0].consistency_constraints.negative_prompt.includes("distorted face"));
    assert.equal(refs.path, videoCharacterRefsFile(project));
    assert.equal(JSON.stringify(refs).includes("风扇正在头顶"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.112 generates scene concept prompts from chapter cards and domain knowledge", async () => {
  const { root, project } = await createVideoProject("novel-studio-v112-video-scenes-");
  try {
    const refs = await generateProjectSceneRefs(project, { from: 1, to: 2 });

    assert.equal(refs.scenes.length, 2);
    assert.ok(refs.scenes.some((scene) => scene.location === "大学男生宿舍"));
    assert.ok(refs.scenes[0].establishing_shot_prompt.includes("wide establishing shot"));
    assert.equal(refs.saved_source_text, false);
    assert.equal(refs.path, videoSceneRefsFile(project));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.113 exports chapter screenplay as JSON and Fountain without changing drafts", async () => {
  const { root, project } = await createVideoProject("novel-studio-v113-video-script-");
  try {
    const result = await exportChapterScreenplay(project, 1);

    assert.equal(result.chapter_no, 1);
    assert.ok(result.screenplay.scenes.length >= 1);
    assert.ok(result.screenplay.fountain.includes("INT."));
    assert.ok(result.screenplay.fountain.includes("LU CHUAN"));
    assert.equal(result.path, videoChapterScreenplayFile(project, 1, "json"));
    assert.equal(JSON.stringify(result.screenplay).includes("巷口，一个穿黑T的人"), true);

    const saved = await readJson(videoChapterScreenplayFile(project, 1, "json"));
    assert.equal(saved.chapter_no, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.114 generates storyboard and video prompts using quality-aware shot choices", async () => {
  const { root, project } = await createVideoProject("novel-studio-v114-video-prompt-");
  try {
    await exportChapterScreenplay(project, 1);
    const result = await generateVideoPromptsForChapter(project, 1, { tool: "jimeng" });

    assert.equal(result.tool, "jimeng");
    assert.ok(result.storyboard.shots.some((shot) => shot.is_coolpoint));
    assert.ok(result.prompts[0].prompt.includes("4K"));
    assert.ok(result.prompts[0].negative.includes("distorted"));
    assert.equal(result.storyboard_path, videoChapterStoryboardFile(project, 1));
    assert.equal(result.prompt_path, videoChapterPromptFile(project, 1, "jimeng"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.115 exports a full video production pack for a chapter range", async () => {
  const { root, project } = await createVideoProject("novel-studio-v115-video-pack-");
  try {
    const pack = await exportFullVideoPack(project, { from: 1, to: 2, tool: "jimeng" });

    assert.equal(pack.status, "completed");
    assert.equal(pack.chapter_count, 2);
    assert.equal(pack.character_count, 2);
    assert.equal(pack.scene_count, 2);
    assert.ok(pack.total_shots >= 4);
    assert.equal(pack.manifest_path, videoManifestFile(project));
    assert.equal(JSON.stringify(pack).includes("风扇正在头顶"), false);

    const manifest = await readJson(videoManifestFile(project));
    assert.equal(manifest.tool, "jimeng");
    assert.equal(manifest.outputs.screenplays.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.116 CLI exposes video factory commands", async () => {
  const { root, project } = await createVideoProject("novel-studio-v116-video-cli-");
  try {
    const charRefs = spawnSync("node", ["src/cli.mjs", "char-refs", "--project", project.path, "--from", "1", "--to", "2"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(charRefs.status, 0, charRefs.stderr);
    assert.match(charRefs.stdout, /char-refs: 2/);

    const script = spawnSync("node", ["src/cli.mjs", "script", "1", "--project", project.path], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(script.status, 0, script.stderr);
    assert.match(script.stdout, /script: 1/);

    const pack = spawnSync("node", ["src/cli.mjs", "full-video-pack", "--from", "1", "--to", "2", "--tool", "jimeng", "--project", project.path], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(pack.status, 0, pack.stderr);
    assert.match(pack.stdout, /full-video-pack: completed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.117 server exposes video factory APIs for the Web video mode", async () => {
  const { root, project } = await createVideoProject("novel-studio-v117-video-api-");
  const app = await serveLocal({ port: 0 });
  try {
    const port = app.server.address().port;
    const pack = await postJson(port, "/api/video/full-pack", {
      project: project.path,
      from: 1,
      to: 2,
      tool: "jimeng",
    });

    assert.equal(pack.status, "completed");
    assert.equal(pack.chapter_count, 2);

    const script = await postJson(port, "/api/video/script", {
      project: project.path,
      chapter_no: 1,
    });
    assert.equal(script.chapter_no, 1);
  } finally {
    await new Promise((resolve, reject) => app.server.close((error) => (error ? reject(error) : resolve())));
    await rm(root, { recursive: true, force: true });
  }
});
