import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  ensureDir,
  padChapter,
  readJson,
  writeJson,
  writeText,
} from "../fsx.mjs";
import {
  chapterCardFile,
  draftFile,
  qualityReportFile,
  videoChapterPromptFile,
  videoChapterScreenplayFile,
  videoChapterStoryboardFile,
  videoCharacterRefsFile,
  videoManifestFile,
  videoPackDir,
  videoSceneRefsFile,
} from "../paths.mjs";

function textLines(text = "") {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isDialogueLine(line = "") {
  return /^[^：:]{1,12}[：:]/.test(line.trim());
}

function splitDialogue(line = "") {
  const match = /^([^：:]{1,12})[：:](.+)$/.exec(line.trim());
  if (!match) return null;
  return {
    character: match[1].trim(),
    line: match[2].trim(),
  };
}

function latinName(name = "") {
  const text = String(name || "").trim();
  if (!text) return "CHARACTER";
  return /^[\x00-\x7F]+$/.test(text) ? text.toUpperCase() : text;
}

function aliasesForCharacter(name = "") {
  const aliases = [name];
  if (/lu\s*chuan/i.test(name)) aliases.push("陆川", "闄嗗窛");
  if (/zhou/i.test(name)) aliases.push("老周", "周", "鑰佸懆");
  return aliases.filter(Boolean);
}

function detectCardCharacter(line = "", card = {}) {
  const names = [
    ...(card.characters_in_scene || []),
    ...(card.character_anchors || []).map((anchor) => anchor.name),
  ];
  for (const name of names) {
    if (aliasesForCharacter(name).some((alias) => line.includes(alias))) return name;
  }
  return null;
}

function extractInlineQuote(line = "") {
  const standard = /[\u201C"](.+?)[\u201D"]/u.exec(line);
  if (standard) return standard[1].trim();
  const mojibake = /鈥滃?(.+?)(?:鈥|$)/u.exec(line);
  if (mojibake) return mojibake[1].trim();
  return "";
}

function collectCardAnchors(cards = []) {
  const byName = new Map();
  for (const card of cards) {
    for (const anchor of card.character_anchors || []) {
      const name = String(anchor.name || "").trim();
      if (!name || byName.has(name)) continue;
      byName.set(name, {
        name,
        surface: String(anchor.surface || "").trim(),
        core: String(anchor.core || "").trim(),
        anchor: String(anchor.anchor || anchor.contradiction || "").trim(),
        signature_action: String(anchor.signature_action || "").trim(),
        signature_line: String(anchor.signature_line || "").trim(),
        first_appearance_chapter: anchor.first_appearance_chapter ?? anchor.source_chapter ?? null,
      });
    }
  }
  return [...byName.values()];
}

async function readCards(project, from = 1, to = from) {
  const cards = [];
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    const card = await readJson(chapterCardFile(project, chapterNo)).catch(() => ({
      chapter_no: chapterNo,
      display_title: `第${chapterNo}集`,
      scene_location: "主场景",
      characters_in_scene: ["主角"],
      character_anchors: [
        {
          name: "主角",
          surface: "短剧主角",
          core: "在压力中抓住机会完成反转",
          signature_action: "冷静观察局面后快速做决定",
        },
      ],
    }));
    cards.push(card);
  }
  return cards;
}

async function readLatestDraftText(project, chapterNo) {
  for (let version = 12; version >= 1; version -= 1) {
    try {
      return await readFile(draftFile(project, chapterNo, `v${version}`), "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new Error(`missing draft for chapter ${chapterNo}`);
}

async function readQuality(project, chapterNo) {
  return readJson(qualityReportFile(project, chapterNo)).catch(() => ({
    chapter_no: chapterNo,
    metrics: {},
  }));
}

export function generateCharacterDesignPortfolio(anchor = {}, { style = "realistic-3d" } = {}) {
  const name = anchor.name || "Character";
  const surface = anchor.surface || anchor.anchor || "distinctive webnovel character";
  const core = anchor.core || "clear inner drive";
  const signatureAction = anchor.signature_action || "stands calmly with a readable posture";
  const signatureLine = anchor.signature_line || "";
  const base = `${surface}, ${core}, ${signatureAction}`;
  return {
    name,
    style,
    identity_card: {
      name,
      surface,
      core,
      anchor: anchor.anchor || "",
      signature_action: signatureAction,
      signature_line: signatureLine,
    },
    three_view_prompt: `${base}, front view / side view / back view, same character, full body standing, neutral expression, white background, clean turnaround sheet, ${style}, 4K, consistent character`,
    expression_sheet_prompt: `${base}, 8-grid expression sheet, same face and hairstyle, neutral / amused / tense / shocked / afraid / tired / decisive / relaxed, bust portrait, white background, ${style}, consistent character`,
    body_language_prompt: `${base}, three pose sheet, relaxed posture / guarded posture / decisive posture, full body, white background, ${style}, consistent character`,
    jimeng_first_frame_prompt: `${base}, half-body portrait, front facing, soft natural light, clear facial features, stable face, high definition`,
    consistency_constraints: {
      locked: [surface, core, "face shape", "hair style", "body proportion", "main outfit color"],
      negative_prompt: "distorted face, extra fingers, malformed hands, blurry face, inconsistent clothes, different character, flicker, warped body",
    },
  };
}

export async function generateProjectCharacterRefs(project, { from = 1, to = 30, style = "realistic-3d" } = {}) {
  const cards = await readCards(project, from, to);
  const characters = collectCardAnchors(cards).map((anchor) => generateCharacterDesignPortfolio(anchor, { style }));
  const result = {
    project_title: project.title,
    range: { from, to },
    style,
    saved_source_text: false,
    characters,
    created_at: new Date().toISOString(),
    path: videoCharacterRefsFile(project),
  };
  await writeJson(result.path, result);
  return result;
}

export async function generateProjectSceneRefs(project, { from = 1, to = 30, style = "cinematic-realistic" } = {}) {
  const cards = await readCards(project, from, to);
  const seen = new Set();
  const scenes = [];
  for (const card of cards) {
    const location = card.scene_location || card.location || inferLocationFromCard(card);
    if (!location || seen.has(location)) continue;
    seen.add(location);
    scenes.push({
      location,
      style,
      source_chapter: card.chapter_no,
      establishing_shot_prompt: `wide establishing shot of ${location}, ${project.genre || "webnovel"} atmosphere, cinematic lighting, realistic production design, 8K, ultra detailed`,
      interior_medium_prompt: `medium shot inside ${location}, natural practical light, lived-in details, shallow depth of field, 4K photorealistic`,
      detail_closeup_prompt: `extreme close-up of a signature object in ${location}, tactile detail, soft rim light, macro lens, 4K`,
    });
  }
  const result = {
    project_title: project.title,
    range: { from, to },
    saved_source_text: false,
    scenes,
    created_at: new Date().toISOString(),
    path: videoSceneRefsFile(project),
  };
  await writeJson(result.path, result);
  return result;
}

function inferLocationFromCard(card = {}) {
  const text = `${card.opening_hook || ""} ${card.main_event || ""}`;
  if (/宿舍|dorm/i.test(text)) return "大学男生宿舍";
  if (/食堂|canteen/i.test(text)) return "食堂后门";
  if (/商户|merchant/i.test(text)) return "大学城商户街";
  return "主场景";
}

function lineToSegment(line, index, total, card = {}) {
  const inlineQuote = extractInlineQuote(line);
  const inlineCharacter = inlineQuote ? detectCardCharacter(line, card) : null;
  if (inlineCharacter) {
    return {
      type: "dialogue",
      character: inlineCharacter,
      line: inlineQuote,
      text: line,
      is_chapter_end: index === total - 1,
    };
  }
  const dialogue = splitDialogue(line);
  if (dialogue) {
    const character = detectCardCharacter(dialogue.character, card) || dialogue.character;
    return {
      type: "dialogue",
      character,
      line: dialogue.line,
      text: line,
      is_chapter_end: index === total - 1,
    };
  }
  return {
    type: "action",
    text: line,
    is_chapter_end: index === total - 1,
  };
}

export function novelToScreenplay(chapterText, card = {}) {
  const lines = textLines(chapterText);
  const location = card.scene_location || card.location || inferLocationFromCard(card);
  const scene = {
    heading: `INT. ${location} - DAY`,
    location,
    segments: lines.map((line, index) => lineToSegment(line, index, lines.length, card)),
  };
  const fountainLines = [scene.heading, ""];
  for (const segment of scene.segments) {
    if (segment.type === "dialogue") {
      fountainLines.push(latinName(segment.character), segment.line, "");
    } else {
      fountainLines.push(segment.text, "");
    }
  }
  if (card.tail_hook) {
    fountainLines.push(`CUT TO BLACK: ${card.tail_hook}`);
  }
  return {
    title: card.display_title || `Chapter ${card.chapter_no || ""}`.trim(),
    chapter_no: card.chapter_no || null,
    saved_source_text: true,
    scenes: [scene],
    fountain: fountainLines.join("\n").trimEnd(),
  };
}

export async function exportChapterScreenplay(project, chapterNo) {
  const existingJsonPath = videoChapterScreenplayFile(project, chapterNo, "json");
  const existingFountainPath = videoChapterScreenplayFile(project, chapterNo, "fountain");
  const [card, text] = await Promise.all([
    readJson(chapterCardFile(project, chapterNo)).catch(() => null),
    readLatestDraftText(project, chapterNo).catch(() => null),
  ]);
  if (!text) {
    const existing = await readJson(existingJsonPath).catch(() => null);
    if (existing?.screenplay) {
      const fountain = existing.screenplay.fountain || await readFile(existingFountainPath, "utf8").catch(() => "");
      const result = {
        ...existing,
        screenplay: {
          ...existing.screenplay,
          fountain,
        },
        path: existing.path || existingJsonPath,
      };
      await writeText(existingFountainPath, String(fountain || "").trimEnd() + "\n");
      return result;
    }
  }
  if (!text) throw new Error(`missing draft or screenplay for chapter ${chapterNo}`);
  const screenplay = novelToScreenplay(text, card);
  const result = {
    project_title: project.title,
    chapter_no: chapterNo,
    screenplay,
    created_at: new Date().toISOString(),
    path: videoChapterScreenplayFile(project, chapterNo, "json"),
  };
  await writeJson(result.path, result);
  await writeText(videoChapterScreenplayFile(project, chapterNo, "fountain"), screenplay.fountain);
  return result;
}

function qualityMetrics(quality = {}) {
  return quality.metrics || quality.metric_summary || {};
}

function segmentShotDescription(segment = {}) {
  if (segment.type === "dialogue") return `${segment.character} says: ${segment.line}`;
  return segment.text;
}

function hasSharedNumber(a = "", b = "") {
  const left = String(a).match(/\d+/g) || [];
  const right = new Set(String(b).match(/\d+/g) || []);
  return left.some((number) => right.has(number));
}

function looksLikeCoolpoint(text = "", visibleResult = "") {
  const source = String(text || "");
  if (visibleResult && source.includes(visibleResult)) return true;
  if (visibleResult && hasSharedNumber(source, visibleResult)) return true;
  return /订单|后台|數字|数字|跳|order|counter|backend/i.test(source);
}

export function screenplayToStoryboard(screenplay = {}, card = {}, quality = {}) {
  const metrics = qualityMetrics(quality);
  const visibleResult = String(card.visible_result || "");
  const tailScore = Number(metrics.tail_hook_score?.score ?? metrics.tail_hook_score?.average ?? 0);
  const shots = [];
  let startSecond = 0;
  for (const scene of screenplay.scenes || []) {
    for (const segment of scene.segments || []) {
      const isCoolpoint = looksLikeCoolpoint(segment.text || segment.line || "", visibleResult);
      const isHook = Boolean(segment.is_chapter_end || (tailScore >= 70 && /二维码|cop|巷口|behind|secret/i.test(segment.text || "")));
      const duration = isCoolpoint ? 5 : isHook ? 3 : segment.type === "dialogue" ? 2.5 : 2.8;
      const shot = {
        shot: shots.length + 1,
        start_second: Number(startSecond.toFixed(1)),
        duration,
        shot_type: isCoolpoint ? "Extreme close-up" : isHook ? "Suspense close-up" : segment.type === "dialogue" ? "Medium shot" : "Wide-to-medium shot",
        camera_movement: isCoolpoint ? "slow push-in" : isHook ? "locked frame, fade down" : "steady camera",
        description: segmentShotDescription(segment),
        scene_location: scene.location,
        is_coolpoint: isCoolpoint,
        is_hook: isHook,
        transition: isHook ? "cut to black" : null,
      };
      shots.push(shot);
      startSecond += duration;
    }
  }
  return {
    chapter_no: screenplay.chapter_no || card.chapter_no || null,
    total_duration: Number(startSecond.toFixed(1)),
    shots,
    quality_metadata: {
      coolpoint_shots: shots.filter((shot) => shot.is_coolpoint).length,
      hook_shots: shots.filter((shot) => shot.is_hook).length,
      avg_shot_duration: shots.length ? Number((startSecond / shots.length).toFixed(1)) : 0,
    },
  };
}

export function adaptShotToVideoPrompt(shot = {}, { tool = "jimeng" } = {}) {
  const base = `${shot.description}, ${shot.shot_type}, ${shot.camera_movement}, cinematic lighting, 4K, smooth motion`;
  if (tool === "runway") {
    return {
      prompt: `${base}, photorealistic, ${shot.duration}s`,
      negative: "distorted face, warped hands, flicker, blurry, extra fingers",
    };
  }
  if (tool === "kling") {
    return {
      prompt: `${base}, realistic lens, stable character identity, duration ${shot.duration}s`,
      negative: "distorted face, warped hands, flicker, blurry, extra fingers",
    };
  }
  if (tool === "veo") {
    return {
      prompt: `Shot ${shot.shot}: ${base}, duration ${shot.duration}s.`,
      negative: "distorted face, warped hands, flicker, blurry, extra fingers",
    };
  }
  return {
    prompt: `${base}, 竖屏9:16, 时长${shot.duration}s, 人物面部稳定不变形, 画面丝滑流畅`,
    negative: "distorted face, warped hands, flicker, blurry, extra fingers, 崩脸, 肢体错乱, 画面割裂",
  };
}

export async function generateVideoPromptsForChapter(project, chapterNo, { tool = "jimeng" } = {}) {
  const screenplayResult = await exportChapterScreenplay(project, chapterNo);
  const [card, quality] = await Promise.all([
    readJson(chapterCardFile(project, chapterNo)).catch(() => ({
      chapter_no: chapterNo,
      display_title: screenplayResult.screenplay?.title || `第${chapterNo}集`,
      scene_location: screenplayResult.screenplay?.scenes?.[0]?.location || "主场景",
    })),
    readQuality(project, chapterNo),
  ]);
  const storyboard = screenplayToStoryboard(screenplayResult.screenplay, card, quality);
  const prompts = storyboard.shots.map((shot) => ({
    shot: shot.shot,
    ...adaptShotToVideoPrompt(shot, { tool }),
  }));
  const storyboardPath = videoChapterStoryboardFile(project, chapterNo);
  const promptPath = videoChapterPromptFile(project, chapterNo, tool);
  await writeJson(storyboardPath, storyboard);
  await writeText(
    promptPath,
    prompts.map((item) => [`Shot ${item.shot}`, item.prompt, `Negative: ${item.negative}`, "---"].join("\n")).join("\n"),
  );
  return {
    project_title: project.title,
    chapter_no: chapterNo,
    tool,
    storyboard,
    prompts,
    storyboard_path: storyboardPath,
    prompt_path: promptPath,
  };
}

export async function exportFullVideoPack(project, { from = 1, to = 1, tool = "jimeng", style = "realistic-3d" } = {}) {
  await ensureDir(videoPackDir(project));
  const charRefs = await generateProjectCharacterRefs(project, { from, to, style });
  const sceneRefs = await generateProjectSceneRefs(project, { from, to, style });
  const outputs = {
    character_refs: charRefs.path,
    scene_refs: sceneRefs.path,
    screenplays: [],
    storyboards: [],
    prompts: [],
  };
  let totalShots = 0;
  let estimatedDuration = 0;
  for (let chapterNo = from; chapterNo <= to; chapterNo += 1) {
    const screenplay = await exportChapterScreenplay(project, chapterNo);
    const promptResult = await generateVideoPromptsForChapter(project, chapterNo, { tool });
    outputs.screenplays.push(screenplay.path);
    outputs.storyboards.push(promptResult.storyboard_path);
    outputs.prompts.push(promptResult.prompt_path);
    totalShots += promptResult.storyboard.shots.length;
    estimatedDuration += promptResult.storyboard.total_duration;
  }
  const manifest = {
    project_title: project.title,
    status: "completed",
    tool,
    style,
    range: { from, to },
    saved_source_text: false,
    chapter_count: to - from + 1,
    character_count: charRefs.characters.length,
    scene_count: sceneRefs.scenes.length,
    total_shots: totalShots,
    estimated_video_duration: Number(estimatedDuration.toFixed(1)),
    outputs,
    next_step: "Generate character reference images first, then scene references, then create video clips shot by shot and assemble.",
    created_at: new Date().toISOString(),
    path: videoManifestFile(project),
  };
  await writeJson(manifest.path, manifest);
  return {
    ...manifest,
    manifest_path: manifest.path,
    pack_path: videoPackDir(project),
  };
}
