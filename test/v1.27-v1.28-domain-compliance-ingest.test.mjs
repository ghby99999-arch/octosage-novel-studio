import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  analyzeDomainKnowledgeCompliance,
  collectDomainKnowledgeFromSources,
  createProject,
  importDomainKnowledge,
  planRewriteLayers,
  runSingleChapterQualityLoop,
} from "../src/core/workflow.mjs";
import { domainKnowledgeBaseFile } from "../src/core/paths.mjs";

async function createTempProject(prefix = "novel-studio-v127-domain-compliance-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.27 domain compliance",
    idea: "我要写一本梦幻西游网文，主角从大唐官府开始",
    platform: "fanqie",
    genre: "game ip fanqie adventure",
  });
  return { root, project };
}

async function seedKnowledge(project) {
  return importDomainKnowledge(project, {
    entries: [
      {
        type: "faction",
        name: "大唐官府",
        aliases: ["大唐"],
        facts: ["物理输出门派", "代表技能横扫千军"],
        constraints: ["不能写成法术主输出门派"],
      },
      {
        type: "location",
        name: "长安城",
        aliases: ["长安"],
        facts: ["主城", "商业活动密集"],
        constraints: ["不要写成荒野副本"],
      },
    ],
  });
}

function domainCard(chapterNo = 1) {
  return {
    chapter_no: chapterNo,
    display_title: "长安城里的横扫千军",
    opening_hook: "大唐官府弟子在长安城接到第一笔订单。",
    main_event: "主角用横扫千军制造第一波误判兑现。",
    protagonist_action: "他在长安城公开演示门派技能。",
    conflict: "围观者以为大唐只会莽撞输出。",
    cool_point_type: "domain_fact_payoff",
    visible_result: "长安城商人当场改变态度。",
    tail_hook: "另一个门派弟子在人群后认出了横扫千军。",
    characters_in_scene: ["主角", "长安商人"],
    character_anchors: [
      {
        name: "长安商人",
        surface: "精明",
        core: "会被真实客流打动",
        anchor: "精明但会被真实客流打动",
        signature_action: "拨算盘前先看人群",
        signature_line: "先看客流，再谈价。",
      },
    ],
    facts_required: ["大唐官府", "长安城", "横扫千军"],
    forbidden_items: ["不要把大唐官府写成法术主输出"],
  };
}

test("v1.27 analyzeDomainKnowledgeCompliance flags fact and constraint violations", async () => {
  const { root, project } = await createTempProject();
  try {
    const knowledge = await seedKnowledge(project);
    const text = "主角站在长安城外的荒野副本里，说大唐官府是法术主输出门派，横扫千军只是普通法术。";
    const result = analyzeDomainKnowledgeCompliance(text, domainCard(), {
      relevant_entries: knowledge.entries,
      hard_rules: knowledge.entries.flatMap((entry) => entry.constraints),
    });

    assert.ok(result.issues.includes("domain_constraint_violation"));
    assert.ok(result.issues.includes("domain_term_misuse"));
    assert.ok(result.violations.some((item) => item.entry_name === "大唐官府"));
    assert.ok(result.violations.some((item) => item.entry_name === "长安城"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.27 domain issues enter review flags and targeted rewrite layer", async () => {
  const { root, project } = await createTempProject("novel-studio-v127-loop-");
  try {
    await seedKnowledge(project);
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") return domainCard(task.chapter_no);
        if (task.task_type === "write_chapter") {
          return {
            chapter_no: task.chapter_card.chapter_no,
            text: "主角站在长安城外的荒野副本里，说大唐官府是法术主输出门派，横扫千军只是普通法术。",
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
        throw new Error(`unexpected task ${task.task_type}`);
      },
    };

    const result = await runSingleChapterQualityLoop(project, 1, { router, maxRewrites: 0 });
    const report = JSON.parse(await readFile(result.quality_report_path, "utf8"));

    assert.ok(report.review_quality_flags.includes("domain_knowledge_violation"));
    assert.ok(report.review.issues.includes("domain_constraint_violation"));
    assert.ok(report.domain_knowledge_compliance);
    assert.ok(planRewriteLayers(report.review.issues).some((layer) => layer.type === "domain_knowledge_repair"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.28 collectDomainKnowledgeFromSources requires confirmation and stores structured knowledge only", async () => {
  const { root, project } = await createTempProject("novel-studio-v128-collect-");
  try {
    await assert.rejects(
      collectDomainKnowledgeFromSources(project, {
        confirmed: false,
        sources: [{ url: "https://example.test/wiki/datang", title: "大唐官府资料" }],
        fetch: async () => ({ ok: true, text: async () => "大唐官府原文资料不应保存" }),
      }),
      /requires user confirmation/,
    );

    const result = await collectDomainKnowledgeFromSources(project, {
      confirmed: true,
      sources: [{ url: "https://example.test/wiki/datang", title: "大唐官府资料" }],
      fetch: async () => ({
        ok: true,
        text: async () => "大唐官府：物理输出门派。代表技能：横扫千军。禁忌：不能写成法术主输出门派。",
      }),
    });
    const saved = await readFile(domainKnowledgeBaseFile(project), "utf8");

    assert.equal(result.saved_source_text, false);
    assert.ok(result.entries.some((entry) => entry.name === "大唐官府"));
    assert.equal(saved.includes("大唐官府：物理输出门派。代表技能"), false);
    assert.ok(result.forbidden_to_copy.includes("source_sentences"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
