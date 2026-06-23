import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  analyzeAiTaste,
  createProject,
  generateChapterCard,
  runBatch,
  sanitizeModelText,
  simulateReaders,
} from "../src/core/workflow.mjs";
import { AI_PREFIX_PATTERNS, AI_SUFFIX_PATTERNS, AI_TASTE_EXPLANATION_TERMS } from "../src/core/rules.mjs";
import { chapterCardFile } from "../src/core/paths.mjs";

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function createTempProject(prefix = "novel-studio-v061-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v0.61 review followups",
    idea: "2016 rebirth campus local service business story",
    platform: "fanqie",
    genre: "urban business rebirth",
  });
  return { root, project };
}

function createCardProvider({ delays = new Map() } = {}) {
  const starts = [];
  const cards = [];
  return {
    starts,
    async invoke(task) {
      if (task.task_type === "generate_chapter_card") {
        starts.push({ chapter_no: task.chapter_no, at: Date.now() });
        const delay = delays.get(task.chapter_no) || 0;
        if (delay) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        const card = {
          chapter_no: task.chapter_no,
          display_title: `real card ${task.chapter_no}`,
          opening_hook: `real opening ${task.chapter_no}`,
          main_event: `real event ${task.chapter_no}`,
          protagonist_action: `real action ${task.chapter_no}`,
          conflict: `real conflict ${task.chapter_no}`,
          cool_point_type: "real-model-card",
          visible_result: `real result ${task.chapter_no}`,
          tail_hook: `real hook ${task.chapter_no}`,
          characters_in_scene: ["陆川"],
          facts_required: ["2016 年"],
          forbidden_items: ["不能出现小程序"],
          target_words: 2600,
        };
        cards.push(card);
        return card;
      }
      if (task.task_type === "write_chapter") {
        return {
          chapter_no: task.chapter_card.chapter_no,
          text: [
            task.chapter_card.display_title,
            "",
            `陆川拿着第${task.chapter_card.chapter_no}章的订单表走进食堂。`,
            "老周看了一眼后台数字，手里的夹子停住了。",
            "下一秒，新的订单又跳了出来。",
          ].join("\n"),
        };
      }
      if (task.task_type === "review_chapter") {
        return { grade: "B", next_action: "approve", issues: [] };
      }
      if (task.task_type === "extract_state_candidates") {
        return {
          meta: { source_chapter: task.chapter_no },
          characters: [],
          relationships: [],
          business_state: [],
          money_orders: [],
          foreshadowing_added: [],
          foreshadowing_resolved: [],
          timeline: [],
          risks: [],
        };
      }
      throw new Error(`unexpected task: ${task.task_type}`);
    },
  };
}

test("generateChapterCard uses the configured real router output instead of mock beats", async () => {
  const { root, project } = await createTempProject("novel-studio-v061-real-card-");
  try {
    const router = createCardProvider();
    const card = await generateChapterCard(project, 30, { router });

    assert.equal(card.chapter_no, 30);
    assert.equal(card.display_title, "real card 30");
    assert.notEqual(card.display_title, "重回报到日，先把法拉利退了");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runBatch pre-generates missing chapter cards before writing chapters", async () => {
  const { root, project } = await createTempProject("novel-studio-v061-pregen-card-");
  try {
    const router = createCardProvider({
      delays: new Map([
        [1, 35],
        [2, 35],
        [3, 35],
      ]),
    });
    await runBatch(project, { from: 1, to: 3, router });

    assert.equal(router.starts.length, 3);
    const spread = Math.max(...router.starts.map((item) => item.at)) - Math.min(...router.starts.map((item) => item.at));
    assert.ok(spread < 30, `expected pre-generation starts to overlap, got ${spread}ms`);
    assert.equal(await exists(chapterCardFile(project, 1)), true);
    assert.equal(await exists(chapterCardFile(project, 2)), true);
    assert.equal(await exists(chapterCardFile(project, 3)), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AI taste analysis and reader simulation reuse centralized explanation terms", async () => {
  const { root, project } = await createTempProject("novel-studio-v061-ai-rules-");
  try {
    const term = AI_TASTE_EXPLANATION_TERMS.find((item) => item === "\u672a\u6765\u7684\u5165\u53e3");
    assert.equal(term, "\u672a\u6765\u7684\u5165\u53e3");

    const text = `\u9646\u5ddd\u77e5\u9053\u8fd9\u662f\u672a\u6765\u7684\u5165\u53e3\u3002\n\u4ed6\u5fc5\u987b\u628a\u63e1\u8fd9\u4e00\u6b21\u673a\u4f1a\u3002\n\u4e0b\u4e00\u79d2\uff0c\u540e\u53f0\u6570\u5b57\u8df3\u4e86\u51fa\u6765\u3002`;
    const plan = await analyzeAiTaste(project, 1, { text });
    const readers = await simulateReaders(project, 1, { text });

    assert.ok(plan.issues.includes("explanation_heavy"));
    assert.ok(
      readers.readers.some(
        (reader) => reader.type === "ai_taste_sensitive_reader" && reader.quit_risk === "high",
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sanitizeModelText uses centralized AI wrapper patterns", () => {
  assert.ok(AI_PREFIX_PATTERNS.length > 0);
  assert.ok(AI_SUFFIX_PATTERNS.length > 0);

  const clean = sanitizeModelText("好的，这是您要的章节：\n\n**陆川把订单递过去。**\n\n以上就是本章内容。");

  assert.equal(clean, "陆川把订单递过去。");
});

test("createProject pre-creates report and ascii task directories", async () => {
  const { root, project } = await createTempProject("novel-studio-v061-dirs-");
  try {
    assert.equal(await exists(path.join(project.path, "reports")), true);
    assert.equal(await exists(path.join(project.path, "tasks")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
